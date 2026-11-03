type AvatarVideo = Pick<HTMLVideoElement, 'muted' | 'volume' | 'paused' | 'play'>;

export function malviAvatarSoundBlocked(video: AvatarVideo) {
  // A successful play() alone does not prove sound: the renderer SDK can fall
  // back to muted video after the browser rejects audible autoplay.
  return video.muted || video.volume === 0 || video.paused;
}

export class MalviAvatarSoundRequiredError extends Error {
  constructor() { super('Enable sound to hear Malvi.'); this.name = 'MalviAvatarSoundRequiredError'; }
}

// Muted playback is a recoverable consent state, not a failed decoder.
// AbortError can occur while the SDK combines its audio and video tracks.
export function malviAvatarPlaybackFailure(error: unknown): string | null {
  if (error instanceof MalviAvatarSoundRequiredError) return null;
  const name = error && typeof error === 'object' && 'name' in error ? error.name : '';
  if (name === 'AbortError' || name === 'NotAllowedError') return null;
  if (name === 'NotSupportedError') return 'This browser could not decode Malvi’s live video. Try an updated Chrome, Edge or Safari browser.';
  return 'Malvi’s live video could not start playing. Check your connection and browser media permissions, then reconnect.';
}

export async function playMalviAvatar(video: AvatarVideo, enableSound = false) {
  if (enableSound) {
    // Run synchronously in the Enable sound click, before awaiting playback.
    video.muted = false;
    video.volume = 1;
  }
  try {
    await video.play();
  } catch (error) {
    // Session provisioning loses the activation gesture on some browsers.
    // Let the paired video render muted, but still require an explicit tap for
    // sound. Do not create another stream or retry decoder/network failures.
    if (enableSound || !(error instanceof Error) || error.name !== 'NotAllowedError') throw error;
    video.muted = true;
    await video.play();
  }
  if (malviAvatarSoundBlocked(video)) throw new MalviAvatarSoundRequiredError();
}
