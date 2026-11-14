type RealtimeSource = {
  on: (type: string, listener: (payload: any) => void) => () => void;
};

/** A click is consent to answer, not proof that server admission has finished. */
export function waitForCallAnswerConfirmation(source: RealtimeSource, expected: {
  callId: string;
  channelName: string;
  callType: 'audio' | 'video';
  signal: AbortSignal;
  timeoutMs?: number;
}): Promise<void> {
  return new Promise((resolve, reject) => {
    const unsubscribe: Array<() => void> = [];
    let timer: ReturnType<typeof setTimeout> | undefined;
    let settled = false;
    const complete = (error?: Error) => {
      if (settled) return;
      settled = true;
      if (timer) clearTimeout(timer);
      expected.signal.removeEventListener('abort', abort);
      for (const off of unsubscribe) off();
      error ? reject(error) : resolve();
    };
    const abort = () => complete(new DOMException('Call answer was cancelled.', 'AbortError'));
    if (expected.signal.aborted) { abort(); return; }
    expected.signal.addEventListener('abort', abort, { once: true });
    unsubscribe.push(source.on('call:connected', payload => {
      if (payload?.callId === expected.callId && payload.channelName === expected.channelName
        && payload.callType === expected.callType) complete();
    }));
    for (const type of ['call:ended', 'call:declined'])
      unsubscribe.push(source.on(type, payload => {
        if (payload?.callId === expected.callId) abort();
      }));
    timer = setTimeout(() => complete(
      new DOMException('The server did not confirm this call in time.', 'TimeoutError')),
    expected.timeoutMs ?? 20000);
  });
}
