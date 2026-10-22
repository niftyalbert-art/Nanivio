// Encoding belongs on the window thread, not inside AudioWorkletGlobalScope.
// Keep the existing 200 ms mono PCM16 / 16 kHz server contract.
export function encodeMalviMicrophoneFrame(data: unknown): string {
  if (data instanceof ArrayBuffer && data.byteLength === 6400) {
    return btoa(String.fromCharCode(...new Uint8Array(data)));
  }
  // Accept an older cached processor's bounded base64 frame during rollout.
  if (typeof data === 'string' && data.length === 8536
    && /^[A-Za-z0-9+/]+={0,2}$/.test(data) && atob(data).length === 6400) return data;
  throw new Error('The microphone recorder returned an invalid audio frame.');
}
