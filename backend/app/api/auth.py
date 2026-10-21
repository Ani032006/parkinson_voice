import datetime
import random
import time
import re
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, or_

from backend.app.core import config
from backend.app.core.database import get_db
from backend.app.core.security import verify_password, get_password_hash, create_access_token, get_current_user, TokenData
from backend.app.models.models import User, Patient, Doctor, Caregiver
from backend.app.schemas.schemas import (
    UserLogin, UserRegister, UserResponse, TokenResponse,
    SendOTPRequest, VerifyOTPRequest, OTPResponse,
    UsernameCheckRequest, UsernameCheckResponse,
    ForgotPasswordRequest, ResetPasswordRequest, LoginOTPRequest
)
from backend.app.services.email_service import send_otp_email, send_password_reset_email
from backend.app.services.sms_service import send_phone_otp_sms, validate_e164_phone, format_e164_phone

router = APIRouter(prefix="/auth", tags=["Authentication"])

# In-memory storage structures
# ACTIVE_OTPS: key (email/phone) -> { "code": "123456", "expires_at": timestamp, "attempts": 0, "last_sent_at": timestamp }
ACTIVE_OTPS = {}

# PASSWORD_RESET_TOKENS: key (email) -> { "token": "123456", "expires_at": timestamp }
PASSWORD_RESET_TOKENS = {}

def validate_password_strength(password: str):
    """Enforces universal password safety rules."""
    if len(password) < 8:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Password must be at least 8 characters long."
        )
    if not re.search(r"[A-Z]", password):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Password must contain at least one uppercase letter (A-Z)."
        )
    if not re.search(r"[a-z]", password):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Password must contain at least one lowercase letter (a-z)."
        )
    if not re.search(r"[0-9]", password):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Password must contain at least one number (0-9)."
        )
    if not re.search(r"[!@#$%^&*()_+\-=\[\]{}|;:,.<>?]", password):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Password must contain at least one special character (!@#$%^&*...)."
        )

async def suggest_usernames(base_username: str, db: AsyncSession):
    """Generates 3 available alternative usernames if the base username is taken."""
    clean_base = re.sub(r"[^\w]", "", base_username.lower().strip()) or "user"
    suffixes = ["123", "2026", "_med", "99", "_pvc", "77"]
    suggestions = []
    
    for s in suffixes:
        cand = f"{clean_base}{s}"
        stmt = select(User).where(User.username == cand)
        res = await db.execute(stmt)
        if not res.scalar_one_or_none() and cand not in suggestions:
            suggestions.append(cand)
            if len(suggestions) >= 3:
                break
    return suggestions

@router.post("/check-username", response_model=UsernameCheckResponse)
async def check_username(req: UsernameCheckRequest, db: AsyncSession = Depends(get_db)):
    uname = req.username.strip().lower()
    if not uname:
        return UsernameCheckResponse(available=False, suggestions=[], message="Username cannot be blank.")

    stmt = select(User).where(User.username == uname)
    res = await db.execute(stmt)
    existing = res.scalar_one_or_none()

    if existing:
        suggestions = await suggest_usernames(uname, db)
        return UsernameCheckResponse(
            available=False,
            suggestions=suggestions,
            message=f"Username '{uname}' is already taken. You can pick one of the suggestions below or choose another."
        )

    return UsernameCheckResponse(available=True, suggestions=[], message="Username is available!")

