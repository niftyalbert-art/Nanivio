import { LANGUAGE_CODES } from '../lib/translator-engine/languagePlan';

/** Language preference is user-editable; identity and permissions are not. */
export function participantLanguage(selected: unknown, saved: unknown = 'en'): string {
  if (typeof selected === 'string' && (LANGUAGE_CODES as readonly string[]).includes(selected)) return selected;
  if (typeof saved === 'string' && (LANGUAGE_CODES as readonly string[]).includes(saved)) return saved;
  return 'en';
}
