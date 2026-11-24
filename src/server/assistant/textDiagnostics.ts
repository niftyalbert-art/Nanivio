import { randomUUID } from 'node:crypto';
import { MALVI_TEXT_ERRORS, type MalviTextErrorCode } from '../../shared/malviTextDiagnostics.ts';
import { malviTextRequestOptions } from './textRequestOptions.ts';

const STAGES = ['validation', 'prepare-context', 'load-memory', 'queue-initial',
  'provider-initial', 'read-tools', 'queue-followup', 'provider-followup',
  'parse-reply', 'save-memory', 'response'] as const;
type Stage = typeof STAGES[number];
type Failure = {
  success: false;
  code: MalviTextErrorCode;
  reference: string;
  error: string;
  diagnostics: { stage: Stage; elapsedMs: number; stagesMs: Partial<Record<Stage, number>>; upstreamStatus?: number };
};
function property(value: unknown, key: string): unknown {
  try { return value && (typeof value === 'object' || typeof value === 'function')
    ? (value as Record<string, unknown>)[key] : undefined; } catch { return undefined; }
}
function status(error: unknown) {
  const value = property(error, 'status');
  return typeof value === 'number' && Number.isInteger(value) && value >= 100 && value <= 599
    ? value : undefined;
}
function classify(error: unknown, stage: Stage, aborted: boolean): MalviTextErrorCode {
  if (property(error, 'code') === 'MALVI_INFERENCE_BUSY') return 'MALVI_TEXT_QUEUE_BUSY';
  if (stage === 'prepare-context' || stage === 'load-memory' || stage === 'validation') return 'MALVI_TEXT_CONTEXT_FAILED';
  if (stage === 'parse-reply') return 'MALVI_TEXT_INVALID_REPLY';
  if (stage !== 'provider-initial' && stage !== 'provider-followup') return 'MALVI_TEXT_FAILED';
  const name = property(error, 'name');
  const upstream = status(error);
  if (aborted || name === 'AbortError' || name === 'TimeoutError' || upstream === 408 || upstream === 504) return 'MALVI_TEXT_TIMEOUT';
  if (upstream === 401 || upstream === 403) return 'MALVI_TEXT_AUTH';
  if (upstream === 429) return 'MALVI_TEXT_CAPACITY';
  if (upstream === 404) return 'MALVI_TEXT_MODEL_UNAVAILABLE';
  if (upstream === 400 || upstream === 422) return 'MALVI_TEXT_REQUEST_REJECTED';
  if (upstream && upstream >= 500) return 'MALVI_TEXT_UPSTREAM_UNAVAILABLE';
  return 'MALVI_TEXT_FAILED';
}

export function createMalviTextDiagnostics(settings: {
  now?: () => number;
  requestOptions?: typeof malviTextRequestOptions;
  log?: (record: Record<string, unknown>) => void;
} = {}) {
  const now = settings.now || (() => performance.now());
  const requestOptions = settings.requestOptions || malviTextRequestOptions;
  const log = settings.log || (record => console.error('[Malvi text diagnostic]', record));
  const started = now();
  let entered = started, stage: Stage = 'validation', captured: Failure | undefined;
  const timings: Partial<Record<Stage, number>> = {};
  const milliseconds = (value: number) => Math.max(0, Math.round(value));
  function finishSpan(at: number) {
    timings[stage] = (timings[stage] || 0) + milliseconds(at - entered);
    entered = at;
  }
  function mark(next: Stage) {
    if (!STAGES.includes(next)) throw Error('Invalid Malvi diagnostic stage');
    if (captured) return;
    finishSpan(now());
    stage = next;
  }
  function fail(error?: unknown, override?: MalviTextErrorCode, aborted = false): Failure {
    if (captured) return captured;
    const at = now();
    finishSpan(at);
    const code = override && Object.hasOwn(MALVI_TEXT_ERRORS, override)
      ? override : classify(error, stage, aborted);
    const reference = `NVMT-${randomUUID()}`;
    const upstreamStatus = stage.startsWith('provider-') ? status(error) : undefined;
    captured = {
      success: false, code, reference,
      error: `${MALVI_TEXT_ERRORS[code]} Support code: ${code}. Reference: ${reference}.`,
      diagnostics: {
        stage, elapsedMs: milliseconds(at - started), stagesMs: { ...timings },
        ...(upstreamStatus !== undefined ? { upstreamStatus } : {}),
      },
    };
    // Deliberately exclude errors, messages, user IDs, prompts, model replies,
    // provider details, URLs, headers, credentials and configuration values.
    try { log({ event: 'malvi_text_failure', code, reference, ...captured.diagnostics }); } catch {}
    return captured;
  }
  return {
    mark, fail,
    async generate<T>(next: 'provider-initial' | 'provider-followup',
      work: (options: ReturnType<typeof malviTextRequestOptions>) => Promise<T>): Promise<T> {
      mark(next);
      const options = requestOptions();
      try { return await work(options); }
      catch (error) {
        // Capture the live signal state now; a successful earlier request's
        // signal expiring later must not misclassify a parse/tool failure.
        fail(error, undefined, options.abortSignal.aborted);
        throw error;
      }
    },
  };
}
