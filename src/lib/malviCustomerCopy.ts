import type { MalviSubscriptionPlan } from '../types/billing';

/** Old administrator catalogues may contain guarantees we have not measured. */
export function malviCustomerCopy<T extends MalviSubscriptionPlan>(plan: T): T {
  const qualify = (text: string) => text
    .replace(/zero awkward pauses/gi, 'responses subject to provider and network delay')
    .replace(/sub-second latency/gi, 'response times dependent on provider and network conditions')
    .replace(/real-time simultaneous Langpretation assistance/gi, 'Language assistance for supported languages; availability and delay vary')
    .replace(/multi-party simultaneous Langpretation across African and global trade corridors/gi,
      'Meeting language assistance for supported language pairs; availability and delay vary');
  return {
    ...plan,
    description: qualify(plan.description),
    langpretationCapabilities: qualify(plan.langpretationCapabilities),
    features: plan.features.map(qualify),
  };
}
