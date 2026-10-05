import React, { useState, useEffect } from 'react';
import {
  Award,
  CheckCircle2,
  XCircle,
  Clock,
  FileText,
  AlertCircle,
  Search,
  Filter,
  DollarSign,
  Star,
  ExternalLink,
  ShieldCheck,
  RefreshCw,
} from 'lucide-react';
import { useNanivio } from '../../context/NanivioContext';
import { ExpertApplication, VerificationStatus } from '../../types/auth';

export const AdminExpertQueue: React.FC = () => {
  const {
    adminExpertsList,
    fetchAdminExperts,
    reviewExpert,
    toggleExpertFeatured,
  } = useNanivio();

  const [selectedFilter, setSelectedFilter] = useState<VerificationStatus | 'ALL'>('ALL');
  const [isLoading, setIsLoading] = useState(false);
  const [activeApp, setActiveApp] = useState<ExpertApplication | null>(null);
  const [reviewNotes, setReviewNotes] = useState('');
  const [reviewAction, setReviewAction] = useState<'APPROVE' | 'REJECT' | 'REQUEST_INFO' | null>(null);

  useEffect(() => {
    loadExperts();
  }, [selectedFilter]);

  const loadExperts = async () => {
    setIsLoading(true);
    try {
      await fetchAdminExperts(selectedFilter === 'ALL' ? undefined : selectedFilter);
    } catch (err) {
      console.error('Failed to load expert applications:', err);
    } finally {
      setIsLoading(false);
    }
  };

  const handleExecuteReview = async () => {
    if (!activeApp || !reviewAction) return;
    try {
      setIsLoading(true);
      await reviewExpert(activeApp.id, reviewAction, reviewNotes || `Admin marked as ${reviewAction}`);
      setActiveApp(null);
      setReviewAction(null);
      setReviewNotes('');
      await loadExperts();
    } catch (err) {
      console.error('Failed to review expert:', err);
    } finally {
      setIsLoading(false);
    }
  };

  const handleToggleFeatured = async (app: ExpertApplication) => {
    try {
      await toggleExpertFeatured(app.id, !app.featured);
      await loadExperts();
    } catch (err) {
      console.error('Toggle featured failed:', err);
    }
  };

  return (
    <div className="space-y-5 animate-in fade-in duration-200">
      {/* Header Bar */}
      <div className="bg-[#0c1424] border border-slate-800 rounded-3xl p-5 shadow-xl flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div>
          <h2 className="text-base font-bold text-white flex items-center gap-2">
            <Award className="w-4 h-4 text-purple-400" />
            <span>Expert Practitioner Verification Queue</span>
          </h2>
          <p className="text-xs text-slate-400">
            Review professional credentials, statutory licenses, and approve practitioners for live marketplace consulting
          </p>
        </div>

        <div className="flex items-center gap-3">
          <select
            value={selectedFilter}
            onChange={(e) => setSelectedFilter(e.target.value as any)}
            className="px-3 py-1.5 bg-slate-900 border border-slate-800 rounded-xl text-xs text-slate-200 focus:outline-none focus:border-purple-500"
          >
            <option value="ALL">All Application Statuses</option>
            <option value="PENDING">Pending Review</option>
            <option value="VERIFIED">Verified / Approved</option>
            <option value="REJECTED">Rejected</option>
            <option value="INFO_REQUESTED">Info Requested</option>
          </select>

          <button
            onClick={loadExperts}
            disabled={isLoading}
            className="px-3 py-1.5 rounded-xl bg-slate-900 border border-slate-800 hover:border-slate-700 text-xs text-slate-300 hover:text-white flex items-center gap-1.5 transition-all"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
            <span>Refresh</span>
          </button>
        </div>
      </div>

      {/* Applications Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {adminExpertsList.length === 0 ? (
          <div className="col-span-full p-8 text-center bg-[#0c1424] border border-slate-800 rounded-3xl text-xs text-slate-500">
            No expert applications found for the selected filter.
          </div>
        ) : (
          adminExpertsList.map((app) => (
            <div
              key={app.id}
              className="bg-[#0c1424] border border-slate-800 hover:border-purple-500/40 rounded-3xl p-5 shadow-xl space-y-4 flex flex-col justify-between transition-all"
            >
              <div className="space-y-3">
                {/* Header: Photo & Title */}
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <div className="w-12 h-12 rounded-2xl overflow-hidden border border-slate-700 bg-slate-800 shrink-0">
                      <img
                        src={app.avatar}
                        alt={app.fullName}
                        className="w-full h-full object-cover"
                      />
                    </div>
                    <div>
                      <div className="flex items-center gap-1.5">
                        <h3 className="font-bold text-white text-xs">{app.fullName}</h3>
                        {app.isFeatured && (
                          <Star className="w-3.5 h-3.5 text-amber-400 fill-amber-400" />
                        )}
                      </div>
                      <div className="text-[11px] text-purple-300 font-medium">{app.title}</div>
                      <div className="text-[10px] font-mono text-emerald-400">{app.nvId}</div>
                    </div>
                  </div>

                  <span className={`px-2 py-0.5 rounded-full text-[9px] font-bold uppercase border ${
                    app.verificationStatus === 'VERIFIED'
                      ? 'bg-emerald-950/80 text-emerald-300 border-emerald-500/40'
                      : app.verificationStatus === 'PENDING'
                      ? 'bg-amber-950/80 text-amber-300 border-amber-500/40'
                      : 'bg-red-950/80 text-red-300 border-red-500/40'
                  }`}>
                    {app.verificationStatus}
                  </span>
                </div>

                {/* Badges & Stats */}
                <div className="grid grid-cols-2 gap-2 text-[11px] font-mono">
                  <div className="p-2 rounded-xl bg-slate-950/60 border border-slate-800">
                    <span className="text-slate-500 text-[10px] block">Rates (Min)</span>
                    <span className="text-white font-bold">GH₵ {app.ratePerMinGHS}</span>
                    <span className="text-slate-400 text-[10px]"> (${app.ratePerMinUSD})</span>
                  </div>

                  <div className="p-2 rounded-xl bg-slate-950/60 border border-slate-800">
                    <span className="text-slate-500 text-[10px] block">Experience</span>
                    <span className="text-white font-bold">{app.experienceYears} Years</span>
                  </div>
                </div>

                {/* Credentials & Licenses */}
                <div className="space-y-1.5 text-xs">
                  <div className="text-slate-400 flex items-center gap-1 text-[11px]">
                    <ShieldCheck className="w-3.5 h-3.5 text-purple-400 shrink-0" />
                    <span className="truncate">License: <strong className="text-white">{app.licenses}</strong></span>
                  </div>

                  <div className="text-[11px] text-slate-400">
                    Category: <span className="text-slate-200">{app.category}</span>
                  </div>

                  <div className="flex flex-wrap gap-1 pt-1">
                    {app.documentNames.map((doc, i) => (
                      <span
                        key={i}
                        className="px-2 py-0.5 rounded-lg bg-slate-900 border border-slate-800 text-slate-300 text-[10px] flex items-center gap-1"
                      >
                        <FileText className="w-3 h-3 text-cyan-400" />
                        <span className="truncate max-w-[120px]">{doc}</span>
                      </span>
                    ))}
                  </div>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="pt-3 border-t border-slate-800/80 flex items-center justify-between gap-2">
                <button
                  onClick={() => handleToggleFeatured(app)}
                  className={`p-2 rounded-xl border text-xs transition-all ${
                    app.isFeatured
                      ? 'bg-amber-500/20 text-amber-300 border-amber-500/40'
                      : 'bg-slate-900 text-slate-400 hover:text-amber-300 border-slate-800'
                  }`}
                  title="Toggle Featured on Marketplace"
                >
                  <Star className="w-3.5 h-3.5" />
                </button>

                <div className="flex items-center gap-1.5">
                  <button
                    onClick={() => {
                      setActiveApp(app);
                      setReviewAction('REJECT');
                    }}
                    className="px-3 py-1.5 rounded-xl bg-red-950/40 hover:bg-red-950/70 text-red-300 border border-red-500/40 text-xs font-semibold"
                  >
                    Reject
                  </button>

                  <button
                    onClick={() => {
                      setActiveApp(app);
                      setReviewAction('APPROVE');
                    }}
                    className="px-3 py-1.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 text-xs font-bold shadow-md"
                  >
                    Approve
                  </button>
                </div>
              </div>
            </div>
          ))
        )}
      </div>

      {/* Review Dialog */}
      {activeApp && reviewAction && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="w-full max-w-md bg-[#0c1626] border border-slate-800 rounded-3xl p-6 shadow-2xl space-y-4">
            <h3 className="text-sm font-bold text-white flex items-center gap-2">
              {reviewAction === 'APPROVE' ? (
                <CheckCircle2 className="w-4 h-4 text-emerald-400" />
              ) : (
                <XCircle className="w-4 h-4 text-red-400" />
              )}
              <span>{reviewAction === 'APPROVE' ? 'Approve Expert Application' : 'Reject Expert Application'}</span>
            </h3>

            <p className="text-xs text-slate-300 leading-relaxed">
              Target Expert: <strong className="text-white">{activeApp.fullName}</strong> (<span className="font-mono text-emerald-400">{activeApp.nvId}</span>).
              {reviewAction === 'APPROVE'
                ? ' This will mark the account as VERIFIED and publish the expert to the live Nanivio Services marketplace.'
                : ' This will notify the applicant and suspend their public listing.'}
            </p>

            <div className="space-y-1">
              <label className="text-xs font-semibold text-slate-400">Review Notes / Compliance Audit Reason</label>
              <textarea
                value={reviewNotes}
                onChange={(e) => setReviewNotes(e.target.value)}
                placeholder="e.g. Verified license with Ghana Medical & Dental Council..."
                rows={3}
                className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-xs text-white focus:outline-none focus:border-purple-500"
              />
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button
                onClick={() => {
                  setActiveApp(null);
                  setReviewAction(null);
                  setReviewNotes('');
                }}
                className="px-4 py-2 rounded-xl bg-slate-900 border border-slate-800 text-slate-400 hover:text-white text-xs font-medium"
              >
                Cancel
              </button>
              <button
                onClick={handleExecuteReview}
                disabled={isLoading}
                className={`px-4 py-2 rounded-xl font-bold text-xs ${
                  reviewAction === 'APPROVE'
                    ? 'bg-emerald-500 hover:bg-emerald-400 text-slate-950'
                    : 'bg-red-500 hover:bg-red-400 text-white'
                }`}
              >
                Confirm {reviewAction}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
