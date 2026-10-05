import React, { useState } from 'react';
import {
  Activity,
  Sparkles,
  Zap,
  TrendingUp,
  Clock,
  Calendar,
  CheckCircle2,
  AlertTriangle,
  RotateCcw,
  Phone,
  Video,
  Users,
  Mic,
  MessageSquare,
  ShieldCheck,
  ArrowRight,
  Info,
} from 'lucide-react';
import { motion } from 'motion/react';
import { useNanivio } from '../../context/NanivioContext';

interface LiveLangpretationMeterProps {
  onTopUpMinutes?: () => void;
  onChangePlan?: () => void;
  compact?: boolean;
}

export const LiveLangpretationMeter: React.FC<LiveLangpretationMeterProps> = ({
  onTopUpMinutes,
  onChangePlan,
  compact = false,
}) => {
  const { langpretationMeter, billingSummary, setIsMinutesModalOpen } = useNanivio();
  const [showChannelDetails, setShowChannelDetails] = useState(false);

  // Meter fallback from context if langpretationMeter is loading
  const meter = langpretationMeter || {
    remainingAllowance: billingSummary?.subscription?.langpretationMinutesRemaining ?? 0,
    monthlyQuota: billingSummary?.subscription?.langpretationMinutesQuota ?? 0,
    minutesUsed: billingSummary?.subscription?.langpretationMinutesUsed ?? 0,
    estimatedSavingsGHS: Number(((billingSummary?.subscription?.langpretationMinutesUsed ?? 0) * 32.8).toFixed(2)),
    estimatedSavingsUSD: Number(((billingSummary?.subscription?.langpretationMinutesUsed ?? 0) * 2.35).toFixed(2)),
    status: (billingSummary?.subscription?.langpretationMinutesRemaining ?? 0) > 0 ? 'ACTIVE' : 'EXHAUSTED',
    currentPeriodStart: billingSummary?.subscription?.currentPeriodStart ?? Date.now(),
    currentPeriodEnd: billingSummary?.subscription?.currentPeriodEnd ?? Date.now() + 86400000 * 30,
    tier: billingSummary?.subscription?.tier ?? 'free',
    planName: billingSummary?.subscription?.planName ?? 'Free Basic Tier',
    channelBreakdown: {
      audioCalls: 0,
      videoCalls: 0,
      groupAudioCalls: 0,
      voiceNotes: 0,
      textChat: 0,
    },
  };

  const quota = Math.max(1, meter.monthlyQuota);
  const remaining = Math.max(0, meter.remainingAllowance);
  const used = Math.max(0, meter.minutesUsed);
  const percentRemaining = Math.min(100, Math.round((remaining / quota) * 100));

  const statusColorMap = {
    ACTIVE: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/30',
    TRIAL: 'text-cyan-400 bg-cyan-500/10 border-cyan-500/30',
    EXHAUSTED: 'text-amber-400 bg-amber-500/10 border-amber-500/30',
    EXPIRED: 'text-rose-400 bg-rose-500/10 border-rose-500/30',
  };

  const handleOpenTopUp = () => {
    if (onTopUpMinutes) {
      onTopUpMinutes();
    } else if (setIsMinutesModalOpen) {
      setIsMinutesModalOpen(true);
    }
  };

  if (compact) {
    return (
      <div className="p-3 rounded-xl bg-slate-900/90 border border-slate-800 flex items-center justify-between gap-3 text-xs">
        <div className="flex items-center gap-2">
          <div className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-pulse" />
          <span className="font-mono text-slate-300">Live Meter:</span>
          <span className="font-mono font-bold text-emerald-400 text-sm">{remaining.toFixed(1)} mins</span>
          <span className="text-slate-500">/ {quota} quota</span>
        </div>
        <button
          onClick={handleOpenTopUp}
          className="px-2.5 py-1 rounded-lg bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-300 font-bold font-mono transition"
        >
          + Top Up
        </button>
      </div>
    );
  }

  return (
    <div className="bg-gradient-to-br from-slate-900 via-slate-900 to-[#0b1424] border border-emerald-500/30 rounded-3xl p-5 sm:p-7 shadow-2xl relative overflow-hidden">
      {/* Background ambient lighting */}
      <div className="absolute top-0 right-0 w-80 h-80 bg-emerald-500/5 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute bottom-0 left-0 w-80 h-80 bg-cyan-500/5 rounded-full blur-3xl pointer-events-none" />

      {/* Header with Title & Status Badge */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-5 border-b border-slate-800/80 relative z-10">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-emerald-500 to-teal-600 p-0.5 shadow-lg shadow-emerald-500/20">
            <div className="w-full h-full bg-slate-950 rounded-[14px] flex items-center justify-center">
              <Activity className="w-6 h-6 text-emerald-400 animate-pulse" />
            </div>
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-lg sm:text-xl font-black text-white tracking-tight flex items-center gap-2">
                <span>Live Langpretation Meter</span>
                <span className="text-[10px] uppercase font-mono font-bold px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                  REAL-TIME QUOTA
                </span>
              </h2>
            </div>
            <p className="text-xs text-slate-400">
              Active speech telecommunication &amp; real-time translation allowance engine
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <span
            className={`px-3 py-1 rounded-full text-xs font-mono font-bold border flex items-center gap-1.5 ${
              statusColorMap[meter.status] || statusColorMap.ACTIVE
            }`}
          >
            <span className="w-2 h-2 rounded-full bg-current animate-ping" />
            {meter.status}
          </span>
          <button
            onClick={handleOpenTopUp}
            className="px-3.5 py-1.5 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-400 hover:to-teal-400 text-slate-950 font-bold text-xs shadow-md shadow-emerald-500/20 transition flex items-center gap-1.5 cursor-pointer"
          >
            <Zap className="w-3.5 h-3.5" />
            <span>Top Up Minutes</span>
          </button>
        </div>
      </div>

      {/* Main Meter Readings Grid */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 py-6 relative z-10">
        {/* Metric 1: Remaining Allowance */}
        <div className="p-4 rounded-2xl bg-slate-950/80 border border-slate-800 space-y-1">
          <div className="flex items-center justify-between text-slate-400 text-xs">
            <span className="font-mono">Remaining Allowance</span>
            <Activity className="w-3.5 h-3.5 text-emerald-400" />
          </div>
          <div className="text-2xl sm:text-3xl font-black text-emerald-400 font-mono">
            {remaining.toFixed(1)}{' '}
            <span className="text-xs font-normal text-slate-400">mins</span>
          </div>
          <div className="text-[11px] text-slate-400">
            {percentRemaining}% of monthly quota available
          </div>
        </div>

        {/* Metric 2: Monthly Quota */}
        <div className="p-4 rounded-2xl bg-slate-950/80 border border-slate-800 space-y-1">
          <div className="flex items-center justify-between text-slate-400 text-xs">
            <span className="font-mono">Monthly Quota</span>
            <Clock className="w-3.5 h-3.5 text-cyan-400" />
          </div>
          <div className="text-2xl sm:text-3xl font-black text-cyan-400 font-mono">
            {quota}{' '}
            <span className="text-xs font-normal text-slate-400">mins</span>
          </div>
          <div className="text-[11px] text-slate-400">
            {meter.planName}
          </div>
        </div>

        {/* Metric 3: Minutes Used */}
        <div className="p-4 rounded-2xl bg-slate-950/80 border border-slate-800 space-y-1">
          <div className="flex items-center justify-between text-slate-400 text-xs">
            <span className="font-mono">Minutes Used</span>
            <TrendingUp className="w-3.5 h-3.5 text-amber-400" />
          </div>
          <div className="text-2xl sm:text-3xl font-black text-amber-400 font-mono">
            {used.toFixed(1)}{' '}
            <span className="text-xs font-normal text-slate-400">mins</span>
          </div>
          <div className="text-[11px] text-slate-400">
            Current billing cycle usage
          </div>
        </div>

        {/* Metric 4: Estimated Savings */}
        <div className="p-4 rounded-2xl bg-slate-950/80 border border-slate-800 space-y-1">
          <div className="flex items-center justify-between text-slate-400 text-xs">
            <span className="font-mono">Estimated Savings</span>
            <Sparkles className="w-3.5 h-3.5 text-purple-400" />
          </div>
          <div className="text-2xl sm:text-3xl font-black text-purple-400 font-mono">
            GH₵ {meter.estimatedSavingsGHS.toFixed(2)}
          </div>
          <div className="text-[11px] text-slate-400">
            ~${meter.estimatedSavingsUSD.toFixed(2)} USD vs traditional
          </div>
        </div>
      </div>

      {/* Progress Bar with Real-Time Fill */}
      <div className="space-y-2 relative z-10 pb-4">
        <div className="flex justify-between text-xs text-slate-400 font-mono">
          <span>Live Allowance Fill</span>
          <span className="text-emerald-400 font-bold">{remaining.toFixed(1)} mins remaining</span>
        </div>
        <div className="w-full h-3 rounded-full bg-slate-950 border border-slate-800 overflow-hidden p-0.5">
          <motion.div
            initial={{ width: 0 }}
            animate={{ width: `${percentRemaining}%` }}
            transition={{ duration: 0.8, ease: 'easeOut' }}
            className={`h-full rounded-full transition-all ${
              percentRemaining > 30
                ? 'bg-gradient-to-r from-emerald-500 to-teal-400'
                : percentRemaining > 10
                ? 'bg-gradient-to-r from-amber-500 to-amber-400'
                : 'bg-gradient-to-r from-rose-500 to-rose-400 animate-pulse'
            }`}
          />
        </div>
      </div>

      {/* Dates & Active Channel Tracking Footer */}
      <div className="pt-4 border-t border-slate-800/80 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 text-xs text-slate-400 relative z-10">
        <div className="flex items-center gap-4 flex-wrap">
          <div className="flex items-center gap-1.5 font-mono">
            <Calendar className="w-3.5 h-3.5 text-slate-500" />
            <span>Cycle Start: {new Date(meter.currentPeriodStart).toLocaleDateString()}</span>
          </div>
          <div className="flex items-center gap-1.5 font-mono">
            <Clock className="w-3.5 h-3.5 text-slate-500" />
            <span>Expires: {new Date(meter.currentPeriodEnd).toLocaleDateString()}</span>
          </div>
        </div>

        <button
          onClick={() => setShowChannelDetails(!showChannelDetails)}
          className="text-emerald-400 hover:text-emerald-300 font-bold transition flex items-center gap-1 cursor-pointer"
        >
          <span>{showChannelDetails ? 'Hide' : 'View'} Channel Breakdown</span>
          <ArrowRight className={`w-3.5 h-3.5 transform transition-transform ${showChannelDetails ? 'rotate-90' : ''}`} />
        </button>
      </div>

      {/* Channel Usage Breakdown Strip */}
      {showChannelDetails && (
        <motion.div
          initial={{ opacity: 0, height: 0 }}
          animate={{ opacity: 1, height: 'auto' }}
          exit={{ opacity: 0, height: 0 }}
          className="mt-4 pt-4 border-t border-slate-800/60 grid grid-cols-2 sm:grid-cols-5 gap-3"
        >
          <div className="p-3 rounded-xl bg-slate-950/60 border border-slate-800/80 space-y-1">
            <div className="flex items-center gap-1.5 text-slate-400 text-xs">
              <Phone className="w-3.5 h-3.5 text-cyan-400" />
              <span>Audio Calls</span>
            </div>
            <div className="text-base font-bold text-white font-mono">
              {meter.channelBreakdown.audioCalls} <span className="text-[10px] text-slate-500 font-normal">mins</span>
            </div>
          </div>

          <div className="p-3 rounded-xl bg-slate-950/60 border border-slate-800/80 space-y-1">
            <div className="flex items-center gap-1.5 text-slate-400 text-xs">
              <Video className="w-3.5 h-3.5 text-emerald-400" />
              <span>Video Calls</span>
            </div>
            <div className="text-base font-bold text-white font-mono">
              {meter.channelBreakdown.videoCalls} <span className="text-[10px] text-slate-500 font-normal">mins</span>
            </div>
          </div>

          <div className="p-3 rounded-xl bg-slate-950/60 border border-slate-800/80 space-y-1">
            <div className="flex items-center gap-1.5 text-slate-400 text-xs">
              <Users className="w-3.5 h-3.5 text-purple-400" />
              <span>Group Audio</span>
            </div>
            <div className="text-base font-bold text-white font-mono">
              {meter.channelBreakdown.groupAudioCalls} <span className="text-[10px] text-slate-500 font-normal">mins</span>
            </div>
          </div>

          <div className="p-3 rounded-xl bg-slate-950/60 border border-slate-800/80 space-y-1">
            <div className="flex items-center gap-1.5 text-slate-400 text-xs">
              <Mic className="w-3.5 h-3.5 text-amber-400" />
              <span>Voice Notes</span>
            </div>
            <div className="text-base font-bold text-white font-mono">
              {meter.channelBreakdown.voiceNotes} <span className="text-[10px] text-slate-500 font-normal">mins</span>
            </div>
          </div>

          <div className="p-3 rounded-xl bg-slate-950/60 border border-slate-800/80 space-y-1">
            <div className="flex items-center gap-1.5 text-slate-400 text-xs">
              <MessageSquare className="w-3.5 h-3.5 text-teal-400" />
              <span>Text / Chat</span>
            </div>
            <div className="text-base font-bold text-white font-mono">
              {meter.channelBreakdown.textChat} <span className="text-[10px] text-slate-500 font-normal">mins</span>
            </div>
          </div>
        </motion.div>
      )}
    </div>
  );
};
