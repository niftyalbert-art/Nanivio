import React, { useRef, useState } from 'react';
import { Check, Copy } from 'lucide-react';
import type { MalviInputResult } from '../../shared/malviInputTypes';

type Props = { result: MalviInputResult };

export const MalviResultPanel: React.FC<Props> = ({ result }) => {
  const [copyState, setCopyState] = useState<'idle' | 'copied' | 'manual' | 'error'>('idle');
  const answerRef = useRef<HTMLTextAreaElement>(null);
  const copyAnswer = async () => {
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(result.answer);
        setCopyState('copied');
        return;
      }
      throw new Error('Clipboard unavailable');
    } catch {
      answerRef.current?.focus();
      answerRef.current?.select();
      setCopyState(answerRef.current ? 'manual' : 'error');
    }
  };
  return (
    <section aria-label="Malvi answer" className="mt-4 overflow-hidden rounded-2xl border border-[#b89a5a]/35 bg-[#111713] text-[#f0eee7] shadow-lg">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/[.08] px-4 py-3">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-[.16em] text-[#d5bf80]">A separate answer</p>
          <p className="mt-1 text-[10px] text-[#aaa9a2]">Select and copy freely. If conversation memory is on, the text prompt and reply may be saved; shared location exchanges are excluded. Nanivio does not archive raw files. AI-provider retention is separate.</p>
        </div>
        <button type="button" onClick={() => void copyAnswer()} className="inline-flex min-h-9 items-center gap-2 rounded-lg border border-[#b89a5a]/45 px-3 text-xs font-semibold text-[#ead8a5] hover:bg-[#b89a5a]/10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#d4bd7d]">
          {copyState === 'copied' ? <Check size={14} /> : <Copy size={14} />}
          {copyState === 'copied' ? 'Copied' : 'Copy answer'}
        </button>
        {copyState === 'copied' && <span role="status" className="sr-only">Answer copied.</span>}
      </div>
      <div className="p-4">
        <label className="sr-only" htmlFor="malvi-separate-answer">Selectable Malvi answer</label>
        <textarea id="malvi-separate-answer" ref={answerRef} readOnly value={result.answer} rows={Math.min(14, Math.max(4, result.answer.split('\n').length + 2))}
          className="w-full resize-y rounded-xl border border-[#47483f] bg-[#0c100e] p-3 text-sm leading-6 text-[#e7e3d7] focus:border-[#d4bd7d] focus:outline-none" />
        {copyState === 'manual' && <p role="status" className="mt-2 text-xs text-[#d5bf80]">The answer is selected. Use your device’s Copy command.</p>}
        {copyState === 'error' && <p role="alert" className="mt-2 text-xs text-[#e8b5a4]">Copy is unavailable; select the answer above and copy it manually.</p>}
        {result.processed && <p className="mt-3 text-[11px] text-[#bdb9ac]">Reviewed {result.processed.name} · {result.processed.kind}</p>}
        {result.limitations?.length > 0 && (
          <ul aria-label="Answer limitations" className="mt-3 space-y-1 rounded-lg border border-[#b89a5a]/20 bg-[#b89a5a]/[.05] px-3 py-2 text-[11px] leading-relaxed text-[#d2c8ad]">
            {result.limitations.map((limitation, index) => <li key={`${index}-${limitation}`}>{limitation}</li>)}
          </ul>
        )}
      </div>
    </section>
  );
};
