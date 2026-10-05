import React, { useState, useEffect } from 'react';
import {
  Building2,
  CheckCircle2,
  XCircle,
  FileText,
  ShieldCheck,
  RefreshCw,
  ExternalLink,
  Briefcase,
  Globe,
  Wallet,
} from 'lucide-react';
import { useNanivio } from '../../context/NanivioContext';
import { BusinessApplication, VerificationStatus } from '../../types/auth';

export const AdminBusinessQueue: React.FC = () => {
  const {
    adminBusinessesList,
    fetchAdminBusinesses,
    reviewBusiness,
  } = useNanivio();

  const [selectedFilter, setSelectedFilter] = useState<VerificationStatus | 'ALL'>('ALL');
  const [isLoading, setIsLoading] = useState(false);
  const [activeBiz, setActiveBiz] = useState<BusinessApplication | null>(null);
  const [reviewNotes, setReviewNotes] = useState('');
  const [reviewAction, setReviewAction] = useState<'APPROVE' | 'REJECT' | 'REQUEST_DOCS' | null>(null);

  useEffect(() => {
    loadBusinesses();
  }, [selectedFilter]);

  const loadBusinesses = async () => {
    setIsLoading(true);
    try {
      await fetchAdminBusinesses(selectedFilter === 'ALL' ? undefined : selectedFilter);
    } catch (err) {
      console.error('Failed to load business registrations:', err);
    } finally {
      setIsLoading(false);
    }
  };

  const handleExecuteReview = async () => {
    if (!activeBiz || !reviewAction) return;
    try {
      setIsLoading(true);
      await reviewBusiness(activeBiz.id, reviewAction, reviewNotes || `Admin marked as ${reviewAction}`);
      setActiveBiz(null);
      setReviewAction(null);
      setReviewNotes('');
      await loadBusinesses();
    } catch (err) {
      console.error('Failed to review business:', err);
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
            <Building2 className="w-4 h-4 text-blue-400" />
            <span>Corporate &amp; Enterprise Organization Queue</span>
          </h2>
          <p className="text-xs text-slate-400">
            Audit Registrar General documents, verify corporate tax status, and unlock enterprise multi-currency ledgers
          </p>
        </div>

        <div className="flex items-center gap-3">
          <select
            value={selectedFilter}
            onChange={(e) => setSelectedFilter(e.target.value as any)}
            className="px-3 py-1.5 bg-slate-900 border border-slate-800 rounded-xl text-xs text-slate-200 focus:outline-none focus:border-blue-500"
          >
            <option value="ALL">All Application Statuses</option>
            <option value="PENDING">Pending Verification</option>
            <option value="VERIFIED">Approved / Active</option>
            <option value="REJECTED">Rejected</option>
          </select>

          <button
            onClick={loadBusinesses}
            disabled={isLoading}
            className="px-3 py-1.5 rounded-xl bg-slate-900 border border-slate-800 hover:border-slate-700 text-xs text-slate-300 hover:text-white flex items-center gap-1.5 transition-all"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
            <span>Refresh</span>
          </button>
        </div>
      </div>

      {/* Grid of Business Registrations */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {adminBusinessesList.length === 0 ? (
          <div className="col-span-full p-8 text-center bg-[#0c1424] border border-slate-800 rounded-3xl text-xs text-slate-500">
            No business registrations found for the selected filter.
          </div>
        ) : (
          adminBusinessesList.map((biz) => (
            <div
              key={biz.id}
              className="bg-[#0c1424] border border-slate-800 hover:border-blue-500/40 rounded-3xl p-5 shadow-xl space-y-4 flex flex-col justify-between transition-all"
            >
              <div className="space-y-3">
                {/* Header */}
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h3 className="font-bold text-white text-sm">{biz.companyName}</h3>
                    <div className="text-xs text-blue-300 font-medium">{biz.industry}</div>
                    <div className="text-[10px] font-mono text-emerald-400">{biz.nvId}</div>
                  </div>

                  <span className={`px-2 py-0.5 rounded-full text-[9px] font-bold uppercase border ${
                    biz.verificationStatus === 'VERIFIED'
                      ? 'bg-emerald-950/80 text-emerald-300 border-emerald-500/40'
                      : biz.verificationStatus === 'PENDING'
                      ? 'bg-amber-950/80 text-amber-300 border-amber-500/40'
                      : 'bg-red-950/80 text-red-300 border-red-500/40'
                  }`}>
                    {biz.verificationStatus}
                  </span>
                </div>

                {/* Details */}
                <div className="space-y-2 text-xs text-slate-300 bg-slate-950/60 p-3 rounded-2xl border border-slate-800/80">
                  <div className="flex items-center justify-between">
                    <span className="text-slate-400">Reg Number:</span>
                    <span className="font-mono text-white font-bold">{biz.registrationNumber}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-slate-400">Tax ID (TIN):</span>
                    <span className="font-mono text-white font-bold">{biz.taxId}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-slate-400">Representative:</span>
                    <span className="text-white font-medium">{biz.representativeName} ({biz.representativeTitle})</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-slate-400">Country:</span>
                    <span className="text-white">{biz.country}</span>
                  </div>
                </div>

                {/* Documents */}
                <div className="space-y-1">
                  <div className="text-[10px] text-slate-400 uppercase font-mono">Incorporation Documents</div>
                  <div className="flex flex-wrap gap-1.5">
                    {biz.documentNames.map((doc, idx) => (
                      <span
                        key={idx}
                        className="px-2.5 py-1 rounded-xl bg-slate-900 border border-slate-800 text-slate-300 text-[10px] flex items-center gap-1 font-mono"
                      >
                        <FileText className="w-3 h-3 text-blue-400" />
                        <span className="truncate max-w-[140px]">{doc}</span>
                      </span>
                    ))}
                  </div>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="pt-3 border-t border-slate-800/80 flex items-center justify-end gap-2">
                <button
                  onClick={() => {
                    setActiveBiz(biz);
                    setReviewAction('REJECT');
                  }}
                  className="px-3.5 py-1.5 rounded-xl bg-red-950/40 hover:bg-red-950/70 text-red-300 border border-red-500/40 text-xs font-semibold"
                >
                  Reject
                </button>

                <button
                  onClick={() => {
                    setActiveBiz(biz);
                    setReviewAction('APPROVE');
                  }}
                  className="px-3.5 py-1.5 rounded-xl bg-blue-500 hover:bg-blue-400 text-slate-950 text-xs font-bold shadow-md"
                >
                  Approve Organization
                </button>
              </div>
            </div>
          ))
        )}
      </div>

      {/* Review Dialog */}
      {activeBiz && reviewAction && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="w-full max-w-md bg-[#0c1626] border border-slate-800 rounded-3xl p-6 shadow-2xl space-y-4">
            <h3 className="text-sm font-bold text-white flex items-center gap-2">
              {reviewAction === 'APPROVE' ? (
                <CheckCircle2 className="w-4 h-4 text-emerald-400" />
              ) : (
                <XCircle className="w-4 h-4 text-red-400" />
              )}
              <span>{reviewAction === 'APPROVE' ? 'Approve Corporate Application' : 'Reject Corporate Application'}</span>
            </h3>

            <p className="text-xs text-slate-300 leading-relaxed">
              Target Entity: <strong className="text-white">{activeBiz.companyName}</strong> (<span className="font-mono text-emerald-400">{activeBiz.nvId}</span>).
              {reviewAction === 'APPROVE'
                ? ' This will activate enterprise sovereign settlement, high-capacity Langpretation quotas, and verified organization branding.'
                : ' This will notify the representative and halt onboarding.'}
            </p>

            <div className="space-y-1">
              <label className="text-xs font-semibold text-slate-400">Review Notes / Compliance Ledger Entry</label>
              <textarea
                value={reviewNotes}
                onChange={(e) => setReviewNotes(e.target.value)}
                placeholder="e.g. Verified with Ghana Registrar General Department & GRA TIN database..."
                rows={3}
                className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-xs text-white focus:outline-none focus:border-blue-500"
              />
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button
                onClick={() => {
                  setActiveBiz(null);
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
                    ? 'bg-blue-500 hover:bg-blue-400 text-slate-950'
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
