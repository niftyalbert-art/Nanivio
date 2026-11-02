import React from 'react';
import { getMalviUsageCopy } from '../../lib/malviUsageCopy';

export interface MalviAllowanceNoticeProps {
  remainingSeconds: number | null;
  unavailable: boolean;
  onViewPlans: () => void;
  languageCode?: string | null;
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
  languageCode = 'en',
}) => {
  const copy = getMalviUsageCopy(languageCode);
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
      ? copy.unavailable
      : copy.checking;

  const thresholdMessage = isUsedUp
    ? copy.exhausted
    : isUrgent
      ? copy.urgent
      : isLow
        ? copy.low
        : null;

  return (
    <section
      data-testid="malvi-allowance-notice"
      aria-label={copy.allowanceLabel}
      dir={copy.direction}
      className={`flex w-full min-w-0 flex-wrap items-center gap-x-3 gap-y-1 rounded-xl border px-3 py-2 transition-colors ${
        isWarning
          ? 'border-[#b89a5a]/40 bg-[#1e1c16] text-[#f1e8d0]'
          : 'border-white/15 bg-[#10201f]/80 text-[#e4e8e1]'
      }`}
    >
      <div className="flex min-w-0 basis-[15rem] grow flex-wrap items-center justify-between gap-x-2 gap-y-1">
        <div className="flex min-w-0 items-baseline gap-2">
          {seconds !== null && (
            <span className="shrink-0 text-[11px] leading-4 text-[#c0d1c8]/80">{copy.timeLeft}</span>
          )}
          <span
            aria-label={copy.timeLeft === 'Malvi time left' ? 'Malvi time remaining' : copy.timeLeft}
            aria-live="off"
            dir={seconds === null ? copy.direction : 'ltr'}
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
            {copy.endAndViewPlans}
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
