import React, { useEffect, useRef, useState } from 'react';
import { Check, Clipboard, LoaderCircle, MessageCircleQuestion, Send, Sparkles, X } from 'lucide-react';
import { useNanivio } from '../../context/NanivioContext';
import { protectedBillingRequest } from '../../lib/billingClient';
import { subscriptionHasCapability } from '../../lib/malviCapabilities';

interface Props {
  callId: string;
  channelName: string;
  expanded: boolean;
  onExpandedChange: (expanded: boolean) => void;
  className?: string;
}

interface InCallAnswer {
  success: boolean;
  answer: string;
}

export const InCallMalvi: React.FC<Props> = ({
  callId,
  channelName,
  expanded,
  onExpandedChange,
  className = '',
}) => {
  const { activeCall, malviSubscription } = useNanivio();
  const [question, setQuestion] = useState('');
  const [answer, setAnswer] = useState('');
  const [error, setError] = useState('');
  const [pending, setPending] = useState(false);
  const [copied, setCopied] = useState(false);
  const requestGeneration = useRef(0);
  const requestController = useRef<AbortController | null>(null);
  const currentCallId = useRef(activeCall?.id);
  currentCallId.current = activeCall?.id;
  const currentChannelName = useRef(channelName);
  currentChannelName.current = channelName;
  const eligibleTier = subscriptionHasCapability(malviSubscription, 'memory');
  const activeSubscription = malviSubscription?.status === 'ACTIVE' || malviSubscription?.status === 'TRIAL';
  const available = activeCall?.id === callId && activeCall.status === 'connected' &&
    !!channelName && eligibleTier && activeSubscription;

  useEffect(() => {
    requestGeneration.current += 1;
    requestController.current?.abort();
    requestController.current = null;
    setQuestion('');
    setAnswer('');
    setError('');
    setPending(false);
    setCopied(false);
    return () => {
      requestGeneration.current += 1;
      requestController.current?.abort();
      requestController.current = null;
    };
  }, [callId, channelName]);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    const typedQuestion = question.trim();
    if (!available || !typedQuestion || pending) return;
    const generation = ++requestGeneration.current;
    const controller = new AbortController();
    requestController.current?.abort();
    requestController.current = controller;
    setPending(true);
    setAnswer('');
    setError('');
    try {
      const result = await protectedBillingRequest('/api/malvi/in-call', {
        method: 'POST',
        body: JSON.stringify({ channelName, question: typedQuestion }),
        signal: controller.signal,
      }) as InCallAnswer;
      if (controller.signal.aborted || generation !== requestGeneration.current || currentCallId.current !== callId || currentChannelName.current !== channelName) return;
      if (result.success !== true || typeof result.answer !== 'string' || !result.answer.trim()) {
        throw new Error('Malvi did not return an answer. Try a more specific question.');
      }
      setAnswer(result.answer.trim());
    } catch (err) {
      if (!controller.signal.aborted && generation === requestGeneration.current && currentCallId.current === callId && currentChannelName.current === channelName) {
        setError(err instanceof Error ? err.message : 'Malvi could not answer right now. Please try again.');
      }
    } finally {
      if (generation === requestGeneration.current && currentCallId.current === callId && currentChannelName.current === channelName) {
        setPending(false);
        if (requestController.current === controller) requestController.current = null;
      }
    }
  };

  const copyAnswer = async () => {
    if (!answer) return;
    try {
      if (!navigator.clipboard) throw new Error('Clipboard access is unavailable. Select the answer to copy it.');
      await navigator.clipboard.writeText(answer);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'The answer could not be copied.');
    }
  };

  if (!available) return null;

  if (!expanded) {
    return (
      <button
        type="button"
        onClick={() => onExpandedChange(true)}
        className={`${className} inline-flex min-h-10 items-center gap-2 rounded-full border border-[#d2b668]/70 bg-[#171f1a]/95 px-3.5 text-xs font-semibold text-[#f5e7bc] shadow-lg backdrop-blur hover:bg-[#26342b]`}
        aria-label="Ask Malvi during this call"
      >
        <MessageCircleQuestion size={15} />
        Ask Malvi
      </button>
    );
  }

  return (
    <section className={`${className} flex min-h-0 select-text flex-col overflow-hidden rounded-2xl border border-white/15 bg-[#151e19]/95 text-[#f3f1e8] shadow-2xl backdrop-blur-xl`} aria-label="In-call Malvi assistant">
      <header className="flex shrink-0 items-center justify-between gap-2 border-b border-white/10 px-3.5 py-3">
        <div className="flex min-w-0 items-center gap-2">
          <span className="grid h-8 w-8 shrink-0 place-items-center rounded-xl bg-[#d2b668]/15 text-[#e7ce83]"><Sparkles size={16}/></span>
          <div className="min-w-0"><h2 className="text-sm font-semibold">Ask Malvi</h2><p className="text-[10px] text-white/55">In-call assistance</p></div>
        </div>
        <button type="button" onClick={() => onExpandedChange(false)} aria-label="Collapse Ask Malvi" className="grid h-8 w-8 shrink-0 place-items-center rounded-lg text-white/60 hover:bg-white/10 hover:text-white"><X size={16}/></button>
      </header>

      <div className="min-h-0 flex-1 space-y-2.5 overflow-y-auto p-3.5">
        <p className="rounded-lg border border-white/10 bg-white/[.04] px-2.5 py-2 text-[10px] leading-4 text-white/65">
          Only the question you type or quote here is sent to Malvi. Call audio, transcripts and other messages are not shared.
        </p>
        <form onSubmit={submit} className="space-y-2">
          <label htmlFor={`in-call-question-${callId}`} className="text-[11px] font-semibold text-white/80">Your question</label>
          <textarea
            id={`in-call-question-${callId}`}
            value={question}
            onChange={event => setQuestion(event.target.value)}
            maxLength={1200}
            rows={3}
            disabled={pending}
            placeholder="Type or quote a question to ask…"
            className="w-full resize-y rounded-xl border border-white/15 bg-[#0f1712] px-3 py-2.5 text-sm leading-5 text-[#f3f1e8] outline-none placeholder:text-white/35 focus:border-[#d2b668]/70 focus:ring-2 focus:ring-[#d2b668]/15 disabled:opacity-60"
          />
          <div className="flex items-center justify-between gap-2">
            <span className="text-[10px] text-white/40">{question.length}/1200</span>
            <button type="submit" disabled={pending || !question.trim()} className="inline-flex min-h-9 items-center gap-2 rounded-xl bg-[#d2b668] px-3.5 text-xs font-bold text-[#242318] hover:bg-[#e0c77a] disabled:cursor-not-allowed disabled:opacity-45">
              {pending ? <><LoaderCircle size={14} className="animate-spin"/>Asking</> : <><Send size={14}/>Ask</>}
            </button>
          </div>
        </form>
        {error && <p role="alert" className="rounded-lg border border-[#b96d5b]/60 bg-[#4b2822]/70 px-2.5 py-2 text-xs leading-5 text-[#ffd8cb]">{error}</p>}
        {answer && <article className="rounded-xl border border-[#d2b668]/25 bg-[#d2b668]/[.07] p-3">
          <div className="flex items-center justify-between gap-2"><h3 className="text-[11px] font-semibold uppercase tracking-[.12em] text-[#dfc979]">Malvi’s answer</h3><button type="button" onClick={() => void copyAnswer()} className="inline-flex min-h-8 items-center gap-1.5 rounded-lg border border-white/10 px-2 text-[10px] font-semibold text-white/75 hover:bg-white/10">{copied ? <Check size={13}/> : <Clipboard size={13}/>} {copied ? 'Copied' : 'Copy'}</button></div>
          <p className="mt-2 whitespace-pre-wrap break-words text-sm leading-5 text-[#f3f1e8]">{answer}</p>
        </article>}
      </div>
    </section>
  );
};

export default InCallMalvi;
