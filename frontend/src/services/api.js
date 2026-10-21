const API_BASE = '/api';

export const getStoredToken = () => localStorage.getItem('pvc_token');
export const setStoredToken = (token) => localStorage.setItem('pvc_token', token);
export const removeStoredToken = () => localStorage.removeItem('pvc_token');

async function request(endpoint, options = {}) {
  const token = getStoredToken();
  const headers = { ...options.headers };

  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  if (!(options.body instanceof FormData)) {
    headers['Content-Type'] = 'application/json';
  }

  let response;
  try {
    response = await fetch(`${API_BASE}${endpoint}`, {
      ...options,
      headers,
    });
  } catch (netErr) {
    const error = new Error("Can't reach server — check your connection");
    error.isNetworkError = true;
    error.originalError = netErr;
    throw error;
  }

  if (!response.ok) {
    let errorDetail = 'API Request Failed';
    try {
      const errJson = await response.json();
      errorDetail = errJson.detail || errJson.message || JSON.stringify(errJson);
    } catch (_) {}
    const error = new Error(errorDetail);
    error.isNetworkError = false;
    error.status = response.status;
    throw error;
  }

  return response.json();
}

export const api = {
  // Auth
  async login(username, password) {
    const data = await request('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ username, password }),
    });
    if (data.access_token) {
      setStoredToken(data.access_token);
    }
    return data;
  },

  async register(userData) {
    const data = await request('/auth/register', {
      method: 'POST',
      body: JSON.stringify(userData),
    });
    if (data.access_token) {
      setStoredToken(data.access_token);
    }
    return data;
  },

  async sendOTP(target, username = 'User', channel = 'EMAIL') {
    const payload = channel === 'PHONE'
      ? { phone: target, email: null, username, channel: 'PHONE' }
      : { email: target, phone: null, username, channel: 'EMAIL' };
    return request('/auth/send-otp', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },

  async verifyOTP(target, otp_code, channel = 'EMAIL') {
    const payload = channel === 'PHONE'
      ? { phone: target, email: null, otp_code, channel: 'PHONE' }
      : { email: target, phone: null, otp_code, channel: 'EMAIL' };
    const data = await request('/auth/verify-otp', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
    if (data.token) {
      setStoredToken(data.token);
    }
    return data;
  },

  async checkUsername(username) {
    return request('/auth/check-username', {
      method: 'POST',
      body: JSON.stringify({ username }),
    });
  },

  async forgotPassword(email) {
    return request('/auth/forgot-password', {
      method: 'POST',
      body: JSON.stringify({ email }),
    });
  },

  async resetPassword(email, reset_token, new_password) {
    return request('/auth/reset-password', {
      method: 'POST',
      body: JSON.stringify({ email, reset_token, new_password }),
    });
  },

  async sendLoginOTP(target, channel = 'EMAIL') {
    return request('/auth/login-otp-request', {
      method: 'POST',
      body: JSON.stringify({ target, channel }),
    });
  },

  async verifyLoginOTP(target, otp_code, channel = 'EMAIL') {
    const payload = channel === 'PHONE'
      ? { phone: target, email: null, otp_code, channel: 'PHONE' }
      : { email: target, phone: null, otp_code, channel: 'EMAIL' };
    const data = await request('/auth/login-otp-verify', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
    if (data.access_token) {
      setStoredToken(data.access_token);
    }
    return data;
  },

  async getMe() {
    return request('/auth/me');
  },

  // Patients
  async getPatients() {
    return request('/patients');
  },

  async getClinicalDirectory() {
    return request('/patients/clinical-directory');
  },

  async submitClinicalOnboarding(payload) {
    return request('/patients/onboarding', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },

  async getPatient(id) {
    return request(`/patients/${id}`);
  },

  async getCaregiverStatus(patientId) {
    return request(`/patients/${patientId}/caregiver-status`);
  },

  // Voice Samples & ML Classification
  async uploadVoiceSample(fileBlob, patientId, taskType = 'SUSTAINED_A') {
    const formData = new FormData();
    formData.append('file', fileBlob, 'recording.wav');
    formData.append('task_type', taskType);
    if (patientId) {
      formData.append('patient_id', patientId.toString());
    }

    return request('/voice-samples/upload', {
      method: 'POST',
      body: formData,
    });
  },

  async getPatientVoiceSamples(patientId) {
    return request(`/voice-samples/patient/${patientId}`);
  },

  // Medications
  async getPatientMedications(patientId) {
    return request(`/medications/patient/${patientId}`);
  },

  async createMedication(medData) {
    return request('/medications', {
      method: 'POST',
      body: JSON.stringify(medData),
    });
  },

  async updateMedication(medId, updateData) {
    return request(`/medications/${medId}`, {
      method: 'PUT',
      body: JSON.stringify(updateData),
    });
  },

  async logMedicationIntake(logData) {
    return request('/medications/log', {
      method: 'POST',
      body: JSON.stringify(logData),
    });
  },

  async getMedicationLogs(patientId) {
    return request(`/medications/logs/patient/${patientId}`);
  },

  // Therapy
  async saveTherapySession(sessionData) {
    return request('/therapy/sessions', {
      method: 'POST',
      body: JSON.stringify(sessionData),
    });
  },

  async getTherapyHistory(patientId) {
    return request(`/therapy/patient/${patientId}`);
  },

  // Alerts
  async getAlerts(params = {}) {
    const query = new URLSearchParams(params).toString();
    return request(`/alerts${query ? `?${query}` : ''}`);
  },

  async acknowledgeAlert(alertId) {
    return request(`/alerts/${alertId}/acknowledge`, {
      method: 'PUT',
      body: JSON.stringify({ status: 'ACKNOWLEDGED' }),
    });
  },

  async triggerTestAlert(patientId, alertType = 'DECLINE_SUDDEN', severity = 'URGENT') {
    return request(`/alerts/test-trigger?patient_id=${patientId}&alert_type=${alertType}&severity=${severity}`, {
      method: 'POST',
    });
  },

  // Clinical Dashboard
  async getDoctorDashboard(patientId, days = 90) {
    return request(`/dashboard/doctor/patient/${patientId}?days=${days}`);
  }
};
