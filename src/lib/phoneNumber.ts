import { parsePhoneNumberFromString, type CountryCode } from 'libphonenumber-js';
import { ALL_COUNTRY_CALLING_CODES } from '../data/countryCallingCodes';

/** Shared by signup and the server so a proof always refers to the same E.164 number. */
export function normalizeSignupPhone(raw: unknown, callingCode?: string, country?: string): string {
  if (typeof raw !== 'string' || raw.length > 80) throw new Error('Enter a valid international phone number.');
  const value = raw.trim();
  if (!/^[+\d\s().-]+$/.test(value)) throw new Error('Enter a valid international phone number.');
  const selected = ALL_COUNTRY_CALLING_CODES.find(c => c.name === country && c.dialCode === callingCode)
    || ALL_COUNTRY_CALLING_CODES.find(c => c.dialCode === callingCode);
  const parsed = value.startsWith('+')
    ? parsePhoneNumberFromString(value)
    : selected ? parsePhoneNumberFromString(value, selected.code as CountryCode) : undefined;
  if (!parsed?.isValid()) throw new Error('Enter a valid phone number with its country calling code.');
  return parsed.number;
}
