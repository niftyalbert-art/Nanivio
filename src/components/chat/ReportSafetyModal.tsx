import React, { useState } from 'react';
import {
  ShieldAlert,
  X,
  AlertTriangle,
  Ban,
  Shield,
  CheckCircle2,
  Lock,
} from 'lucide-react';
import { SafetyReport } from '../../types';

interface ReportSafetyModalProps {
  isOpen: boolean;
  onClose: () => void;
  targetId: string;
  targetName: string;
  isGroup?: boolean;
  onSubmitReport: (report: Omit<SafetyReport, 'id' | 'timestamp'>, shouldBlock?: boolean, shouldRestrict?: boolean) => Promise<void>;
}

export const ReportSafetyModal: React.FC<ReportSafetyModalProps> = ({
  isOpen,
  onClose,
  targetId,
  targetName,
  isGroup = false,
  onSubmitReport,
}) => {
  const [reason, setReason] = useState<SafetyReport['reason']>('spam');
  const [details, setDetails] = useState('');
  const [blockAlso, setBlockAlso] = useState(false);
  const [restrictAlso, setRestrictAlso] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [successToast, setSuccessToast] = useState(false);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    try {
      await onSubmitReport(
        {
          targetId,
          targetName,
          reason,
          details: details.trim(),
        },
        blockAlso,
        restrictAlso
      );
      setSuccessToast(true);
      setTimeout(() => {
        setSuccessToast(false);
        onClose();
      }, 1500);
    } catch (err) {
      console.error('Safety report error:', err);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 bg-black/80 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-[#0b1424] border border-rose-500/40 rounded-3xl w-full max-w-md shadow-2xl overflow-hidden flex flex-col">
        {/* Header */}
        <div className="p-4 sm:p-5 border-b border-slate-800 flex items-center justify-between bg-gradient-to-r from-rose-950/40 via-slate-900 to-slate-900">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-rose-500/20 text-rose-400 border border-rose-500/30">
              <ShieldAlert className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-sm sm:text-base font-bold text-white">
                Report {isGroup ? 'Group' : 'User'}: {targetName}
              </h3>
              <p className="text-xs text-rose-300/80">Confidential Trust &amp; Safety Review</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {successToast ? (
          <div className="p-8 text-center space-y-3">
            <div className="w-12 h-12 rounded-full bg-emerald-500/20 text-emerald-400 mx-auto flex items-center justify-center border border-emerald-500/40">
              <CheckCircle2 className="w-6 h-6" />
            </div>
            <h4 className="text-base font-bold text-white">Report Submitted</h4>
            <p className="text-xs text-slate-300">
              Thank you for keeping Nanivio safe. Our security operations team has logged this report for investigation.
            </p>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="p-4 sm:p-5 space-y-4">
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-slate-300">Reason for report *</label>
              <div className="grid grid-cols-1 gap-1.5">
                {[
                  { value: 'spam', label: 'Spam or unwanted advertising' },
                  { value: 'harassment', label: 'Harassment, hate speech, or abuse' },
                  { value: 'impersonation', label: 'Impersonation or fake profile' },
                  { value: 'suspicious', label: 'Fraudulent transaction or payment scam' },
                  { value: 'inappropriate', label: 'Inappropriate or harmful media' },
                  { value: 'other', label: 'Other violation of terms' },
                ].map((item) => (
                  <label
                    key={item.value}
                    className={`p-2.5 rounded-xl border flex items-center gap-2.5 text-xs cursor-pointer transition-colors ${
                      reason === item.value
                        ? 'bg-rose-950/30 border-rose-500/60 text-white font-semibold'
                        : 'bg-slate-900/40 border-slate-800 text-slate-300 hover:border-slate-700'
                    }`}
                  >
                    <input
                      type="radio"
                      name="safety-reason"
                      value={item.value}
                      checked={reason === item.value}
                      onChange={() => setReason(item.value as any)}
                      className="text-rose-500 focus:ring-rose-500"
                    />
                    <span>{item.label}</span>
                  </label>
                ))}
              </div>
            </div>

            {/* Additional details */}
            <div className="space-y-1">
              <label className="text-xs font-semibold text-slate-300">Additional details (optional)</label>
              <textarea
                rows={2}
                placeholder="Explain what happened or specify message snippets..."
                value={details}
                onChange={(e) => setDetails(e.target.value)}
                className="w-full bg-slate-950 border border-slate-800 rounded-xl p-2.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-rose-500"
              />
            </div>

            {/* Immediate Protection Actions */}
            {!isGroup && (
              <div className="space-y-2 pt-2 border-t border-slate-800">
                <span className="text-[11px] font-mono uppercase tracking-wider text-slate-400">
                  Immediate Protections:
                </span>

                <label className="p-2.5 rounded-xl border border-slate-800 bg-slate-900/30 flex items-center justify-between text-xs cursor-pointer">
                  <div className="flex items-center gap-2 text-slate-200">
                    <Ban className="w-4 h-4 text-rose-400" />
                    <span>Block this user completely</span>
                  </div>
                  <input
                    type="checkbox"
                    checked={blockAlso}
                    onChange={(e) => setBlockAlso(e.target.checked)}
                    className="rounded bg-slate-950 border-slate-700 text-rose-500 focus:ring-rose-500"
                  />
                </label>

                <label className="p-2.5 rounded-xl border border-slate-800 bg-slate-900/30 flex items-center justify-between text-xs cursor-pointer">
                  <div className="flex items-center gap-2 text-slate-200">
                    <Shield className="w-4 h-4 text-amber-400" />
                    <span>Restrict user (silently limits calls &amp; alerts)</span>
                  </div>
                  <input
                    type="checkbox"
                    checked={restrictAlso}
                    onChange={(e) => setRestrictAlso(e.target.checked)}
                    className="rounded bg-slate-950 border-slate-700 text-amber-500 focus:ring-amber-500"
                  />
                </label>
              </div>
            )}

            {/* Footer buttons */}
            <div className="p-3 border-t border-slate-800 bg-slate-900/80 -mx-4 -mb-4 sm:-mx-5 sm:-mb-5 flex items-center justify-between mt-4">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-400 hover:text-white transition-colors"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={isSubmitting}
                className="px-5 py-2.5 rounded-xl bg-rose-600 hover:bg-rose-500 text-white font-bold text-xs hover:scale-105 transition-all shadow-lg shadow-rose-600/20"
              >
                {isSubmitting ? 'Submitting...' : 'Submit Report'}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
};
