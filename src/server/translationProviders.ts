// Shared by authenticated HTTP and WebSocket translation paths.
// Provider failures log fixed reason codes, HTTP status, and bounded structural
// metadata, never URLs, credentials, request text, or raw upstream bodies.
export interface ProviderTranslation {
  text: string;
  provider: string;
}

export function khayaLanguageCode(code: string, version2 = false): string {
  const codes: Record<string, string> = version2
    ? { en: 'eng', ak: 'twi', ee: 'ewe' }
    : { ak: 'tw' };
  // Do not silently substitute generic Twi for the separate Akuapem dialect.
  return codes[code] || code;
}

export function sunbirdLanguageCode(code: string): string {
  const codes: Record<string, string> = {
    en: 'eng', lg: 'lug', sw: 'swa',
  };
  return codes[code] || code;
}

export function extractTranslation(data: unknown, provider: 'khaya' | 'sunbird'): string | null {
  const value = data as any;
  if (value?.success === false || ['FAILED', 'FAILURE', 'ERROR'].includes(String(value?.status).toUpperCase())) {
    return null;
  }
  const text = provider === 'khaya'
    ? (typeof value === 'string' ? value : value?.translation || value?.out || value?.text || value?.translated_text)
    : value?.output?.translated_text || value?.translated_text;
  return typeof text === 'string' && text.trim() ? text.trim() : null;
}

function responseShape(data: any) {
  const type = (value: unknown) => value === null ? 'null' : Array.isArray(value) ? 'array' : typeof value;
  const fields = (value: any) => value && typeof value === 'object'
    ? Object.fromEntries(Object.keys(value).filter(key => /^[a-z_]{1,40}$/i.test(key)).slice(0, 24).map(key => [key, type(value[key])]))
    : {};
  return {
    type: type(data),
    fields: fields(data),
    outputFields: fields(data?.output),
    dataFields: fields(data?.data),
    state: ['COMPLETED', 'IN_QUEUE', 'IN_PROGRESS', 'FAILED', 'SUCCESS'].includes(data?.status) ? data.status : undefined,
  };
}

export function translationEndpoint(provider: 'khaya' | 'sunbird', endpoint: string): URL {
  const url = new URL(endpoint);
  if (provider === 'sunbird' && url.hostname === 'api.sunbird.ai' &&
      url.pathname !== '/tasks/translate') {
    // Text MT must not be sent to the official speech-synthesis operation.
    // Custom proxy endpoints are untouched; corrections are explicit in logs.
    console.warn('[Nanivio translation]', provider, 'using-official-translation-endpoint');
    url.pathname = '/tasks/translate';
    url.search = '';
    url.hash = '';
  }
  return url;
}

async function requestTranslation(
  provider: 'khaya' | 'sunbird',
  endpoint: string,
  headers: Record<string, string>,
  body: Record<string, string>,
  signal?:AbortSignal,
): Promise<ProviderTranslation | null> {
  try {
    const url = translationEndpoint(provider, endpoint);
    if (url.protocol !== 'https:') {
      console.warn('[Nanivio translation]', provider, 'invalid-endpoint');
      return null;
    }
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...headers },
      body: JSON.stringify(body),
      signal: AbortSignal.any([AbortSignal.timeout(10000),...(signal?[signal]:[])]),
      redirect: 'error',
    });
    if (!response.ok) {
      console.warn('[Nanivio translation]', provider, 'http-error', response.status);
      return null;
    }
    const data = await response.json();
    const text = extractTranslation(data, provider);
    if (!text) {
      console.warn('[Nanivio translation]', provider, 'invalid-response', responseShape(data));
      return null;
    }
    return { text, provider: provider === 'khaya' ? 'khaya-ghana-nlp' : 'sunbird-makerere' };
  } catch (error) {
    const name = error instanceof Error ? error.name : '';
    const reason = name === 'TimeoutError' || name === 'AbortError'
      ? 'timeout' : name === 'SyntaxError' ? 'invalid-json' : 'request-failed';
    console.warn('[Nanivio translation]', provider, reason);
    return null;
  }
}

export async function callKhayaEngine(text: string, sourceLang: string, targetLang: string,signal?:AbortSignal): Promise<ProviderTranslation | null> {
  const apiKey = process.env.KHAYA_API_KEY;
  if (!apiKey) return null;
  const endpoint = process.env.KHAYA_TRANSLATION_URL || 'https://translation-api.ghananlp.org/v1/translate';
  const version2 = /\/v2(?:\/|$)/.test(endpoint);
  return requestTranslation('khaya', endpoint, { 'Ocp-Apim-Subscription-Key': apiKey }, {
    in: text,
    lang: `${khayaLanguageCode(sourceLang, version2)}-${khayaLanguageCode(targetLang, version2)}`,
  },signal);
}

export async function callSunbirdEngine(text: string, sourceLang: string, targetLang: string,signal?:AbortSignal): Promise<ProviderTranslation | null> {
  const apiKey = process.env.SUNBIRD_API_KEY;
  if (!apiKey) return null;
  return requestTranslation(
    'sunbird',
    process.env.SUNBIRD_TRANSLATION_URL || 'https://api.sunbird.ai/tasks/translate',
    { Authorization: `Bearer ${apiKey}` },
    {
      source_language: sunbirdLanguageCode(sourceLang),
      target_language: sunbirdLanguageCode(targetLang),
      text,
    },
    signal,
  );
}
