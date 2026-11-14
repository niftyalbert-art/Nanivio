import { randomUUID } from 'node:crypto';
import type { RequestHandler, Response } from 'express';

export const CALL_STARTUP_TRACE_VERSION = 'call-startup-v1';
export const CALL_STARTUP_TRACE_LOG = '[Nanivio call startup]';
type Operation = 'token' | 'join';
type Phase = 'authentication' | 'authorization' | 'allowance' | 'signing' | 'registration';
type Event = 'received' | 'phase' | 'slow' | 'finished' | 'disconnected';
const phases = new Set<Phase>(['authentication', 'authorization', 'allowance', 'signing', 'registration']);
interface State {
  id: string;
  operation: Operation;
  started: number;
  phase: Phase;
  phaseStarted: number;
}
interface Options {
  now?: () => number;
  log?: (record: Record<string, unknown>) => void;
  newId?: () => string;
  slowMs?: number;
}

/** Observes the existing admission path. Never authorizes, retries or cancels it. */
export function createCallStartupTracing(options: Options = {}) {
  const active = new WeakMap<Response, State>();
  const now = options.now || (() => performance.now());
  const log = options.log || (record => console.info(CALL_STARTUP_TRACE_LOG, JSON.stringify(record)));
  const emit = (state: State, event: Event, extra: Record<string, unknown> = {}) => {
    // Only fixed operation/phase labels, generated correlation IDs and timings.
    // Deliberately never inspect the request body, headers, user or channel.
    try {
      const time = now();
      log({
        version: CALL_STARTUP_TRACE_VERSION, traceId: state.id, operation: state.operation,
        event, phase: state.phase, elapsedMs: Math.max(0, Math.round(time - state.started)),
        phaseElapsedMs: Math.max(0, Math.round(time - state.phaseStarted)),
        ...extra,
      });
    } catch { /* Diagnostics must not affect call admission or error handling. */ }
  };
  const phase = (response: Response, nextPhase: Phase) => {
    try {
      const state = active.get(response);
      if (!state || !phases.has(nextPhase) || state.phase === nextPhase) return;
      emit(state, 'phase', { nextPhase });
      state.phase = nextPhase;
      state.phaseStarted = now();
    } catch { /* Preserve the original route even if a diagnostic dependency fails. */ }
  };
  const begin = (operation: Operation): RequestHandler => {
    if (operation !== 'token' && operation !== 'join') throw new Error('Unknown call trace operation.');
    return (_request, response, next) => {
      try {
        const started = now();
        const state: State = {
          id: (options.newId || randomUUID)(), operation, started,
          phase: 'authentication', phaseStarted: started,
        };
        active.set(response, state);
        try {
          response.setHeader('X-Nanivio-Call-Trace', state.id);
          response.setHeader('X-Nanivio-Call-Trace-Version', CALL_STARTUP_TRACE_VERSION);
        } catch { /* Header delivery is optional; logs remain useful on disconnect. */ }
        emit(state, 'received');
        let closed = false;
        const finish = (event: 'finished' | 'disconnected') => {
          if (closed) return;
          closed = true;
          clearTimeout(timer);
          response.removeListener('finish', onFinish);
          response.removeListener('close', onClose);
          active.delete(response);
          emit(state, event, {
            // A disconnected response's default status 200 is not a success.
            ...(event === 'finished' ? { status: response.statusCode } : {}),
          });
        };
        const onFinish = () => finish('finished');
        const onClose = () => finish('disconnected');
        const timer = setTimeout(() => emit(state, 'slow'), options.slowMs ?? 5000);
        timer.unref?.();
        response.once('finish', onFinish);
        response.once('close', onClose);
      } catch { /* Starting a trace is never a prerequisite for making a call. */ }
      next();
    };
  };
  const authenticated: RequestHandler = (_request, response, next) => {
    const state = active.get(response);
    if (state) phase(response, state.operation === 'join' ? 'registration' : 'authorization');
    next();
  };
  return { begin, authenticated, phase };
}

export const callStartupTracing = createCallStartupTracing();
