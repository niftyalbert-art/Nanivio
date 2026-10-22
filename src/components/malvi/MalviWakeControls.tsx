import { CheckCircle2, Mic } from 'lucide-react';

type MalviWakeControlsProps = {
  armed: boolean;
  checking: boolean;
  installing: boolean;
  packRequired: boolean;
  disabled: boolean;
  feedback: string;
  onToggle: () => void;
  onInstall: () => void;
};

export default function MalviWakeControls({
  armed,
  checking,
  installing,
  packRequired,
  disabled,
  feedback,
  onToggle,
  onInstall,
}: MalviWakeControlsProps) {
  return (
    <div className="mt-5 flex flex-wrap items-center gap-3">
      <button
        type="button"
        onClick={onToggle}
        disabled={disabled}
        aria-label="Local wake-word listening"
        aria-pressed={armed}
        aria-describedby="malvi-wake-help"
        title={armed ? 'Disable local wake word' : undefined}
        className={`inline-flex items-center gap-2 rounded-xl border px-4 py-3 text-sm font-medium transition disabled:cursor-not-allowed disabled:opacity-45 ${
          armed
            ? 'border-[var(--nv-gold)] bg-[var(--nv-gold)]/10 text-[var(--nv-gold)]'
            : 'border-slate-600 text-slate-100 hover:border-[var(--nv-gold)]'
        }`}
      >
        {armed ? <CheckCircle2 className="h-4 w-4" aria-hidden="true" /> : <Mic className="h-4 w-4" aria-hidden="true" />}
        {checking ? 'Cancel wake setup' : armed ? 'Enabled' : 'Enable local wake word'}
      </button>

      {packRequired && (
        <button
          type="button"
          onClick={onInstall}
          disabled={disabled || installing}
          className="rounded-xl border border-slate-600 px-4 py-3 text-sm text-slate-100 transition hover:border-[var(--nv-gold)] disabled:cursor-not-allowed disabled:opacity-45"
        >
          {installing ? 'Installing local speech pack…' : 'Install local speech pack'}
        </button>
      )}

      {(checking || feedback) && (
        <p
          role="status"
          aria-live="polite"
          className="min-w-0 flex-[1_1_15rem] text-xs leading-relaxed text-amber-200"
        >
          {checking && <span>Checking local wake-word setup…</span>}
          {checking && feedback && <span> </span>}
          {feedback}
        </p>
      )}
    </div>
  );
}
