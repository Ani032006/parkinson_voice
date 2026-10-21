import os
import uuid
import datetime
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, desc
from backend.app.core.database import get_db
from backend.app.core.security import get_current_user, TokenData
from backend.app.core.config import UPLOAD_DIR, CLINICAL_SAFETY_DISCLAIMER
from backend.app.models.models import VoiceSample, ExtractedFeatures, ClassificationResult, Patient
from backend.app.schemas.schemas import VoiceSampleDetailSchema, ExtractedFeaturesSchema, ClassificationResultSchema
from backend.app.services.classification_worker import classification_worker

router = APIRouter(prefix="/voice-samples", tags=["Voice Samples"])

@router.post("/upload")
async def upload_and_classify_voice_sample(
    file: UploadFile = File(...),
    patient_id: Optional[int] = Form(None),
    task_type: str = Form("SUSTAINED_A"),
    current_user: TokenData = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """
    Base Flow: Record Voice Sample -> Auto-includes Classify Voice Sample.
    Accepts an audio recording, saves it, runs quality checks, extracts acoustic features,
    and runs the classifier to produce risk score, confidence, and severity level.
    """
    target_patient_id = patient_id or current_user.patient_id
    if not target_patient_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Target patient_id is required"
        )

    # Check permission
    if current_user.role == "PATIENT" and current_user.patient_id != target_patient_id:
        raise HTTPException(status_code=403, detail="Cannot upload voice samples for another patient")

    # Read audio bytes
    audio_bytes = await file.read()
    if not audio_bytes:
        raise HTTPException(status_code=400, detail="Uploaded audio file is empty")

    # Save audio file to storage
    file_ext = os.path.splitext(file.filename)[1] or ".wav"
    unique_filename = f"sample_{target_patient_id}_{int(datetime.datetime.now().timestamp())}_{uuid.uuid4().hex[:8]}{file_ext}"
    file_path = UPLOAD_DIR / unique_filename

    with open(file_path, "wb") as f:
        f.write(audio_bytes)

    # Create VoiceSample record
    voice_sample = VoiceSample(
        patient_id=target_patient_id,
        recorded_by_user_id=current_user.user_id,
        timestamp=datetime.datetime.now(datetime.timezone.utc),
        task_type=task_type,
        file_path=str(file_path),
        status="PENDING"
    )
    db.add(voice_sample)
    await db.commit()
    await db.refresh(voice_sample)

    # Process sample (Quality validation -> Feature extraction -> ML classification -> Decline check)
    result = await classification_worker.process_voice_sample(
        db=db,
        sample_id=voice_sample.id,
        audio_bytes=audio_bytes,
        filename=file.filename
    )

    if not result.get("success"):
        return {
            "success": False,
            "sample_id": voice_sample.id,
            "status": result.get("status"),
            "message": result.get("error"),
            "disclaimer": CLINICAL_SAFETY_DISCLAIMER
        }

    return {
        "success": True,
        "sample_id": voice_sample.id,
        "status": "CLASSIFIED",
        "duration_sec": result.get("duration_sec"),
        "snr_db": result.get("snr_db"),
        "quality_warning": result.get("quality_warning"),
        "features": result.get("features"),
        "classification": result.get("classification"),
        "decline_alert": result.get("decline_alert"),
        "disclaimer": CLINICAL_SAFETY_DISCLAIMER
    }

@router.get("/patient/{patient_id}", response_model=List[VoiceSampleDetailSchema])
async def get_patient_voice_samples(
    patient_id: int,
    limit: int = 30,
    current_user: TokenData = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    if current_user.role == "PATIENT" and current_user.patient_id != patient_id:
        raise HTTPException(status_code=403, detail="Access denied to voice samples")

    stmt = (
        select(VoiceSample)
        .where(VoiceSample.patient_id == patient_id)
        .order_by(desc(VoiceSample.timestamp))
        .limit(limit)
    )
    res = await db.execute(stmt)
    samples = res.scalars().all()

    output = []
    for s in samples:
        # Load features & classification
        f_res = await db.execute(select(ExtractedFeatures).where(ExtractedFeatures.voice_sample_id == s.id))
        f = f_res.scalar_one_or_none()

        c_res = await db.execute(select(ClassificationResult).where(ClassificationResult.voice_sample_id == s.id))
        c = c_res.scalar_one_or_none()

        feat_schema = None
        if f:
            feat_schema = ExtractedFeaturesSchema(
                jitter_local=f.jitter_local,
                jitter_rap=f.jitter_rap,
                jitter_ppq5=f.jitter_ppq5,
                shimmer_local=f.shimmer_local,
                shimmer_apq3=f.shimmer_apq3,
                shimmer_apq5=f.shimmer_apq5,
                hnr=f.hnr,
                f0_mean=f.f0_mean,
                f0_std=f.f0_std,
                f0_min=f.f0_min,
                f0_max=f.f0_max,
                ppe=f.ppe,
                spread1=f.spread1,
                spread2=f.spread2
            )

        class_schema = None
        if c:
            class_schema = ClassificationResultSchema(
                risk_score=c.risk_score,
                confidence=c.confidence,
                severity_level=c.severity_level,
                model_version=c.model_version,
                inference_time_ms=c.inference_time_ms,
                disclaimer=CLINICAL_SAFETY_DISCLAIMER
            )

        output.append(VoiceSampleDetailSchema(
            id=s.id,
            patient_id=s.patient_id,
            timestamp=s.timestamp,
            task_type=s.task_type,
            audio_duration_sec=s.audio_duration_sec,
            sample_rate=s.sample_rate,
            status=s.status,
            features=feat_schema,
            classification=class_schema,
            disclaimer=CLINICAL_SAFETY_DISCLAIMER
        ))

    return output
