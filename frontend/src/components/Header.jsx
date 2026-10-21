import React from 'react';
import { useAuth } from '../context/AuthContext';
import { Activity, User, HeartHandshake, Stethoscope, Bell, Sparkles, LogOut } from 'lucide-react';

export default function Header() {
  const { user, activeRole, switchRole, logout, activeToast, dismissToast } = useAuth();

  const roles = [
    { id: 'PATIENT', label: 'Patient View', icon: User, desc: 'Large-touch & Voice' },
    { id: 'CAREGIVER', label: 'Caregiver View', icon: HeartHandshake, desc: 'Meds & Alerts' },
    { id: 'DOCTOR', label: 'Doctor View', icon: Stethoscope, desc: '90-Day Trends' },
  ];

  return (
    <header className="bg-[#125450] text-white shadow-lg border-b border-[#1B7B75] sticky top-0 z-40">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-3 flex flex-col md:flex-row md:items-center md:justify-between gap-3">
        {/* Brand with Canva Style Badge */}
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="w-11 h-11 rounded-2xl bg-[#2DD4BF] flex items-center justify-center text-[#125450] shadow-md shadow-[#2DD4BF]/20">
              <Activity className="w-6 h-6 animate-pulse" />
            </div>
            <div>
              <div className="flex items-center space-x-2">
                <span className="text-[10px] font-extrabold uppercase tracking-widest bg-[#2DD4BF] text-[#125450] px-2 py-0.5 rounded-full">
                  Best Medical Services
                </span>
                <span className="text-xs text-[#99E6DF] font-semibold hidden sm:inline">• Live Biofeedback</span>
              </div>
              <h1 className="text-lg sm:text-xl font-black tracking-tight text-white flex items-center gap-2 mt-0.5">
                Parkinson&apos;s Voice Companion
              </h1>
            </div>
          </div>
        </div>

        {/* Role Switcher & User Profile Toolbar */}
        {user ? (
          <div className="flex flex-wrap items-center justify-between md:justify-end gap-2">
            {/* If user is demo account, show full role switcher. If registered patient/doctor/caregiver, show locked role badge */}
            {['patient', 'caregiver', 'doctor'].includes(user?.username) ? (
              <div className="flex items-center space-x-1.5 bg-[#0D3F3C] p-1.5 rounded-full border border-[#1E8A83]">
                <span className="text-[11px] font-bold text-[#99E6DF] uppercase tracking-wider px-3 hidden lg:inline">
                  Demo Switch:
                </span>
                <div className="flex space-x-1">
                  {roles.map((r) => {
                    const Icon = r.icon;
                    const isActive = activeRole === r.id;
                    return (
                      <button
                        key={r.id}
                        onClick={() => switchRole(r.id)}
                        className={`flex items-center space-x-1.5 px-3.5 py-1.5 rounded-full text-xs font-bold transition-all duration-150 min-h-[38px] ${
                          isActive
                            ? 'bg-[#2DD4BF] text-[#125450] shadow-md font-extrabold'
                            : 'text-[#C6F6F2] hover:text-white hover:bg-[#1B7B75]/60'
                        }`}
                        aria-pressed={isActive}
                      >
                        <Icon className="w-4 h-4 flex-shrink-0" />
                        <span>{r.label}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            ) : (
              <div className="flex items-center space-x-2 bg-[#0D3F3C] px-4 py-2 rounded-full border border-[#1E8A83] text-[#2DD4BF] shadow-sm">
                {user.role === 'PATIENT' && <User className="w-4 h-4 text-[#2DD4BF]" />}
                {user.role === 'CAREGIVER' && <HeartHandshake className="w-4 h-4 text-[#2DD4BF]" />}
                {user.role === 'DOCTOR' && <Stethoscope className="w-4 h-4 text-[#2DD4BF]" />}
                <span className="text-xs font-black uppercase tracking-wider text-white">
                  {user.role === 'PATIENT' ? 'Patient Portal' : user.role === 'CAREGIVER' ? 'Caregiver Portal' : 'Doctor Portal'}
                </span>
              </div>
            )}

            <div className="flex items-center space-x-3 pl-3 border-l border-[#1E8A83]">
              <div className="text-right hidden sm:block">
                <p className="text-xs font-extrabold text-white">{user.full_name || user.username}</p>
                <p className="text-[10px] text-[#2DD4BF] font-extrabold uppercase tracking-wider">{user.role}</p>
              </div>
              <button
                onClick={logout}
                className="px-3 py-1.5 bg-[#0D3F3C] hover:bg-red-600/90 text-slate-200 hover:text-white rounded-full text-xs font-extrabold transition border border-[#1E8A83] hover:border-red-500 flex items-center space-x-1"
                title="Sign out of account"
              >
                <LogOut className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Sign Out</span>
              </button>
            </div>
          </div>
        ) : null}
      </div>

      {/* Real-Time Alert Toast Notification Banner */}
      {activeToast && (
        <div
          className={`border-b px-4 py-2.5 transition-all flex items-center justify-between shadow-inner ${
            activeToast.severity === 'URGENT'
              ? 'bg-red-600 text-white border-red-700 font-medium'
              : activeToast.severity === 'WARNING'
              ? 'bg-amber-500 text-slate-950 border-amber-600 font-medium'
              : 'bg-[#1B7B75] text-white border-[#2DD4BF]'
          }`}
        >
          <div className="max-w-7xl mx-auto flex items-center justify-between w-full">
            <div className="flex items-center space-x-3">
              <span className="flex h-3 w-3 relative">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-white opacity-75"></span>
                <span className="relative inline-flex rounded-full h-3 w-3 bg-white"></span>
              </span>
              <Bell className="w-5 h-5 flex-shrink-0" />
              <div className="text-xs sm:text-sm font-bold">
                <strong>[{activeToast.severity} ALERT - {activeToast.patientName}]:</strong> {activeToast.title} — {activeToast.message}
              </div>
            </div>
            <button
              onClick={dismissToast}
              className="ml-4 px-2.5 py-1 bg-black/20 hover:bg-black/30 rounded-full text-xs uppercase tracking-wider font-extrabold transition"
            >
              Dismiss
            </button>
          </div>
        </div>
      )}
    </header>
  );
}
