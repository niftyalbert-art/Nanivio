import test from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import vm from 'node:vm';

// Actual browser service with only its capture/network dependencies isolated.
const bundle = await build({
  entryPoints: ['src/services/speechService.ts'], bundle: true, write: false, platform: 'browser', format: 'cjs',
  plugins: [{
    name: 'isolated-speech-dependencies',
    setup(build) {
      build.onResolve({ filter: /providerSpeechRecorder$/ }, () => ({ path: 'recorder', namespace: 'fixture' }));
      build.onResolve({ filter: /authenticatedFetch$/ }, () => ({ path: 'network', namespace: 'fixture' }));
      build.onLoad({ filter: /.*/, namespace: 'fixture' }, ({ path }) => ({ contents: path === 'network'
        ? 'export function authenticatedFetch(){throw new Error("No network allowed in this test")}'
        : `export class ProviderSpeechRecorder {
            constructor(){globalThis.fixtureRecorders.push(this)}
            start(language,onText,onError){this.language=language;this.onText=onText;this.onError=onError;return new Promise(resolve=>{this.resolve=resolve})}
            stop(){this.stopped=true}
          }`,
      }));
    },
  }],
});
function fixture() {
  const context = vm.createContext({
    module: { exports: {} }, fixtureRecorders: [],
    window: {}, navigator: { mediaDevices: { getUserMedia() {} } },
  });
  vm.runInContext(bundle.outputFiles[0].text, context);
  return { service: (context.module as any).exports.speechService, recorders: context.fixtureRecorders as any[] };
}

test('international languages all use owned capture instead of the Azure or browser speech SDK', async () => {
  assert.doesNotMatch(bundle.outputFiles[0].text, /azure-speech-token|SpeechSDK|webkitSpeechRecognition/);
  const f = fixture();
  for (const language of ['en', 'fr', 'es', 'ar', 'de', 'it', 'pt', 'zh', 'ja', 'ko']) {
    const results: any[] = [];
    const start = f.service.startListening(language, (value: any) => results.push(value));
    const recorder = f.recorders.at(-1)!;
    recorder.resolve(true);
    assert.equal(await start, true);
    assert.equal(recorder.language, language);
    recorder.onText('Actual transcript fixture', null);
    assert.equal(results[0].transcript, 'Actual transcript fixture');
    assert.equal(results[0].confidence, null);
  }
  f.service.stopListening();
  assert.ok(f.recorders.every(recorder => recorder.stopped));
});

test('stopped recognition cannot deliver stale transcripts or errors into the next session', async () => {
  const f = fixture(), results: any[] = [], errors: any[] = [];
  const oldStart = f.service.startListening('en', (value: any) => results.push(value), (error: any) => errors.push(error));
  const old = f.recorders[0];
  f.service.stopListening();
  const newStart = f.service.startListening('fr', (value: any) => results.push(value));
  const current = f.recorders[1];
  current.resolve(true); assert.equal(await newStart, true);
  old.onText('Stale transcript', null); old.onError(new Error('Stale failure'));
  old.resolve(true); assert.equal(await oldStart, false);
  assert.equal(current.stopped, undefined);
  assert.equal(results.length, 0); assert.equal(errors.length, 0);
  current.onText('New session', null); assert.equal(results.length, 1);
  f.service.stopListening();
});

test('recognition failure stops capture and notifies the caller without a fallback', async () => {
  const f = fixture(), errors: any[] = [];
  const start = f.service.startListening('en', () => {}, (error: any) => errors.push(error));
  const recorder = f.recorders[0];
  recorder.resolve(true); await start;
  recorder.onError(new Error('Recognition unavailable'));
  assert.equal(recorder.stopped, true);
  assert.equal(errors.length, 1);
  assert.equal(f.recorders.length, 1);
});
