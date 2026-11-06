import assert from 'node:assert/strict';
import test from 'node:test';
import { LANGUAGE_TOOL, createLanguageControlTool, parseLanguageControl, SPOKEN_LANGUAGE_POLICY } from '../src/server/assistant/languageControl.ts';
import { MALVI_LANGUAGES } from '../src/lib/malviLanguages.ts';
import { assertMalviVoiceLanguage, malviVoiceSetup } from '../src/server/assistant/malviVoiceConfig.ts';
import { createGeminiReferenceBridge, createOpenAIReferenceBridge } from '../src/server/assistant/referenceToolBridges.ts';

const available = (code: string) => {
  if (!['en', 'fr', 'ak', 'ar'].includes(code)) throw new Error('The selected voice does not support this language.');
};
test('every available catalogue language can be selected by code, name, native name and locale for each voice', () => {
  for (const provider of ['gemini', 'elevenlabs'] as const) {
    const supported = malviVoiceSetup({}, provider).supportedLanguages;
    const tool = createLanguageControlTool(supported);
    const expected = MALVI_LANGUAGES.filter(item => supported.includes(item.code));
    assert.deepEqual(tool.parametersJsonSchema.properties.language.enum, expected.map(item => item.code));
    assert.deepEqual(tool.parametersJsonSchema.properties.partnerLanguage.enum, [...expected.map(item => item.code), null]);
    for (const item of expected) {
      assert.ok(tool.description.includes(`${item.code}: ${item.name} / ${item.nativeName}`));
      for (const value of [item.code, item.name, item.nativeName, item.locale]) {
        const result = parseLanguageControl({mode:'conversation',language:value,partnerLanguage:null},
          code => assertMalviVoiceLanguage(code, provider));
        assert.equal(result.language.code, item.code, `${provider}: ${value}`);
      }
    }
    for (const item of MALVI_LANGUAGES.filter(item => !supported.includes(item.code))) {
      assert.ok(!tool.parametersJsonSchema.properties.language.enum.includes(item.code));
      assert.throws(() => parseLanguageControl({mode:'conversation',language:item.name,partnerLanguage:null},
        code => assertMalviVoiceLanguage(code, provider)), /not supported/);
    }
  }
  assert.throws(() => createLanguageControlTool([]), /no available/);
});
test('spoken dialects are never silently substituted and voice identity stays fixed', () => {
  const assertAll = () => {};
  assert.equal(parseLanguageControl({mode:'conversation',language:'Akuapem Twi',partnerLanguage:null},assertAll).language.code,'tw-ak');
  assert.equal(parseLanguageControl({mode:'conversation',language:'Twi (Akan)',partnerLanguage:null},assertAll).language.code,'ak');
  assert.throws(() => parseLanguageControl({mode:'conversation',language:'Ghana',partnerLanguage:null},assertAll), /valid/);
  for (const provider of ['gemini','elevenlabs'] as const) {
    const before = malviVoiceSetup({},provider).voiceId;
    for(const code of createLanguageControlTool(malviVoiceSetup({},provider).supportedLanguages).parametersJsonSchema.properties.language.enum) {
      parseLanguageControl({mode:'conversation',language:code,partnerLanguage:null},language=>assertMalviVoiceLanguage(language,provider));
      assert.equal(malviVoiceSetup({},provider).voiceId,before);
    }
  }
  assert.match(SPOKEN_LANGUAGE_POLICY,/same signature female voice/);
});
test('spoken switches resolve registered available languages without an account preference change', () => {
  const result = parseLanguageControl({ mode: 'conversation', language: 'fr', partnerLanguage: null }, available);
  assert.equal(result.language.code, 'fr');
  assert.equal(result.interpreterPair, null);
  assert.match(SPOKEN_LANGUAGE_POLICY, /BEFORE speaking/);
  assert.match(SPOKEN_LANGUAGE_POLICY, /Do not change account settings/);
});
test('two-person mode validates both different participant languages and supports reverse turns', () => {
  assert.deepEqual(parseLanguageControl({ mode: 'interpreter', language: 'fr', partnerLanguage: 'en' }, available).interpreterPair, ['fr','en']);
  assert.deepEqual(parseLanguageControl({ mode: 'interpreter', language: 'en', partnerLanguage: 'fr' }, available).interpreterPair, ['en','fr']);
  assert.throws(() => parseLanguageControl({ mode: 'interpreter', language: 'fr', partnerLanguage: 'fr' }, available), /different/);
  assert.throws(() => parseLanguageControl({ mode: 'interpreter', language: 'en', partnerLanguage: 'xx' }, available), /valid/);
  assert.throws(() => parseLanguageControl({ mode: 'interpreter', language: 'en', partnerLanguage: 'de' }, available), /not support/);
});
test('unregistered, unavailable and malformed switches cannot substitute English', () => {
  for (const args of [null, [], {}, { mode:'invented', language:'en' }, { mode:'conversation', language:'xx' },
    { mode:'conversation', language:'de' }, { mode:'conversation', language:'en', partnerLanguage:'fr' }]) {
    assert.throws(() => parseLanguageControl(args, available));
  }
});
test('both declared tool schemas and bridges preserve the structured language result and suppress duplicates', async () => {
  assert.deepEqual(LANGUAGE_TOOL.parametersJsonSchema.required, ['language', 'mode', 'partnerLanguage']);
  assert.ok(LANGUAGE_TOOL.parametersJsonSchema.properties.language.enum.includes('ak'));
  const calls: any[] = [], gemini: any[] = [], openai: any[] = [];
  const run = async (name: string | undefined, args: unknown) => {
    assert.equal(name, LANGUAGE_TOOL.name); calls.push(args);
    const result = parseLanguageControl(args, available);
    return { switched: true, language: result.language.code, interpreterPair: result.interpreterPair };
  };
  const args = { language:'fr', mode:'interpreter', partnerLanguage:'en' };
  const bridge = createGeminiReferenceBridge(run, result => gemini.push(result), () => false);
  const message = { toolCall: { functionCalls: [{ id:'switch-1', name:LANGUAGE_TOOL.name, args }] } };
  await bridge(message); await bridge(message);
  assert.equal(calls.length, 1);
  assert.equal(gemini[0].functionResponses[0].response.language, 'fr');
  const other = createOpenAIReferenceBridge(run, result => openai.push(result), () => false);
  const event = { type:'response.event', event:{ type:'response.output_item.done', item:{
    type:'function_call', call_id:'switch-2', name:LANGUAGE_TOOL.name, arguments:JSON.stringify(args) } } };
  await other(event); await other(event);
  assert.equal(calls.length, 2);
  assert.equal(JSON.parse(openai[0].item.output).language, 'fr');
});
