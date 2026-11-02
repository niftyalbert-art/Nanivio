import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Play } from 'lucide-react';
import { prepareNanivioSignature } from '../../lib/nanivioSignatureMedia';

// Vite serves the existing upload in development and fingerprints it in builds.
// Do not duplicate the video in public/ or recreate it with canvas effects.

interface NanivioCelebrationVideoEffectProps {
  mode?: 'signup' | 'signin';
  onComplete: () => void;
}

export const NanivioCelebrationVideoEffect: React.FC<NanivioCelebrationVideoEffectProps> = ({
  mode = 'signin',
  onComplete,
}) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const videoHostRef = useRef<HTMLDivElement>(null);
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
    // Reuse the actual preloaded media element rather than starting a second
    // download/decode only after authentication has finished.
    const video = prepareNanivioSignature();
    if (video) {
      videoRef.current = video;
      video.className = 'absolute inset-0 h-full w-full object-contain';
      video.setAttribute('aria-hidden','true');
      video.disablePictureInPicture = true;
      video.disableRemotePlayback = true;
      videoHostRef.current?.appendChild(video);
      video.currentTime = 0;
      video.onended = complete;
      video.onerror = () => setHasError(true);
      video.onplaying = () => setNeedsPlay(false);
      video.muted = false;
      video.volume = 1;
      if (video.error) setHasError(true);
      else video.play().catch(() => {
        if (active) setNeedsPlay(true);
      });
    }
    return () => {
      active = false;
      if (video) {
        video.pause();
        video.onended = video.onerror = video.onplaying = null;
        video.remove();
      }
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
        <div ref={videoHostRef} data-testid="nanivio-signature-video" className="absolute inset-0" aria-hidden="true" />
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
