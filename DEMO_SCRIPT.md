# Parkinson's Voice Companion — Live Academic Demo & Viva Presentation Script

> **Document Version:** v1.0.0  
> **Target Audience:** External Evaluators, Faculty Examiners, Clinical Neurologists  
> **Student:** Aniruddh VK (Roll No: `24BAI1490`)  
> **Project Scope:** Passive Vocal Monitoring, Levodopa Wearing-Off Correlation, LSVT Speech Coaching & Decline Alerting System

---

## 1. System Architecture Overview (30-Second Elevator Pitch)

"Parkinson's Disease affects 10 million patients worldwide, with **89% experiencing hypophonia and vocal tremor years before motor symptoms appear**. 

Our system, **Parkinson's Voice Companion**, bridges the critical 3-to-6 month gap between neurologist clinic visits through three decoupled tiers:
1. **Client Tier:** A responsive React 18 SPA providing role-adapted dashboards for Patients, Caregivers, and Doctors.
2. **Clinical Backend & ML Tier:** An asynchronous FastAPI server integrating a C++ Praat acoustic signal engine (`parselmouth`) that extracts 22 acoustic biomarkers in under 15ms and an ensemble classifier trained on 3,141 authentic clinical voice recordings (81.09% 5-fold CV accuracy, 0.885 ROC-AUC).
3. **Statistical Clinical Analytics:** Real-time change-point analysis ($\sigma$-shift alerting) and medication wearing-off correlation algorithms flagging pre-dose vocal deterioration."

---

## 2. Live 3-Beat Demonstration Walkthrough

### Beat 1: Patient Voice Check-In & LSVT Therapy Coach
1. **Log in as Patient:** Click **Demo Patient (Robert Jenkins)** on the login screen.
2. **Voice Check-In (`VoiceRecorder`):**
   - Click **Record Sustained 'AH' (3s)**.
   - Show the real-time audio waveform capture.
   - Highlight the **Acoustic Quality Validator** checking SNR, duration ($\ge 2\text{s}$), and energy floor.
   - Point out the instant classification results: Risk Score (e.g., $48.2\%$), Model Confidence ($88\%$), and extracted biomarkers (MDVP:Jitter %, Shimmer, HNR, F0).
3. **AI Speech Therapy Coach (`TherapyCoach`):**
   - Select **LSVT LOUD Sustained Phonation**.
   - Click **Start Therapy Exercise (10s)**.
   - Demonstrate the **live decibel meter gauge** showing real-time feedback when vocal volume reaches the clinical target ($\ge 75\text{ dB}$).
   - Show pitch stability calculation and automatic session persistence to database.
4. **Medication Logger (`MedicationLogger`):**
   - Click **Take Dose (Sinemet 25/100mg)** to log scheduled medication intake timestamp.

---

### Beat 2: Caregiver Watchtower & Real-Time Alerting
1. **Switch Role to Caregiver:** Click **Switch to Caregiver** or log in as **Sarah Jenkins**.
2. **Longitudinal Patient Health Cards:**
   - Display patient's current status: *Stable Voice Metrics*, *Last Dose Taken at 08:00 AM*.
3. **Decline Alert Notification Feed (`AlertsList`):**
   - Demonstrate the incoming alert queue (Urgent Decline Alerts vs. Gradual Trend Drift Warnings).
   - Click **Acknowledge Alert** to demonstrate optimistic UI updates and live state change to `ACKNOWLEDGED`.

---

### Beat 3: Neurologist Console & Levodopa Wearing-Off Correlation
1. **Switch Role to Doctor:** Log in as **Dr. Emily Vance (Movement Disorder Specialist)**.
2. **Composite 90-Day Longitudinal Trajectory (`DoctorView`):**
   - Point out the interactive Recharts trajectory displaying 89 longitudinal trend points.
   - **Crucial Clinical Highlight:** Show the **Red Dot Markers** on the chart indicating **Pre-Dose Wearing-Off Dips**—statistically significant vocal deterioration ($\ge 15\%$) occurring within the 2-hour window prior to scheduled levodopa doses.
3. **Time-Range Window Filtering:**
   - Toggle between **14d**, **30d**, **60d**, and **90d** to showcase dynamic data aggregation.
4. **Clinical Data Export:**
   - Click **Export CSV Report** to immediately download the comprehensive tabular clinical report for electronic health records (EHR).
5. **Prescription Schedule Modification:**
   - Click **Update Prescription Schedule** to adjust Sinemet dosages or intake intervals in response to wearing-off dips.

---

## 3. High-Yield Defense Q&A for Academic Evaluators

### Q1: Why not use a deep neural network (e.g., CNN / Transformer) instead of a feature-engineered ensemble?
> **Answer:** In neurodegenerative clinical monitoring, **interpretability and regulatory transparency are paramount**. Medical practitioners cannot act on "black box" latent representations. By utilizing Praat signal processing to compute standard phoniatric biomarkers (Jitter, Shimmer, HNR, PPE, DFA), clinicians can directly correlate risk scores with known physiological phenotypes (vocal cord atrophy and laryngeal bradykinesia). Furthermore, inference executes in $< 15\text{ms}$ on commodity hardware with zero GPU dependency.

### Q2: How does the system avoid false alarms from common colds or hoarseness?
> **Answer:** The **Decline Detection Service** uses rolling baseline standard deviations ($\sigma$-shift analysis) across longitudinal windows rather than isolated single-point thresholds. An `URGENT` alert requires a sudden jump of $\Delta \ge 0.20$ ($z \ge 2.8\sigma$), while gradual progression requires sustained drift across 6 or more consecutive samples.

### Q3: How do you handle patient privacy and security?
> **Answer:** All passwords are salted and hashed using `bcrypt`. Authentication uses short-lived JWT tokens with role-based access control (RBAC). Dual-factor OTP verification is supported via Gmail SMTP and Twilio SMS with rate-limiting, resend cooldowns, and brute-force attempt limits. Voice recordings are stored in a dedicated protected vault outside public static access.
