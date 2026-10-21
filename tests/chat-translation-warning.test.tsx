import test from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { prepareChatTranslation } from '../src/lib/chatTranslation';
import { TranslationUnavailableNotice } from '../src/components/chat/TranslationUnavailableNotice';
import { privateMessageMedia } from '../src/server/chatAttachments';
import { restoredPrivateMessage } from '../src/lib/privateChat';

test('provider failure preserves original and returns a visible failure state without provider details', async () => {
  const result = await prepareChatTranslation('Hello', 'en', 'ak', true, async () => { throw new Error('private upstream detail'); });
  assert.deepEqual(result, { translationStatus: 'unavailable', translationTargetLang: 'ak' });
  const html = renderToStaticMarkup(<TranslationUnavailableNotice state={result} isMe={false} viewerLanguage="ak" />);
  assert.match(html, /Translation unavailable/);
  assert.match(html, /showing original message/);
  assert.doesNotMatch(html, /private upstream/);
});

test('successful translation is preserved and has no failure warning', async () => {
  const result = await prepareChatTranslation('Hello', 'en', 'ak', true, async () => ({ translatedText: 'Maakye' }));
  assert.equal(result.translatedText, 'Maakye');
  assert.equal(result.translationStatus, 'translated');
  assert.equal(renderToStaticMarkup(<TranslationUnavailableNotice state={result} isMe={false} viewerLanguage="ak" />), '');
});

test('disabled, same-language and missing-recipient routes do not call a provider or show a warning', async () => {
  const translate = async () => { assert.fail('Unexpected provider call'); return { translatedText: '' }; };
  for (const [target, enabled] of [['ak', false], ['en', true], [undefined, true]] as const) {
    assert.deepEqual(await prepareChatTranslation('Hello', 'en', target, enabled, translate), {});
  }
});

test('empty successful provider output still shows translation unavailable', async () => {
  const result = await prepareChatTranslation('Hello', 'en', 'lg', true, async () => ({ translatedText: ' ' }));
  assert.equal(result.translationStatus, 'unavailable');
});

test('warning survives private message metadata sanitization and cannot carry a misleading translation', () => {
  const media = privateMessageMedia({ translationStatus: 'unavailable', translationTargetLang: 'ak', translatedText: 'incorrect fallback' });
  assert.equal(media.translationStatus, 'unavailable');
  assert.equal(media.translationTargetLang, 'ak');
  assert.equal(media.translatedText, undefined);
  assert.equal(privateMessageMedia({ translationStatus: '<script>' }).translationStatus, undefined);
  assert.equal(privateMessageMedia({ translationStatus: 'translated', translatedText: 'Maakye' }).translatedText, 'Maakye');
});

test('sender sees failure, but a group member with a different target language does not get a misleading warning', () => {
  const state = { translationStatus: 'unavailable' as const, translationTargetLang: 'ak' };
  assert.match(renderToStaticMarkup(<TranslationUnavailableNotice state={state} isMe={true} viewerLanguage="en" />), /original message only/);
  assert.equal(renderToStaticMarkup(<TranslationUnavailableNotice state={state} isMe={false} viewerLanguage="fr" />), '');
});

test('restored message history keeps the failure warning and original message without stale translation', () => {
  const restored = restoredPrivateMessage({
    id: 'history-test', channelId: 'test-channel', userId: 'test-peer', userName: 'Test peer',
    text: 'Original text', translatedText: 'Stale translation', sourceLang: 'en', createdAt: 1, reactions: [],
    nanivio: { translationStatus: 'unavailable', translationTargetLang: 'ak' },
  });
  assert.equal(restored.text, 'Original text');
  assert.equal(restored.translatedText, undefined);
  assert.equal(restored.translationStatus, 'unavailable');
  assert.match(renderToStaticMarkup(<TranslationUnavailableNotice state={restored} isMe={false} viewerLanguage="ak" />), /Translation unavailable/);
});
