import json
import logging
import asyncio
from datetime import datetime, timezone
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from backend.app.models.models import VoiceSample, ExtractedFeatures, ClassificationResult, Patient
from backend.app.ml.audio_validator import validate_audio_file
from backend.app.ml.feature_extractor import extract_acoustic_features
from backend.app.ml.classifier import classifier
from backend.app.services.decline_detection_service import decline_detection_service
from backend.app.websocket.ws_manager import ws_manager

logger = logging.getLogger("classification_worker")

class ClassificationWorker:
    @staticmethod
    async def process_voice_sample(
        db: AsyncSession,
        sample_id: int,
        audio_bytes: bytes,
        filename: str
    ) -> dict:
        """
        Executes the base flow: Record Voice Sample -> Auto-includes Classify Voice Sample.
        Extracts acoustic features, runs classifier inference, saves results, and extends
        to Decline Detection (OnSeverityChange).
        """
        # Fetch the sample record
        stmt = select(VoiceSample).where(VoiceSample.id == sample_id)
        res = await db.execute(stmt)
        sample = res.scalar_one_or_none()
        if not sample:
            raise ValueError(f"VoiceSample with id {sample_id} not found")

        # 1. Quality Validation Check
        val_result, audio_data, sample_rate = validate_audio_file(audio_bytes, filename)
        if not val_result.is_valid:
            sample.status = "REJECTED_QUALITY"
            sample.audio_duration_sec = val_result.duration_sec
            sample.sample_rate = val_result.sample_rate
            await db.commit()
            return {
                "success": False,
                "status": "REJECTED_QUALITY",
                "error": val_result.error_message,
                "duration_sec": val_result.duration_sec
            }

        sample.status = "PROCESSING"
        sample.audio_duration_sec = val_result.duration_sec
        sample.sample_rate = sample_rate
        await db.commit()

        try:
            # 2. Extract Acoustic Features (Praat / Parselmouth)
            features = extract_acoustic_features(audio_data)

            extracted_feat_obj = ExtractedFeatures(
                voice_sample_id=sample.id,
                jitter_local=features.get("MDVP:Jitter(%)"),
                jitter_rap=features.get("MDVP:RAP"),
                jitter_ppq5=features.get("MDVP:PPQ"),
                shimmer_local=features.get("MDVP:Shimmer"),
                shimmer_apq3=features.get("Shimmer:APQ3"),
                shimmer_apq5=features.get("Shimmer:APQ5"),
                hnr=features.get("HNR"),
                f0_mean=features.get("MDVP:Fo(Hz)"),
                f0_std=features.get("f0_std"),
                f0_min=features.get("MDVP:Flo(Hz)"),
                f0_max=features.get("MDVP:Fhi(Hz)"),
                ppe=features.get("PPE"),
                spread1=features.get("spread1"),
                spread2=features.get("spread2"),
                raw_features_json=json.dumps(features)
            )
            db.add(extracted_feat_obj)

            # 3. Classifier Inference
            pred_result = classifier.predict_features(features)

            classification_obj = ClassificationResult(
                voice_sample_id=sample.id,
                risk_score=pred_result["risk_score"],
                confidence=pred_result["confidence"],
                severity_level=pred_result["severity_level"],
                model_version=pred_result["model_version"],
                inference_time_ms=pred_result["inference_time_ms"]
            )
            db.add(classification_obj)

            sample.status = "CLASSIFIED"
            await db.commit()
            await db.refresh(classification_obj)

            # 4. Trigger Extension Point: OnSeverityChange -> Decline Detection
            decline_alert = await decline_detection_service.evaluate_change_point(
                db=db,
                patient_id=sample.patient_id,
                latest_sample_id=sample.id,
                latest_risk_score=pred_result["risk_score"]
            )

            # 5. Broadcast real-time update to active dashboards
            patient_res = await db.execute(select(Patient).where(Patient.id == sample.patient_id))
            patient = patient_res.scalar_one_or_none()

            ws_payload = {
                "event": "VOICE_SAMPLE_CLASSIFIED",
                "sample_id": sample.id,
                "patient_id": sample.patient_id,
                "patient_name": patient.name if patient else "Patient",
                "risk_score": pred_result["risk_score"],
                "confidence": pred_result["confidence"],
                "severity_level": pred_result["severity_level"],
                "timestamp": sample.timestamp.isoformat(),
                "decline_alert_triggered": bool(decline_alert)
            }
            await ws_manager.broadcast_all(ws_payload)

            return {
                "success": True,
                "status": "CLASSIFIED",
                "sample_id": sample.id,
                "duration_sec": val_result.duration_sec,
                "snr_db": val_result.snr_db,
                "clipping_pct": val_result.clipping_pct,
                "quality_warning": val_result.quality_warning,
                "features": features,
                "classification": pred_result,
                "decline_alert": {
                    "id": decline_alert.id,
                    "type": decline_alert.type,
                    "severity": decline_alert.severity,
                    "title": decline_alert.title
                } if decline_alert else None
            }

        except Exception as e:
            logger.exception(f"Error classifying voice sample {sample_id}: {str(e)}")
            sample.status = "FAILED"
            await db.commit()
            return {
                "success": False,
                "status": "FAILED",
                "error": f"Internal classification processing error: {str(e)}"
            }

classification_worker = ClassificationWorker()
