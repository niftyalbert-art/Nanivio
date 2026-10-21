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
  await video.play();
  if (malviAvatarSoundBlocked(video)) throw new Error('Enable sound to hear Malvi.');
}
