// Shared by authenticated HTTP and WebSocket translation paths.
// Provider failures log fixed reason codes, HTTP status, and bounded structural
// metadata, never URLs, credentials, request text, or raw upstream bodies.
export interface ProviderTranslation {
  text: string;
  provider: string;
}
export type TranslationFailureReason='limit'|'authentication'|'authorization'|'configuration'|
  'upstream'|'timeout'|'transport'|'invalid_response'|'cancelled';
export class TranslationRequestError extends Error {
  constructor(public status:number,public diagnostic:{
    provider:'khaya'|'sunbird';operation:'translation';upstreamHttpStatus?:number;
    failure:TranslationFailureReason;
  }){super('Nanivio text translation could not complete.');}
}

async function quotaErrorHint(response:Response,signal:AbortSignal):Promise<boolean>{
  if(!response.body)return false;
  const reader=response.body.getReader(),parts:Buffer[]=[];
  let size=0;
  let abort!:()=>void;
  const stopped=new Promise<never>((_,reject)=>{
    abort=()=>{reject(signal.reason);void reader.cancel().catch(()=>{});};
    signal.addEventListener('abort',abort,{once:true});
  });
  try{
    if(signal.aborted)abort();
    while(size<65536){
      const {value,done}=await Promise.race([reader.read(),stopped]);
      if(done)break;
      parts.push(Buffer.from(value.subarray(0,65536-size)));
      size+=value.length;
    }
    if(signal.aborted)throw signal.reason;
    return /\b(quota|credits?|exceeded|capacity)\b|rate[\s_-]*limit/i.test(Buffer.concat(parts).toString('utf8'));
  }finally{
    signal.removeEventListener('abort',abort);void reader.cancel().catch(()=>{});
  }
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
  preserveProviderErrors=false,
): Promise<ProviderTranslation | null> {
  const deadline=AbortSignal.any([AbortSignal.timeout(10000),...(signal?[signal]:[])]);
  try {
    let url:URL;
    try{url=translationEndpoint(provider,endpoint);}
    catch{throw new TranslationRequestError(503,{provider,operation:'translation',failure:'configuration'});}
    if (url.protocol !== 'https:') {
      console.warn('[Nanivio translation]', provider, 'invalid-endpoint');
      throw new TranslationRequestError(503,{provider,operation:'translation',failure:'configuration'});
    }
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...headers },
      body: JSON.stringify(body),
      signal: deadline,
      redirect: 'error',
    });
    if (!response.ok) {
      console.warn('[Nanivio translation]', provider, 'http-error', response.status);
      const limited=response.status===429||preserveProviderErrors&&response.status===403&&await quotaErrorHint(response,deadline);
      if(response.status!==403||!preserveProviderErrors)void response.body?.cancel().catch(()=>{});
      const failure:TranslationFailureReason=limited?'limit':response.status===401?'authentication':
        response.status===403?'authorization':response.status===404?'configuration':'upstream';
      const status=limited||['authentication','authorization','configuration'].includes(failure)?503:
        [502,503,504].includes(response.status)?response.status:502;
      throw new TranslationRequestError(status,
        {provider,operation:'translation',upstreamHttpStatus:response.status,failure});
    }
    const data = await response.json();
    const text = extractTranslation(data, provider);
    if (!text) {
      console.warn('[Nanivio translation]', provider, 'invalid-response', responseShape(data));
      throw new TranslationRequestError(502,{provider,operation:'translation',
        upstreamHttpStatus:response.status,failure:'invalid_response'});
    }
    return { text, provider: provider === 'khaya' ? 'khaya-ghana-nlp' : 'sunbird-makerere' };
  } catch (error) {
    if(error instanceof TranslationRequestError){
      if(preserveProviderErrors)throw error;
      return null;
    }
    const name = error instanceof Error ? error.name : '';
    const reason = name === 'TimeoutError' || name === 'AbortError'
      ? 'timeout' : name === 'SyntaxError' ? 'invalid-json' : 'request-failed';
    console.warn('[Nanivio translation]', provider, reason);
    const timedOut=deadline.aborted||name==='TimeoutError'||name==='AbortError';
    if(preserveProviderErrors)throw new TranslationRequestError(signal?.aborted?499:timedOut?504:502,{
      provider,operation:'translation',failure:signal?.aborted?'cancelled':timedOut?'timeout':
        name==='SyntaxError'?'invalid_response':'transport',
    });
    return null;
  }
}

export async function callKhayaEngine(text: string, sourceLang: string, targetLang: string,signal?:AbortSignal,
  preserveProviderErrors=false): Promise<ProviderTranslation | null> {
  const apiKey = process.env.KHAYA_API_KEY;
  if (!apiKey) {
    if(preserveProviderErrors)throw new TranslationRequestError(503,{provider:'khaya',operation:'translation',failure:'configuration'});
    return null;
  }
  const endpoint = process.env.KHAYA_TRANSLATION_URL || 'https://translation-api.ghananlp.org/v1/translate';
  const version2 = /\/v2(?:\/|$)/.test(endpoint);
  return requestTranslation('khaya', endpoint, { 'Ocp-Apim-Subscription-Key': apiKey }, {
    in: text,
    lang: `${khayaLanguageCode(sourceLang, version2)}-${khayaLanguageCode(targetLang, version2)}`,
  },signal,preserveProviderErrors);
}

export async function callSunbirdEngine(text: string, sourceLang: string, targetLang: string,signal?:AbortSignal,
  preserveProviderErrors=false): Promise<ProviderTranslation | null> {
  const apiKey = process.env.SUNBIRD_API_KEY;
  if (!apiKey) {
    if(preserveProviderErrors)throw new TranslationRequestError(503,{provider:'sunbird',operation:'translation',failure:'configuration'});
    return null;
  }
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
    preserveProviderErrors,
  );
}
