import json
import re
import random
import datetime
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, desc
from backend.app.core.database import get_db
from backend.app.core.security import get_current_user, TokenData, get_password_hash
from backend.app.models.models import User, Patient, Doctor, Caregiver, VoiceSample, ClassificationResult, Alert, Medication, MedicationLog, TherapySession
from backend.app.schemas.schemas import (
    PatientSummary, ClinicalDirectoryResponse, DoctorOption,
    CaregiverOption, PatientOption, CatalogMedicationOption, OnboardingRequest
)

router = APIRouter(prefix="/patients", tags=["Patients"])

@router.get("", response_model=List[PatientSummary])
async def list_patients(
    current_user: TokenData = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """
    Returns patients accessible to the current user according to RBAC.
    """
    if current_user.role == "DOCTOR":
        stmt = select(Patient).where(Patient.doctor_id == current_user.doctor_id)
    elif current_user.role == "CAREGIVER":
        stmt = select(Patient).where(Patient.caregiver_id == current_user.caregiver_id)
    elif current_user.role == "PATIENT":
        stmt = select(Patient).where(Patient.id == current_user.patient_id)
    else:
        stmt = select(Patient)

    res = await db.execute(stmt)
    patients = res.scalars().all()

    summaries = []
    for p in patients:
        # Fetch latest classification
        sample_stmt = (
            select(VoiceSample, ClassificationResult)
            .outerjoin(ClassificationResult, VoiceSample.id == ClassificationResult.voice_sample_id)
            .where(VoiceSample.patient_id == p.id)
            .where(VoiceSample.status == "CLASSIFIED")
            .order_by(desc(VoiceSample.timestamp))
            .limit(1)
        )
        sample_res = await db.execute(sample_stmt)
        latest_sample = sample_res.first()

        latest_risk = latest_sample[1].risk_score if latest_sample and latest_sample[1] else None
        latest_sev = latest_sample[1].severity_level if latest_sample and latest_sample[1] else "NORMAL"
        last_date = latest_sample[0].timestamp if latest_sample else None

        # Fetch active alerts count
        alert_stmt = (
            select(Alert)
            .where(Alert.patient_id == p.id)
            .where(Alert.status == "ACTIVE")
        )
        alert_res = await db.execute(alert_stmt)
        active_alerts = alert_res.scalars().all()
        has_wearing_off = any(a.type == "WEARING_OFF_DIP" for a in active_alerts)

        # Lookup doctor & caregiver names
        doc_name = None
        if p.doctor_id:
            d_res = await db.execute(select(Doctor).where(Doctor.id == p.doctor_id))
            d = d_res.scalar_one_or_none()
            if d:
                doc_name = d.name

        cg_name = None
        if p.caregiver_id:
            c_res = await db.execute(select(Caregiver).where(Caregiver.id == p.caregiver_id))
            c = c_res.scalar_one_or_none()
            if c:
                cg_name = c.name

        summaries.append(PatientSummary(
            id=p.id,
            name=p.name,
            date_of_birth=p.date_of_birth,
            diagnosis_year=p.diagnosis_year,
            doctor_name=doc_name,
            caregiver_name=cg_name,
            latest_risk_score=latest_risk,
            latest_severity_level=latest_sev,
            active_alerts_count=len(active_alerts),
            wearing_off_pattern_flagged=has_wearing_off,
            last_sample_date=last_date
        ))

    return summaries

COMMON_PARKINSONS_MEDICATIONS = [
    CatalogMedicationOption(
        name="Carbidopa-Levodopa (Sinemet)",
        dosage="25/100 mg",
        frequency="3x daily",
        scheduled_times=["08:00", "13:00", "18:00"],
        instructions="Take 30-45 minutes before meals with a glass of water."
    ),
    CatalogMedicationOption(
        name="Carbidopa-Levodopa ER (Sinemet CR)",
        dosage="50/200 mg",
        frequency="2x daily",
        scheduled_times=["08:00", "20:00"],
        instructions="Extended-release formula for smooth daytime and overnight symptom control."
    ),
    CatalogMedicationOption(
        name="Pramipexole (Mirapex)",
        dosage="0.5 mg",
        frequency="3x daily",
        scheduled_times=["08:00", "14:00", "20:00"],
        instructions="Dopamine agonist. Take with meals to minimize lightheadedness or nausea."
    ),
    CatalogMedicationOption(
        name="Ropinirole (Requip)",
        dosage="2 mg",
        frequency="3x daily",
        scheduled_times=["08:00", "14:00", "20:00"],
        instructions="Titrated dopamine agonist for tremor and rigidity reduction."
    ),
    CatalogMedicationOption(
        name="Rasagiline (Azilect)",
        dosage="1 mg",
        frequency="1x daily (Morning)",
        scheduled_times=["08:00"],
        instructions="Selective irreversible MAO-B inhibitor taken once every morning."
    ),
    CatalogMedicationOption(
        name="Amantadine HCl",
        dosage="100 mg",
        frequency="2x daily",
        scheduled_times=["08:00", "14:00"],
        instructions="NMDA receptor antagonist targeting levodopa-induced dyskinesia."
    ),
    CatalogMedicationOption(
        name="Entacapone (Comtan)",
        dosage="200 mg",
        frequency="With each Sinemet dose",
        scheduled_times=["08:00", "13:00", "18:00"],
        instructions="COMT inhibitor taken simultaneously with Carbidopa-Levodopa to prolong on-time."
    ),
]

@router.get("/clinical-directory", response_model=ClinicalDirectoryResponse)
async def get_clinical_directory(
    db: AsyncSession = Depends(get_db)
):
    """
    Returns registered doctors, caregivers, and patients from the database,
    plus the standard Parkinson's medications catalog for onboarding selection.
    """
    doc_res = await db.execute(select(Doctor).order_by(Doctor.name))
    doctors = [
        DoctorOption(
            id=d.id,
            name=d.name,
            specialty=d.specialty or "Neurology & Movement Disorders",
            clinic_name=d.clinic_name or "Movement Disorders Center",
            email=d.email,
            phone=d.phone
        )
        for d in doc_res.scalars().all()
    ]

    cg_res = await db.execute(select(Caregiver).order_by(Caregiver.name))
    caregivers = [
        CaregiverOption(
            id=c.id,
            name=c.name,
            relationship_type=c.relationship_type or "Family Caregiver",
            phone=c.phone
        )
        for c in cg_res.scalars().all()
    ]

    pat_res = await db.execute(select(Patient).order_by(Patient.name))
    patients = [
        PatientOption(
            id=p.id,
            name=p.name,
            date_of_birth=str(p.date_of_birth) if p.date_of_birth else None,
            diagnosis_year=p.diagnosis_year
        )
        for p in pat_res.scalars().all()
    ]

    return ClinicalDirectoryResponse(
        doctors=doctors,
        caregivers=caregivers,
        patients=patients,
        common_medications=COMMON_PARKINSONS_MEDICATIONS
    )

@router.post("/onboarding")
async def save_clinical_onboarding(
    req: OnboardingRequest,
    current_user: TokenData = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """
    Saves new patient/caregiver clinical setup to the database.
    Allows linking existing doctors/caregivers or creating new ones,
    and initializing Parkinson's medications schedule.
    """
    if current_user.role == "PATIENT":
        p_res = await db.execute(select(Patient).where(Patient.user_id == current_user.user_id))
        patient = p_res.scalar_one_or_none()
        if not patient:
            raise HTTPException(status_code=404, detail="Patient profile not found")

        # 1. Attending Doctor Handling
        if req.doctor_choice == "NEW" and req.new_doctor_name and req.new_doctor_name.strip():
            doc_uname = re.sub(r"[^\w]", "", req.new_doctor_name.lower()) + f"_{random.randint(100, 999)}"
            doc_email = req.new_doctor_email.strip().lower() if req.new_doctor_email else f"{doc_uname}@clinic.local"
            doc_user = User(
                username=doc_uname,
                hashed_password=get_password_hash("DoctorPass123!"),
                full_name=req.new_doctor_name.strip(),
                email=doc_email,
                phone_number=req.new_doctor_phone,
                role="DOCTOR"
            )
            db.add(doc_user)
            await db.flush()

            new_doc = Doctor(
                user_id=doc_user.id,
                name=req.new_doctor_name.strip(),
                email=doc_email,
                phone=req.new_doctor_phone or "",
                specialty=req.new_doctor_specialty or "Movement Disorders Neurology",
                clinic_name=req.new_doctor_clinic or "Movement Disorders Clinic"
            )
            db.add(new_doc)
            await db.flush()
            patient.doctor_id = new_doc.id
        elif req.doctor_choice == "EXISTING" and req.doctor_id:
            patient.doctor_id = req.doctor_id
        elif patient.doctor_id is None:
            first_doc = (await db.execute(select(Doctor).limit(1))).scalar_one_or_none()
            if first_doc:
                patient.doctor_id = first_doc.id

        # 2. Caregiver Handling
        if req.caregiver_choice == "NEW" and req.new_caregiver_name and req.new_caregiver_name.strip():
            cg_uname = re.sub(r"[^\w]", "", req.new_caregiver_name.lower()) + f"_{random.randint(100, 999)}"
            cg_user = User(
                username=cg_uname,
                hashed_password=get_password_hash("CaregiverPass123!"),
                full_name=req.new_caregiver_name.strip(),
                email=f"{cg_uname}@caregiver.local",
                phone_number=req.new_caregiver_phone,
                role="CAREGIVER"
            )
            db.add(cg_user)
            await db.flush()

            new_cg = Caregiver(
                user_id=cg_user.id,
                name=req.new_caregiver_name.strip(),
                email=cg_user.email,
                phone=req.new_caregiver_phone or "",
                relationship_type=req.new_caregiver_relationship or "Family Caregiver"
            )
            db.add(new_cg)
            await db.flush()
            patient.caregiver_id = new_cg.id
        elif req.caregiver_choice == "EXISTING" and req.caregiver_id:
            patient.caregiver_id = req.caregiver_id

        # 3. Patient Clinical Baseline
        if req.date_of_birth:
            patient.date_of_birth = req.date_of_birth
        if req.diagnosis_year:
            patient.diagnosis_year = req.diagnosis_year
        patient.notes = "ONBOARDING_COMPLETED"

        # 4. Medication Initialization
        if req.medications and len(req.medications) > 0:
            for m in req.medications:
                med = Medication(
                    patient_id=patient.id,
                    doctor_id=patient.doctor_id or 1,
                    name=m.name.strip(),
                    dosage=m.dosage.strip(),
                    frequency=m.frequency.strip(),
                    scheduled_times_json=json.dumps(m.scheduled_times or ["08:00", "13:00", "18:00"]),
                    instructions=m.instructions or "Take with water as prescribed.",
                    is_active=True
                )
                db.add(med)

        await db.commit()
        await db.refresh(patient)

        return {
            "success": True,
            "message": "Clinical onboarding completed! Your doctor, caregiver, and medication schedules are saved.",
            "patient_id": patient.id,
            "doctor_id": patient.doctor_id,
            "caregiver_id": patient.caregiver_id,
            "onboarding_completed": True
        }

    elif current_user.role == "CAREGIVER":
        c_res = await db.execute(select(Caregiver).where(Caregiver.user_id == current_user.user_id))
        caregiver = c_res.scalar_one_or_none()
        if not caregiver:
            raise HTTPException(status_code=404, detail="Caregiver profile not found")

        if req.relationship_type:
            caregiver.relationship_type = req.relationship_type

        linked_patient_id = None
        if req.patient_choice == "NEW" and req.new_patient_name and req.new_patient_name.strip():
            pat_uname = re.sub(r"[^\w]", "", req.new_patient_name.lower()) + f"_{random.randint(100, 999)}"
            pat_user = User(
                username=pat_uname,
                hashed_password=get_password_hash("PatientPass123!"),
                full_name=req.new_patient_name.strip(),
                email=f"{pat_uname}@companion.local",
                role="PATIENT"
            )
            db.add(pat_user)
            await db.flush()

            new_pat = Patient(
                user_id=pat_user.id,
                name=req.new_patient_name.strip(),
                date_of_birth=req.new_patient_dob or "1960-01-01",
                diagnosis_year=req.new_patient_diagnosis_year or datetime.datetime.now().year,
                caregiver_id=caregiver.id,
                doctor_id=1,
                notes="ONBOARDING_COMPLETED"
            )
            db.add(new_pat)
            await db.flush()
            linked_patient_id = new_pat.id
        elif req.patient_choice == "EXISTING" and req.patient_id:
            p_to_link = (await db.execute(select(Patient).where(Patient.id == req.patient_id))).scalar_one_or_none()
            if p_to_link:
                p_to_link.caregiver_id = caregiver.id
                linked_patient_id = p_to_link.id

        await db.commit()

        return {
            "success": True,
            "message": "Caregiver setup completed! You are now linked to your patient's real-time monitoring.",
            "caregiver_id": caregiver.id,
            "linked_patient_id": linked_patient_id,
            "onboarding_completed": True
        }

    return {
        "success": True,
        "message": "Profile updated.",
        "onboarding_completed": True
    }

@router.get("/{patient_id}", response_model=PatientSummary)
async def get_patient(
    patient_id: int,
    current_user: TokenData = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    # RBAC check
    if current_user.role == "PATIENT" and current_user.patient_id != patient_id:
        raise HTTPException(status_code=403, detail="Access denied to patient profile")

    stmt = select(Patient).where(Patient.id == patient_id)
    res = await db.execute(stmt)
    p = res.scalar_one_or_none()
    if not p:
        raise HTTPException(status_code=404, detail="Patient not found")

    if current_user.role == "DOCTOR" and p.doctor_id != current_user.doctor_id:
        raise HTTPException(status_code=403, detail="Patient is not assigned to your clinic")
    if current_user.role == "CAREGIVER" and p.caregiver_id != current_user.caregiver_id:
        raise HTTPException(status_code=403, detail="Patient is not linked to your caregiver account")

    # Fetch latest status
    sample_stmt = (
        select(VoiceSample, ClassificationResult)
        .outerjoin(ClassificationResult, VoiceSample.id == ClassificationResult.voice_sample_id)
        .where(VoiceSample.patient_id == p.id)
        .where(VoiceSample.status == "CLASSIFIED")
        .order_by(desc(VoiceSample.timestamp))
        .limit(1)
    )
    sample_res = await db.execute(sample_stmt)
    latest_sample = sample_res.first()

    latest_risk = latest_sample[1].risk_score if latest_sample and latest_sample[1] else None
    latest_sev = latest_sample[1].severity_level if latest_sample and latest_sample[1] else "NORMAL"
    last_date = latest_sample[0].timestamp if latest_sample else None

    alert_stmt = select(Alert).where(Alert.patient_id == p.id).where(Alert.status == "ACTIVE")
    alert_res = await db.execute(alert_stmt)
    active_alerts = alert_res.scalars().all()

    # Lookup doctor & caregiver names
    doc_name = None
    if p.doctor_id:
        d_res = await db.execute(select(Doctor).where(Doctor.id == p.doctor_id))
        d = d_res.scalar_one_or_none()
        if d:
            doc_name = d.name

    cg_name = None
    if p.caregiver_id:
        c_res = await db.execute(select(Caregiver).where(Caregiver.id == p.caregiver_id))
        c = c_res.scalar_one_or_none()
        if c:
            cg_name = c.name

    return PatientSummary(
        id=p.id,
        name=p.name,
        date_of_birth=p.date_of_birth,
        diagnosis_year=p.diagnosis_year,
        doctor_name=doc_name,
        caregiver_name=cg_name,
        latest_risk_score=latest_risk,
        latest_severity_level=latest_sev,
        active_alerts_count=len(active_alerts),
        wearing_off_pattern_flagged=any(a.type == "WEARING_OFF_DIP" for a in active_alerts),
        last_sample_date=last_date
    )

@router.get("/{patient_id}/caregiver-status")
async def get_caregiver_patient_status(
    patient_id: int,
    current_user: TokenData = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """
    Returns compact status update summary for the Caregiver view:
    - Latest acoustic risk & severity
    - Last logged medication intake
    - Last speech therapy session date & score
    - Active alerts summary
    """
    stmt = select(Patient).where(Patient.id == patient_id)
    res = await db.execute(stmt)
    p = res.scalar_one_or_none()
    if not p:
        raise HTTPException(status_code=404, detail="Patient not found")

    if current_user.role == "CAREGIVER" and p.caregiver_id != current_user.caregiver_id:
        raise HTTPException(status_code=403, detail="Patient is not linked to your caregiver account")
    if current_user.role == "PATIENT" and p.id != current_user.patient_id:
        raise HTTPException(status_code=403, detail="Access denied")

    # 1. Latest Voice Sample Classification
    sample_stmt = (
        select(VoiceSample, ClassificationResult)
        .outerjoin(ClassificationResult, VoiceSample.id == ClassificationResult.voice_sample_id)
        .where(VoiceSample.patient_id == p.id)
        .where(VoiceSample.status == "CLASSIFIED")
        .order_by(desc(VoiceSample.timestamp))
        .limit(1)
    )
    sample_res = await db.execute(sample_stmt)
    latest_sample = sample_res.first()

    latest_risk = latest_sample[1].risk_score if latest_sample and latest_sample[1] else None
    latest_sev = latest_sample[1].severity_level if latest_sample and latest_sample[1] else "NORMAL"
    last_sample_date = latest_sample[0].timestamp if latest_sample else None

    # 2. Last Logged Medication Dose
    med_log_stmt = (
        select(MedicationLog, Medication.name)
        .join(Medication, MedicationLog.medication_id == Medication.id)
        .where(MedicationLog.patient_id == p.id)
        .order_by(desc(MedicationLog.created_at))
        .limit(1)
    )
    med_log_res = await db.execute(med_log_stmt)
    last_med_row = med_log_res.first()

    last_med_info = None
    if last_med_row:
        mlog, mname = last_med_row
        last_med_info = {
            "id": mlog.id,
            "medication_name": mname,
            "status": mlog.status,
            "scheduled_time": mlog.scheduled_time.isoformat() if mlog.scheduled_time else None,
            "actual_time": mlog.actual_time.isoformat() if mlog.actual_time else None,
            "notes": mlog.notes
        }

    # 3. Last Speech Therapy Session
    therapy_stmt = (
        select(TherapySession)
        .where(TherapySession.patient_id == p.id)
        .order_by(desc(TherapySession.timestamp))
        .limit(1)
    )
    therapy_res = await db.execute(therapy_stmt)
    last_th = therapy_res.scalar_one_or_none()

    last_therapy_info = None
    if last_th:
        last_therapy_info = {
            "id": last_th.id,
            "exercise_type": last_th.exercise_type,
            "score": last_th.score,
            "timestamp": last_th.timestamp.isoformat() if last_th.timestamp else None
        }

    # 4. Active Alerts Count
    alert_stmt = select(Alert).where(Alert.patient_id == p.id).where(Alert.status == "ACTIVE")
    alert_res = await db.execute(alert_stmt)
    active_alerts = alert_res.scalars().all()

    # Doctor name
    doc_name = None
    if p.doctor_id:
        d_res = await db.execute(select(Doctor).where(Doctor.id == p.doctor_id))
        d = d_res.scalar_one_or_none()
        if d:
            doc_name = d.name

    return {
        "patient": {
            "id": p.id,
            "name": p.name,
            "diagnosis_year": p.diagnosis_year,
            "doctor_name": doc_name,
            "latest_risk_score": latest_risk,
            "latest_severity_level": latest_sev,
            "last_sample_date": last_sample_date.isoformat() if last_sample_date else None,
        },
        "status_summary": {
            "active_alerts_count": len(active_alerts),
            "wearing_off_flagged": any(a.type == "WEARING_OFF_DIP" for a in active_alerts),
            "last_logged_medication": last_med_info,
            "last_therapy_session": last_therapy_info,
        }
    }

