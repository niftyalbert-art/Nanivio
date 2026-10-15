import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Play } from 'lucide-react';

// Vite serves the existing upload in development and fingerprints it in builds.
// Do not duplicate the video in public/ or recreate it with canvas effects.
const welcomeVideoUrl = new URL(
  '../../../attached_assets/7fa9a39190244f62ad3b118c4449b4fe_1792033302425.mp4',
  import.meta.url,
).href;

interface NanivioCelebrationVideoEffectProps {
  mode?: 'signup' | 'signin';
  onComplete: () => void;
}

export const NanivioCelebrationVideoEffect: React.FC<NanivioCelebrationVideoEffectProps> = ({
  mode = 'signin',
  onComplete,
}) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const onCompleteRef = useRef(onComplete);
  const completedRef = useRef(false);
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
      video.muted = false;
      video.volume = 1;
      video.play().catch(() => {
        if (active) setNeedsPlay(true);
      });
    }
    return () => {
      active = false;
    };
  }, [complete]);

  const playVideo = () => {
    const video = videoRef.current;
    if (!video) return;
    video.muted = false;
    video.volume = 1;
    video.play().catch(() => setNeedsPlay(true));
  };

  const successMessage = mode === 'signup'
    ? 'Your account was created successfully.'
    : 'You signed in successfully.';

  return (
    <section
      aria-label="Nanivio welcome video"
      className="fixed inset-0 z-[100] flex items-center justify-center overflow-hidden bg-black text-white"
    >
      <p className="sr-only" role="status">
        {successMessage} The Nanivio signature plays with sound before you continue.
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
          muted={false}
          controls={false}
          disablePictureInPicture
          disableRemotePlayback
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
          Play Nanivio signature
        </button>
      )}

      {hasError && (
        <button
          type="button"
          onClick={complete}
          className="absolute bottom-6 right-5 min-h-11 rounded-full border border-white/30 bg-black/70 px-5 text-sm font-medium focus-visible:outline focus-visible:outline-2 focus-visible:outline-cyan-300"
        >
          Continue
        </button>
      )}
    </section>
  );
};
