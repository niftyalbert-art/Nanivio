import React from 'react';
import test from 'node:test';
import assert from 'node:assert/strict';
import { renderToStaticMarkup } from 'react-dom/server';
import { INITIAL_LANGUAGE_REGISTRY } from '../src/i18n/languages.ts';
import { getMalviUsageCopy } from '../src/lib/malviUsageCopy.ts';
import { MalviAllowanceNotice } from '../src/components/malvi/MalviAllowanceNotice.tsx';

const renderNotice = (languageCode: string, seconds: number) => renderToStaticMarkup(
  <MalviAllowanceNotice languageCode={languageCode} remainingSeconds={seconds} unavailable={false} onViewPlans={() => {}} />,
);

const userCopyKeys = [
  'allowanceLabel', 'timeLeft', 'checking', 'unavailable', 'low', 'urgent',
  'exhausted', 'subscriptionTitle', 'subscriptionBody', 'subscribe', 'endAndViewPlans',
] as const;

test('every initial UI language has explicit native Malvi usage copy', () => {
  const english = getMalviUsageCopy('en');
  for (const language of INITIAL_LANGUAGE_REGISTRY) {
    const copy = getMalviUsageCopy(language.code);
    for (const key of userCopyKeys) {
      assert.ok(copy[key].trim(), `${language.code} is missing ${key}`);
      if (language.code !== 'en') {
        assert.notEqual(copy[key], english[key], `${language.code} fell back to English for ${key}`);
      }
    }
    assert.equal(copy.direction, language.direction, `${language.code} text direction`);
  }
});

test('unknown locale uses the unchanged English defaults', () => {
  assert.deepEqual(getMalviUsageCopy('unlisted-locale'), getMalviUsageCopy('en'));
  const englishCopy = getMalviUsageCopy('en');
  assert.equal(englishCopy.subscriptionTitle, 'Malvi minutes used up');
  assert.equal(englishCopy.subscriptionBody, 'Your Malvi allowance is used up. Open Billing to review your plan.');
  assert.equal(englishCopy.subscribe, 'Subscribe');
  assert.equal(englishCopy.endAndViewPlans, 'End & view plans');
  const english = renderNotice('en', 60);
  assert.match(english, /Malvi time left/);
  assert.match(english, /One minute or less of Malvi time left/);
  assert.match(english, /aria-label="Malvi time remaining" aria-live="off"/);
});

test('checking and unavailable states use the selected UI language', () => {
  const checking = renderToStaticMarkup(<MalviAllowanceNotice languageCode="fr" remainingSeconds={null} unavailable={false} onViewPlans={() => {}} />);
  const unavailable = renderToStaticMarkup(<MalviAllowanceNotice languageCode="fr" remainingSeconds={null} unavailable onViewPlans={() => {}} />);
  assert.match(checking, /Vérification du temps restant/);
  assert.match(unavailable, /Temps restant indisponible/);
  assert.match(unavailable, /Terminer et voir les offres/);
  assert.doesNotMatch(unavailable, /00:00/);
});

test('French, Twi and Arabic low-time warnings retain polite and urgent announcement roles', () => {
  const frenchLow = renderNotice('fr', 60);
  assert.match(frenchLow, /Il reste une minute ou moins de temps Malvi/);
  assert.match(frenchLow, /role="status" aria-live="polite"/);
  const twiLow = renderNotice('ak', 60);
  assert.match(twiLow, /Malvi bere simma baako anaa nea ennu saa na aka/);
  assert.match(twiLow, /role="status" aria-live="polite"/);
  const arabicLow = renderNotice('ar', 60);
  assert.match(arabicLow, /dir="rtl"/);
  assert.match(arabicLow, /بقيت دقيقة واحدة أو أقل من وقت مالفي/);
  assert.match(arabicLow, /role="status" aria-live="polite"/);

  for (const [locale, expected] of [
    ['fr', 'Il reste 30 secondes ou moins de temps Malvi'],
    ['ak', 'Malvi bere sekɔnd 30 anaa nea ennu saa na aka'],
    ['ar', 'بقيت 30 ثانية أو أقل من وقت مالفي'],
  ]) {
    const urgent = renderNotice(locale, 30);
    assert.match(urgent, new RegExp(expected));
    assert.match(urgent, /role="alert" aria-live="assertive"/);
    assert.match(urgent, /data-testid="malvi-allowance-notice"/);
  }
});

test('localized exhaustion also supplies the subscription prompt and plans actions', () => {
  const cases = [
    ['fr', /Temps Malvi épuisé/, /Votre temps Malvi est épuisé/, /Votre temps avec Malvi est terminé/, /Voir les offres/, /Terminer et voir les offres/],
    ['ak', /Malvi bere no asa/, /Malvi sima no asa/, /Wo ne Malvi bere no asa/, /Hwɛ nhyehyɛe/, /Gyae na hwɛ nhyehyɛe/],
    ['ar', /انتهى وقت مالفي/, /انتهى وقت مالفي/, /انتهى وقتك مع مالفي/, /عرض الخطط/, /إنهاء وعرض الخطط/],
  ] as const;
  for (const [locale, exhausted, title, body, subscribe, endPlans] of cases) {
    const copy = getMalviUsageCopy(locale);
    assert.match(copy.exhausted, exhausted);
    assert.match(copy.subscriptionTitle, title);
    assert.match(copy.subscriptionBody, body);
    assert.match(copy.subscribe, subscribe);
    assert.match(copy.endAndViewPlans, endPlans);
    assert.match(renderNotice(locale, 0), exhausted);
  }
});
