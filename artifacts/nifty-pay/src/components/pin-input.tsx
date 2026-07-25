import { useRef, type KeyboardEvent, type ClipboardEvent } from 'react';
import { cn } from '@/lib/utils';

interface PinInputProps {
  value: string;
  onChange: (v: string) => void;
  disabled?: boolean;
  autoFocus?: boolean;
}

export function PinInput({ value, onChange, disabled, autoFocus }: PinInputProps) {
  // Single ref holding all four input elements — no hooks inside arrays
  const refs = useRef<(HTMLInputElement | null)[]>([null, null, null, null]);

  const digits = value.padEnd(4, ' ').split('').slice(0, 4);

  const focus = (i: number) => refs.current[i]?.focus();

  const handleChange = (i: number, raw: string) => {
    const digit = raw.replace(/\D/g, '').slice(-1);
    const next = digits.map((d, idx) => (idx === i ? digit : d)).join('').replace(/ /g, '');
    onChange(next);
    if (digit && i < 3) focus(i + 1);
  };

  const handleKey = (i: number, e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Backspace') {
      if (digits[i] && digits[i] !== ' ') {
        const next = digits.map((d, idx) => (idx === i ? ' ' : d)).join('').trimEnd();
        onChange(next.replace(/ /g, ''));
      } else if (i > 0) {
        const next = digits.map((d, idx) => (idx === i - 1 ? ' ' : d)).join('').trimEnd();
        onChange(next.replace(/ /g, ''));
        focus(i - 1);
      }
    } else if (e.key === 'ArrowLeft' && i > 0) {
      focus(i - 1);
    } else if (e.key === 'ArrowRight' && i < 3) {
      focus(i + 1);
    }
  };

  const handlePaste = (e: ClipboardEvent<HTMLInputElement>) => {
    e.preventDefault();
    const pasted = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, 4);
    onChange(pasted);
    focus(Math.min(pasted.length, 3));
  };

  return (
    <div className="flex gap-3 justify-center">
      {([0, 1, 2, 3] as const).map(i => (
        <input
          key={i}
          ref={el => { refs.current[i] = el; }}
          type="text"
          inputMode="numeric"
          pattern="\d*"
          maxLength={1}
          value={digits[i] === ' ' || !digits[i] ? '' : digits[i]}
          autoFocus={autoFocus !== false && i === 0}
          disabled={disabled}
          onChange={e => handleChange(i, e.target.value)}
          onKeyDown={e => handleKey(i, e)}
          onPaste={handlePaste}
          onFocus={e => e.target.select()}
          className={cn(
            'w-14 h-14 text-center text-2xl font-bold rounded-xl border-2 bg-card',
            'transition-all duration-150 outline-none caret-transparent',
            'focus:border-primary focus:ring-2 focus:ring-primary/20',
            digits[i] && digits[i] !== ' '
              ? 'border-primary/60 text-foreground'
              : 'border-border text-muted-foreground',
            disabled && 'opacity-50 cursor-not-allowed',
          )}
        />
      ))}
    </div>
  );
}
