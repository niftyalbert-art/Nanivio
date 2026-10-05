/**
 * Nanivio Multilingual Translations for Authentication & Account Hub
 * Developed for Nanivio Tech. Gh.
 *
 * Supports live, instantaneous interface language switching across all 31 supported
 * international and regional languages on the sign-in / sign-up gateway and the user account hub.
 */

import { AuthTranslations, AccountTranslations } from './translations/types';
import { ASIAN_AUTH_TRANSLATIONS, ASIAN_ACCOUNT_TRANSLATIONS } from './translations/asian';
import { EUROPEAN_AUTH_TRANSLATIONS, EUROPEAN_ACCOUNT_TRANSLATIONS } from './translations/european';
import { AFRICAN_AUTH_TRANSLATIONS, AFRICAN_ACCOUNT_TRANSLATIONS } from './translations/africanAndMidEast';

export type { AuthTranslations, AccountTranslations };

/**
 * Complete collection of authentication translations for all supported languages.
 * Languages include Japanese, Thai, Russian, Korean, Hindi, Bengali, Vietnamese, Indonesian,
 * English, French, Spanish, German, Italian, Portuguese, Dutch, Polish, Turkish,
 * Akan/Twi, Yoruba, Hausa, Swahili, Arabic, Igbo, Amharic, Ewe, Ga, Zulu, Xhosa, Somali, and Wolof.
 */
export const AUTH_TRANSLATIONS: Record<string, AuthTranslations> = {
  ...EUROPEAN_AUTH_TRANSLATIONS,
  ...ASIAN_AUTH_TRANSLATIONS,
  ...AFRICAN_AUTH_TRANSLATIONS,
};

/**
 * Returns translated strings for the auth and gateway screens with safe fallback to English.
 */
export function getAuthText(langCode: string | undefined): AuthTranslations {
  const normalized = (langCode || 'en').toLowerCase().trim();
  if (AUTH_TRANSLATIONS[normalized]) {
    return AUTH_TRANSLATIONS[normalized];
  }
  // Try language prefix (e.g. 'ja-JP' -> 'ja', 'th-TH' -> 'th', 'ru-RU' -> 'ru')
  const prefix = normalized.split('-')[0];
  if (AUTH_TRANSLATIONS[prefix]) {
    return AUTH_TRANSLATIONS[prefix];
  }
  return AUTH_TRANSLATIONS.en;
}

/**
 * Complete collection of account hub translations for all 31 supported languages.
 */
export const ACCOUNT_TRANSLATIONS: Record<string, AccountTranslations> = {
  ...EUROPEAN_ACCOUNT_TRANSLATIONS,
  ...ASIAN_ACCOUNT_TRANSLATIONS,
  ...AFRICAN_ACCOUNT_TRANSLATIONS,
};

/**
 * Returns translated strings for the account hub with safe fallback to English.
 */
export function getAccountText(langCode: string | undefined): AccountTranslations {
  const normalized = (langCode || 'en').toLowerCase().trim();
  if (ACCOUNT_TRANSLATIONS[normalized]) {
    return ACCOUNT_TRANSLATIONS[normalized];
  }
  const prefix = normalized.split('-')[0];
  if (ACCOUNT_TRANSLATIONS[prefix]) {
    return ACCOUNT_TRANSLATIONS[prefix];
  }
  return ACCOUNT_TRANSLATIONS.en;
}
