/** Distinguish local device failures from RTC/network failures without exposing credentials. */
export function callMediaErrorMessage(error: unknown, type: 'audio' | 'video'): string {
  const candidate = error as { name?: string; code?: string; message?: string } | null;
  const detail = `${candidate?.name || ''} ${candidate?.code || ''} ${candidate?.message || String(error)}`;
  const device = type === 'video' ? 'camera or microphone' : 'microphone';
  if (/not_readable|notreadable|could not start (video|audio) source|trackstarterror/i.test(detail)) {
    return `Your ${device} could not start. Close other apps or browser tabs using it, then end this call and try again.${type === 'video' ? ' You can also try an audio-only call if your camera is unavailable.' : ''}`;
  }
  if (/permission|denied|not_allowed|notallowed/i.test(detail)) {
    return `Access to your ${device} was denied. Allow access in your browser settings, then call again.`;
  }
  if (/not_found|notfound|devicesnotfound/i.test(detail)) {
    return `No available ${device} was found. Connect or enable your device, then call again.`;
  }
  return 'The call media could not connect. Check your connection and call again.';
}
