export const MALVI_TEXT_ERRORS = {
  MALVI_TEXT_TIMEOUT: 'Malvi’s text request reached its time limit.',
  MALVI_TEXT_AUTH: 'Malvi’s AI service connection is not authorized.',
  MALVI_TEXT_CAPACITY: 'Malvi’s AI service has reached a provider capacity or usage limit.',
  MALVI_TEXT_MODEL_UNAVAILABLE: 'The configured Malvi text service is unavailable.',
  MALVI_TEXT_REQUEST_REJECTED: 'Malvi’s AI service rejected the request.',
  MALVI_TEXT_UPSTREAM_UNAVAILABLE: 'Malvi’s AI service is temporarily unavailable.',
  MALVI_TEXT_INVALID_REPLY: 'Malvi received a reply that could not be processed.',
  MALVI_TEXT_QUEUE_BUSY: 'Malvi’s request queue is busy.',
  MALVI_TEXT_NOT_CONFIGURED: 'Malvi’s text service needs configuration.',
  MALVI_TEXT_CONTEXT_FAILED: 'Malvi could not prepare this conversation.',
  MALVI_TEXT_FAILED: 'Malvi could not complete this text request.',
} as const;

export type MalviTextErrorCode = keyof typeof MALVI_TEXT_ERRORS;
export type MalviTextPublicFailure = { code: MalviTextErrorCode; message: string; reference?: string };

// Use only fixed customer copy and a server-generated reference. Never render
// raw provider errors, arbitrary response messages or diagnostic stage values.
export function safeMalviTextFailure(value: unknown): MalviTextPublicFailure | null {
  if (!value || typeof value !== 'object') return null;
  const { code, reference } = value as { code?: unknown; reference?: unknown };
  if (typeof code !== 'string' || !Object.hasOwn(MALVI_TEXT_ERRORS, code)) return null;
  return {
    code: code as MalviTextErrorCode,
    message: MALVI_TEXT_ERRORS[code as MalviTextErrorCode],
    ...(typeof reference === 'string'
      && /^NVMT-[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/.test(reference)
      ? { reference } : {}),
  };
}
