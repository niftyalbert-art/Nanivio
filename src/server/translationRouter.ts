import { planTranslation, azureLanguageCode, type TranslationProvider } from '../lib/translator-engine/languagePlan.ts';
import { callKhayaEngine, callSunbirdEngine, type ProviderTranslation } from './translationProviders.ts';

export async function callAzureTranslator(text: string, source: string, target: string): Promise<ProviderTranslation | null> {
  const key = process.env.AZURE_TRANSLATOR_KEY;
  if (!key) return null;
  const endpoint = process.env.AZURE_TRANSLATOR_ENDPOINT || 'https://api.cognitive.microsofttranslator.com';
  try {
    const url = new URL(`${endpoint.replace(/\/$/, '')}/translate`);
    if (url.protocol !== 'https:') return null;
    url.searchParams.set('api-version', '3.0');
    url.searchParams.set('from', azureLanguageCode(source));
    url.searchParams.set('to', azureLanguageCode(target));
    const headers: Record<string, string> = { 'Content-Type':'application/json', 'Ocp-Apim-Subscription-Key':key };
    if (process.env.AZURE_TRANSLATOR_REGION) headers['Ocp-Apim-Subscription-Region'] = process.env.AZURE_TRANSLATOR_REGION;
    const response = await fetch(url, {method:'POST',headers,body:JSON.stringify([{text}]),signal:AbortSignal.timeout(10000),redirect:'error'});
    if (!response.ok) { console.warn('[Nanivio translation] azure http-error', response.status); return null; }
    const data = await response.json();
    const translated = data?.[0]?.translations?.[0]?.text;
    return typeof translated === 'string' && translated.trim() ? {text:translated,provider:'azure-translator'} : null;
  } catch { console.warn('[Nanivio translation] azure request-failed'); return null; }
}

export const translationProviderConfigured = (provider: TranslationProvider) =>
  Boolean(process.env[provider === 'azure' ? 'AZURE_TRANSLATOR_KEY' : provider === 'khaya' ? 'KHAYA_API_KEY' : 'SUNBIRD_API_KEY']);

export async function translateWithProductionProviders(text: string, source: string, target: string) {
  const plan = planTranslation(source, target);
  if (!plan.supported) return null;
  if (!plan.hops.length) return {text,provider:'direct-passthrough',providerChain:[],pivotUsed:false};
  let output = text;
  const chain: string[] = [];
  for (const hop of plan.hops) {
    const result = hop.provider === 'khaya' ? await callKhayaEngine(output, hop.source, hop.target)
      : hop.provider === 'sunbird' ? await callSunbirdEngine(output, hop.source, hop.target)
      : await callAzureTranslator(output, hop.source, hop.target);
    // Never expose an intermediate language as a completed target translation.
    if (!result?.text?.trim()) return null;
    output = result.text;
    chain.push(result.provider);
  }
  return {text:output,provider:chain.join('+'),providerChain:chain,pivotUsed:plan.requiresPivot};
}
