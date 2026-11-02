// Preload only: never play before a successful authentication.
const videoUrl = new URL('../../attached_assets/7fa9a39190244f62ad3b118c4449b4fe_1792033302425.mp4', import.meta.url).href;
let prepared: HTMLVideoElement | null = null;
export function prepareNanivioSignature() {
  if (typeof document === 'undefined') return null;
  if (!prepared) {
    prepared = document.createElement('video');
    prepared.preload = 'auto';
    prepared.playsInline = true;
    prepared.src = videoUrl;
    prepared.controls = false;
    prepared.load();
  } else if (prepared.error) {
    // A failed background preload must not permanently poison a later
    // successful sign-in; retry loading on this explicit auth attempt.
    prepared.load();
  }
  return prepared;
}