@router.post("/send-otp", response_model=OTPResponse)
async def send_otp(req: SendOTPRequest, db: AsyncSession = Depends(get_db)):
    channel = (req.channel or "EMAIL").upper()
    now = time.time()

    if channel == "PHONE":
        raw_phone = (req.phone or "").strip()
        if validate_e164_phone(raw_phone):
            clean_phone = raw_phone
        else:
            clean_phone = format_e164_phone(raw_phone)
            if not validate_e164_phone(clean_phone):
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="Invalid phone number. Must be a 10-digit number or international E.164 format (e.g., +919876543210)."
                )
        
        # Check if phone number is already registered
        stmt = select(User).where(User.phone_number == clean_phone)
        res = await db.execute(stmt)
        if res.scalar_one_or_none():
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"An account with phone number {clean_phone} already exists. Please log in instead."
            )
        target_key = f"phone:{clean_phone}"

    else:
        clean_email = (req.email or "").strip().lower()
        if not clean_email or "@" not in clean_email:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Invalid email address format."
            )
        
        # Check if email is already registered
        stmt = select(User).where(User.email == clean_email)
        res = await db.execute(stmt)
        if res.scalar_one_or_none():
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"An account with email address {clean_email} already exists. Please log in instead."
            )
        target_key = f"email:{clean_email}"

    # Rate limiting: 30-second resend cooldown check
    existing = ACTIVE_OTPS.get(target_key)
    if existing and (now - existing.get("last_sent_at", 0)) < config.RESEND_COOLDOWN_SECONDS:
        remaining = int(config.RESEND_COOLDOWN_SECONDS - (now - existing["last_sent_at"]))
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail=f"Resend cooldown active. Please wait {remaining} seconds before requesting a new OTP code."
        )

    # Generate 6-digit random numeric code
    code = f"{random.randint(100000, 999999)}"
    expires_at = now + config.OTP_EXPIRY_SECONDS  # 5 minutes

    ACTIVE_OTPS[target_key] = {
        "code": code,
        "expires_at": expires_at,
        "attempts": 0,
        "last_sent_at": now
    }

    # Dispatch OTP via chosen provider
    if channel == "PHONE":
        clean_phone = target_key.replace("phone:", "")
        sent = await send_phone_otp_sms(clean_phone, code)
        if not sent:
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="Failed to send SMS OTP. Please check phone number or try again."
            )
        if not config.TWILIO_ACCOUNT_SID:
            msg = f"SMS OTP code sent to {clean_phone} (Dev Simulator Code: {code}). Valid for 5 minutes."
        else:
            msg = f"6-digit SMS OTP code sent to {clean_phone}. Valid for 5 minutes."
    else:
        clean_email = target_key.replace("email:", "")
        sent = await send_otp_email(
            recipient_email=clean_email,
            otp_code=code,
            username=req.username or "User"
        )
        if not sent:
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="Failed to send verification email via Gmail SMTP. Please check credentials or try again."
            )
        msg = f"Verification code sent to {clean_email}. Please check your email inbox."

    return OTPResponse(success=True, message=msg)

@router.post("/verify-otp", response_model=OTPResponse)
async def verify_otp(req: VerifyOTPRequest, db: AsyncSession = Depends(get_db)):
    channel = (req.channel or "EMAIL").upper()
    now = time.time()

    if channel == "PHONE":
        clean_phone = format_e164_phone(req.phone or "")
        if not clean_phone:
            raise HTTPException(status_code=400, detail="Phone number is required.")
        target_key = f"phone:{clean_phone}"
    else:
        if not req.email:
            raise HTTPException(status_code=400, detail="Email address is required.")
        target_key = f"email:{req.email.strip().lower()}"

    record = ACTIVE_OTPS.get(target_key)

    if not record:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="No active OTP code was found. Please click 'Send OTP' first."
        )

    # Expiry Check (5 minutes)
    if now > record["expires_at"]:
        ACTIVE_OTPS.pop(target_key, None)
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="OTP code has expired (5-minute limit). Please request a new OTP code."
        )

    # Code Verification
    if record["code"] != req.otp_code.strip():
        record["attempts"] += 1
        if record["attempts"] >= config.MAX_OTP_ATTEMPTS:
            ACTIVE_OTPS.pop(target_key, None)
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Maximum OTP verification attempts exceeded ({config.MAX_OTP_ATTEMPTS}/{config.MAX_OTP_ATTEMPTS}). Please request a new code."
            )
        remaining_tries = config.MAX_OTP_ATTEMPTS - record["attempts"]
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Invalid OTP code. {remaining_tries} attempt(s) remaining."
        )

    # Valid OTP -> clear record
    ACTIVE_OTPS.pop(target_key, None)

    return OTPResponse(
        success=True,
        message=f"{'Phone' if channel == 'PHONE' else 'Email'} OTP successfully verified!",
        token=None
    )

