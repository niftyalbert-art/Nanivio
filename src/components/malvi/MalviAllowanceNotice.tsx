import React from 'react';

export interface MalviAllowanceNoticeProps {
  remainingSeconds: number | null;
  unavailable: boolean;
  onViewPlans: () => void;
}

const formatTime = (seconds: number) => {
  const safeSeconds = Math.max(0, Math.floor(seconds));
  return `${Math.floor(safeSeconds / 60)
    .toString()
    .padStart(2, '0')}:${(safeSeconds % 60).toString().padStart(2, '0')}`;
};

export const MalviAllowanceNotice: React.FC<MalviAllowanceNoticeProps> = ({
  remainingSeconds,
  unavailable,
  onViewPlans,
}) => {
  const seconds = remainingSeconds === null || !Number.isFinite(remainingSeconds)
    ? null
    : Math.max(0, Math.floor(remainingSeconds));
  const isUsedUp = seconds === 0;
  const isUrgent = seconds !== null && seconds > 0 && seconds <= 30;
  const isLow = seconds !== null && seconds > 30 && seconds <= 60;
  const showAction = unavailable || isUsedUp || isUrgent || isLow;
  const isWarning = showAction;

  const timerText = seconds !== null
    ? formatTime(seconds)
    : unavailable
      ? 'Remaining time unavailable'
      : 'Checking remaining time';

  const thresholdMessage = isUsedUp
    ? 'Malvi time used up'
    : isUrgent
      ? '30 seconds or less of Malvi time left'
      : isLow
        ? 'One minute or less of Malvi time left'
        : null;

  return (
    <section
      data-testid="malvi-allowance-notice"
      aria-label="Malvi allowance"
      className={`flex w-full min-w-0 flex-wrap items-center gap-x-3 gap-y-1 rounded-xl border px-3 py-2 transition-colors ${
        isWarning
          ? 'border-[#b89a5a]/40 bg-[#1e1c16] text-[#f1e8d0]'
          : 'border-white/15 bg-[#10201f]/80 text-[#e4e8e1]'
      }`}
    >
      <div className="flex min-w-0 basis-[15rem] grow flex-wrap items-center justify-between gap-x-2 gap-y-1">
        <div className="flex min-w-0 items-baseline gap-2">
          {seconds !== null && (
            <span className="shrink-0 text-[11px] leading-4 text-[#c0d1c8]/80">Malvi time left</span>
          )}
          <span
            aria-label="Malvi time remaining"
            aria-live="off"
            className={`min-w-0 break-words font-mono text-[13px] font-semibold leading-5 tabular-nums ${
              seconds === null ? 'font-sans text-[11px] font-medium' : ''
            }`}
          >
            {timerText}
          </span>
        </div>
        {showAction && (
          <button
            type="button"
            onClick={onViewPlans}
            className="inline-flex min-h-9 shrink-0 items-center justify-center rounded-lg border border-[#b89a5a]/55 bg-[#b89a5a]/10 px-2.5 text-[11px] font-semibold leading-4 text-[#ead9a7] transition-colors hover:bg-[#b89a5a]/20 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#e3d09a]"
          >
            End &amp; view plans
          </button>
        )}
      </div>
      {thresholdMessage && (
        <p
          role={isLow ? 'status' : 'alert'}
          aria-live={isLow ? 'polite' : 'assertive'}
          className="text-[11px] font-medium leading-4 text-[#e3d09a]"
        >
          {thresholdMessage}
        </p>
      )}
    </section>
  );
};
