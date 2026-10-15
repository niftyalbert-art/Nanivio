import test from 'node:test';
import assert from 'node:assert/strict';
import { khayaLanguageCode, sunbirdLanguageCode, extractTranslation } from '../src/server/translationProviders.ts';

// Pure contract tests only, not fabricated network responses or live-provider
// evidence. Actual output is checked separately with authenticated live requests.
test('Khaya translates the app Twi code to the documented provider code', () => {
  assert.equal(khayaLanguageCode('ak'), 'tw');
  assert.equal(khayaLanguageCode('en'), 'en');
  assert.equal(khayaLanguageCode('ak', true), 'twi');
  assert.equal(khayaLanguageCode('en', true), 'eng');
  assert.equal(khayaLanguageCode('ee', true), 'ewe');
});

test('an unsupported dialect is not silently replaced with generic Twi', () => {
  assert.equal(khayaLanguageCode('tw-ak'), 'tw-ak');
});

test('Sunbird receives ISO 639-3 codes instead of application codes', () => {
  assert.equal(sunbirdLanguageCode('en'), 'eng');
  assert.equal(sunbirdLanguageCode('lg'), 'lug');
  assert.equal(sunbirdLanguageCode('sw'), 'swa');
});

test('translation extraction accepts text and rejects empty or malformed values', () => {
  assert.equal(extractTranslation(' documented text ', 'khaya'), 'documented text');
  for (const input of [null, undefined, '', ' ', 12, {}, [], { translation: {} }]) {
    assert.equal(extractTranslation(input, 'khaya'), null);
    assert.equal(extractTranslation(input, 'sunbird'), null);
  }
});

test('an explicitly failed result is never treated as a translation', () => {
  assert.equal(extractTranslation({ success: false, text: 'input' }, 'khaya'), null);
  assert.equal(extractTranslation({ status: 'FAILED', translated_text: 'input' }, 'sunbird'), null);
});
