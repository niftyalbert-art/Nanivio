import { AssistantError } from './redisStore';

type Job = { priority: boolean; start: () => void; reject: (error: Error) => void; timer: ReturnType<typeof setTimeout> };
/** Process-local admission control, not a claim about the provider's own queue.
 * Three priority starts at most before a waiting ordinary request gets a turn.
 * Running work is never interrupted or silently sent to a different provider.
 */
export function createInferenceQueue(concurrency = 4, maxPending = 64, waitMs = 12000) {
  if (![concurrency, maxPending, waitMs].every(n => Number.isInteger(n) && n > 0)) throw new Error('Invalid inference queue settings.');
  const pending: Job[] = [];
  let active = 0, priorityBurst = 0;
  const busy = () => new AssistantError(503, 'MALVI_INFERENCE_BUSY', 'Malvi is busy. Please try again shortly.');
  function drain() {
    while (active < concurrency && pending.length) {
      const normal = pending.findIndex(j => !j.priority);
      const premium = pending.findIndex(j => j.priority);
      const index = premium >= 0 && (normal < 0 || priorityBurst < 3) ? premium : normal;
      const [job] = pending.splice(index, 1);
      priorityBurst = job.priority ? priorityBurst + 1 : 0;
      clearTimeout(job.timer); active++; job.start();
    }
  }
  return {
    run<T>(tier: string, work: () => Promise<T>, signal?: AbortSignal): Promise<T> {
      if (signal?.aborted) return Promise.reject(signal.reason || busy());
      if (pending.length >= maxPending) return Promise.reject(busy());
      return new Promise<T>((resolve, reject) => {
        let started = false;
        const remove = (error: Error) => {
          if (started) return;
          const index = pending.indexOf(job);
          if (index < 0) return;
          pending.splice(index, 1); clearTimeout(job.timer);
          signal?.removeEventListener('abort', abort); reject(error);
        };
        const abort = () => remove(signal?.reason || busy());
        const job: Job = {
          priority: tier === 'malvi_premium' || tier === 'malvi_business', reject,
          timer: setTimeout(() => remove(busy()), waitMs),
          start: () => {
            started = true; signal?.removeEventListener('abort', abort);
            Promise.resolve().then(work).then(resolve, reject).finally(() => { active--; drain(); });
          },
        };
        signal?.addEventListener('abort', abort, { once: true });
        pending.push(job); drain();
      });
    },
    stats: () => ({ active, pending: pending.length }),
  };
}
export const malviInferenceQueue = createInferenceQueue();
