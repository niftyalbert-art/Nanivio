import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { getAllLanguages, getLangpretationLanguages } from '../src/i18n/languages';
import { LANGUAGE_CODES, planTranslation } from '../src/lib/translator-engine/languagePlan';
import { SUPPORTED_LANGUAGES } from '../src/types';

test('communication pickers cover the complete 18-language scope, not unrelated registry languages', () => {
  const codes = getLangpretationLanguages().map(lang => lang.code).sort();
  assert.deepEqual(codes, [...LANGUAGE_CODES].sort());
  assert.deepEqual(SUPPORTED_LANGUAGES.map(lang => lang.code).sort(), codes);
  assert.ok(getAllLanguages().length > codes.length, 'Interface catalogue stays separate');
});

test('a selectable translation language always has a route and dialects are not silently aliased', () => {
  const languages = getLangpretationLanguages();
  assert.equal(languages.find(lang => lang.code === 'tw-ak')?.translation, false);
  for (const source of languages.filter(lang => lang.translation)) {
    for (const target of languages.filter(lang => lang.translation)) {
      assert.equal(planTranslation(source.code, target.code).supported, true);
    }
  }
  assert.equal(planTranslation('tw-ak', 'en').supported, false);
});

test('recorded speech uses the speaking preference and preserves that source through delivery', () => {
  const recorder = readFileSync('src/components/chat/VoiceNoteRecorder.tsx', 'utf8');
  assert.match(recorder, /const sourceLang = speakingLanguage \|\| myLanguage/);
  assert.match(recorder, /sourceLang=\$\{encodeURIComponent\(sourceLang\)\}/);
  assert.doesNotMatch(recorder, /sourceLang: myLanguage/);
  const chat = readFileSync('src/components/chat/ChatView.tsx', 'utf8');
  assert.match(chat, /payload\.targetLang,\s+payload\.sourceLang/);
  const context = readFileSync('src/context/NanivioContext.tsx', 'utf8');
  assert.match(context, /sourceLang: sourceLangParam \|\| speakingLanguage \|\| myLanguage/);
  assert.doesNotMatch(context, /nanivio_speaking_language'\) \|\| 'ak'/);
});
