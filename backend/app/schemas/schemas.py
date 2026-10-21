import datetime
from typing import Optional, List, Any, Dict
from pydantic import BaseModel, Field, ConfigDict

# --- Auth Schemas ---
class UserLogin(BaseModel):
    username: str
    password: str

class UserRegister(BaseModel):
    username: str
    password: str
    full_name: str
    email: Optional[str] = Field(default=None)
    phone_number: Optional[str] = Field(default=None)
    role: str = "PATIENT"
    otp_code: Optional[str] = None

class SendOTPRequest(BaseModel):
    email: Optional[str] = Field(default=None)
    phone: Optional[str] = Field(default=None)
    channel: str = "EMAIL"  # "EMAIL" or "PHONE"
    username: Optional[str] = "User"

class VerifyOTPRequest(BaseModel):
    email: Optional[str] = Field(default=None)
    phone: Optional[str] = Field(default=None)
    channel: str = "EMAIL"  # "EMAIL" or "PHONE"
    otp_code: str

class OTPResponse(BaseModel):
    success: bool
    message: str
    token: Optional[str] = None  # Returned on successful phone login if account exists

class UsernameCheckRequest(BaseModel):
    username: str

class UsernameCheckResponse(BaseModel):
    available: bool
    suggestions: List[str] = []
    message: str

class ForgotPasswordRequest(BaseModel):
    email: str

class ResetPasswordRequest(BaseModel):
    email: str
    reset_token: str
    new_password: str

class LoginOTPRequest(BaseModel):
    target: str  # email address or phone number
    channel: str = "EMAIL"  # "EMAIL" or "PHONE"

class UserResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    username: str
    full_name: str
    email: str
    role: str
    patient_id: Optional[int] = None
    doctor_id: Optional[int] = None
    caregiver_id: Optional[int] = None
    onboarding_completed: bool = True

class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: UserResponse

# --- Clinical Onboarding Schemas ---
class DoctorOption(BaseModel):
    id: int
    name: str
    specialty: str
    clinic_name: str
    email: str
    phone: Optional[str] = None

class CaregiverOption(BaseModel):
    id: int
    name: str
    relationship_type: str
    phone: Optional[str] = None

class PatientOption(BaseModel):
    id: int
    name: str
    date_of_birth: Optional[str] = None
    diagnosis_year: Optional[int] = None

class CatalogMedicationOption(BaseModel):
    name: str
    dosage: str
    frequency: str
    scheduled_times: List[str]
    instructions: Optional[str] = None

class ClinicalDirectoryResponse(BaseModel):
    doctors: List[DoctorOption]
    caregivers: List[CaregiverOption]
    patients: List[PatientOption]
    common_medications: List[CatalogMedicationOption]

class OnboardingMedicationItem(BaseModel):
    name: str
    dosage: str
    frequency: str = "3x daily"
    scheduled_times: List[str] = ["08:00", "13:00", "18:00"]
    instructions: Optional[str] = None

class OnboardingRequest(BaseModel):
    # Patient onboarding fields
    doctor_choice: Optional[str] = "EXISTING"  # "EXISTING", "NEW", "NONE"
    doctor_id: Optional[int] = None
    new_doctor_name: Optional[str] = None
    new_doctor_specialty: Optional[str] = "Movement Disorders Neurology"
    new_doctor_clinic: Optional[str] = "Movement Disorders Center"
    new_doctor_email: Optional[str] = None
    new_doctor_phone: Optional[str] = None

    caregiver_choice: Optional[str] = "NONE"   # "EXISTING", "NEW", "NONE"
    caregiver_id: Optional[int] = None
    new_caregiver_name: Optional[str] = None
    new_caregiver_relationship: Optional[str] = "Family Member"
    new_caregiver_phone: Optional[str] = None

    date_of_birth: Optional[str] = None
    diagnosis_year: Optional[int] = None
    medications: List[OnboardingMedicationItem] = []

    # Caregiver onboarding fields
    patient_choice: Optional[str] = "EXISTING"  # "EXISTING", "NEW"
    patient_id: Optional[int] = None
    new_patient_name: Optional[str] = None
    new_patient_dob: Optional[str] = None
    new_patient_diagnosis_year: Optional[int] = None
    relationship_type: Optional[str] = None

