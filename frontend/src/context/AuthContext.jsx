import React, { createContext, useContext, useState, useEffect } from 'react';
import { api, setStoredToken, removeStoredToken, getStoredToken } from '../services/api';

const AuthContext = createContext(null);

const DEMO_CREDENTIALS = {
  PATIENT: { username: 'patient', password: 'patient123' },
  CAREGIVER: { username: 'caregiver', password: 'caregiver123' },
  DOCTOR: { username: 'doctor', password: 'doctor123' },
};

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [activeRole, setActiveRole] = useState('PATIENT');
  const [loading, setLoading] = useState(true);
  const [activeToast, setActiveToast] = useState(null);
  const [ws, setWs] = useState(null);

  // Initialize session
  useEffect(() => {
    async function initAuth() {
      try {
        const token = getStoredToken();
        if (token) {
          const me = await api.getMe();
          setUser(me);
          setActiveRole(me.role);
        } else {
          setUser(null);
        }
      } catch (err) {
        console.warn('Initial session restore failed:', err);
        removeStoredToken();
        setUser(null);
      } finally {
        setLoading(false);
      }
    }
    initAuth();
  }, []);

  // Maintain WebSocket connection for real-time alert updates
  useEffect(() => {
    if (!user) return;

    let wsUrl;
    if (import.meta.env.VITE_WS_URL) {
      wsUrl = `${import.meta.env.VITE_WS_URL.replace(/\/$/, '')}/ws/${user.id}/${activeRole}`;
    } else {
      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      wsUrl = `${protocol}//${window.location.host}/ws/${user.id}/${activeRole}`;
    }

    let socket;
    try {
      socket = new WebSocket(wsUrl);
      socket.onopen = () => {
        console.log(`[WS] Connected to live alert channel for user ${user.id} (${activeRole})`);
      };

      socket.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          if (data.event === 'NEW_ALERT') {
            setActiveToast({
              id: data.alert.id,
              type: data.alert.type,
              severity: data.alert.severity,
              title: data.alert.title,
              message: data.alert.message,
              patientName: data.alert.patient_name,
              time: new Date().toLocaleTimeString(),
            });
          }
        } catch (e) {
          console.error('[WS] Parse error:', e);
        }
      };

      socket.onclose = () => {
        console.log('[WS] Disconnected');
      };

      setWs(socket);
    } catch (e) {
      console.warn('[WS] Connection failed:', e);
    }

    return () => {
      if (socket) socket.close();
    };
  }, [user, activeRole]);

  const loginUser = async (username, password) => {
    setLoading(true);
    try {
      const res = await api.login(username, password);
      setUser(res.user);
      setActiveRole(res.user.role);
      return res.user;
    } finally {
      setLoading(false);
    }
  };

  const registerUser = async (formData) => {
    setLoading(true);
    try {
      const res = await api.register(formData);
      setUser(res.user);
      setActiveRole(res.user.role);
      return res.user;
    } finally {
      setLoading(false);
    }
  };

  const switchRole = async (targetRole) => {
    setLoading(true);
    try {
      const creds = DEMO_CREDENTIALS[targetRole] || DEMO_CREDENTIALS.PATIENT;
      const res = await api.login(creds.username, creds.password);
      setUser(res.user);
      setActiveRole(res.user.role);
    } catch (err) {
      console.error('Role switch failed:', err);
    } finally {
      setLoading(false);
    }
  };

  const logout = () => {
    removeStoredToken();
    setUser(null);
  };

  const dismissToast = () => setActiveToast(null);

  return (
    <AuthContext.Provider
      value={{
        user,
        activeRole,
        loading,
        loginUser,
        registerUser,
        switchRole,
        logout,
        activeToast,
        dismissToast,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
