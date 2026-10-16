// Only the browser's explicitly on-device recognizer is allowed here.
// Never substitute webkitSpeechRecognition or a cloud recognizer.
export async function startLocalMalviWakeWord(onWake: () => void, onError: (message: string) => void) {
  const Recognition = (window as any).SpeechRecognition;
  if (!Recognition || typeof Recognition.available !== 'function' || !('processLocally' in Recognition.prototype)) {
    throw new Error('This browser cannot verify on-device wake-word recognition. Use Start live avatar; no cloud listening is enabled.');
  }
  const availability = await Recognition.available({ langs: ['en-US'], processLocally: true });
  if (availability !== 'available') {
    throw new Error('An on-device English speech pack is required for “Nanivio”. Install it in a supported browser, or use Start live avatar. No audio was sent to a server.');
  }
  const recognition = new Recognition();
  recognition.processLocally = true;
  recognition.lang = 'en-US';
  recognition.continuous = true;
  recognition.interimResults = false;
  let stopped = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const stop = () => { stopped = true; clearTimeout(timer); recognition.abort(); };
  recognition.onresult = (event: any) => {
    for (let i = event.resultIndex; i < event.results.length; i++) {
      if (event.results[i].isFinal && /\bnanivio\b/i.test(event.results[i][0].transcript)) {
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
  recognition.start();
  return stop;
}
