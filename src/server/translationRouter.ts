import { planTranslation, type TranslationProvider } from '../lib/translator-engine/languagePlan.ts';
import { callKhayaEngine, callSunbirdEngine, type ProviderTranslation } from './translationProviders.ts';
import { translateGeminiText } from './langpretationGemini.ts';

export const translationProviderConfigured = (provider: TranslationProvider) =>
  Boolean(process.env[provider === 'gemini' ? 'GEMINI_API_KEY' : provider === 'khaya' ? 'KHAYA_API_KEY' : 'SUNBIRD_API_KEY']);

export async function translateWithProductionProviders(text: string, source: string, target: string,signal?:AbortSignal) {
  const plan = planTranslation(source, target);
  if (!plan.supported) return null;
  if (!plan.hops.length) return {text,provider:'direct-passthrough',providerChain:[],pivotUsed:false};
  let output = text;
  const chain: string[] = [];
  for (const hop of plan.hops) {
    if(signal?.aborted)return null;
    const result = hop.provider === 'khaya' ? await callKhayaEngine(output, hop.source, hop.target,signal)
      : hop.provider === 'sunbird' ? await callSunbirdEngine(output, hop.source, hop.target,signal)
      : await translateGeminiText(output, hop.source, hop.target).catch(() => {
        console.warn('[Nanivio translation] gemini request-failed');
        return null;
      });
    // Never expose an intermediate language as a completed target translation.
    if (!result?.text?.trim()) return null;
    output = result.text;
    chain.push(result.provider);
  }
  return {text:output,provider:chain.join('+'),providerChain:chain,pivotUsed:plan.requiresPivot};
}
