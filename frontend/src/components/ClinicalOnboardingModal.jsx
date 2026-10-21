import React, { useState, useEffect } from 'react';
import { Stethoscope, HeartHandshake, Pill, Check, Plus, AlertCircle, RefreshCw, Calendar, Sparkles, X, ChevronRight, User } from 'lucide-react';
import { api } from '../services/api';

export default function ClinicalOnboardingModal({ user, onComplete }) {
  const isPatient = user?.role === 'PATIENT';
  const isCaregiver = user?.role === 'CAREGIVER';

  const [directory, setDirectory] = useState({ doctors: [], caregivers: [], patients: [], common_medications: [] });
  const [loadingDirectory, setLoadingDirectory] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState(null);

  // Patient Setup Form State
  const [doctorChoice, setDoctorChoice] = useState('EXISTING'); // 'EXISTING', 'NEW'
  const [selectedDoctorId, setSelectedDoctorId] = useState('');
  const [newDoctorName, setNewDoctorName] = useState('');
  const [newDoctorSpecialty, setNewDoctorSpecialty] = useState('Movement Disorders Neurology');
  const [newDoctorClinic, setNewDoctorClinic] = useState('Neurology Care Center');
  const [newDoctorEmail, setNewDoctorEmail] = useState('');
  const [newDoctorPhone, setNewDoctorPhone] = useState('');

  const [caregiverChoice, setCaregiverChoice] = useState('NONE'); // 'EXISTING', 'NEW', 'NONE'
  const [selectedCaregiverId, setSelectedCaregiverId] = useState('');
  const [newCaregiverName, setNewCaregiverName] = useState('');
  const [newCaregiverRel, setNewCaregiverRel] = useState('Spouse');
  const [newCaregiverPhone, setNewCaregiverPhone] = useState('');

  const [dob, setDob] = useState('1960-01-01');
  const [diagnosisYear, setDiagnosisYear] = useState(new Date().getFullYear() - 3);

  // Selected & Custom Medications
  const [selectedMeds, setSelectedMeds] = useState([]); // [{ name, dosage, frequency, scheduled_times, instructions }]
  const [customMedName, setCustomMedName] = useState('');
  const [customMedDosage, setCustomMedDosage] = useState('');
  const [customMedFreq, setCustomMedFreq] = useState('3x daily');
  const [showAddCustom, setShowAddCustom] = useState(false);

  // Caregiver Setup Form State
  const [patientChoice, setPatientChoice] = useState('EXISTING'); // 'EXISTING', 'NEW'
  const [selectedPatientId, setSelectedPatientId] = useState('');
  const [newPatientName, setNewPatientName] = useState('');
  const [newPatientDob, setNewPatientDob] = useState('1960-01-01');
  const [newPatientDiagYear, setNewPatientDiagYear] = useState(new Date().getFullYear() - 3);
  const [caregiverRelType, setCaregiverRelType] = useState('Primary Family Caregiver');

  useEffect(() => {
    async function loadDirectory() {
      try {
        setLoadingDirectory(true);
        const data = await api.getClinicalDirectory();
        setDirectory(data);
        if (data.doctors && data.doctors.length > 0) {
          setSelectedDoctorId(data.doctors[0].id.toString());
        }
        if (data.caregivers && data.caregivers.length > 0) {
          setSelectedCaregiverId(data.caregivers[0].id.toString());
        }
        if (data.patients && data.patients.length > 0) {
          setSelectedPatientId(data.patients[0].id.toString());
        }
        // Default select standard Carbidopa-Levodopa
        if (data.common_medications && data.common_medications.length > 0) {
          setSelectedMeds([data.common_medications[0]]);
        }
      } catch (err) {
        console.error('Failed to load clinical directory:', err);
      } finally {
        setLoadingDirectory(false);
      }
    }
    loadDirectory();
  }, []);

  const toggleCatalogMed = (med) => {
    const exists = selectedMeds.find((m) => m.name === med.name);
    if (exists) {
      setSelectedMeds(selectedMeds.filter((m) => m.name !== med.name));
    } else {
      setSelectedMeds([...selectedMeds, med]);
    }
  };

  const handleAddCustomMed = (e) => {
    e.preventDefault();
    if (!customMedName.trim() || !customMedDosage.trim()) return;
    const newMed = {
      name: customMedName.trim(),
      dosage: customMedDosage.trim(),
      frequency: customMedFreq,
      scheduled_times: ['08:00', '13:00', '18:00'],
      instructions: 'Take as prescribed by doctor.',
    };
    setSelectedMeds([...selectedMeds, newMed]);
    setCustomMedName('');
    setCustomMedDosage('');
    setShowAddCustom(false);
  };

  const removeMed = (index) => {
    setSelectedMeds(selectedMeds.filter((_, i) => i !== index));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setErrorMessage(null);
    setSubmitting(true);

    try {
      const payload = isPatient
        ? {
            doctor_choice: doctorChoice,
            doctor_id: doctorChoice === 'EXISTING' && selectedDoctorId ? parseInt(selectedDoctorId) : null,
            new_doctor_name: doctorChoice === 'NEW' ? newDoctorName : null,
            new_doctor_specialty: doctorChoice === 'NEW' ? newDoctorSpecialty : null,
            new_doctor_clinic: doctorChoice === 'NEW' ? newDoctorClinic : null,
            new_doctor_email: doctorChoice === 'NEW' ? newDoctorEmail : null,
            new_doctor_phone: doctorChoice === 'NEW' ? newDoctorPhone : null,

            caregiver_choice: caregiverChoice,
            caregiver_id: caregiverChoice === 'EXISTING' && selectedCaregiverId ? parseInt(selectedCaregiverId) : null,
            new_caregiver_name: caregiverChoice === 'NEW' ? newCaregiverName : null,
            new_caregiver_relationship: caregiverChoice === 'NEW' ? newCaregiverRel : null,
            new_caregiver_phone: caregiverChoice === 'NEW' ? newCaregiverPhone : null,

            date_of_birth: dob,
            diagnosis_year: parseInt(diagnosisYear) || 2021,
            medications: selectedMeds,
          }
        : {
            patient_choice: patientChoice,
            patient_id: patientChoice === 'EXISTING' && selectedPatientId ? parseInt(selectedPatientId) : null,
            new_patient_name: patientChoice === 'NEW' ? newPatientName : null,
            new_patient_dob: patientChoice === 'NEW' ? newPatientDob : null,
            new_patient_diagnosis_year: patientChoice === 'NEW' ? parseInt(newPatientDiagYear) : null,
            relationship_type: caregiverRelType,
          };

      const res = await api.submitClinicalOnboarding(payload);
      if (onComplete) {
        onComplete(res);
      }
    } catch (err) {
      setErrorMessage(err.message || 'Failed to save clinical profile. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/70 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto animate-fadeIn">
      <div className="bg-white rounded-3xl max-w-3xl w-full shadow-2xl border border-[#2DD4BF]/40 overflow-hidden my-8">
        
        {/* Modal Header */}
        <div className="bg-gradient-to-r from-[#125450] via-[#1B7B75] to-[#146E68] text-white p-6 sm:p-8">
          <div className="flex items-center space-x-2 bg-[#2DD4BF] text-[#125450] px-3 py-1 rounded-full text-xs font-black uppercase tracking-wider inline-flex mb-2">
            <Sparkles className="w-3.5 h-3.5" />
            <span>Complete Your Clinical Care Profile</span>
          </div>
          <h2 className="text-2xl sm:text-3xl font-black text-white">
            Welcome, {user?.full_name || user?.username}!
          </h2>
          <p className="text-xs sm:text-sm text-[#C6F6F2] font-semibold mt-1 max-w-xl">
            {isPatient
              ? 'Select the doctor you are seeing, your primary family caregiver, and initialize your Parkinson’s medications from our database.'
              : 'Link to the patient under your care to enable real-time medication tracking and statistical decline alerts.'}
          </p>
        </div>

        {errorMessage && (
          <div className="mx-6 mt-4 p-3.5 bg-red-50 border border-red-300 rounded-2xl flex items-start space-x-2 text-xs font-bold text-red-800">
            <AlertCircle className="w-4 h-4 text-red-600 flex-shrink-0 mt-0.5" />
            <span>{errorMessage}</span>
          </div>
        )}

        {loadingDirectory ? (
          <div className="p-12 text-center text-slate-500 flex flex-col items-center justify-center">
            <RefreshCw className="w-8 h-8 text-[#1B7B75] animate-spin mb-3" />
            <span className="font-bold text-sm">Loading database directory (doctors, caregivers, catalog)...</span>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="p-6 sm:p-8 space-y-6">
            
            {/* ─── PATIENT FORM FLOW ─── */}
            {isPatient && (
              <>
                {/* 1. ATTENDING DOCTOR */}
                <div className="space-y-3 p-4 bg-[#F8F9FA] rounded-2xl border border-slate-200">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-black uppercase tracking-wider text-[#125450] flex items-center gap-1.5">
                      <Stethoscope className="w-4 h-4 text-[#1B7B75]" />
                      <span>1. Attending Doctor / Neurologist <span className="text-red-500">*</span></span>
                    </label>
                    <div className="flex space-x-1 bg-slate-200 p-0.5 rounded-full text-[11px] font-bold">
                      <button
                        type="button"
                        onClick={() => setDoctorChoice('EXISTING')}
                        className={`px-3 py-1 rounded-full transition ${
                          doctorChoice === 'EXISTING' ? 'bg-[#1B7B75] text-white shadow-sm' : 'text-slate-600'
                        }`}
                      >
                        Choose from Database
                      </button>
                      <button
                        type="button"
                        onClick={() => setDoctorChoice('NEW')}
                        className={`px-3 py-1 rounded-full transition ${
                          doctorChoice === 'NEW' ? 'bg-[#1B7B75] text-white shadow-sm' : 'text-slate-600'
                        }`}
                      >
                        + Add New Doctor
                      </button>
                    </div>
                  </div>

                  {doctorChoice === 'EXISTING' ? (
                    <div>
                      <select
                        value={selectedDoctorId}
                        onChange={(e) => setSelectedDoctorId(e.target.value)}
                        className="w-full px-3.5 py-2.5 bg-white border border-slate-300 rounded-xl text-xs font-extrabold text-slate-900 focus:ring-2 focus:ring-[#1B7B75]"
                        required
                      >
                        {directory.doctors.map((d) => (
                          <option key={d.id} value={d.id}>
                            {d.name} — {d.specialty} ({d.clinic_name})
                          </option>
                        ))}
                      </select>
                      <span className="text-[11px] text-slate-500 mt-1 block">
                        Selected doctor can review your 90-day acoustic trajectories and wearing-off correlations.
                      </span>
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2">
                      <div>
                        <label className="block text-[10px] font-bold uppercase text-slate-600 mb-1">Doctor's Full Name *</label>
                        <input
                          type="text"
                          value={newDoctorName}
                          onChange={(e) => setNewDoctorName(e.target.value)}
                          placeholder="Dr. Rajesh Sharma, MD"
                          className="w-full px-3 py-2 bg-white border border-slate-300 rounded-xl text-xs font-semibold"
                          required={doctorChoice === 'NEW'}
                        />
                      </div>
                      <div>
                        <label className="block text-[10px] font-bold uppercase text-slate-600 mb-1">Clinic / Hospital *</label>
                        <input
                          type="text"
                          value={newDoctorClinic}
                          onChange={(e) => setNewDoctorClinic(e.target.value)}
                          placeholder="City Movement Disorders Center"
                          className="w-full px-3 py-2 bg-white border border-slate-300 rounded-xl text-xs font-semibold"
                        />
                      </div>
                      <div>
                        <label className="block text-[10px] font-bold uppercase text-slate-600 mb-1">Specialty</label>
                        <input
                          type="text"
                          value={newDoctorSpecialty}
                          onChange={(e) => setNewDoctorSpecialty(e.target.value)}
                          placeholder="Movement Disorders & Neurorehab"
                          className="w-full px-3 py-2 bg-white border border-slate-300 rounded-xl text-xs font-semibold"
                        />
                      </div>
                      <div>
                        <label className="block text-[10px] font-bold uppercase text-slate-600 mb-1">Doctor Email (Optional)</label>
                        <input
                          type="email"
                          value={newDoctorEmail}
                          onChange={(e) => setNewDoctorEmail(e.target.value)}
                          placeholder="doctor@hospital.org"
                          className="w-full px-3 py-2 bg-white border border-slate-300 rounded-xl text-xs font-semibold"
                        />
                      </div>
                    </div>
                  )}
                </div>

                {/* 2. PRIMARY CAREGIVER */}
                <div className="space-y-3 p-4 bg-[#F8F9FA] rounded-2xl border border-slate-200">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-black uppercase tracking-wider text-[#125450] flex items-center gap-1.5">
                      <HeartHandshake className="w-4 h-4 text-[#1B7B75]" />
                      <span>2. Primary Caregiver / Family Aide</span>
                    </label>
                    <div className="flex space-x-1 bg-slate-200 p-0.5 rounded-full text-[11px] font-bold">
                      <button
                        type="button"
                        onClick={() => setCaregiverChoice('EXISTING')}
                        className={`px-3 py-1 rounded-full transition ${
                          caregiverChoice === 'EXISTING' ? 'bg-[#1B7B75] text-white shadow-sm' : 'text-slate-600'
                        }`}
                      >
                        Choose Existing
                      </button>
                      <button
                        type="button"
                        onClick={() => setCaregiverChoice('NEW')}
                        className={`px-3 py-1 rounded-full transition ${
                          caregiverChoice === 'NEW' ? 'bg-[#1B7B75] text-white shadow-sm' : 'text-slate-600'
                        }`}
                      >
                        + Add New
                      </button>
                      <button
                        type="button"
                        onClick={() => setCaregiverChoice('NONE')}
                        className={`px-2.5 py-1 rounded-full transition ${
                          caregiverChoice === 'NONE' ? 'bg-slate-400 text-white shadow-sm' : 'text-slate-500'
                        }`}
                      >
                        None
                      </button>
                    </div>
                  </div>

                  {caregiverChoice === 'EXISTING' && (
                    <select
                      value={selectedCaregiverId}
                      onChange={(e) => setSelectedCaregiverId(e.target.value)}
                      className="w-full px-3.5 py-2.5 bg-white border border-slate-300 rounded-xl text-xs font-extrabold text-slate-900 focus:ring-2 focus:ring-[#1B7B75]"
                    >
                      {directory.caregivers.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.name} — {c.relationship_type} {c.phone ? `(${c.phone})` : ''}
                        </option>
                      ))}
                    </select>
                  )}

                  {caregiverChoice === 'NEW' && (
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-2">
                      <div>
                        <label className="block text-[10px] font-bold uppercase text-slate-600 mb-1">Caregiver Name *</label>
                        <input
                          type="text"
                          value={newCaregiverName}
                          onChange={(e) => setNewCaregiverName(e.target.value)}
                          placeholder="Sarah Jenkins"
                          className="w-full px-3 py-2 bg-white border border-slate-300 rounded-xl text-xs font-semibold"
                          required={caregiverChoice === 'NEW'}
                        />
                      </div>
                      <div>
                        <label className="block text-[10px] font-bold uppercase text-slate-600 mb-1">Relationship</label>
                        <select
                          value={newCaregiverRel}
                          onChange={(e) => setNewCaregiverRel(e.target.value)}
                          className="w-full px-3 py-2 bg-white border border-slate-300 rounded-xl text-xs font-semibold"
                        >
                          <option value="Spouse">Spouse / Partner</option>
                          <option value="Son/Daughter">Son / Daughter</option>
                          <option value="Sibling">Sibling</option>
                          <option value="Primary Care Aide">Primary Care Aide</option>
                          <option value="Family Member">Family Member</option>
                        </select>
                      </div>
                      <div>
                        <label className="block text-[10px] font-bold uppercase text-slate-600 mb-1">Phone Number</label>
                        <input
                          type="tel"
                          value={newCaregiverPhone}
                          onChange={(e) => setNewCaregiverPhone(e.target.value)}
                          placeholder="+919876543210"
                          className="w-full px-3 py-2 bg-white border border-slate-300 rounded-xl text-xs font-semibold"
                        />
                      </div>
                    </div>
                  )}
                </div>

                {/* 3. PARKINSON'S MEDICATIONS */}
                <div className="space-y-3 p-4 bg-[#F8F9FA] rounded-2xl border border-slate-200">
                  <div className="flex items-center justify-between">
                    <div>
                      <label className="text-xs font-black uppercase tracking-wider text-[#125450] flex items-center gap-1.5">
                        <Pill className="w-4 h-4 text-[#1B7B75]" />
                        <span>3. Current Parkinson's Medications Regimen</span>
                      </label>
                      <span className="text-[11px] text-slate-500 block mt-0.5">
                        Select from standard database prescriptions or add custom medications.
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={() => setShowAddCustom(!showAddCustom)}
                      className="px-3 py-1 bg-[#125450] hover:bg-[#0D3F3C] text-white rounded-lg text-xs font-bold transition flex items-center space-x-1"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      <span>Custom Med</span>
                    </button>
                  </div>

                  {/* Custom Med Quick Creator Form */}
                  {showAddCustom && (
                    <div className="p-3 bg-white border border-[#2DD4BF] rounded-xl space-y-2 animate-fadeIn">
                      <span className="text-xs font-bold text-[#125450] block">Add Custom Prescription:</span>
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                        <input
                          type="text"
                          value={customMedName}
                          onChange={(e) => setCustomMedName(e.target.value)}
                          placeholder="Medication Name (e.g. Madopar)"
                          className="px-3 py-1.5 border border-slate-300 rounded-lg text-xs font-semibold"
                        />
                        <input
                          type="text"
                          value={customMedDosage}
                          onChange={(e) => setCustomMedDosage(e.target.value)}
                          placeholder="Dosage (e.g. 100/25 mg)"
                          className="px-3 py-1.5 border border-slate-300 rounded-lg text-xs font-semibold"
                        />
                        <button
                          type="button"
                          onClick={handleAddCustomMed}
                          className="px-3 py-1.5 bg-[#1B7B75] hover:bg-[#125450] text-white rounded-lg text-xs font-bold"
                        >
                          Add to Prescription List
                        </button>
                      </div>
                    </div>
                  )}

                  {/* Standard Catalog Grid */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-48 overflow-y-auto pr-1">
                    {directory.common_medications.map((med) => {
                      const isChecked = selectedMeds.some((m) => m.name === med.name);
                      return (
                        <div
                          key={med.name}
                          onClick={() => toggleCatalogMed(med)}
                          className={`p-2.5 rounded-xl border cursor-pointer transition-all flex items-start space-x-2.5 ${
                            isChecked
                              ? 'bg-[#E6F7F5] border-[#2DD4BF] text-[#125450] shadow-sm'
                              : 'bg-white border-slate-200 hover:border-slate-300 text-slate-700'
                          }`}
                        >
                          <div
                            className={`w-4 h-4 rounded-md mt-0.5 flex items-center justify-center border transition ${
                              isChecked ? 'bg-[#1B7B75] border-[#1B7B75] text-white' : 'border-slate-300 bg-white'
                            }`}
                          >
                            {isChecked && <Check className="w-3 h-3 stroke-[3]" />}
                          </div>
                          <div className="flex-1 min-w-0">
                            <span className="text-xs font-bold block truncate">{med.name}</span>
                            <span className="text-[10px] text-slate-500 font-medium block">
                              {med.dosage} • {med.frequency}
                            </span>
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  {/* Selected Medications Summary Tags */}
                  {selectedMeds.length > 0 && (
                    <div className="mt-2 pt-2 border-t border-slate-200">
                      <span className="text-[11px] font-bold text-slate-600 block mb-1">
                        Active Prescriptions to Save ({selectedMeds.length}):
                      </span>
                      <div className="flex flex-wrap gap-1.5">
                        {selectedMeds.map((m, idx) => (
                          <span
                            key={idx}
                            className="bg-[#125450] text-[#2DD4BF] text-[10px] font-black px-2.5 py-1 rounded-lg flex items-center space-x-1.5"
                          >
                            <span>{m.name} ({m.dosage})</span>
                            <button
                              type="button"
                              onClick={() => removeMed(idx)}
                              className="text-white/60 hover:text-white"
                              title="Remove medication"
                            >
                              <X className="w-3 h-3" />
                            </button>
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                </div>

                {/* 4. CLINICAL BASELINE */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 p-4 bg-[#F8F9FA] rounded-2xl border border-slate-200">
                  <div>
                    <label className="block text-[11px] font-bold uppercase text-slate-700 mb-1">
                      Date of Birth
                    </label>
                    <input
                      type="date"
                      value={dob}
                      onChange={(e) => setDob(e.target.value)}
                      className="w-full px-3.5 py-2 bg-white border border-slate-300 rounded-xl text-xs font-semibold"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-bold uppercase text-slate-700 mb-1">
                      Year of Diagnosis
                    </label>
                    <input
                      type="number"
                      min={1980}
                      max={new Date().getFullYear()}
                      value={diagnosisYear}
                      onChange={(e) => setDiagnosisYear(e.target.value)}
                      className="w-full px-3.5 py-2 bg-white border border-slate-300 rounded-xl text-xs font-semibold"
                    />
                  </div>
                </div>
              </>
            )}

            {/* ─── CAREGIVER FORM FLOW ─── */}
            {isCaregiver && (
              <div className="space-y-4">
                <div className="space-y-3 p-4 bg-[#F8F9FA] rounded-2xl border border-slate-200">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-black uppercase tracking-wider text-[#125450] flex items-center gap-1.5">
                      <User className="w-4 h-4 text-[#1B7B75]" />
                      <span>Select or Add Patient Under Your Care <span className="text-red-500">*</span></span>
                    </label>
                    <div className="flex space-x-1 bg-slate-200 p-0.5 rounded-full text-[11px] font-bold">
                      <button
                        type="button"
                        onClick={() => setPatientChoice('EXISTING')}
                        className={`px-3 py-1 rounded-full transition ${
                          patientChoice === 'EXISTING' ? 'bg-[#1B7B75] text-white shadow-sm' : 'text-slate-600'
                        }`}
                      >
                        Existing Patient in DB
                      </button>
                      <button
                        type="button"
                        onClick={() => setPatientChoice('NEW')}
                        className={`px-3 py-1 rounded-full transition ${
                          patientChoice === 'NEW' ? 'bg-[#1B7B75] text-white shadow-sm' : 'text-slate-600'
                        }`}
                      >
                        + Add New Patient
                      </button>
                    </div>
                  </div>

                  {patientChoice === 'EXISTING' ? (
                    <div>
                      <select
                        value={selectedPatientId}
                        onChange={(e) => setSelectedPatientId(e.target.value)}
                        className="w-full px-3.5 py-2.5 bg-white border border-slate-300 rounded-xl text-xs font-extrabold text-slate-900 focus:ring-2 focus:ring-[#1B7B75]"
                        required
                      >
                        {directory.patients.map((p) => (
                          <option key={p.id} value={p.id}>
                            {p.name} (Diagnosed: {p.diagnosis_year || '2021'})
                          </option>
                        ))}
                      </select>
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-2">
                      <div>
                        <label className="block text-[10px] font-bold uppercase text-slate-600 mb-1">Patient Full Name *</label>
                        <input
                          type="text"
                          value={newPatientName}
                          onChange={(e) => setNewPatientName(e.target.value)}
                          placeholder="Robert Jenkins"
                          className="w-full px-3 py-2 bg-white border border-slate-300 rounded-xl text-xs font-semibold"
                          required={patientChoice === 'NEW'}
                        />
                      </div>
                      <div>
                        <label className="block text-[10px] font-bold uppercase text-slate-600 mb-1">Date of Birth</label>
                        <input
                          type="date"
                          value={newPatientDob}
                          onChange={(e) => setNewPatientDob(e.target.value)}
                          className="w-full px-3 py-2 bg-white border border-slate-300 rounded-xl text-xs font-semibold"
                        />
                      </div>
                      <div>
                        <label className="block text-[10px] font-bold uppercase text-slate-600 mb-1">Diagnosis Year</label>
                        <input
                          type="number"
                          value={newPatientDiagYear}
                          onChange={(e) => setNewPatientDiagYear(e.target.value)}
                          className="w-full px-3 py-2 bg-white border border-slate-300 rounded-xl text-xs font-semibold"
                        />
                      </div>
                    </div>
                  )}
                </div>

                <div className="p-4 bg-[#F8F9FA] rounded-2xl border border-slate-200">
                  <label className="block text-xs font-black uppercase tracking-wider text-[#125450] mb-1.5">
                    Your Relationship to Patient
                  </label>
                  <select
                    value={caregiverRelType}
                    onChange={(e) => setCaregiverRelType(e.target.value)}
                    className="w-full px-3.5 py-2.5 bg-white border border-slate-300 rounded-xl text-xs font-extrabold text-slate-900"
                  >
                    <option value="Primary Family Caregiver">Primary Family Caregiver (Spouse/Partner)</option>
                    <option value="Son/Daughter Caregiver">Son / Daughter</option>
                    <option value="Professional Home Health Aide">Professional Home Health Aide</option>
                    <option value="Sibling / Relative">Sibling / Relative</option>
                  </select>
                </div>
              </div>
            )}

            {/* Submit Action Button */}
            <div className="pt-2">
              <button
                type="submit"
                disabled={submitting}
                className="w-full py-4 bg-[#125450] hover:bg-[#0D3F3C] disabled:bg-slate-300 text-white rounded-2xl text-sm font-black tracking-wider uppercase transition shadow-lg shadow-[#125450]/30 flex items-center justify-center space-x-2 min-h-[52px]"
              >
                {submitting ? (
                  <>
                    <RefreshCw className="w-5 h-5 animate-spin text-[#2DD4BF]" />
                    <span>Saving to Database...</span>
                  </>
                ) : (
                  <>
                    <span>Save Clinical Profile & Enter Companion</span>
                    <ChevronRight className="w-5 h-5 text-[#2DD4BF]" />
                  </>
                )}
              </button>
            </div>

          </form>
        )}

      </div>
    </div>
  );
}