# --- Feature & Classification Schemas ---
class ExtractedFeaturesSchema(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    jitter_local: Optional[float] = None
    jitter_rap: Optional[float] = None
    jitter_ppq5: Optional[float] = None
    shimmer_local: Optional[float] = None
    shimmer_apq3: Optional[float] = None
    shimmer_apq5: Optional[float] = None
    hnr: Optional[float] = None
    f0_mean: Optional[float] = None
    f0_std: Optional[float] = None
    f0_min: Optional[float] = None
    f0_max: Optional[float] = None
    ppe: Optional[float] = None
    spread1: Optional[float] = None
    spread2: Optional[float] = None

class ClassificationResultSchema(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    risk_score: float = Field(..., ge=0.0, le=1.0, description="Estimated voice acoustic risk score (0-1)")
    confidence: float = Field(..., ge=0.0, le=1.0, description="Model confidence indicator (0-1)")
    severity_level: str = Field(..., description="LOW_RISK, MILD, MODERATE, SEVERE")
    model_version: str
    inference_time_ms: float
    disclaimer: str

class VoiceSampleDetailSchema(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    patient_id: int
    timestamp: datetime.datetime
    task_type: str
    audio_duration_sec: float
    sample_rate: int
    status: str
    features: Optional[ExtractedFeaturesSchema] = None
    classification: Optional[ClassificationResultSchema] = None
    disclaimer: str

# --- Medication Schemas ---
class MedicationCreate(BaseModel):
    patient_id: int
    name: str
    dosage: str
    frequency: str
    scheduled_times: List[str] = ["08:00", "13:00", "18:00"]
    instructions: Optional[str] = None

class MedicationUpdate(BaseModel):
    name: Optional[str] = None
    dosage: Optional[str] = None
    frequency: Optional[str] = None
    scheduled_times: Optional[List[str]] = None
    instructions: Optional[str] = None
    is_active: Optional[bool] = None

class MedicationResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    patient_id: int
    doctor_id: int
    name: str
    dosage: str
    frequency: str
    scheduled_times: List[str]
    instructions: Optional[str] = None
    is_active: bool
    created_at: datetime.datetime

class MedicationLogCreate(BaseModel):
    medication_id: int
    status: str = Field(..., description="TAKEN, SKIPPED, DELAYED")
    scheduled_time: datetime.datetime
    actual_time: Optional[datetime.datetime] = None
    notes: Optional[str] = None

class MedicationLogResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    medication_id: int
    medication_name: str
    patient_id: int
    logged_by_user_id: int
    status: str
    scheduled_time: datetime.datetime
    actual_time: datetime.datetime
    notes: Optional[str] = None
    created_at: datetime.datetime
    wearing_off_detected: bool = False
    wearing_off_summary: Optional[str] = None

class WearingOffCorrelationItem(BaseModel):
    dose_time: datetime.datetime
    medication_name: str
    pre_dose_risk_score: Optional[float] = None
    post_dose_risk_score: Optional[float] = None
    delta_risk: Optional[float] = None
    is_wearing_off_dip: bool = False

# --- Therapy Schemas ---
class TherapySessionCreate(BaseModel):
    patient_id: Optional[int] = None
    exercise_type: str = "SUSTAINED_VOWEL_AH"
    target_pitch_hz: float = 160.0
    target_volume_db: float = 75.0
    duration_sec: float
    avg_volume_db: float
    pitch_stability_pct: float
    score: float
    feedback_notes: Optional[str] = None

class TherapySessionResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    patient_id: int
    exercise_type: str
    target_pitch_hz: float
    target_volume_db: float
    duration_sec: float
    avg_volume_db: float
    pitch_stability_pct: float
    score: float
    feedback_notes: Optional[str] = None
    timestamp: datetime.datetime

# --- Alert Schemas ---
class AlertResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    patient_id: int
    patient_name: Optional[str] = None
    type: str
    severity: str
    title: str
    message: str
    trigger_time: datetime.datetime
    status: str
    recipient_roles: List[str]
    acknowledged_at: Optional[datetime.datetime] = None

class AlertAcknowledgeRequest(BaseModel):
    status: str = "ACKNOWLEDGED"

# --- Dashboard Schemas ---
class PatientSummary(BaseModel):
    id: int
    name: str
    date_of_birth: Optional[str] = None
    diagnosis_year: Optional[int] = None
    doctor_name: Optional[str] = None
    caregiver_name: Optional[str] = None
    latest_risk_score: Optional[float] = None
    latest_severity_level: Optional[str] = "NORMAL"
    active_alerts_count: int = 0
    wearing_off_pattern_flagged: bool = False
    last_sample_date: Optional[datetime.datetime] = None

class LongitudinalTrendPoint(BaseModel):
    date: str
    risk_score: float
    confidence: float
    severity_level: str
    jitter: Optional[float] = None
    shimmer: Optional[float] = None
    hnr: Optional[float] = None
    f0_mean: Optional[float] = None
    medication_taken: bool = False
    medication_name: Optional[str] = None
    is_pre_dose_dip: bool = False

class DoctorPatientDetailDashboard(BaseModel):
    patient: PatientSummary
    trend_90d: List[LongitudinalTrendPoint]
    active_medications: List[MedicationResponse]
    recent_medication_logs: List[MedicationLogResponse]
    recent_therapy_sessions: List[TherapySessionResponse]
    alerts: List[AlertResponse]
    wearing_off_summary: Dict[str, Any]
    disclaimer: str