@router.post("/register", response_model=TokenResponse)
async def register(req: UserRegister, db: AsyncSession = Depends(get_db)):
    # Validate Password Complexity
    validate_password_strength(req.password)

    # Check if username exists
    uname = req.username.strip().lower()
    stmt = select(User).where(User.username == uname)
    res = await db.execute(stmt)
    if res.scalar_one_or_none():
        suggestions = await suggest_usernames(uname, db)
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Username '{uname}' is already taken. Suggested options: {', '.join(suggestions)}"
        )

    # Check duplicate email or phone number
    user_email = req.email.strip().lower() if (req.email and req.email.strip()) else f"{uname}@companion.local"
    user_phone = format_e164_phone(req.phone_number) if req.phone_number else None

    stmt_check = select(User).where(or_(User.email == user_email, User.username == uname))
    res_check = await db.execute(stmt_check)
    if res_check.scalar_one_or_none():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="An account with this username or email already exists. Please log in instead."
        )

    if user_phone:
        stmt_p = select(User).where(User.phone_number == user_phone)
        res_p = await db.execute(stmt_p)
        if res_p.scalar_one_or_none():
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"An account with phone number {user_phone} already exists. Please log in instead."
            )

    # Normalize role
    role = req.role.upper()
    if role not in ["PATIENT", "CAREGIVER", "DOCTOR"]:
        role = "PATIENT"

    # Create User
    new_user = User(
        username=uname,
        hashed_password=get_password_hash(req.password),
        full_name=req.full_name.strip(),
        email=user_email,
        phone_number=user_phone,
        role=role
    )
    db.add(new_user)
    await db.flush()

    patient_id = None
    doctor_id = None
    caregiver_id = None

    if role == "PATIENT":
        p = Patient(
            user_id=new_user.id,
            name=new_user.full_name,
            date_of_birth=None,
            diagnosis_year=None,
            baseline_hnr=20.0,
            doctor_id=None,
            caregiver_id=None,
            notes="NEEDS_ONBOARDING"
        )
        db.add(p)
        await db.flush()
        patient_id = p.id
        onboarding_completed = False
    elif role == "DOCTOR":
        d = Doctor(
            user_id=new_user.id,
            name=new_user.full_name,
            email=user_email,
            phone=user_phone or "555-0199",
            specialty="Neurology & Movement Disorders",
            clinic_name="Movement Disorders Clinic"
        )
        db.add(d)
        await db.flush()
        doctor_id = d.id
        onboarding_completed = True
    elif role == "CAREGIVER":
        c = Caregiver(
            user_id=new_user.id,
            name=new_user.full_name,
            email=user_email,
            phone=user_phone or "555-0199",
            relationship_type="Family Caregiver"
        )
        db.add(c)
        await db.flush()
        caregiver_id = c.id
        patient_id = None
        onboarding_completed = False
    else:
        onboarding_completed = True

    await db.commit()

    token_payload = {
        "user_id": new_user.id,
        "sub": new_user.username,
        "role": role,
        "patient_id": patient_id,
        "doctor_id": doctor_id,
        "caregiver_id": caregiver_id
    }
    token = create_access_token(token_payload)

    user_resp = UserResponse(
        id=new_user.id,
        username=new_user.username,
        full_name=new_user.full_name,
        email=new_user.email,
        role=role,
        patient_id=patient_id,
        doctor_id=doctor_id,
        caregiver_id=caregiver_id,
        onboarding_completed=onboarding_completed
    )

    return TokenResponse(access_token=token, token_type="bearer", user=user_resp)

@router.post("/login", response_model=TokenResponse)
async def login(credentials: UserLogin, db: AsyncSession = Depends(get_db)):
    target = credentials.username.strip().lower()
    
    # Check if user exists by username, email, or phone
    clean_phone = format_e164_phone(target) if (target.startswith("+") or target.isdigit()) else None
    
    conds = [User.username == target, User.email == target, User.phone_number == target]
    if clean_phone:
        conds.append(User.phone_number == clean_phone)
    
    stmt = select(User).where(or_(*conds))
    res = await db.execute(stmt)
    user = res.scalars().first()

    if not user:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Account not found for '{credentials.username}'. Please register first to create an account."
        )

    if not verify_password(credentials.password, user.hashed_password):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect password. Please check your password or use 'Forgot Password'."
        )

    patient_id = None
    doctor_id = None
    caregiver_id = None

    if user.role == "PATIENT":
        p_res = await db.execute(select(Patient).where(Patient.user_id == user.id))
        p = p_res.scalar_one_or_none()
        patient_id = p.id if p else None
    elif user.role == "DOCTOR":
        d_res = await db.execute(select(Doctor).where(Doctor.user_id == user.id))
        d = d_res.scalar_one_or_none()
        doctor_id = d.id if d else None
    elif user.role == "CAREGIVER":
        c_res = await db.execute(select(Caregiver).where(Caregiver.user_id == user.id))
        c = c_res.scalar_one_or_none()
        caregiver_id = c.id if c else None
        if c:
            p_res = await db.execute(select(Patient).where(Patient.caregiver_id == c.id))
            p = p_res.first()
            if p:
                patient_id = p[0].id

    token_payload = {
        "user_id": user.id,
        "sub": user.username,
        "role": user.role,
        "patient_id": patient_id,
        "doctor_id": doctor_id,
        "caregiver_id": caregiver_id
    }
    token = create_access_token(token_payload)

    onboarding_completed = True
    if user.username not in ["patient", "doctor", "caregiver"]:
        if user.role == "PATIENT":
            onboarding_completed = bool(p and p.notes != "NEEDS_ONBOARDING" and p.doctor_id is not None)
        elif user.role == "CAREGIVER":
            onboarding_completed = bool(patient_id is not None)

    user_resp = UserResponse(
        id=user.id,
        username=user.username,
        full_name=user.full_name,
        email=user.email,
        role=user.role,
        patient_id=patient_id,
        doctor_id=doctor_id,
        caregiver_id=caregiver_id,
        onboarding_completed=onboarding_completed
    )

    return TokenResponse(access_token=token, token_type="bearer", user=user_resp)

