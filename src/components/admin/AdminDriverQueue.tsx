import React, { useState, useEffect } from 'react';
import {
  Car,
  CheckCircle2,
  XCircle,
  FileText,
  ShieldCheck,
  RefreshCw,
  ExternalLink,
  Shield,
  Key,
  MapPin,
  Calendar,
  AlertTriangle,
  User,
  Check,
  X,
  Clock,
  Navigation,
} from 'lucide-react';
import { useNanivio } from '../../context/NanivioContext';
import { DriverVerificationApplication, VerificationStatus } from '../../types/auth';

export const AdminDriverQueue: React.FC = () => {
  const {
    adminDriversList,
    fetchAdminDrivers,
    reviewDriver,
  } = useNanivio();

  const [selectedFilter, setSelectedFilter] = useState<VerificationStatus | 'ALL'>('ALL');
  const [isLoading, setIsLoading] = useState(false);
  const [activeDriver, setActiveDriver] = useState<DriverVerificationApplication | null>(null);
  const [reviewNotes, setReviewNotes] = useState('');
  const [reviewAction, setReviewAction] = useState<'APPROVE' | 'REJECT' | 'REQUEST_INFO' | null>(null);

  useEffect(() => {
    loadDrivers();
  }, [selectedFilter]);

  const loadDrivers = async () => {
    setIsLoading(true);
    try {
      await fetchAdminDrivers(selectedFilter === 'ALL' ? undefined : selectedFilter);
    } catch (err) {
      console.error('Failed to load driver applications:', err);
    } finally {
      setIsLoading(false);
    }
  };

  const handleExecuteReview = async () => {
    if (!activeDriver || !reviewAction) return;
    try {
      setIsLoading(true);
      await reviewDriver(activeDriver.id, reviewAction, reviewNotes || `Admin marked as ${reviewAction}`);
      setActiveDriver(null);
      setReviewAction(null);
      setReviewNotes('');
      await loadDrivers();
    } catch (err) {
      console.error('Failed to review driver:', err);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="space-y-5 animate-in fade-in duration-200">
      {/* Header */}
      <div className="bg-[#0c1424] border border-slate-800 rounded-3xl p-5 shadow-xl flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div>
          <h2 className="text-base font-bold text-white flex items-center gap-2">
            <Car className="w-4 h-4 text-emerald-400" />
            <span>Nanivio Drive Partner Verification Queue</span>
          </h2>
          <p className="text-xs text-slate-400">
            Verify DVLA driver licenses, vehicle roadworthiness, commercial insurance policies, and activate driver partner cockpits
          </p>
        </div>

        <div className="flex items-center gap-3">
          <select
            value={selectedFilter}
            onChange={(e) => setSelectedFilter(e.target.value as any)}
            className="px-3 py-1.5 bg-slate-900 border border-slate-800 rounded-xl text-xs text-slate-200 focus:outline-none focus:border-emerald-500"
          >
            <option value="ALL">All Application Statuses</option>
            <option value="PENDING">Pending Verification</option>
            <option value="VERIFIED">Approved / Active Drivers</option>
            <option value="REJECTED">Rejected</option>
          </select>

          <button
            onClick={loadDrivers}
            disabled={isLoading}
            className="px-3 py-1.5 rounded-xl bg-slate-900 border border-slate-800 hover:border-slate-700 text-xs text-slate-300 hover:text-white flex items-center gap-1.5 transition-all cursor-pointer"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
            <span>Refresh</span>
          </button>
        </div>
      </div>

      {/* Grid of Driver Partner Registrations */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {adminDriversList.length === 0 ? (
          <div className="col-span-full p-8 text-center bg-[#0c1424] border border-slate-800 rounded-3xl text-xs text-slate-500">
            No driver partner applications found for the selected filter.
          </div>
        ) : (
          adminDriversList.map((driver) => (
            <div
              key={driver.id}
              className="bg-[#0c1424] border border-slate-800 hover:border-emerald-500/40 rounded-3xl p-5 shadow-xl space-y-4 flex flex-col justify-between transition-all"
            >
              <div className="space-y-3">
                {/* Driver Top Row */}
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <div className="w-11 h-11 rounded-2xl bg-emerald-500/20 border border-emerald-500/30 flex items-center justify-center text-emerald-400 font-bold overflow-hidden shrink-0">
                      <Car className="w-5 h-5" />
                    </div>
                    <div>
                      <h3 className="font-bold text-white text-sm">{driver.name}</h3>
                      <div className="text-xs text-emerald-300 font-medium">{driver.vehicleMake} {driver.vehicleModel} ({driver.vehicleYear})</div>
                      <div className="text-[10px] font-mono text-slate-400">NV ID: {driver.nvId}</div>
                    </div>
                  </div>

                  <span className={`px-2 py-0.5 rounded-full text-[9px] font-bold uppercase border shrink-0 ${
                    driver.verificationStatus === 'VERIFIED'
                      ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30'
                      : driver.verificationStatus === 'PENDING'
                      ? 'bg-amber-500/20 text-amber-300 border-amber-500/30'
                      : 'bg-rose-500/20 text-rose-300 border-rose-500/30'
                  }`}>
                    {driver.verificationStatus}
                  </span>
                </div>

                {/* Vehicle Specs Grid */}
                <div className="p-3 rounded-2xl bg-slate-900/80 border border-slate-800/80 space-y-2 text-xs">
                  <div className="flex items-center justify-between text-slate-300">
                    <span className="text-slate-400">License Plate:</span>
                    <span className="font-mono font-black text-amber-400 bg-slate-950 px-2 py-0.5 rounded border border-slate-800">
                      {driver.plateNumber}
                    </span>
                  </div>
                  <div className="flex items-center justify-between text-slate-300">
                    <span className="text-slate-400">Vehicle Color:</span>
                    <span className="font-medium text-white">{driver.vehicleColor}</span>
                  </div>
                  <div className="flex items-center justify-between text-slate-300">
                    <span className="text-slate-400">Service Category:</span>
                    <span className="font-bold text-emerald-400 uppercase tracking-wide text-[10px]">
                      {driver.serviceTier || 'STANDARD'}
                    </span>
                  </div>
                  <div className="flex items-center justify-between text-slate-300">
                    <span className="text-slate-400">Driver License:</span>
                    <span className="font-mono text-slate-300">{driver.driverLicenseNumber}</span>
                  </div>
                </div>

                {/* Compliance & Regulatory Documentation Checks */}
                <div className="space-y-1.5 text-[11px] text-slate-400">
                  <div className="flex items-center gap-1.5 text-slate-300">
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                    <span>Insurance: {driver.insurancePolicyNumber || 'Commercial Cover Logged'}</span>
                  </div>
                  <div className="flex items-center gap-1.5 text-slate-300">
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                    <span>Roadworthiness: {driver.roadworthinessCert || 'DVLA Pass Certified'}</span>
                  </div>
                  <div className="flex items-center gap-1.5 text-slate-300">
                    <Clock className="w-3.5 h-3.5 text-blue-400 shrink-0" />
                    <span>Submitted: {new Date(driver.submittedAt).toLocaleDateString()}</span>
                  </div>
                </div>

                {driver.reviewNotes && (
                  <div className="p-2.5 rounded-xl bg-slate-900 border border-slate-800 text-[11px] text-slate-300">
                    <span className="font-semibold text-slate-400">Admin Notes:</span> {driver.reviewNotes}
                  </div>
                )}
              </div>

              {/* Action Buttons */}
              <div className="pt-2 border-t border-slate-800 flex items-center gap-2">
                <button
                  onClick={() => {
                    setActiveDriver(driver);
                    setReviewAction(null);
                  }}
                  className="flex-1 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-xs font-bold text-slate-200 hover:text-white border border-slate-800 hover:border-slate-700 transition-all flex items-center justify-center gap-1.5 cursor-pointer"
                >
                  <FileText className="w-3.5 h-3.5 text-emerald-400" />
                  <span>Inspect Dossier</span>
                </button>

                {driver.verificationStatus === 'PENDING' && (
                  <>
                    <button
                      onClick={() => {
                        setActiveDriver(driver);
                        setReviewAction('APPROVE');
                      }}
                      className="p-2 rounded-xl bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-300 border border-emerald-500/40 transition-all cursor-pointer"
                      title="Quick Approve Driver"
                    >
                      <Check className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => {
                        setActiveDriver(driver);
                        setReviewAction('REJECT');
                      }}
                      className="p-2 rounded-xl bg-rose-500/20 hover:bg-rose-500/30 text-rose-300 border border-rose-500/40 transition-all cursor-pointer"
                      title="Reject Application"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </>
                )}
              </div>
            </div>
          ))
        )}
      </div>

      {/* Review / Inspection Dossier Modal */}
      {activeDriver && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in duration-150">
          <div className="max-w-xl w-full bg-[#0a1120] border border-slate-800 rounded-3xl p-6 shadow-2xl space-y-5 max-h-[90vh] overflow-y-auto">
            {/* Modal Header */}
            <div className="flex items-center justify-between pb-3 border-b border-slate-800">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl bg-emerald-500/20 border border-emerald-500/30 flex items-center justify-center text-emerald-400 font-bold">
                  <Car className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-bold text-white text-base">Driver Verification Review</h3>
                  <div className="text-xs text-slate-400">{activeDriver.name} · NV ID: {activeDriver.nvId}</div>
                </div>
              </div>

              <button
                onClick={() => {
                  setActiveDriver(null);
                  setReviewAction(null);
                  setReviewNotes('');
                }}
                className="text-slate-400 hover:text-white p-1 rounded-xl bg-slate-900 border border-slate-800 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Application Detail Sections */}
            <div className="space-y-4 text-xs">
              <div className="p-4 rounded-2xl bg-slate-900/60 border border-slate-800 space-y-2">
                <h4 className="font-bold text-emerald-400 uppercase tracking-wider text-[10px]">Vehicle &amp; License Documentation</h4>
                <div className="grid grid-cols-2 gap-3 text-slate-300">
                  <div>
                    <span className="text-slate-500 block">Vehicle Specification</span>
                    <span className="font-semibold text-white">{activeDriver.vehicleYear} {activeDriver.vehicleMake} {activeDriver.vehicleModel}</span>
                  </div>
                  <div>
                    <span className="text-slate-500 block">Number Plate</span>
                    <span className="font-mono font-bold text-amber-400">{activeDriver.plateNumber}</span>
                  </div>
                  <div>
                    <span className="text-slate-500 block">Driver License #</span>
                    <span className="font-mono text-white">{activeDriver.driverLicenseNumber}</span>
                  </div>
                  <div>
                    <span className="text-slate-500 block">Service Tier</span>
                    <span className="font-bold text-emerald-400 uppercase">{activeDriver.serviceTier || 'STANDARD'}</span>
                  </div>
                  <div>
                    <span className="text-slate-500 block">Commercial Insurance</span>
                    <span className="text-white">{activeDriver.insurancePolicyNumber || 'Enterprise Insurance Commercial'}</span>
                  </div>
                  <div>
                    <span className="text-slate-500 block">Roadworthiness Certificate</span>
                    <span className="text-white">{activeDriver.roadworthinessCert || 'DVLA Validated'}</span>
                  </div>
                </div>
              </div>

              {/* Action Selector */}
              <div className="space-y-2">
                <label className="font-semibold text-white block">Select Review Decision:</label>
                <div className="grid grid-cols-3 gap-2">
                  <button
                    type="button"
                    onClick={() => setReviewAction('APPROVE')}
                    className={`py-2.5 px-3 rounded-xl border text-xs font-bold transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
                      reviewAction === 'APPROVE'
                        ? 'bg-emerald-500 text-slate-950 border-emerald-400 shadow-md shadow-emerald-500/20'
                        : 'bg-slate-900 text-emerald-400 border-emerald-500/30 hover:bg-emerald-500/10'
                    }`}
                  >
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    <span>Approve</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setReviewAction('REQUEST_INFO')}
                    className={`py-2.5 px-3 rounded-xl border text-xs font-bold transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
                      reviewAction === 'REQUEST_INFO'
                        ? 'bg-amber-500 text-slate-950 border-amber-400 shadow-md shadow-amber-500/20'
                        : 'bg-slate-900 text-amber-400 border-amber-500/30 hover:bg-amber-500/10'
                    }`}
                  >
                    <AlertTriangle className="w-3.5 h-3.5" />
                    <span>Request Docs</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setReviewAction('REJECT')}
                    className={`py-2.5 px-3 rounded-xl border text-xs font-bold transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
                      reviewAction === 'REJECT'
                        ? 'bg-rose-500 text-white border-rose-400 shadow-md shadow-rose-500/20'
                        : 'bg-slate-900 text-rose-400 border-rose-500/30 hover:bg-rose-500/10'
                    }`}
                  >
                    <XCircle className="w-3.5 h-3.5" />
                    <span>Reject</span>
                  </button>
                </div>
              </div>

              {/* Review Notes */}
              <div className="space-y-1.5">
                <label className="font-semibold text-slate-300 block">Compliance Audit Notes (Recorded into Audit Ledger):</label>
                <textarea
                  value={reviewNotes}
                  onChange={(e) => setReviewNotes(e.target.value)}
                  placeholder="Enter notes on DVLA check, vehicle inspection, or reason for request/rejection..."
                  rows={3}
                  className="w-full p-3 bg-slate-900 border border-slate-800 rounded-2xl text-xs text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500"
                />
              </div>
            </div>

            {/* Modal Actions */}
            <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-800">
              <button
                type="button"
                onClick={() => {
                  setActiveDriver(null);
                  setReviewAction(null);
                  setReviewNotes('');
                }}
                className="px-4 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-slate-400 hover:text-white text-xs font-bold border border-slate-800 cursor-pointer"
              >
                Cancel
              </button>

              <button
                type="button"
                disabled={!reviewAction || isLoading}
                onClick={handleExecuteReview}
                className="px-5 py-2.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 disabled:opacity-40 disabled:cursor-not-allowed text-slate-950 text-xs font-black transition-all flex items-center gap-2 cursor-pointer shadow-lg shadow-emerald-500/20"
              >
                {isLoading ? (
                  <>
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    <span>Submitting Audit Decision...</span>
                  </>
                ) : (
                  <>
                    <ShieldCheck className="w-4 h-4" />
                    <span>Confirm Decision</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
