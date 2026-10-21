// Only fixed codes and our own explanations may leave the server. Provider
// messages can echo submitted speech, account information or request headers.
const CREDIT = 'The ElevenLabs account or API-key credit allowance needs attention.';
const ACCESS = 'Check the key’s Text to Speech access and access to the approved voice.';
const PARAMETERS = 'ElevenLabs rejected a speech parameter. Check the voice, model and audio-format settings.';
const REASONS = new Map<string, string>([
  ['quota_exceeded', CREDIT], ['insufficient_credits', CREDIT],
  ['insufficient_balance', CREDIT], ['payment_required', CREDIT],
  ['paid_plan_required', CREDIT], ['free_users_not_allowed', CREDIT],
  ['invalid_api_key', ACCESS], ['missing_permissions', ACCESS],
  ['authentication_error', ACCESS], ['permission_error', ACCESS],
  ['voice_access_denied', ACCESS],
  ['voice_not_found', 'The configured voice was not found or is not accessible to this key.'],
  ['invalid_voice_id', 'The configured voice ID was rejected.'],
  ['model_not_found', 'The configured speech model was not found or is not accessible.'],
  ['invalid_parameters', PARAMETERS], ['invalid_request', PARAMETERS],
  ['validation_error', PARAMETERS], ['invalid_output_format', PARAMETERS],
  ['rate_limit_exceeded', 'The ElevenLabs request-rate limit was reached.'],
  ['concurrent_limit_exceeded', 'The ElevenLabs simultaneous-request limit was reached.'],
  ['detected_unusual_activity', 'ElevenLabs blocked this request for an account security restriction.'],
  ['system_busy', 'ElevenLabs is temporarily busy.'],
  ['internal_server_error', 'ElevenLabs reported a temporary service error.'],
]);

const MAX_ERROR_BYTES = 8192;
const ERROR_READ_TIMEOUT_MS = 1500;

/** Bounded, best-effort parsing; never return raw text, messages or unknown codes. */
export async function malviSpeechFailure(response: Response): Promise<string> {
  let detail: Record<string, unknown> = {};
  const reader = response.body?.getReader();
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    if (reader) {
      const read = async () => {
        const chunks: Uint8Array[] = [];
        let bytes = 0;
        while (true) {
          const result = await reader.read();
          if (result.done) break;
          bytes += result.value.byteLength;
          if (bytes > MAX_ERROR_BYTES) return null;
          chunks.push(result.value);
        }
        return JSON.parse(Buffer.concat(chunks).toString('utf8')) as unknown;
      };
      const payload = await Promise.race([
        read(),
        new Promise<null>(resolve => { timer = setTimeout(() => resolve(null), ERROR_READ_TIMEOUT_MS); }),
      ]);
      if (payload && typeof payload === 'object' && !Array.isArray(payload)) {
        const object = payload as Record<string, unknown>;
        const candidate = object.detail ?? object;
        if (candidate && typeof candidate === 'object' && !Array.isArray(candidate)) {
          detail = candidate as Record<string, unknown>;
        }
      }
    }
  } catch {
    // Non-JSON gateway errors and interrupted bodies still retain HTTP status.
  } finally {
    clearTimeout(timer);
    void reader?.cancel().catch(() => {});
  }
  const code = [detail.code, detail.status, detail.type]
    .find((value): value is string => typeof value === 'string' && REASONS.has(value));
  const reason = code ? REASONS.get(code)! :
    response.status === 401 || response.status === 403 ? ACCESS :
    response.status === 402 ? CREDIT :
    response.status === 429 ? 'The speech request-rate or concurrency limit was reached.' :
    [400, 406, 415, 422].includes(response.status) ? PARAMETERS :
    response.status === 404 ? 'The speech endpoint or configured voice was not found.' :
    response.status >= 500 ? 'The speech service or an upstream gateway failed.' :
    'The speech provider rejected this request.';
  return `Malvi’s ElevenLabs voice is unavailable (HTTP ${response.status}${code ? `; ${code}` : ''}). ${reason}`;
}
