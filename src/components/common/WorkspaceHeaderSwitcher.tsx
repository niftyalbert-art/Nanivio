import React from 'react';
import { PhoneCall, Sparkles, Radio, CreditCard, PlusCircle } from 'lucide-react';
import { useNanivio } from '../../context/NanivioContext';

interface WorkspaceHeaderSwitcherProps {
  currentSpace?: 'communication' | 'fintech';
}

export const WorkspaceHeaderSwitcher: React.FC<WorkspaceHeaderSwitcherProps> = () => {
  const { setActiveTab, currentPlan, billingSummary, wallets = [] } = useNanivio();

  const commBalance =
    billingSummary?.communicationAccount?.balance ??
    (wallets?.find((w) => w.currency === 'GHS')?.amount ?? 0.0);
  const minutesLeft = currentPlan?.langpretationMinutesRemaining ?? 0;

  return (
    <div className="w-full bg-gradient-to-r from-[#091220] via-[#0d1a30] to-[#070e1b] border border-slate-800/90 rounded-3xl p-3 sm:p-4 shadow-xl backdrop-blur-xl mb-6">
      <div className="flex flex-col sm:flex-row items-center justify-between gap-3">
        {/* Workspace Brand / Mode Label */}
        <div className="flex items-center gap-2.5 self-start sm:self-center">
          <div className="w-8 h-8 rounded-2xl bg-gradient-to-tr from-cyan-500 to-emerald-400 p-0.5 shadow-md shadow-emerald-500/20 shrink-0 flex items-center justify-center">
            <div className="w-full h-full bg-slate-950 rounded-[14px] flex items-center justify-center">
              <Radio className="w-4 h-4 text-emerald-400" />
            </div>
          </div>
          <div>
            <div className="text-[10px] uppercase font-mono tracking-widest text-slate-400 font-bold flex items-center gap-1.5">
              <span>Nanivio Communication Hub</span>
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
            </div>
            <div className="text-xs font-bold text-white flex items-center gap-2">
              <span>Voice, Video &amp; Langpretation Workspace</span>
            </div>
          </div>
        </div>

        {/* Master Segmented Workspace Controls */}
        <div className="flex items-center p-1.5 rounded-2xl bg-slate-950/90 border border-slate-800 shadow-inner w-full sm:w-auto gap-1">
          {/* Communication Interface Pill */}
          <button
            id="btn-switch-to-communication"
            onClick={() => setActiveTab('calls')}
            className="flex-1 sm:flex-initial px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-2 cursor-pointer bg-gradient-to-r from-emerald-500 to-teal-500 text-slate-950 shadow-lg shadow-emerald-500/30 scale-[1.02]"
          >
            <PhoneCall className="w-3.5 h-3.5" />
            <span>Communication Space</span>
            <span className="text-[9px] px-1.5 py-0.5 rounded-full font-mono font-bold bg-slate-950/30 text-slate-950">
              {minutesLeft}m left
            </span>
          </button>

          {/* Communication Account Balance & Top-up Pill */}
          <button
            id="btn-switch-to-billing-balance"
            onClick={() => setActiveTab('billing')}
            className="flex-1 sm:flex-initial px-3.5 py-2 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-2 cursor-pointer text-emerald-300 bg-emerald-950/40 border border-emerald-500/30 hover:bg-emerald-950/70"
            title="Communication Balance: Click to buy minutes & view billing"
          >
            <CreditCard className="w-3.5 h-3.5 text-emerald-400" />
            <span>GH₵ {commBalance.toFixed(0)}</span>
            <span className="text-[10px] px-1.5 py-0.5 rounded-md bg-emerald-500/20 text-emerald-300 font-mono font-bold flex items-center gap-0.5">
              <PlusCircle className="w-2.5 h-2.5" />
              Add
            </span>
          </button>

          {/* Services & Drive Pill */}
          <button
            id="btn-switch-to-services"
            onClick={() => setActiveTab('services')}
            className="hidden lg:flex px-3.5 py-2 rounded-xl text-xs font-bold text-slate-400 hover:text-white hover:bg-slate-900/80 transition-all items-center justify-center gap-1.5 cursor-pointer"
            title="Open Nanivio Services, Ride Hailing, Car Rentals & Directory"
          >
            <Sparkles className="w-3.5 h-3.5 text-amber-400" />
            <span>Services</span>
          </button>
        </div>
      </div>
    </div>
  );
};
