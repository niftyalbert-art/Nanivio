import React from 'react';
import { AlertTriangle, X } from 'lucide-react';
import { useNanivio } from '../../context/NanivioContext';

export const CallAllowanceNotice: React.FC = () => {
  const {
    callBillingNotice,
    dismissCallBillingNotice,
    setActiveTab,
    setPendingBillingAction,
  } = useNanivio();

  if (!callBillingNotice) return null;

  const openPlans = () => {
    setPendingBillingAction({ purpose: 'SUBSCRIPTION', subTab: 'plans' });
    setActiveTab('billing');
    dismissCallBillingNotice();
  };

  return (
    <div
      role="status"
      aria-live="polite"
      className="mx-auto w-full max-w-xl rounded-xl border border-amber-300/30 bg-[#292318]/95 px-3 py-2.5 text-amber-50 shadow-lg"
    >
      <div className="flex items-start gap-2.5">
        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-300" aria-hidden="true" />
        <div className="min-w-0 flex-1">
          <p className="text-[10px] font-bold uppercase tracking-wider text-amber-300">
            {callBillingNotice.subscriptionRequired ? 'Plan required' : 'Call allowance'}
          </p>
          <p className="text-xs font-semibold leading-relaxed">
            {callBillingNotice.message}
          </p>
          <p className="mt-1 text-[11px] leading-relaxed text-amber-100/70">
            Ordinary chat is free, and receiving calls does not use your plan minutes.
          </p>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={openPlans}
              className="min-h-8 rounded-lg bg-amber-300 px-3 text-[11px] font-bold text-slate-950 transition hover:bg-amber-200 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-100"
            >
              View plans
            </button>
            <button
              type="button"
              onClick={dismissCallBillingNotice}
              className="min-h-8 rounded-lg px-3 text-[11px] font-semibold text-amber-100/80 transition hover:bg-white/10 hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-100"
            >
              Dismiss
            </button>
          </div>
        </div>
        <button
          type="button"
          onClick={dismissCallBillingNotice}
          aria-label="Dismiss call allowance notice"
          className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-amber-100/70 transition hover:bg-white/10 hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-100"
        >
          <X className="h-4 w-4" aria-hidden="true" />
        </button>
      </div>
    </div>
  );
};
