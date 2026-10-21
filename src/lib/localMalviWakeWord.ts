// Only the browser's explicitly on-device recognizer is allowed here.
// Never substitute webkitSpeechRecognition or a cloud recognizer.
export class LocalWakeWordError extends Error {
  constructor(public code: 'UNSUPPORTED_BROWSER' | 'PACK_REQUIRED', message: string) { super(message); }
}

export function isMalviWakePhrase(transcript: string) {
  return /(?:^|[^\p{L}\p{N}_])(?:malvi|nanivio)(?=$|[^\p{L}\p{N}_])/iu.test(transcript);
}

function localRecognition() {
  const Recognition = typeof window === 'undefined' ? undefined : (window as any).SpeechRecognition;
  if (!Recognition || typeof Recognition.available !== 'function' || !('processLocally' in Recognition.prototype)) {
    throw new LocalWakeWordError('UNSUPPORTED_BROWSER', 'This browser cannot verify on-device wake-word recognition. Use Start live avatar; no cloud listening is enabled.');
  }
  return Recognition;
}

export async function installLocalMalviWakeWordPack() {
  const Recognition = localRecognition();
  if (typeof Recognition.install !== 'function') throw new LocalWakeWordError('UNSUPPORTED_BROWSER', 'This browser cannot install an on-device speech pack. Use Start live avatar instead.');
  // Only called from an explicit user click; never download packs while idle.
  return Boolean(await Recognition.install({ langs: ['en-US'], processLocally: true }));
}

export async function startLocalMalviWakeWord(
  onWake: () => void, onError: (message: string) => void, signal?: AbortSignal,
) {
  const cancelled = () => { if (signal?.aborted) throw new DOMException('Local listening was cancelled.', 'AbortError'); };
  cancelled();
  const Recognition = localRecognition();
  const availability = await Recognition.available({ langs: ['en-US'], processLocally: true });
  cancelled();
  if (availability !== 'available') {
    throw new LocalWakeWordError('PACK_REQUIRED', 'An on-device English speech pack is required to recognise “Malvi”, “Hey Malvi”, or “Nanivio”. Install it below, or use Start live avatar. No audio was sent to a server.');
  }
  const recognition = new Recognition();
  recognition.processLocally = true;
  recognition.lang = 'en-US';
  recognition.continuous = true;
  recognition.interimResults = false;
  let stopped = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const stop = () => {
    if (stopped) return;
    stopped = true;
    signal?.removeEventListener('abort', stop);
    clearTimeout(timer);
    recognition.abort();
  };
  signal?.addEventListener('abort', stop, { once: true });
  recognition.onresult = (event: any) => {
    if (stopped) return;
    for (let i = event.resultIndex; i < event.results.length; i++) {
      if (event.results[i].isFinal && typeof event.results[i][0]?.transcript === 'string' && isMalviWakePhrase(event.results[i][0].transcript)) {
        stop();
        onWake();
        break;
      }
    }
  };
  recognition.onerror = () => {
    if (stopped) return;
    stop();
    onError('Local wake-word listening stopped. Check microphone permission, or start the avatar manually.');
  };
  recognition.onend = () => {
    if (!stopped) timer = setTimeout(() => {
      if (!stopped) {
        try { recognition.start(); } catch { stop(); onError('Local wake-word listening could not restart.'); }
      }
    }, 300);
  };
  try { recognition.start(); } catch (error) { stop(); throw error; }
  return stop;
}
