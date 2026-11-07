import { planTranslation, type TranslationProvider } from '../lib/translator-engine/languagePlan.ts';
import { callKhayaEngine, callSunbirdEngine, TranslationRequestError, type ProviderTranslation } from './translationProviders.ts';
import { LangpretationGeminiError, translateGeminiText } from './langpretationGemini.ts';
import { SpeechProviderError } from './speechProviders.ts';

export const translationProviderConfigured = (provider: TranslationProvider) =>
  Boolean(process.env[provider === 'gemini' ? 'GEMINI_API_KEY' : provider === 'khaya' ? 'KHAYA_API_KEY' : 'SUNBIRD_API_KEY']);

export async function translateWithProductionProviders(text: string, source: string, target: string,signal?:AbortSignal,
  options:{preserveProviderErrors?:boolean}={}) {
  const plan = planTranslation(source, target);
  if (!plan.supported) return null;
  if (!plan.hops.length) return {text,provider:'direct-passthrough',providerChain:[],pivotUsed:false};
  let output = text;
  const chain: string[] = [];
  for (const hop of plan.hops) {
    if(signal?.aborted)return null;
    let result:ProviderTranslation|null;
    try{
      result = hop.provider === 'khaya' ? await callKhayaEngine(output, hop.source, hop.target,signal,options.preserveProviderErrors)
        : hop.provider === 'sunbird' ? await callSunbirdEngine(output, hop.source, hop.target,signal,options.preserveProviderErrors)
        : await translateGeminiText(output, hop.source, hop.target,signal).catch((error:unknown) => {
        if(options.preserveProviderErrors){
          if(error instanceof LangpretationGeminiError)
            throw new SpeechProviderError(error.status,'Nanivio text translation could not complete.',error.diagnostic);
          throw error;
        }
        console.warn('[Nanivio translation] gemini request-failed');
        return null;
      });
    }catch(error){
      if(error instanceof TranslationRequestError)
        throw new SpeechProviderError(error.status,error.message,undefined,error.diagnostic);
      throw error;
    }
    // Never expose an intermediate language as a completed target translation.
    if (!result?.text?.trim()) return null;
    output = result.text;
    chain.push(result.provider);
  }
  return {text:output,provider:chain.join('+'),providerChain:chain,pivotUsed:plan.requiresPivot};
}
