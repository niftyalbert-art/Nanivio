import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { once } from 'node:events';
import test from 'node:test';
import express from 'express';
import { featureSettingsHandler, videoCallingEnabled } from '../src/server/featureSettings.ts';

const configured = { AGORA_APP_ID: 'test-app-id', AGORA_APP_CERTIFICATE: 'test-certificate' };

test('configured video calling defaults to enabled and honors the explicit off switch', () => {
  assert.equal(videoCallingEnabled(configured), true);
  assert.equal(videoCallingEnabled({ ...configured, NANIVIO_VIDEO_CALLS_ENABLED: 'true' }), true);
  assert.equal(videoCallingEnabled({ ...configured, NANIVIO_VIDEO_CALLS_ENABLED: 'false' }), false);
});

test('video calling stays disabled when Agora configuration is missing', () => {
  assert.equal(videoCallingEnabled({}), false);
  assert.equal(videoCallingEnabled({ AGORA_APP_ID: 'test-app-id' }), false);
  assert.equal(videoCallingEnabled({ AGORA_APP_CERTIFICATE: 'test-certificate' }), false);
  assert.equal(videoCallingEnabled({ ...configured, AGORA_APP_ID: ' ', NANIVIO_VIDEO_CALLS_ENABLED: 'true' }), false);
});

test('ordinary clients can read current capabilities without gaining write permissions', async () => {
  const features = { videoCallsEnabled: true, audioCallsEnabled: false };
  const app = express();
  app.get('/api/features', featureSettingsHandler(features));
  const server = app.listen(0, '127.0.0.1');
  await once(server, 'listening');
  try {
    const address = server.address() as { port: number };
    const url = `http://127.0.0.1:${address.port}/api/features`;
    const response = await fetch(url);
    assert.equal(response.status, 200);
    assert.equal(response.headers.get('cache-control'), 'no-store');
    assert.deepEqual(await response.json(), features);
    assert.equal((await fetch(url, { method: 'POST' })).status, 404);
    Object.assign(features, { unexpectedText: 'must not be public', unexpectedObject: { hidden: true } });
    assert.deepEqual(await (await fetch(url)).json(), { videoCallsEnabled: true, audioCallsEnabled: false });
    features.videoCallsEnabled = false;
    assert.equal((await (await fetch(url)).json()).videoCallsEnabled, false);
  } finally {
    await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
  }
});

test('management remains admin-only and clients read the ordinary-user endpoint', () => {
  const server = readFileSync(new URL('../server.ts', import.meta.url), 'utf8');
  const context = readFileSync(new URL('../src/context/NanivioContext.tsx', import.meta.url), 'utf8');
  assert.match(server, /app\.get\("\/api\/features", featureSettingsHandler\(adminFeatureSwitches\)\)/);
  assert.match(server, /app\.get\("\/api\/admin\/features", requireAdmin,/);
  assert.match(server, /app\.post\("\/api\/admin\/features\/update", requireAdmin,/);
  assert.match(context, /fetch\('\/api\/features',/);
  assert.doesNotMatch(context, /fetch\('\/api\/admin\/features'[,)]/);
  assert.match(context, /Authorization: `Bearer \$\{token\}`/);
  assert.match(context, /if \(!response\.ok\) throw new Error\('The server did not save the feature setting/);
  assert.match(context, /if \(featureSettingsStatus !== 'ready'\)/);
});