@router.post("/forgot-password", response_model=OTPResponse)
async def forgot_password(req: ForgotPasswordRequest, db: AsyncSession = Depends(get_db)):
    email = req.email.strip().lower()
    if not email or "@" not in email:
        raise HTTPException(status_code=400, detail="Please enter a valid email address.")

    stmt = select(User).where(User.email == email)
    res = await db.execute(stmt)
    user = res.scalar_one_or_none()

    if not user:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Account not found for email '{email}'. Please register first."
        )

    # Generate 6-digit reset token
    reset_token = f"{random.randint(100000, 999999)}"
    expires_at = time.time() + 900  # 15 minutes

    PASSWORD_RESET_TOKENS[email] = {
        "token": reset_token,
        "expires_at": expires_at
    }

    sent = await send_password_reset_email(email, reset_token, user.full_name)
    if not sent:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to send password reset email via Gmail SMTP."
        )

    return OTPResponse(
        success=True,
        message=f"Password reset link & code sent to {email}. Please check your email inbox!"
    )

@router.post("/reset-password", response_model=OTPResponse)
async def reset_password(req: ResetPasswordRequest, db: AsyncSession = Depends(get_db)):
    email = req.email.strip().lower()
    token_entry = PASSWORD_RESET_TOKENS.get(email)

    if not token_entry:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="No active password reset request found. Please request a new password reset."
        )

    if time.time() > token_entry["expires_at"]:
        PASSWORD_RESET_TOKENS.pop(email, None)
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Password reset token has expired (15-minute limit). Please request a new reset link."
        )

    if token_entry["token"] != req.reset_token.strip():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid reset security code. Please check your email inbox."
        )

    # Validate new password strength
    validate_password_strength(req.new_password)

    stmt = select(User).where(User.email == email)
    res = await db.execute(stmt)
    user = res.scalar_one_or_none()

    if not user:
        raise HTTPException(status_code=404, detail="User account not found.")

    user.hashed_password = get_password_hash(req.new_password)
    await db.commit()
    PASSWORD_RESET_TOKENS.pop(email, None)

    return OTPResponse(
        success=True,
        message="Your password has been successfully reset! You can now log in with your new password."
    )

@router.post("/login-otp-request", response_model=OTPResponse)
async def login_otp_request(req: LoginOTPRequest, db: AsyncSession = Depends(get_db)):
    channel = (req.channel or "EMAIL").upper()
    now = time.time()
    target = req.target.strip()

    if channel == "PHONE":
        clean_phone = format_e164_phone(target)
        if not clean_phone:
            raise HTTPException(status_code=400, detail="Invalid phone number format.")
        stmt = select(User).where(User.phone_number == clean_phone)
        res = await db.execute(stmt)
        user = res.scalar_one_or_none()
        if not user:
            raise HTTPException(
                status_code=400,
                detail=f"Account not found for phone number {clean_phone}. Please register first."
            )
        target_key = f"login_phone:{clean_phone}"
    else:
        clean_email = target.lower()
        stmt = select(User).where(User.email == clean_email)
        res = await db.execute(stmt)
        user = res.scalar_one_or_none()
        if not user:
            raise HTTPException(
                status_code=400,
                detail=f"Account not found for email {clean_email}. Please register first."
            )
        target_key = f"login_email:{clean_email}"

    code = f"{random.randint(100000, 999999)}"
    ACTIVE_OTPS[target_key] = {
        "code": code,
        "expires_at": now + 300,
        "attempts": 0,
        "user_id": user.id,
        "last_sent_at": now
    }

    if channel == "PHONE":
        sent = await send_phone_otp_sms(clean_phone, code)
        msg = f"SMS OTP login code sent to {clean_phone} (Dev Code: {code}). Valid for 5 minutes." if not config.TWILIO_ACCOUNT_SID else f"6-digit SMS OTP code sent to {clean_phone}."
    else:
        sent = await send_otp_email(clean_email, code, user.full_name)
        msg = f"6-digit login verification code sent to {clean_email}."

    return OTPResponse(success=True, message=msg)

