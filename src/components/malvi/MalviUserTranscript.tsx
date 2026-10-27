import React, { useEffect, useRef, useState } from 'react';

/** Keep live recognition readable without putting a large panel over the face. */
export function MalviUserTranscript({ text }: { text: string }) {
  const [expanded, setExpanded] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const followLatest = useRef(true);

  useEffect(() => {
    const box = scrollRef.current;
    if (box && followLatest.current) box.scrollTop = box.scrollHeight;
  }, [text, expanded]);

  return (
    <section className="w-full min-w-0 max-w-xl rounded-xl border border-white/15 bg-[#10201f]/90 px-3 py-2 text-[#e3ebe5] backdrop-blur-md">
      <div className="mb-1 flex items-center justify-between gap-3">
        <span className="text-xs font-semibold text-[#c9e2cf]">You said</span>
        <button
          type="button"
          aria-expanded={expanded}
          aria-controls="malvi-user-transcript"
          className="min-h-9 shrink-0 px-2 text-xs underline underline-offset-4 focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#d6e7da]"
          onClick={() => { followLatest.current = true; setExpanded(value => !value); }}
        >
          {expanded ? 'Show less' : 'Expand transcript'}
        </button>
      </div>
      <div
        id="malvi-user-transcript"
        ref={scrollRef}
        role="region"
        aria-label="Your recognized speech"
        aria-live="polite"
        aria-relevant="text"
        tabIndex={0}
        onScroll={event => {
          const box = event.currentTarget;
          followLatest.current = box.scrollHeight - box.scrollTop - box.clientHeight < 24;
        }}
        className={`${expanded ? 'max-h-[40dvh]' : 'max-h-[18dvh]'} min-h-6 overflow-y-auto overscroll-contain whitespace-pre-wrap break-words text-left text-sm leading-6 [overflow-wrap:anywhere] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#d6e7da]`}
      >
        {text}
      </div>
    </section>
  );
}
