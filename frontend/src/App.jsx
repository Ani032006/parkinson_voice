import React, { useState, useEffect } from 'react';
import { useAuth } from './context/AuthContext';
import Header from './components/Header';
import PatientView from './views/PatientView';
import CaregiverView from './views/CaregiverView';
import DoctorView from './views/DoctorView';
import ClinicalOnboardingModal from './components/ClinicalOnboardingModal';
import { ShieldAlert, Activity, HeartHandshake, Stethoscope } from 'lucide-react';

import LoginView from './views/LoginView';

export default function App() {
  const { user, activeRole, loading } = useAuth();
  const [showOnboarding, setShowOnboarding] = useState(false);

  useEffect(() => {
    if (user && user.onboarding_completed === false) {
      setShowOnboarding(true);
    }
  }, [user]);

  const handleOnboardingCompleted = () => {
    setShowOnboarding(false);
    window.location.reload();
  };

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col font-sans text-slate-900 selection:bg-blue-600 selection:text-white">
      <Header />

      <main className="flex-1 py-4 sm:py-6">
        {loading ? (
          <div className="flex items-center justify-center min-h-[50vh]">
            <div className="text-center space-y-3">
              <div className="w-12 h-12 border-4 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto" />
              <p className="text-slate-600 font-semibold text-sm">
                Connecting to Parkinson&apos;s Voice Companion...
              </p>
            </div>
          </div>
        ) : !user ? (
          <LoginView />
        ) : (
          <>
            {activeRole === 'PATIENT' && <PatientView onOpenOnboarding={() => setShowOnboarding(true)} />}
            {activeRole === 'CAREGIVER' && <CaregiverView onOpenOnboarding={() => setShowOnboarding(true)} />}
            {activeRole === 'DOCTOR' && <DoctorView />}
            
            {/* Clinical Onboarding & Care Team Setup Wizard Modal */}
            {showOnboarding && (
              <ClinicalOnboardingModal
                user={user}
                onComplete={handleOnboardingCompleted}
              />
            )}
          </>
        )}
      </main>

      {/* Global Safety & Regulatory Footer */}
      <footer className="bg-slate-900 text-slate-400 text-xs border-t border-slate-800 py-6 mt-12">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 flex flex-col md:flex-row items-center justify-between gap-4 text-center md:text-left">
          <div className="flex items-center space-x-2 text-slate-300">
            <ShieldAlert className="w-4 h-4 text-amber-500 flex-shrink-0" />
            <span>
              <strong>Safety Note:</strong> Experimental monitoring support tool. Not FDA/CE cleared as a diagnostic medical device.
            </span>
          </div>
          <div className="text-slate-500">
            Parkinson&apos;s Voice Companion v1.0.0 • ML Model: Oxford Voice Ensemble • Sub-100ms Live Biofeedback
          </div>
        </div>
      </footer>
    </div>
  );
}
