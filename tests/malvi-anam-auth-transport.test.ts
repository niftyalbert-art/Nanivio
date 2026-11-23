import assert from 'node:assert/strict';
import test from 'node:test';
import { build } from 'esbuild';
import { createRequire } from 'node:module';

test('the installed Anam REST client confines the application bearer to our handoff', async () => {
  // Exercise the actual pinned SDK transport, not the browser fixture's double.
  const bundle = await build({
    stdin: {
      resolveDir: process.cwd(), loader: 'js',
      contents: `export {CoreApiRestClient} from './node_modules/@anam-ai/js-sdk/dist/module/modules/CoreApiRestClient.js';`,
    },
    bundle: true, platform: 'node', format: 'cjs', write: false,
  });
  const module = { exports: {} as any };
  new Function('require', 'module', 'exports', bundle.outputFiles[0].text)(
    createRequire(import.meta.url), module, module.exports);
  const previous = globalThis.fetch;
  const calls: { url: string; authorization: string | null }[] = [];
  globalThis.fetch = async (url, options) => {
    calls.push({ url: String(url), authorization: new Headers(options?.headers).get('authorization') });
    return Response.json({ sessionId: 'fixture-session' });
  };
  try {
    const client = new module.exports.CoreApiRestClient('fixture-nanivio-credential', undefined, {
      baseUrl: '/api/assistant/session/fixture/anam-bearer',
      retry: { maxAttempts: 1 }, requestTimeoutMs: 1000,
    });
    await client.startSession();
    assert.deepEqual(calls, [{
      url: '/api/assistant/session/fixture/anam-bearer/v1/engine/session',
      authorization: 'Bearer fixture-nanivio-credential',
    }]);
  } finally { globalThis.fetch = previous; }
});
