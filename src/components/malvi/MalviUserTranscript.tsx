import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';

/** Keep live recognition readable without putting a large panel over the face. */
export function MalviUserTranscript({ text, speaker = 'user', compact = false, contained = false, label, ariaLabel }: {
  text: string;
  speaker?: 'user' | 'malvi';
  compact?: boolean;
  contained?: boolean;
  label?: string;
  ariaLabel?: string;
}) {
  const [expanded, setExpanded] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const followLatest = useRef(true);
  const layout = useRef({ width: 0, height: 0, content: 0 });
  const transcriptId = speaker === 'user' ? 'malvi-user-transcript' : 'malvi-spoken-transcript';

  useLayoutEffect(() => {
    const box = scrollRef.current;
    if (!box) return;
    if (followLatest.current) box.scrollTop = box.scrollHeight;
    layout.current = { width: box.clientWidth, height: box.clientHeight, content: box.scrollHeight };
  }, [text, expanded]);

  useEffect(() => {
    const box = scrollRef.current;
    if (!box || typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(() => {
      if (followLatest.current) box.scrollTop = box.scrollHeight;
      layout.current = { width: box.clientWidth, height: box.clientHeight, content: box.scrollHeight };
    });
    observer.observe(box);
    return () => observer.disconnect();
  }, []);

  return (
    <section className={`w-full min-w-0 max-w-xl rounded-xl border border-white/15 bg-[#10201f]/95 px-3 text-[#e3ebe5] ${contained ? 'flex h-full min-h-0 flex-col overflow-hidden py-1.5' : 'shrink-0 py-2'}`}>
      <div className="mb-1 flex shrink-0 items-center justify-between gap-3">
        <span className="text-xs font-semibold text-[#c9e2cf]">{label ?? (speaker === 'user' ? 'You said' : 'Malvi')}</span>
        <button
          type="button"
          aria-expanded={expanded}
          aria-controls={transcriptId}
          aria-label={expanded ? 'Show less transcript' : 'Expand transcript'}
          className={`${contained ? 'min-h-6' : 'min-h-9'} shrink-0 px-2 text-xs underline underline-offset-4 focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#d6e7da]`}
          onClick={() => { followLatest.current = true; setExpanded(value => !value); }}
        >
          {expanded ? 'Show less' : contained ? 'Expand' : 'Expand transcript'}
        </button>
      </div>
      <div
        id={transcriptId}
        ref={scrollRef}
        role="region"
        aria-label={ariaLabel ?? (speaker === 'user' ? 'Your recognized speech' : 'Live subtitles')}
        aria-live="polite"
        aria-relevant="text"
        tabIndex={0}
        onScroll={event => {
          const box = event.currentTarget;
          const previous = layout.current;
          // Rotation/browser toolbar resizing is not a request to read older text.
          if (previous.width !== box.clientWidth || previous.height !== box.clientHeight || previous.content !== box.scrollHeight) {
            if (followLatest.current) box.scrollTop = box.scrollHeight;
            layout.current = { width: box.clientWidth, height: box.clientHeight, content: box.scrollHeight };
            return;
          }
          followLatest.current = box.scrollHeight - box.scrollTop - box.clientHeight < 24;
        }}
        className={`${compact ? (expanded ? 'max-h-[20dvh]' : 'max-h-[9dvh]') : (expanded ? 'max-h-[40dvh]' : 'max-h-[18dvh]')} ${contained ? 'flex-1' : ''} min-h-6 overflow-y-auto overscroll-contain whitespace-pre-wrap break-words text-left text-sm leading-6 [overflow-wrap:anywhere] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#d6e7da]`}
      >
        {text}
      </div>
    </section>
  );
}