@router.post("/login-otp-verify", response_model=TokenResponse)
async def login_otp_verify(req: VerifyOTPRequest, db: AsyncSession = Depends(get_db)):
    channel = (req.channel or "EMAIL").upper()
    now = time.time()

    if channel == "PHONE":
        clean_phone = format_e164_phone(req.phone or "")
        target_key = f"login_phone:{clean_phone}"
    else:
        clean_email = (req.email or "").strip().lower()
        target_key = f"login_email:{clean_email}"

    record = ACTIVE_OTPS.get(target_key)
    if not record or now > record["expires_at"]:
        raise HTTPException(status_code=400, detail="OTP code expired or invalid. Please request a new code.")

    if record["code"] != req.otp_code.strip():
        raise HTTPException(status_code=400, detail="Invalid OTP code.")

    user_id = record["user_id"]
    ACTIVE_OTPS.pop(target_key, None)

    stmt = select(User).where(User.id == user_id)
    res = await db.execute(stmt)
    user = res.scalar_one_or_none()

    if not user:
        raise HTTPException(status_code=404, detail="User account not found.")

    patient_id = None
    doctor_id = None
    caregiver_id = None

    if user.role == "PATIENT":
        p_res = await db.execute(select(Patient).where(Patient.user_id == user.id))
        p = p_res.scalar_one_or_none()
        patient_id = p.id if p else None
    elif user.role == "DOCTOR":
        d_res = await db.execute(select(Doctor).where(Doctor.user_id == user.id))
        d = d_res.scalar_one_or_none()
        doctor_id = d.id if d else None
    elif user.role == "CAREGIVER":
        c_res = await db.execute(select(Caregiver).where(Caregiver.user_id == user.id))
        c = c_res.scalar_one_or_none()
        caregiver_id = c.id if c else None

    token_payload = {
        "user_id": user.id,
        "sub": user.username,
        "role": user.role,
        "patient_id": patient_id,
        "doctor_id": doctor_id,
        "caregiver_id": caregiver_id
    }
    token = create_access_token(token_payload)

    user_resp = UserResponse(
        id=user.id,
        username=user.username,
        full_name=user.full_name,
        email=user.email,
        role=user.role,
        patient_id=patient_id,
        doctor_id=doctor_id,
        caregiver_id=caregiver_id
    )

    return TokenResponse(access_token=token, token_type="bearer", user=user_resp)

@router.get("/me", response_model=UserResponse)
async def get_me(
    current_user: TokenData = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    stmt = select(User).where(User.id == current_user.user_id)
    res = await db.execute(stmt)
    user = res.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    onboarding_completed = True
    if user.username not in ["patient", "doctor", "caregiver"]:
        if user.role == "PATIENT":
            p_res = await db.execute(select(Patient).where(Patient.user_id == user.id))
            p = p_res.scalar_one_or_none()
            onboarding_completed = bool(p and p.notes != "NEEDS_ONBOARDING" and p.doctor_id is not None)
        elif user.role == "CAREGIVER":
            c_res = await db.execute(select(Caregiver).where(Caregiver.user_id == user.id))
            c = c_res.scalar_one_or_none()
            if c:
                p_res = await db.execute(select(Patient).where(Patient.caregiver_id == c.id))
                onboarding_completed = bool(p_res.first())
            else:
                onboarding_completed = False

    return UserResponse(
        id=user.id,
        username=user.username,
        full_name=user.full_name,
        email=user.email,
        role=user.role,
        patient_id=current_user.patient_id,
        doctor_id=current_user.doctor_id,
        caregiver_id=current_user.caregiver_id,
        onboarding_completed=onboarding_completed
    )
