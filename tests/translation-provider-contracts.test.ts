import test from 'node:test';
import assert from 'node:assert/strict';
import { khayaLanguageCode, sunbirdLanguageCode, extractTranslation, translationEndpoint } from '../src/server/translationProviders.ts';

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

test('official Sunbird non-translation operations are corrected to text MT without speech parameters', () => {
  assert.equal(
    translationEndpoint('sunbird', 'https://api.sunbird.ai/tasks/audio/speech?voice=example#speech').href,
    'https://api.sunbird.ai/tasks/translate',
  );
});

test('Sunbird uses its current documented operation while custom proxies and Khaya are preserved', () => {
  const current = 'https://api.sunbird.ai/tasks/translate';
  assert.equal(translationEndpoint('sunbird', current).href, current);
  for (const path of ['nllb_translate', 'nmt', 'translate/']) {
    assert.equal(translationEndpoint('sunbird', `https://api.sunbird.ai/tasks/${path}`).href, current);
  }
  const proxy = 'https://translation-proxy.example/custom-mt?version=2';
  assert.equal(translationEndpoint('sunbird', proxy).href, proxy);
  const khaya = 'https://translation-api.ghananlp.org/v1/translate';
  assert.equal(translationEndpoint('khaya', khaya).href, khaya);
});
