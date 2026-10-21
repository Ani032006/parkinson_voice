import React, { useState, useEffect, useRef } from 'react';
import { useAuth } from '../context/AuthContext';
import { api } from '../services/api';
import {
  Activity, ShieldCheck, Stethoscope, HeartHandshake, User,
  Lock, Mail, Phone, UserPlus, LogIn, Sparkles, ArrowRight, ShieldAlert,
  CheckCircle2, Send, RefreshCw, KeyRound, Clock, Check, Mic, LineChart, AlertTriangle, X, HelpCircle
} from 'lucide-react';

export default function LoginView() {
  const { loginUser, registerUser, switchRole } = useAuth();
  const [mode, setMode] = useState('login'); // 'login' | 'register'
  const [loginSubMode, setLoginSubMode] = useState('PASSWORD'); // 'PASSWORD' | 'OTP'
  const [authChannel, setAuthChannel] = useState('EMAIL'); // 'EMAIL' | 'PHONE'
  
  // Login Form State
  const [loginUsername, setLoginUsername] = useState('');
  const [loginPassword, setLoginPassword] = useState('');
  
  // Login OTP State
  const [loginTarget, setLoginTarget] = useState('');
  const [loginOtpCode, setLoginOtpCode] = useState('');
  const [loginOtpSent, setLoginOtpSent] = useState(false);
  const [loginOtpSending, setLoginOtpSending] = useState(false);
  const [loginOtpVerifying, setLoginOtpVerifying] = useState(false);

  // Register Form State
  const [regUsername, setRegUsername] = useState('');
  const [regPassword, setRegPassword] = useState('');
  const [regFullName, setRegFullName] = useState('');
  const [regEmail, setRegEmail] = useState('');
  const [regPhone, setRegPhone] = useState('+91');
  const [regRole, setRegRole] = useState('PATIENT');

  // Username Availability & Suggestions
  const [usernameCheck, setUsernameCheck] = useState({ available: true, suggestions: [], message: '' });
  const [checkingUsername, setCheckingUsername] = useState(false);

  // OTP Verification & Cooldown State
  const [otpCode, setOtpCode] = useState('');
  const [otpSent, setOtpSent] = useState(false);
  const [otpSending, setOtpSending] = useState(false);
  const [otpVerified, setOtpVerified] = useState(false);
  const [otpVerifying, setOtpVerifying] = useState(false);
  const [otpMessage, setOtpMessage] = useState(null);
  const [error, setError] = useState(null);
  const [submitting, setSubmitting] = useState(false);

  // Forgot Password Modal State
  const [showForgotModal, setShowForgotModal] = useState(false);
  const [forgotEmail, setForgotEmail] = useState('');
  const [forgotStep, setForgotStep] = useState(1); // 1: Email, 2: Token + New Password
  const [forgotToken, setForgotToken] = useState('');
  const [forgotNewPassword, setForgotNewPassword] = useState('');
  const [forgotMessage, setForgotMessage] = useState(null);
  const [forgotError, setForgotError] = useState(null);
  const [forgotLoading, setForgotLoading] = useState(false);

  // 30-Second Resend Cooldown Timer
  const [cooldown, setCooldown] = useState(0);
  const cooldownRef = useRef(null);

  useEffect(() => {
    if (cooldown > 0) {
      cooldownRef.current = setTimeout(() => setCooldown(cooldown - 1), 1000);
    } else {
      clearTimeout(cooldownRef.current);
    }
    return () => clearTimeout(cooldownRef.current);
  }, [cooldown]);

  // Username availability checking debouncer
  useEffect(() => {
    if (!regUsername || regUsername.trim().length < 3) {
      setUsernameCheck({ available: true, suggestions: [], message: '' });
      return;
    }
    const timer = setTimeout(async () => {
      setCheckingUsername(true);
      try {
        const res = await api.checkUsername(regUsername.trim());
        setUsernameCheck(res);
      } catch (_) {
      } finally {
        setCheckingUsername(false);
      }
    }, 500);
    return () => clearTimeout(timer);
  }, [regUsername]);

  // Password Security Strength Rule Evaluator
  const getPasswordStrength = (pass) => {
    const checks = {
      length: pass.length >= 8,
      uppercase: /[A-Z]/.test(pass),
      lowercase: /[a-z]/.test(pass),
      number: /[0-9]/.test(pass),
      special: /[!@#$%^&*()_+\-=\[\]{}|;:,.<>?]/.test(pass),
    };
    const passedCount = Object.values(checks).filter(Boolean).length;
    let label = 'Weak';
    let color = 'bg-red-500';
    if (passedCount >= 5) {
      label = 'Strong (Secure)';
      color = 'bg-emerald-500';
    } else if (passedCount >= 3) {
      label = 'Moderate';
      color = 'bg-amber-500';
    }
    return { checks, passedCount, label, color };
  };

  const regPassStrength = getPasswordStrength(regPassword);
  const isRegFormValid = regFullName.trim() && regUsername.trim() && regPassword && regPassStrength.passedCount >= 5 && (authChannel === 'PHONE' ? regPhone.trim().length >= 10 : regEmail.trim().includes('@'));

  const handleSendOTP = async () => {
    setError(null);
    setOtpMessage(null);

    // Gating check: User must fill all information before getting an OTP
    if (!regFullName.trim() || !regUsername.trim()) {
      setError('Please fill in your Full Name and Username before requesting an OTP code.');
      return;
    }

    if (regPassStrength.passedCount < 5) {
      setError('Please ensure your password meets all universal security rules before requesting an OTP code.');
      return;
    }

    const target = authChannel === 'PHONE' ? regPhone.trim() : regEmail.trim();
    if (!target) {
      setError(authChannel === 'PHONE' ? 'Please enter a valid 10-digit phone number.' : 'Please enter a valid email address.');
      return;
    }

    if (authChannel === 'PHONE') {
      const digitsOnly = target.replace(/\D/g, '');
      if (!target.startsWith('+') && digitsOnly.length === 10) {
        setRegPhone(`+91${digitsOnly}`);
      }
    }

    setOtpSending(true);

    try {
      const res = await api.sendOTP(target, regFullName || regUsername || 'User', authChannel);
      setOtpSent(true);
      setOtpMessage(res.message);
      setCooldown(30);
    } catch (err) {
      setError(err.message || 'Failed to send OTP code. Please try again.');
    } finally {
      setOtpSending(false);
    }
  };

  const handleVerifyOTP = async () => {
    if (!otpCode || otpCode.length < 5) {
      setError('Please enter the 6-digit verification code.');
      return;
    }
    setError(null);
    setOtpMessage(null);
    setOtpVerifying(true);

    const target = authChannel === 'PHONE' ? regPhone.trim() : regEmail.trim();

    try {
      const res = await api.verifyOTP(target, otpCode, authChannel);
      setOtpVerified(true);
      setOtpMessage(res.message);
    } catch (err) {
      setError(err.message || 'Verification code invalid or expired.');
    } finally {
      setOtpVerifying(false);
    }
  };

  const handleLoginSubmit = async (e) => {
    e.preventDefault();
    setError(null);
    if (!loginUsername || !loginPassword) {
      setError('Username and password are required.');
      return;
    }
    setSubmitting(true);
    try {
      await loginUser(loginUsername.trim(), loginPassword);
    } catch (err) {
      setError(err.message || 'Login failed. Please check your credentials.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleSendLoginOTP = async () => {
    setError(null);
    setOtpMessage(null);
    if (!loginTarget.trim()) {
      setError(`Please enter your registered ${authChannel === 'PHONE' ? 'phone number' : 'email address'}.`);
      return;
    }
    setLoginOtpSending(true);
    try {
      const res = await api.sendLoginOTP(loginTarget.trim(), authChannel);
      setLoginOtpSent(true);
      setOtpMessage(res.message);
      setCooldown(30);
    } catch (err) {
      setError(err.message || 'Failed to send login OTP. Please register if you do not have an account.');
    } finally {
      setLoginOtpSending(false);
    }
  };

  const handleVerifyLoginOTP = async () => {
    if (!loginOtpCode || loginOtpCode.length < 5) {
      setError('Please enter the 6-digit OTP code.');
      return;
    }
    setError(null);
    setLoginOtpVerifying(true);
    try {
      const res = await api.verifyLoginOTP(loginTarget.trim(), loginOtpCode, authChannel);
      if (res.access_token) {
        window.location.reload();
      }
    } catch (err) {
      setError(err.message || 'OTP verification failed.');
    } finally {
      setLoginOtpVerifying(false);
    }
  };

  const handleRegisterSubmit = async (e) => {
    e.preventDefault();
    setError(null);
    if (!regUsername || !regPassword || !regFullName) {
      setError('Full Name, Username, and Password are required.');
      return;
    }

    if (regPassStrength.passedCount < 5) {
      setError('Password does not meet universal security requirements.');
      return;
    }

    if (!otpVerified) {
      setError(`Please verify your ${authChannel === 'PHONE' ? 'phone number' : 'email'} via OTP code before completing registration.`);
      return;
    }

    setSubmitting(true);
    try {
      await registerUser({
        username: regUsername.trim(),
        password: regPassword,
        full_name: regFullName.trim(),
        email: regEmail.trim(),
        phone_number: regPhone.trim(),
        role: regRole
      });
    } catch (err) {
      setError(err.message || 'Registration failed. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleForgotPasswordSubmit = async (e) => {
    e.preventDefault();
    setForgotError(null);
    setForgotMessage(null);

    if (forgotStep === 1) {
      if (!forgotEmail || !forgotEmail.includes('@')) {
        setForgotError('Please enter a valid registered email address.');
        return;
      }
      setForgotLoading(true);
      try {
        const res = await api.forgotPassword(forgotEmail.trim());
        setForgotMessage(res.message);
        setForgotStep(2);
      } catch (err) {
        setForgotError(err.message || 'Failed to send password reset email.');
      } finally {
        setForgotLoading(false);
      }
    } else {
      if (!forgotToken || !forgotNewPassword) {
        setForgotError('Security reset code and new password are required.');
        return;
      }
      const strength = getPasswordStrength(forgotNewPassword);
      if (strength.passedCount < 5) {
        setForgotError('New password does not meet security rules (min 8 chars, A-Z, a-z, 0-9, special char).');
        return;
      }
      setForgotLoading(true);
      try {
        const res = await api.resetPassword(forgotEmail.trim(), forgotToken.trim(), forgotNewPassword);
        setForgotMessage(res.message);
        setTimeout(() => {
          setShowForgotModal(false);
          setForgotStep(1);
          setForgotEmail('');
          setForgotToken('');
          setForgotNewPassword('');
        }, 2500);
      } catch (err) {
        setForgotError(err.message || 'Password reset failed.');
      } finally {
        setForgotLoading(false);
      }
    }
  };


  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 py-4 sm:py-8">
      {/* Canva Style Layout Grid: Left Hero Graphic + Right Form Card */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-stretch">
        
        {/* ── LEFT HERO PANEL (Canva Template Aesthetic) ── */}
        <div className="lg:col-span-7 bg-[#F4F3EF] rounded-3xl p-6 sm:p-10 border border-slate-200/80 shadow-md flex flex-col justify-between relative overflow-hidden">
          
          <div className="space-y-6 relative z-10">
            {/* Header Badge */}
            <div className="inline-flex items-center space-x-2 bg-[#125450] text-[#2DD4BF] px-3.5 py-1.5 rounded-full text-xs font-extrabold shadow-sm">
              <Sparkles className="w-3.5 h-3.5" />
              <span className="uppercase tracking-widest">BEST MEDICAL SERVICES</span>
            </div>

            {/* Main Stacked Headline */}
            <div>
              <h1 className="text-4xl sm:text-5xl lg:text-6xl font-black text-[#1C2526] tracking-tight leading-none uppercase">
                BEST MEDICAL
              </h1>
              <h1 className="text-4xl sm:text-5xl lg:text-6xl font-black text-[#1B7B75] tracking-tight leading-none uppercase mt-1">
                SERVICES
              </h1>
              <p className="text-sm sm:text-base font-medium text-slate-600 max-w-lg mt-3 leading-relaxed">
                Integrated vocal biomarker monitoring, LSVT speech therapy coaching, and clinical decline alerting.
              </p>
            </div>

            {/* Split Content: 3 Pill Feature Cards + Doctor Photo Card */}
            <div className="grid grid-cols-1 sm:grid-cols-12 gap-4 pt-2">
              
              {/* Stack of 3 Pill Feature Cards */}
              <div className="sm:col-span-7 space-y-3">
                
                {/* Pill Card 1: Vocal Biomarker */}
                <div className="bg-[#2DD4BF] text-[#0D3F3C] p-4 rounded-r-full rounded-l-3xl shadow-sm border border-[#2DD4BF]/50 flex items-center space-x-3 transition hover:translate-x-1">
                  <div className="w-10 h-10 rounded-full bg-[#125450] text-[#2DD4BF] flex items-center justify-center flex-shrink-0 font-bold shadow-inner">
                    <Mic className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="font-extrabold text-sm leading-snug">Vocal Biomarker Analysis</h3>
                    <p className="text-[11px] font-semibold text-[#0D3F3C]/80">22 Praat acoustic metrics & automated ML severity scoring</p>
                  </div>
                </div>

                {/* Pill Card 2: LSVT Therapy */}
                <div className="bg-[#2DD4BF] text-[#0D3F3C] p-4 rounded-r-full rounded-l-3xl shadow-sm border border-[#2DD4BF]/50 flex items-center space-x-3 transition hover:translate-x-1">
                  <div className="w-10 h-10 rounded-full bg-[#125450] text-[#2DD4BF] flex items-center justify-center flex-shrink-0 font-bold shadow-inner">
                    <Activity className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="font-extrabold text-sm leading-snug">LSVT Speech Therapy Coach</h3>
                    <p className="text-[11px] font-semibold text-[#0D3F3C]/80">Real-time Web Audio API dB & pitch biofeedback loop</p>
                  </div>
                </div>

                {/* Pill Card 3: Rapid Decline */}
                <div className="bg-[#2DD4BF] text-[#0D3F3C] p-4 rounded-r-full rounded-l-3xl shadow-sm border border-[#2DD4BF]/50 flex items-center space-x-3 transition hover:translate-x-1">
                  <div className="w-10 h-10 rounded-full bg-[#125450] text-[#2DD4BF] flex items-center justify-center flex-shrink-0 font-bold shadow-inner">
                    <ShieldAlert className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="font-extrabold text-sm leading-snug">Rapid Decline Alerting</h3>
                    <p className="text-[11px] font-semibold text-[#0D3F3C]/80">CUSUM rolling sigma statistical drift detection & doctor alerts</p>
                  </div>
                </div>
              </div>

              {/* High-Resolution Studio Doctor Image Card */}
              <div className="sm:col-span-5 relative rounded-3xl overflow-hidden shadow-lg border-2 border-white group min-h-[220px]">
                <img
                  src="/doctor_hero.png"
                  alt="Medical Professional Doctor"
                  className="w-full h-full object-cover object-center group-hover:scale-105 transition duration-500"
                  onError={(e) => {
                    e.target.style.display = 'none';
                  }}
                />
                <div className="absolute inset-0 bg-gradient-to-t from-[#125450]/90 via-transparent to-transparent flex flex-col justify-end p-4 text-white">
                  <span className="text-[10px] uppercase tracking-widest font-extrabold text-[#2DD4BF]">CLINICAL TEAM PORTAL</span>
                  <span className="text-xs font-bold">24/7 Vocal Health Tracking</span>
                </div>
              </div>

            </div>
          </div>

          {/* Footer Tag */}
          <div className="mt-8 pt-4 border-t border-slate-300/60 flex flex-wrap items-center justify-between text-[11px] text-slate-500 font-bold">
            <span className="text-[#125450]">PARKINSONSVOICECOMPANION.COM</span>
          </div>

        </div>

        {/* ── RIGHT AUTHENTICATION & LOGIN/REGISTER CARD ── */}
        <div className="lg:col-span-5 bg-white rounded-3xl p-6 sm:p-8 border border-slate-200 shadow-lg flex flex-col justify-between">
          <div>
            
            {/* Top Auth Mode Switcher (Sign In vs Register) */}
            <div className="flex items-center justify-between border-b border-slate-100 pb-4 mb-6">
              <div>
                <h2 className="text-xl font-extrabold text-slate-900">
                  {mode === 'login' ? 'Portal Sign In' : 'Create Medical Account'}
                </h2>
                <p className="text-xs text-slate-500 mt-0.5">
                  {mode === 'login' ? 'Access your personalized medical view' : 'Join Parkinson\'s Voice Companion'}
                </p>
              </div>

              <div className="flex bg-slate-100 p-1 rounded-full">
                <button
                  type="button"
                  onClick={() => { setMode('login'); setError(null); setOtpMessage(null); }}
                  className={`px-3.5 py-1.5 rounded-full text-xs font-extrabold transition-all ${
                    mode === 'login'
                      ? 'bg-[#125450] text-[#2DD4BF] shadow-sm'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  Login
                </button>
                <button
                  type="button"
                  onClick={() => { setMode('register'); setError(null); setOtpMessage(null); }}
                  className={`px-3.5 py-1.5 rounded-full text-xs font-extrabold transition-all ${
                    mode === 'register'
                      ? 'bg-[#125450] text-[#2DD4BF] shadow-sm'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  Register
                </button>
              </div>
            </div>

            {/* Error Message Alert */}
            {error && (
              <div className="mb-4 p-3 bg-red-50 border border-red-200 text-red-700 rounded-2xl text-xs font-bold flex items-start space-x-2">
                <AlertTriangle className="w-4 h-4 text-red-500 flex-shrink-0 mt-0.5" />
                <span>{error}</span>
              </div>
            )}

            {/* OTP Status Message */}
            {otpMessage && (
              <div className="mb-4 p-3 bg-[#E6F7F5] border border-[#2DD4BF] text-[#125450] rounded-2xl text-xs font-bold flex items-start space-x-2">
                <CheckCircle2 className="w-4 h-4 text-[#1B7B75] flex-shrink-0 mt-0.5" />
                <span>{otpMessage}</span>
              </div>
            )}

            {/* ── MODE 1: LOGIN FORM ── */}
            {mode === 'login' && (
              <div>
                {/* Login Sub-Mode Switcher: Password Login vs OTP Login */}
                <div className="flex space-x-2 bg-slate-100 p-1 rounded-xl mb-4 text-xs">
                  <button
                    type="button"
                    onClick={() => { setLoginSubMode('PASSWORD'); setError(null); setOtpMessage(null); }}
                    className={`flex-1 py-1.5 rounded-lg font-extrabold transition ${
                      loginSubMode === 'PASSWORD' ? 'bg-white text-[#125450] shadow-sm' : 'text-slate-600'
                    }`}
                  >
                    Password Login
                  </button>
                  <button
                    type="button"
                    onClick={() => { setLoginSubMode('OTP'); setError(null); setOtpMessage(null); }}
                    className={`flex-1 py-1.5 rounded-lg font-extrabold transition ${
                      loginSubMode === 'OTP' ? 'bg-white text-[#125450] shadow-sm' : 'text-slate-600'
                    }`}
                  >
                    Login via OTP
                  </button>
                </div>

                {loginSubMode === 'PASSWORD' ? (
                  <form onSubmit={handleLoginSubmit} className="space-y-4">
                    <div>
                      <label className="block text-xs font-extrabold uppercase tracking-wider text-slate-700 mb-1.5">
                        Username or Registered Email/Phone
                      </label>
                      <div className="relative">
                        <User className="w-4 h-4 absolute left-3.5 top-3.5 text-slate-400" />
                        <input
                          type="text"
                          value={loginUsername}
                          onChange={(e) => setLoginUsername(e.target.value)}
                          placeholder="e.g. patient_john or doctor@hospital.org"
                          className="w-full pl-10 pr-4 py-3 bg-[#F8F9FA] border border-slate-200 rounded-xl text-xs font-semibold text-slate-900 focus:outline-none focus:border-[#1B7B75]"
                          required
                        />
                      </div>
                    </div>

                    <div>
                      <div className="flex items-center justify-between mb-1.5">
                        <label className="block text-xs font-extrabold uppercase tracking-wider text-slate-700">
                          Password
                        </label>
                        <button
                          type="button"
                          onClick={() => { setShowForgotModal(true); setForgotEmail(loginUsername.includes('@') ? loginUsername : ''); }}
                          className="text-xs font-bold text-[#1B7B75] hover:underline"
                        >
                          Forgot Password?
                        </button>
                      </div>
                      <div className="relative">
                        <Lock className="w-4 h-4 absolute left-3.5 top-3.5 text-slate-400" />
                        <input
                          type="password"
                          value={loginPassword}
                          onChange={(e) => setLoginPassword(e.target.value)}
                          placeholder="••••••••"
                          className="w-full pl-10 pr-4 py-3 bg-[#F8F9FA] border border-slate-200 rounded-xl text-xs font-semibold text-slate-900 focus:outline-none focus:border-[#1B7B75]"
                          required
                        />
                      </div>
                    </div>

                    <button
                      type="submit"
                      disabled={submitting}
                      className="w-full py-3.5 bg-[#125450] hover:bg-[#0D3F3C] text-white rounded-xl text-xs font-extrabold tracking-wider uppercase transition shadow-md flex items-center justify-center space-x-2"
                    >
                      {submitting ? (
                        <RefreshCw className="w-4 h-4 animate-spin text-[#2DD4BF]" />
                      ) : (
                        <>
                          <span>Sign In to Medical Dashboard</span>
                          <ArrowRight className="w-4 h-4 text-[#2DD4BF]" />
                        </>
                      )}
                    </button>
                  </form>
                ) : (
                  /* Login via OTP Form */
                  <div className="space-y-4">
                    <div className="flex justify-between items-center mb-1">
                      <label className="text-xs font-extrabold uppercase tracking-wider text-slate-700">
                        Select Channel
                      </label>
                      <div className="flex space-x-1 bg-slate-100 p-0.5 rounded-full text-[11px]">
                        <button
                          type="button"
                          onClick={() => { setAuthChannel('EMAIL'); setLoginOtpSent(false); }}
                          className={`px-2.5 py-1 rounded-full font-bold ${authChannel === 'EMAIL' ? 'bg-[#1B7B75] text-white' : 'text-slate-600'}`}
                        >
                          Email
                        </button>
                        <button
                          type="button"
                          onClick={() => { setAuthChannel('PHONE'); setLoginOtpSent(false); }}
                          className={`px-2.5 py-1 rounded-full font-bold ${authChannel === 'PHONE' ? 'bg-[#1B7B75] text-white' : 'text-slate-600'}`}
                        >
                          SMS Phone
                        </button>
                      </div>
                    </div>

                    <div className="relative">
                      {authChannel === 'EMAIL' ? <Mail className="w-4 h-4 absolute left-3.5 top-3.5 text-slate-400" /> : <Phone className="w-4 h-4 absolute left-3.5 top-3.5 text-slate-400" />}
                      <input
                        type={authChannel === 'EMAIL' ? 'email' : 'tel'}
                        value={loginTarget}
                        onChange={(e) => setLoginTarget(e.target.value)}
                        placeholder={authChannel === 'EMAIL' ? 'registered@email.com' : '+919876543210'}
                        className="w-full pl-10 pr-24 py-3 bg-[#F8F9FA] border border-slate-200 rounded-xl text-xs font-semibold text-slate-900"
                      />
                      <button
                        type="button"
                        onClick={handleSendLoginOTP}
                        disabled={loginOtpSending || cooldown > 0}
                        className="absolute right-1.5 top-1.5 px-3 py-1.5 bg-[#1B7B75] text-white rounded-lg text-xs font-bold"
                      >
                        {loginOtpSending ? 'Sending...' : cooldown > 0 ? `${cooldown}s` : loginOtpSent ? 'Resend' : 'Send OTP'}
                      </button>
                    </div>

                    {loginOtpSent && (
                      <div className="space-y-3 bg-[#E6F7F5] p-3 rounded-2xl border border-[#2DD4BF]">
                        <label className="block text-xs font-extrabold uppercase text-[#125450]">
                          Enter 6-Digit OTP Code
                        </label>
                        <div className="flex space-x-2">
                          <input
                            type="text"
                            maxLength={6}
                            value={loginOtpCode}
                            onChange={(e) => setLoginOtpCode(e.target.value)}
                            placeholder="123456"
                            className="flex-1 px-3 py-2 bg-white border border-[#2DD4BF] rounded-xl text-center text-sm font-extrabold text-[#125450]"
                          />
                          <button
                            type="button"
                            onClick={handleVerifyLoginOTP}
                            disabled={loginOtpVerifying}
                            className="px-4 py-2 bg-[#125450] text-white rounded-xl text-xs font-extrabold"
                          >
                            {loginOtpVerifying ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <span>Verify & Login</span>}
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* ── MODE 2: REGISTER FORM WITH OTP VERIFICATION & VALIDATIONS ── */}
            {mode === 'register' && (
              <form onSubmit={handleRegisterSubmit} className="space-y-3.5">
                
                {/* Full Name & Username */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[11px] font-extrabold uppercase tracking-wider text-slate-700 mb-1">
                      Full Name <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="text"
                      value={regFullName}
                      onChange={(e) => setRegFullName(e.target.value)}
                      placeholder="Dr. Sarah Jenkins"
                      className="w-full px-3.5 py-2.5 bg-[#F8F9FA] border border-slate-200 rounded-xl text-xs font-semibold text-slate-900 focus:border-[#1B7B75]"
                      required
                    />
                  </div>

                  <div>
                    <div className="flex justify-between items-center mb-1">
                      <label className="text-[11px] font-extrabold uppercase tracking-wider text-slate-700">
                        Username <span className="text-red-500">*</span>
                      </label>
                      {checkingUsername && <RefreshCw className="w-3 h-3 text-[#1B7B75] animate-spin" />}
                    </div>
                    <input
                      type="text"
                      value={regUsername}
                      onChange={(e) => setRegUsername(e.target.value)}
                      placeholder="s_jenkins"
                      className={`w-full px-3.5 py-2.5 bg-[#F8F9FA] border rounded-xl text-xs font-semibold text-slate-900 ${
                        usernameCheck.available ? 'border-slate-200 focus:border-[#1B7B75]' : 'border-red-400 bg-red-50'
                      }`}
                      required
                    />

                    {/* Username Suggestion Pills if taken */}
                    {!usernameCheck.available && usernameCheck.suggestions.length > 0 && (
                      <div className="mt-1.5 p-2 bg-amber-50 rounded-xl border border-amber-200 text-[11px]">
                        <span className="font-bold text-amber-900 block mb-1">Username taken. Suggested options:</span>
                        <div className="flex flex-wrap gap-1.5">
                          {usernameCheck.suggestions.map((sug) => (
                            <button
                              key={sug}
                              type="button"
                              onClick={() => { setRegUsername(sug); setUsernameCheck({ available: true, suggestions: [], message: '' }); }}
                              className="px-2 py-0.5 bg-[#1B7B75] hover:bg-[#125450] text-white font-bold rounded-lg transition text-[10px]"
                            >
                              + {sug}
                            </button>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                </div>

                {/* Password Input with Live Security Rules Meter */}
                <div>
                  <label className="block text-[11px] font-extrabold uppercase tracking-wider text-slate-700 mb-1">
                    Password <span className="text-red-500">*</span>
                  </label>
                  <div className="relative">
                    <Lock className="w-4 h-4 absolute left-3 top-3 text-slate-400" />
                    <input
                      type="password"
                      value={regPassword}
                      onChange={(e) => setRegPassword(e.target.value)}
                      placeholder="Min 8 chars (A-Z, a-z, 0-9, !@#)"
                      className="w-full pl-9 pr-3.5 py-2.5 bg-[#F8F9FA] border border-slate-200 rounded-xl text-xs font-semibold text-slate-900 focus:border-[#1B7B75]"
                      required
                    />
                  </div>

                  {/* Password Strength Indicator Gauge */}
                  {regPassword && (
                    <div className="mt-2 space-y-1.5 bg-slate-50 p-2.5 rounded-xl border border-slate-200 text-[11px]">
                      <div className="flex justify-between items-center font-extrabold">
                        <span className="text-slate-600">Password Safety:</span>
                        <span className={regPassStrength.passedCount >= 5 ? 'text-emerald-700' : 'text-amber-700'}>
                          {regPassStrength.label} ({regPassStrength.passedCount}/5)
                        </span>
                      </div>
                      
                      <div className="w-full bg-slate-200 h-1.5 rounded-full overflow-hidden">
                        <div
                          className={`h-full transition-all duration-300 ${regPassStrength.color}`}
                          style={{ width: `${(regPassStrength.passedCount / 5) * 100}%` }}
                        />
                      </div>

                      <div className="grid grid-cols-2 gap-1 text-[10px] font-semibold text-slate-600 pt-1">
                        <span className={regPassStrength.checks.length ? 'text-emerald-700 flex items-center gap-1' : 'text-slate-400 flex items-center gap-1'}>
                          {regPassStrength.checks.length ? <Check className="w-3 h-3 text-emerald-600" /> : '•'} Min 8 Chars
                        </span>
                        <span className={regPassStrength.checks.uppercase ? 'text-emerald-700 flex items-center gap-1' : 'text-slate-400 flex items-center gap-1'}>
                          {regPassStrength.checks.uppercase ? <Check className="w-3 h-3 text-emerald-600" /> : '•'} Uppercase (A-Z)
                        </span>
                        <span className={regPassStrength.checks.lowercase ? 'text-emerald-700 flex items-center gap-1' : 'text-slate-400 flex items-center gap-1'}>
                          {regPassStrength.checks.lowercase ? <Check className="w-3 h-3 text-emerald-600" /> : '•'} Lowercase (a-z)
                        </span>
                        <span className={regPassStrength.checks.number ? 'text-emerald-700 flex items-center gap-1' : 'text-slate-400 flex items-center gap-1'}>
                          {regPassStrength.checks.number ? <Check className="w-3 h-3 text-emerald-600" /> : '•'} Number (0-9)
                        </span>
                        <span className={regPassStrength.checks.special ? 'text-emerald-700 flex items-center gap-1' : 'text-slate-400 flex items-center gap-1'}>
                          {regPassStrength.checks.special ? <Check className="w-3 h-3 text-emerald-600" /> : '•'} Special (!@#$)
                        </span>
                      </div>
                    </div>
                  )}
                </div>

                {/* Role Selection */}
                <div>
                  <label className="block text-[11px] font-extrabold uppercase tracking-wider text-slate-700 mb-1">
                    Select Account Role <span className="text-red-500">*</span>
                  </label>
                  <div className="grid grid-cols-3 gap-2">
                    {[
                      { id: 'PATIENT', label: 'Patient', icon: User },
                      { id: 'CAREGIVER', label: 'Caregiver', icon: HeartHandshake },
                      { id: 'DOCTOR', label: 'Doctor', icon: Stethoscope },
                    ].map((r) => {
                      const Icon = r.icon;
                      const isSel = regRole === r.id;
                      return (
                        <button
                          key={r.id}
                          type="button"
                          onClick={() => setRegRole(r.id)}
                          className={`p-2 rounded-xl text-xs font-extrabold border transition-all flex flex-col items-center justify-center space-y-1 ${
                            isSel
                              ? 'bg-[#1B7B75] text-white border-[#1B7B75] shadow-sm'
                              : 'bg-[#F8F9FA] text-slate-700 border-slate-200 hover:border-[#2DD4BF]'
                          }`}
                        >
                          <Icon className="w-4 h-4" />
                          <span>{r.label}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Auth Verification Channel Toggle (Email vs SMS Phone) */}
                <div className="pt-2 border-t border-slate-100">
                  <div className="flex items-center justify-between mb-2">
                    <label className="text-[11px] font-extrabold uppercase tracking-wider text-slate-700">
                      Verification Method <span className="text-red-500">*</span>
                    </label>
                    <div className="flex space-x-1 bg-slate-100 p-0.5 rounded-full text-[11px]">
                      <button
                        type="button"
                        onClick={() => { setAuthChannel('EMAIL'); setOtpSent(false); setOtpVerified(false); }}
                        className={`px-2.5 py-1 rounded-full font-bold transition ${
                          authChannel === 'EMAIL' ? 'bg-[#1B7B75] text-white' : 'text-slate-600'
                        }`}
                      >
                        Email OTP
                      </button>
                      <button
                        type="button"
                        onClick={() => { setAuthChannel('PHONE'); setOtpSent(false); setOtpVerified(false); }}
                        className={`px-2.5 py-1 rounded-full font-bold transition ${
                          authChannel === 'PHONE' ? 'bg-[#1B7B75] text-white' : 'text-slate-600'
                        }`}
                      >
                        SMS Phone OTP
                      </button>
                    </div>
                  </div>

                  {/* Channel Input Field & OTP Gating Button */}
                  {authChannel === 'EMAIL' ? (
                    <div className="relative">
                      <Mail className="w-4 h-4 absolute left-3 top-3 text-slate-400" />
                      <input
                        type="email"
                        value={regEmail}
                        onChange={(e) => setRegEmail(e.target.value)}
                        placeholder="doctor@hospital.org"
                        className="w-full pl-9 pr-24 py-2.5 bg-[#F8F9FA] border border-slate-200 rounded-xl text-xs font-semibold text-slate-900"
                        required={authChannel === 'EMAIL'}
                      />
                      <button
                        type="button"
                        onClick={handleSendOTP}
                        disabled={otpSending || cooldown > 0 || otpVerified}
                        className="absolute right-1.5 top-1.5 px-3 py-1 bg-[#1B7B75] hover:bg-[#125450] disabled:bg-slate-300 text-white rounded-lg text-[11px] font-bold transition"
                        title={!isRegFormValid ? 'Fill Name, Username, & Password first' : 'Send OTP code'}
                      >
                        {otpSending ? 'Sending...' : cooldown > 0 ? `${cooldown}s` : otpSent ? 'Resend' : 'Send OTP'}
                      </button>
                    </div>
                  ) : (
                    <div className="relative">
                      <Phone className="w-4 h-4 absolute left-3 top-3 text-slate-400" />
                      <input
                        type="tel"
                        value={regPhone}
                        onChange={(e) => setRegPhone(e.target.value)}
                        placeholder="+919876543210 (10-digits)"
                        className="w-full pl-9 pr-24 py-2.5 bg-[#F8F9FA] border border-slate-200 rounded-xl text-xs font-semibold text-slate-900"
                        required={authChannel === 'PHONE'}
                      />
                      <button
                        type="button"
                        onClick={handleSendOTP}
                        disabled={otpSending || cooldown > 0 || otpVerified}
                        className="absolute right-1.5 top-1.5 px-3 py-1 bg-[#1B7B75] hover:bg-[#125450] disabled:bg-slate-300 text-white rounded-lg text-[11px] font-bold transition"
                        title={!isRegFormValid ? 'Fill Name, Username, & Password first' : 'Send SMS OTP code'}
                      >
                        {otpSending ? 'Sending...' : cooldown > 0 ? `${cooldown}s` : otpSent ? 'Resend SMS' : 'Send SMS'}
                      </button>
                    </div>
                  )}
                </div>

                {/* OTP Verification Code Entry */}
                {otpSent && !otpVerified && (
                  <div className="bg-[#E6F7F5] p-3 rounded-2xl border border-[#2DD4BF] space-y-2">
                    <label className="block text-[11px] font-extrabold uppercase text-[#125450]">
                      Enter 6-Digit Verification Code
                    </label>
                    <div className="flex space-x-2">
                      <input
                        type="text"
                        maxLength={6}
                        value={otpCode}
                        onChange={(e) => setOtpCode(e.target.value)}
                        placeholder="123456"
                        className="flex-1 px-3 py-2 bg-white border border-[#2DD4BF] rounded-xl text-center text-sm font-extrabold tracking-widest text-[#125450]"
                      />
                      <button
                        type="button"
                        onClick={handleVerifyOTP}
                        disabled={otpVerifying}
                        className="px-4 py-2 bg-[#1B7B75] hover:bg-[#125450] text-white rounded-xl text-xs font-extrabold transition flex items-center space-x-1"
                      >
                        {otpVerifying ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <span>Verify Code</span>}
                      </button>
                    </div>
                  </div>
                )}

                {/* Submit Register Button */}
                <button
                  type="submit"
                  disabled={submitting || !otpVerified}
                  className="w-full py-3.5 bg-[#125450] hover:bg-[#0D3F3C] disabled:bg-slate-300 text-white rounded-xl text-xs font-extrabold tracking-wider uppercase transition shadow-md flex items-center justify-center space-x-2"
                >
                  {submitting ? (
                    <RefreshCw className="w-4 h-4 animate-spin text-[#2DD4BF]" />
                  ) : (
                    <>
                      <UserPlus className="w-4 h-4 text-[#2DD4BF]" />
                      <span>{otpVerified ? 'Complete Medical Registration' : 'Verify OTP to Complete Registration'}</span>
                    </>
                  )}
                </button>
              </form>
            )}


          </div>
        </div>

      </div>

      {/* ── FORGOT PASSWORD MODAL ── */}
      {showForgotModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl p-6 sm:p-8 max-w-md w-full shadow-2xl border border-slate-100 relative animate-in fade-in zoom-in duration-200">
            <button
              onClick={() => { setShowForgotModal(false); setForgotError(null); setForgotMessage(null); }}
              className="absolute right-4 top-4 text-slate-400 hover:text-slate-700 p-1"
            >
              <X className="w-5 h-5" />
            </button>

            <div className="flex items-center space-x-3 mb-4">
              <div className="w-10 h-10 rounded-2xl bg-[#E6F7F5] flex items-center justify-center text-[#125450]">
                <KeyRound className="w-5 h-5 text-[#1B7B75]" />
              </div>
              <div>
                <h3 className="text-lg font-extrabold text-slate-900">Reset Your Password</h3>
                <p className="text-xs text-slate-500">We'll send a password reset link to your inbox</p>
              </div>
            </div>

            {forgotError && (
              <div className="mb-4 p-3 bg-red-50 border border-red-200 text-red-700 rounded-xl text-xs font-bold flex items-start space-x-2">
                <AlertTriangle className="w-4 h-4 text-red-500 flex-shrink-0 mt-0.5" />
                <span>{forgotError}</span>
              </div>
            )}

            {forgotMessage && (
              <div className="mb-4 p-3 bg-[#E6F7F5] border border-[#2DD4BF] text-[#125450] rounded-xl text-xs font-bold flex items-start space-x-2">
                <CheckCircle2 className="w-4 h-4 text-[#1B7B75] flex-shrink-0 mt-0.5" />
                <span>{forgotMessage}</span>
              </div>
            )}

            <form onSubmit={handleForgotPasswordSubmit} className="space-y-4">
              {forgotStep === 1 ? (
                <div>
                  <label className="block text-xs font-extrabold uppercase text-slate-700 mb-1.5">
                    Registered Email Address
                  </label>
                  <div className="relative">
                    <Mail className="w-4 h-4 absolute left-3.5 top-3.5 text-slate-400" />
                    <input
                      type="email"
                      value={forgotEmail}
                      onChange={(e) => setForgotEmail(e.target.value)}
                      placeholder="user@hospital.org"
                      className="w-full pl-10 pr-4 py-3 bg-[#F8F9FA] border border-slate-200 rounded-xl text-xs font-semibold text-slate-900"
                      required
                    />
                  </div>
                </div>
              ) : (
                <>
                  <div>
                    <label className="block text-xs font-extrabold uppercase text-slate-700 mb-1.5">
                      6-Digit Security Code (From Email)
                    </label>
                    <input
                      type="text"
                      maxLength={6}
                      value={forgotToken}
                      onChange={(e) => setForgotToken(e.target.value)}
                      placeholder="123456"
                      className="w-full px-4 py-2.5 bg-[#F8F9FA] border border-slate-200 rounded-xl text-center text-sm font-extrabold text-[#125450] tracking-widest"
                      required
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-extrabold uppercase text-slate-700 mb-1.5">
                      New Password (Min 8 chars, A-Z, 0-9, !@#$)
                    </label>
                    <div className="relative">
                      <Lock className="w-4 h-4 absolute left-3.5 top-3.5 text-slate-400" />
                      <input
                        type="password"
                        value={forgotNewPassword}
                        onChange={(e) => setForgotNewPassword(e.target.value)}
                        placeholder="••••••••"
                        className="w-full pl-10 pr-4 py-3 bg-[#F8F9FA] border border-slate-200 rounded-xl text-xs font-semibold text-slate-900"
                        required
                      />
                    </div>
                  </div>
                </>
              )}

              <button
                type="submit"
                disabled={forgotLoading}
                className="w-full py-3 bg-[#125450] hover:bg-[#0D3F3C] text-white rounded-xl text-xs font-extrabold uppercase tracking-wider transition shadow-md flex items-center justify-center space-x-2"
              >
                {forgotLoading ? (
                  <RefreshCw className="w-4 h-4 animate-spin text-[#2DD4BF]" />
                ) : (
                  <span>{forgotStep === 1 ? 'Send Reset Link & Code' : 'Update Password'}</span>
                )}
              </button>
            </form>
          </div>
        </div>
      )}

    </div>
  );
}
