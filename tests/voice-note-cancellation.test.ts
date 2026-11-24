import assert from 'node:assert/strict';
import test from 'node:test';
import { build } from 'esbuild';
import { createRequire } from 'node:module';

// Exercise the real staged pipeline with in-memory speech/translation adapters.
// No recordings, service credentials or provider requests are used.
const bundle = await build({
  entryPoints: ['src/server/voiceNotePipeline.ts'],
  bundle: true, platform: 'node', format: 'cjs', write: false,
  plugins: [{
    name: 'isolated-voice-note-abort',
    setup(builder) {
      builder.onResolve({ filter: /speechProviders\.ts$/ }, () => ({ path: 'speech', namespace: 'fixture' }));
      builder.onResolve({ filter: /translationRouter\.ts$/ }, () => ({ path: 'translation', namespace: 'fixture' }));
      builder.onLoad({ filter: /.*/, namespace: 'fixture' }, ({ path }) => ({
        contents: path === 'speech' ? `
          export class SpeechProviderError extends Error {
            constructor(status,message,diagnostic,upstreamDiagnostic){
              super(message);this.status=status;this.diagnostic=diagnostic;this.upstreamDiagnostic=upstreamDiagnostic;
            }
          }
          export function wavDurationSeconds(){return 1;}
          export function transcribeProviderAudio(_audio,_language,_mime,options){
            return globalThis.__voiceNoteAbort.stage('recognition',options.signal);
          }
          export function synthesizeProviderAudio(_text,_language,options){
            return globalThis.__voiceNoteAbort.stage('synthesis',options.signal);
          }`
          : `export function translateWithProductionProviders(_text,_source,_target,signal){
               return globalThis.__voiceNoteAbort.stage('translation',signal);
             }`,
      }));
    },
  }],
});
const module = { exports: {} as any };
new Function('require', 'module', 'exports', bundle.outputFiles[0].text)(
  createRequire(import.meta.url), module, module.exports);

for (const blockedStage of ['recognition', 'translation', 'synthesis']) {
  test(`a deadline abort during ${blockedStage} reports timeout rather than a provider failure`, async t => {
    const deadline = new AbortController();
    t.mock.method(AbortSignal, 'timeout', () => deadline.signal);
    const original = (globalThis as any).__voiceNoteAbort;
    t.after(() => { (globalThis as any).__voiceNoteAbort = original; });
    const calls: string[] = [];
    (globalThis as any).__voiceNoteAbort = {
      stage(name: string, signal: AbortSignal) {
        calls.push(name);
        if (name !== blockedStage) return Promise.resolve({ text: 'fixed fixture', provider: 'fixture' });
        return new Promise((_resolve, reject) => {
          signal.addEventListener('abort', () => reject(new DOMException('private abort detail', 'AbortError')), { once: true });
          queueMicrotask(() => deadline.abort());
        });
      },
    };
    await assert.rejects(module.exports.processStagedVoiceNote(Buffer.alloc(2), 'en', 'fr'), (error: any) => {
      assert.equal(error.status, 504);
      assert.equal(error.stage, blockedStage);
      assert.match(error.message, /timed out/);
      assert.doesNotMatch(error.message, /private abort detail/);
      return true;
    });
    assert.equal(calls.at(-1), blockedStage, 'never begin another stage after the deadline');
  });
}

test('explicit user cancellation stays distinct from the pipeline deadline', async t => {
  const deadline = new AbortController(), user = new AbortController();
  t.mock.method(AbortSignal, 'timeout', () => deadline.signal);
  const original = (globalThis as any).__voiceNoteAbort;
  t.after(() => { (globalThis as any).__voiceNoteAbort = original; });
  (globalThis as any).__voiceNoteAbort = {
    stage(_name: string, signal: AbortSignal) {
      return new Promise((_resolve, reject) => {
        signal.addEventListener('abort', () => reject(new DOMException('private abort detail', 'AbortError')), { once: true });
        queueMicrotask(() => user.abort());
      });
    },
  };
  await assert.rejects(module.exports.processStagedVoiceNote(Buffer.alloc(2), 'en', 'fr', user.signal), (error: any) => {
    assert.equal(error.status, 499);
    assert.match(error.message, /cancelled/);
    assert.equal(deadline.signal.aborted, false);
    return true;
  });
});
