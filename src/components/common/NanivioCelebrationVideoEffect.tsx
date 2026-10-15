import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Play, Volume2, VolumeX } from 'lucide-react';

// Vite serves the existing upload in development and fingerprints it in builds.
// Do not duplicate the video in public/ or recreate it with canvas effects.
const welcomeVideoUrl = new URL(
  '../../../attached_assets/7fa9a39190244f62ad3b118c4449b4fe_1792033302425.mp4',
  import.meta.url,
).href;

interface NanivioCelebrationVideoEffectProps {
  mode?: 'signup' | 'signin' | 'intro';
  onComplete: () => void;
}

export const NanivioCelebrationVideoEffect: React.FC<NanivioCelebrationVideoEffectProps> = ({
  mode = 'signin',
  onComplete,
}) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const onCompleteRef = useRef(onComplete);
  const completedRef = useRef(false);
  const [muted, setMuted] = useState(true);
  const [needsPlay, setNeedsPlay] = useState(false);
  const [hasError, setHasError] = useState(false);
  onCompleteRef.current = onComplete;

  const complete = useCallback(() => {
    if (completedRef.current) return;
    completedRef.current = true;
    onCompleteRef.current();
  }, []);

  useEffect(() => {
    let active = true;
    const video = videoRef.current;
    if (video) {
      video.play().catch(() => {
        if (active) setNeedsPlay(true);
      });
    }
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') complete();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      active = false;
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [complete]);

  const playVideo = () => {
    videoRef.current?.play().catch(() => setNeedsPlay(true));
  };

  const successMessage = mode === 'signup'
    ? 'Your account was created successfully.'
    : mode === 'signin'
      ? 'You signed in successfully.'
      : 'Welcome to Nanivio.';

  return (
    <section
      aria-label="Nanivio welcome video"
      className="fixed inset-0 z-[100] flex items-center justify-center overflow-hidden bg-black text-white"
    >
      <p className="sr-only" role="status">
        {successMessage} You can skip the welcome video to continue.
      </p>

      {hasError ? (
        <p role="alert" className="max-w-sm px-6 text-center text-sm text-slate-200">
          {successMessage} The welcome video could not load. Select Continue to enter Nanivio.
        </p>
      ) : (
        <video
          ref={videoRef}
          src={welcomeVideoUrl}
          autoPlay
          muted={muted}
          playsInline
          preload="auto"
          aria-hidden="true"
          className="absolute inset-0 h-full w-full object-contain"
          onPlay={() => setNeedsPlay(false)}
          onEnded={complete}
          onError={() => setHasError(true)}
        />
      )}

      {needsPlay && !hasError && (
        <button
          type="button"
          onClick={playVideo}
          className="relative z-10 flex items-center gap-2 rounded-full border border-white/40 bg-black/75 px-5 py-3 text-sm font-medium focus-visible:outline focus-visible:outline-2 focus-visible:outline-cyan-300"
        >
          <Play size={18} aria-hidden="true" />
          Play welcome video
        </button>
      )}

      <div className="absolute inset-x-0 bottom-6 z-10 flex items-center justify-between gap-3 px-5 pb-[env(safe-area-inset-bottom)]">
        {!hasError && (
          <button
            type="button"
            onClick={() => setMuted(value => !value)}
            aria-label={muted ? 'Turn video sound on' : 'Mute video sound'}
            aria-pressed={!muted}
            className="flex min-h-11 items-center gap-2 rounded-full border border-white/30 bg-black/70 px-4 text-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-cyan-300"
          >
            {muted ? <VolumeX size={18} aria-hidden="true" /> : <Volume2 size={18} aria-hidden="true" />}
            {muted ? 'Sound on' : 'Mute'}
          </button>
        )}
        <button
          type="button"
          autoFocus
          onClick={complete}
          className="ml-auto min-h-11 rounded-full border border-white/30 bg-black/70 px-5 text-sm font-medium focus-visible:outline focus-visible:outline-2 focus-visible:outline-cyan-300"
        >
          {hasError ? 'Continue' : 'Skip video'}
        </button>
      </div>
    </section>
  );
};
