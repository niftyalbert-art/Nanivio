import { LANGUAGE_CODES, planTranslation, type TranslationProvider } from '../lib/translator-engine/languagePlan';

export type ReadinessStage = 'language' | 'recognition' | 'translation' | 'speech';
export interface PairReadiness {
  source: string;
  target: string;
  sameLanguage: boolean;
  configured: boolean;
  liveVerified: false;
  blockers: { stage: ReadinessStage; reason: string }[];
}
export interface LangpretationReadiness {
  pairs: PairReadiness[];
  total: number;
  sameLanguage: number;
  crossLanguage: number;
  configured: number;
  blocked: number;
  liveVerified: number;
}

/** Configuration evidence only. This function performs no provider requests. */
export function buildLangpretationReadiness(checks: {
  active: (language: string) => boolean;
  speech: (language: string, operation: 'asr' | 'tts') => boolean;
  translation: (provider: TranslationProvider) => boolean;
  /** Optional integrated live-audio route. Undefined means use the staged route. */
  integratedSpeech?: (source: string, target: string) => boolean | undefined;
}): LangpretationReadiness {
  const pairs: PairReadiness[] = LANGUAGE_CODES.flatMap(source => LANGUAGE_CODES.map(target => {
    const sameLanguage = source === target;
    const plan = planTranslation(source, target);
    const blockers: PairReadiness['blockers'] = [];
    for (const language of new Set([source, target])) {
      if (!checks.active(language)) blockers.push({ stage: 'language', reason: `${language}: disabled by administrator.` });
    }
    if (!sameLanguage) {
      const integrated = checks.integratedSpeech?.(source,target);
      if (integrated !== undefined) {
        if (!integrated) blockers.push({stage:'translation',reason:'Nanivio live audio translation is not configured.'});
      } else {
        if (!checks.speech(source, 'asr')) blockers.push({ stage: 'recognition', reason: `${source}: recognition is not configured.` });
        if (!plan.supported) {
          blockers.push({ stage: 'translation', reason: plan.reason || 'Translation is not implemented.' });
        } else {
          for (const hop of plan.hops) {
            if (!checks.translation(hop.provider)) blockers.push({
              stage: 'translation', reason: `${hop.source} → ${hop.target}: ${hop.provider} translation is not configured.`,
            });
          }
        }
        if (!checks.speech(target, 'tts')) blockers.push({ stage: 'speech', reason: `${target}: spoken output is not configured.` });
      }
    }
    return { source, target, sameLanguage, configured: blockers.length === 0, liveVerified: false, blockers };
  }));
  return {
    pairs, total: pairs.length, sameLanguage: pairs.filter(pair => pair.sameLanguage).length,
    crossLanguage: pairs.filter(pair => !pair.sameLanguage).length,
    configured: pairs.filter(pair => pair.configured).length,
    blocked: pairs.filter(pair => !pair.configured).length, liveVerified: 0,
  };
}
