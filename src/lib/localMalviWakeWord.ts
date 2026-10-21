// Only the browser's explicitly on-device recognizer is allowed here.
// Never substitute webkitSpeechRecognition or a cloud recognizer.
export class LocalWakeWordError extends Error {
  constructor(public code: 'UNSUPPORTED_BROWSER' | 'PACK_REQUIRED' | 'PACK_UNAVAILABLE' | 'SETUP_FAILED', message: string) { super(message); }
}

function waitForLocalCheck<T>(operation: Promise<T>, signal?: AbortSignal): Promise<T> {
  return new Promise((resolve, reject) => {
    const finish = (error?: unknown, value?: T) => {
      clearTimeout(timer);
      signal?.removeEventListener('abort', abort);
      if (error) reject(error); else resolve(value as T);
    };
    const abort = () => finish(new DOMException('Local listening was cancelled.', 'AbortError'));
    const timer = setTimeout(() => finish(new LocalWakeWordError('SETUP_FAILED',
      'The browser did not finish checking on-device speech support. Try again, or open Nanivio directly in a supported desktop browser. No cloud listening was enabled.')), 10_000);
    signal?.addEventListener('abort', abort, { once: true });
    if (signal?.aborted) abort();
    operation.then(value => finish(undefined, value), error => finish(error));
  });
}

function recognitionError(code?: string): string {
  if (code === 'not-allowed' || code === 'service-not-allowed') {
    return 'Microphone or on-device speech access was blocked. Allow microphone access in this site’s browser permissions. If Nanivio is inside a preview, open the website directly and try again. No cloud listening was enabled.';
  }
  if (code === 'audio-capture') return 'The microphone could not start. Close other apps using it, check your microphone, and try again.';
  if (code === 'language-not-supported') return 'The English on-device speech pack is not usable in this browser. Recheck local wake setup, or start Malvi manually.';
  return 'Local wake-word listening stopped. Check microphone permission, or start Malvi manually. No cloud listening was enabled.';
}

export function isMalviWakePhrase(transcript: string) {
  return /(?:^|[^\p{L}\p{N}_])(?:malvi|nanivio)(?=$|[^\p{L}\p{N}_])/iu.test(transcript);
}

function localRecognition() {
  const Recognition = typeof window === 'undefined' ? undefined : (window as any).SpeechRecognition;
  if (!Recognition || typeof Recognition.available !== 'function' || !('processLocally' in Recognition.prototype)) {
    throw new LocalWakeWordError('UNSUPPORTED_BROWSER', 'This browser cannot verify on-device wake-word recognition. Most mobile browsers do not support it. Try an up-to-date supported desktop browser, or use Start live avatar. No cloud listening is enabled.');
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
  let availability: string;
  try {
    availability = await waitForLocalCheck<string>(Recognition.available({ langs: ['en-US'], processLocally: true }), signal);
  } catch (error) {
    if (signal?.aborted || error instanceof LocalWakeWordError) throw error;
    throw new LocalWakeWordError('SETUP_FAILED', 'The browser blocked the on-device speech check. Open Nanivio directly outside any embedded preview, check site permissions, and try again. No cloud listening was enabled.');
  }
  cancelled();
  if (availability === 'unavailable') {
    throw new LocalWakeWordError('PACK_UNAVAILABLE', 'This browser cannot download the required English on-device speech pack. Use a supported desktop browser or start Malvi manually. No cloud listening was enabled.');
  }
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
  let starting = true;
  let resolveStart!: () => void;
  let rejectStart!: (error: Error) => void;
  const started = new Promise<void>((resolve, reject) => { resolveStart = resolve; rejectStart = reject; });
  const startTimer = setTimeout(() => {
    rejectStart(new LocalWakeWordError('SETUP_FAILED', 'The microphone recognizer did not start. Check browser permissions and try again. No cloud listening was enabled.'));
    stop();
  }, 10_000);
  const stop = () => {
    if (stopped) return;
    stopped = true;
    signal?.removeEventListener('abort', stop);
    clearTimeout(timer);
    clearTimeout(startTimer);
    if (starting) rejectStart(new DOMException('Local listening was cancelled.', 'AbortError'));
    recognition.abort();
  };
  signal?.addEventListener('abort', stop, { once: true });
  recognition.onstart = () => {
    if (stopped) return;
    starting = false;
    clearTimeout(startTimer);
    resolveStart();
  };
  recognition.onresult = (event: any) => {
    if (stopped || starting) return;
    for (let i = event.resultIndex; i < event.results.length; i++) {
      if (event.results[i].isFinal && typeof event.results[i][0]?.transcript === 'string' && isMalviWakePhrase(event.results[i][0].transcript)) {
        stop();
        onWake();
        break;
      }
    }
  };
  recognition.onerror = (event: { error?: string }) => {
    if (stopped) return;
    const message = recognitionError(event?.error);
    if (starting) {
      rejectStart(new LocalWakeWordError('SETUP_FAILED', message));
      stop();
      return;
    }
    stop();
    onError(message);
  };
  recognition.onend = () => {
    if (starting && !stopped) {
      rejectStart(new LocalWakeWordError('SETUP_FAILED', 'Local speech recognition ended before the microphone started. Check browser permissions and try again.'));
      stop();
      return;
    }
    if (!stopped) timer = setTimeout(() => {
      if (!stopped) {
        try { recognition.start(); } catch { stop(); onError('Local wake-word listening could not restart.'); }
      }
    }, 300);
  };
  try { recognition.start(); } catch {
    rejectStart(new LocalWakeWordError('SETUP_FAILED', 'The browser could not start local speech recognition. Check microphone permissions and open Nanivio directly in a supported browser.'));
    stop();
  }
  await started;
  if (stopped) throw new LocalWakeWordError('SETUP_FAILED', 'Local microphone listening stopped during setup. Check browser permissions and try again.');
  cancelled();
  return stop;
}
