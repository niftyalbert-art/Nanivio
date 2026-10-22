// Require explicit on-device capability even for a vendor-prefixed constructor.
// A legacy webkitSpeechRecognition API alone is NOT a local recognizer.
export class LocalWakeWordError extends Error {
  constructor(public code: 'UNSUPPORTED_BROWSER' | 'PACK_REQUIRED' | 'PACK_UNAVAILABLE' | 'SETUP_FAILED', message: string) { super(message); }
}

function waitForLocalCheck<T>(operation: Promise<T>, signal?: AbortSignal, timeoutMs = 10_000,
  timeoutMessage = 'The browser did not finish checking on-device speech support. Try again, or open Nanivio directly in a supported desktop browser. No cloud listening was enabled.'): Promise<T> {
  return new Promise((resolve, reject) => {
    let settled = false;
    const finish = (error?: unknown, value?: T) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      signal?.removeEventListener('abort', abort);
      if (error) reject(error); else resolve(value as T);
    };
    const abort = () => finish(new DOMException('Local listening was cancelled.', 'AbortError'));
    const timer = setTimeout(() => finish(new LocalWakeWordError('SETUP_FAILED', timeoutMessage)), timeoutMs);
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
  if (typeof window !== 'undefined' && window.isSecureContext === false) {
    throw new LocalWakeWordError('UNSUPPORTED_BROWSER', 'Local wake listening needs a secure HTTPS page. Open Nanivio directly over HTTPS, or use Start live avatar. No cloud listening is enabled.');
  }
  const candidates = typeof window === 'undefined' ? [] : [(window as any).SpeechRecognition, (window as any).webkitSpeechRecognition];
  const Recognition = candidates.find(candidate => typeof candidate === 'function'
    && typeof candidate.available === 'function' && candidate.prototype && 'processLocally' in candidate.prototype);
  if (Recognition) return Recognition;
  throw new LocalWakeWordError('UNSUPPORTED_BROWSER', 'This browser cannot verify on-device wake-word recognition. Use Start live avatar here, or a supported desktop browser with its English speech pack. No cloud listening is enabled.');
}

export async function installLocalMalviWakeWordPack() {
  const Recognition = localRecognition();
  if (typeof Recognition.install !== 'function') throw new LocalWakeWordError('UNSUPPORTED_BROWSER', 'This browser cannot install an on-device speech pack. Use Start live avatar instead.');
  // Only called from an explicit user click; never download packs while idle.
  try {
    return Boolean(await waitForLocalCheck(Recognition.install({ langs: ['en-US'], processLocally: true }), undefined, 120_000,
      'The browser has not confirmed the speech-pack installation after two minutes. The download may still continue in your browser. Retry when it finishes, or start Malvi manually.'));
  } catch (error) {
    if (error instanceof LocalWakeWordError) throw error;
    throw new LocalWakeWordError('SETUP_FAILED', 'The browser blocked the local speech-pack installation. Open Nanivio directly, check site permissions, then retry. You can still start Malvi manually.');
  }
}

export async function startLocalMalviWakeWord(
  onWake: () => void, onError: (message: string) => void, signal?: AbortSignal,
  onState?: (state: 'listening' | 'restarting') => void,
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
  if (recognition.processLocally !== true) {
    throw new LocalWakeWordError('UNSUPPORTED_BROWSER', 'The browser could not enforce on-device listening. Use Start live avatar instead. No cloud recognition was started.');
  }
  recognition.lang = 'en-US';
  recognition.continuous = true;
  recognition.interimResults = false;
  let stopped = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let starting = true;
  let everStarted = false;
  let resolveStart!: () => void;
  let rejectStart!: (error: Error) => void;
  const started = new Promise<void>((resolve, reject) => { resolveStart = resolve; rejectStart = reject; });
  let startTimer: ReturnType<typeof setTimeout> | undefined;
  const stop = () => {
    if (stopped) return;
    stopped = true;
    signal?.removeEventListener('abort', stop);
    clearTimeout(timer);
    clearTimeout(startTimer);
    if (!everStarted) rejectStart(new DOMException('Local listening was cancelled.', 'AbortError'));
    try { recognition.abort(); } catch { /* Already stopped by the browser. */ }
  };
  const failed = (message: string) => {
    if (stopped) return;
    if (!everStarted) rejectStart(new LocalWakeWordError('SETUP_FAILED', message));
    stop();
    if (everStarted) onError(message);
  };
  const begin = () => {
    if (stopped) return;
    starting = true;
    clearTimeout(startTimer);
    startTimer = setTimeout(() => failed('The microphone recognizer did not start or restart. Check browser permissions and try again. No cloud listening was enabled.'), 10_000);
    try { recognition.start(); }
    catch { failed('The browser could not start local speech recognition. Check microphone permissions and open Nanivio directly in a supported browser.'); }
  };
  signal?.addEventListener('abort', stop, { once: true });
  recognition.onstart = () => {
    if (stopped) return;
    starting = false;
    everStarted = true;
    clearTimeout(startTimer);
    resolveStart();
    onState?.('listening');
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
    failed(message);
  };
  recognition.onend = () => {
    if (starting && !stopped) {
      failed('Local speech recognition ended before the microphone started. Check browser permissions and try again.');
      return;
    }
    if (!stopped) {
      starting = true;
      clearTimeout(timer);
      onState?.('restarting');
      timer = setTimeout(begin, 300);
    }
  };
  begin();
  await started;
  if (stopped || starting) {
    stop();
    throw new LocalWakeWordError('SETUP_FAILED', 'Local microphone listening stopped during setup. Check browser permissions and try again.');
  }
  cancelled();
  return stop;
}
