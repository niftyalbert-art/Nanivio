type AvatarVideo = Pick<HTMLVideoElement, 'muted' | 'volume' | 'paused' | 'play'>;

export function malviAvatarSoundBlocked(video: AvatarVideo) {
  // A successful play() alone does not prove sound: the renderer SDK can fall
  // back to muted video after the browser rejects audible autoplay.
  return video.muted || video.volume === 0 || video.paused;
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
  if (malviAvatarSoundBlocked(video)) throw new Error('Enable sound to hear Malvi.');
}
