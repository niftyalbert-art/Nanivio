// The provider rejects an eight-second deadline (minimum: ten seconds).
// This is an upper bound, not a delay. Keep text retries explicit and bounded.
export const MALVI_TEXT_TIMEOUT_MS = 15_000;

export function malviTextRequestOptions() {
  return {
    abortSignal: AbortSignal.timeout(MALVI_TEXT_TIMEOUT_MS),
    httpOptions: {
      timeout: MALVI_TEXT_TIMEOUT_MS,
      retryOptions: { attempts: 1 },
    },
  };
}
