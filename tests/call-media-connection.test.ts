import test from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';

async function loadClient() {
  const result = await build({
    entryPoints: ['src/lib/agoraClient.ts'], bundle: true, write: false,
    platform: 'node', format: 'cjs', packages: 'external',
    plugins: [{ name: 'rtc-fixture', setup(builder) {
      builder.onResolve({ filter: /^agora-rtc-sdk-ng$/ }, () => ({ path: 'sdk', namespace: 'fixture' }));
      builder.onResolve({ filter: /authClient$/ }, () => ({ path: 'auth', namespace: 'fixture' }));
      builder.onLoad({ filter: /.*/, namespace: 'fixture' }, args => ({ loader: 'js', contents: args.path === 'auth'
        ? 'export const authClient = {getToken:()=>"test-session"}'
        : 'export default globalThis.__rtcFixture;' }));
    } }],
  });
  const module = { exports: {} as any };
  new Function('require', 'module', 'exports', result.outputFiles[0].text)(
    createRequire(import.meta.url), module, module.exports);
  return module.exports.agoraClient;
}

function fixture(fail: 'none' | 'token' | 'camera' | 'publish' | 'register' = 'none') {
  const events: string[] = [];
  const track = (kind: string) => ({
    getMediaStreamTrack: () => ({ kind }),
    stop: () => events.push(`${kind}:stop`), close: () => events.push(`${kind}:close`),
    setEnabled: async (enabled: boolean) => { events.push(`${kind}:enabled:${enabled}`); }, setVolume: () => {},
  });
  const remote = { setVolume: (volume: number) => events.push(`remote:volume:${volume}`) };
  const handlers = new Map<string, Function>();
  const client = {
    remoteUsers: [{ audioTrack: remote }], on: (event: string, handler: Function) => handlers.set(event, handler),
    join: async () => { events.push('rtc:join'); handlers.get('connection-state-change')?.('CONNECTED'); },
    publish: async () => { events.push('rtc:publish'); if (fail === 'publish') throw new Error('Publication failed'); },
    leave: async () => { events.push('rtc:leave'); },
  };
  (globalThis as any).__rtcFixture = {
    createClient: () => client,
    createMicrophoneAudioTrack: async () => { events.push('microphone'); return track('audio'); },
    createCameraVideoTrack: async () => { events.push('camera'); if (fail === 'camera') throw new Error('NotAllowedError'); return track('video'); },
  };
  (globalThis as any).MediaStream = class {
    constructor(public tracks: any[]) {} getTracks() { return this.tracks; }
  };
  globalThis.fetch = async url => {
    if (String(url).endsWith('/token')) {
      events.push('token');
      return fail === 'token' ? Response.json({ error: 'Token unavailable' }, { status: 503 })
        : Response.json({ token: 'fixture-token', appId: 'fixture-app', agoraUid: 1 });
    }
    if (String(url).endsWith('/join')) {
      events.push('register');
      return Response.json({ success: fail !== 'register' }, { status: fail === 'register' ? 503 : 200 });
    }
    events.push('unregister'); return Response.json({ success: true });
  };
  return events;
}

for (const type of ['audio', 'video'] as const) {
  test(`${type} reports connected only after token, real tracks, publication and server registration`, async t => {
    const original = globalThis.fetch; t.after(() => { globalThis.fetch = original; });
    const events = fixture(); const client = await loadClient();
    const states: string[] = []; client.subscribeTelemetry((stats: any) => states.push(stats.connectionState));
    const result = await client.joinChannel('private-call', 'user', 'User', type);
    assert.equal(result.connectionState, 'CONNECTED'); assert.equal(result.hasLocalMedia, true);
    assert.equal(result.hasRemoteMedia, false);
    assert.ok(events.indexOf('rtc:publish') < events.indexOf('register'));
    assert.equal(events.includes('camera'), type === 'video');
    assert.equal(states.at(-1), 'CONNECTED');
    client.setRemoteAudioMuted(true); assert.ok(events.includes('remote:volume:0'));
    client.setRemoteAudioMuted(false); assert.ok(events.includes('remote:volume:100'));
    await client.leaveChannel(); assert.equal(client.getStats().connectionState, 'DISCONNECTED');
  });
}

for (const failure of ['token', 'camera', 'publish', 'register'] as const) {
  test(`${failure} failure rejects, disconnects and closes any opened microphone/camera`, async t => {
    const original = globalThis.fetch; t.after(() => { globalThis.fetch = original; });
    const events = fixture(failure); const client = await loadClient();
    const states: string[] = []; client.subscribeTelemetry((stats: any) => states.push(stats.connectionState));
    await assert.rejects(client.joinChannel('private-call', 'user', 'User', 'video'));
    assert.equal(client.getStats().connectionState, 'DISCONNECTED');
    assert.equal(client.getLocalStream(), null);
    if (failure !== 'token') assert.ok(events.includes('audio:close'));
    if (failure === 'publish' || failure === 'register') assert.ok(events.includes('video:close'));
    assert.equal(states.includes('CONNECTED'), false);
  });
}

for (const type of ['audio', 'video'] as const) {
  test(`${type} ringing preview immediately publishes local readiness, not a connected call`, async t => {
    const original = globalThis.fetch; t.after(() => { globalThis.fetch = original; });
    const events = fixture(); const client = await loadClient();
    const snapshots: any[] = [];
    client.subscribeTelemetry((stats: any) => snapshots.push(stats));
    await client.startLocalPreview(type);
    assert.equal(snapshots.at(-1).hasLocalMedia, true);
    assert.equal(snapshots.at(-1).connectionState, 'DISCONNECTED');
    assert.equal(snapshots.at(-1).hasRemoteMedia, false);
    assert.equal(events.includes('camera'), type === 'video');
    assert.equal(events.includes('token'), false);
    await client.leaveChannel();
    assert.equal(snapshots.at(-1).hasLocalMedia, false);
    assert.ok(events.includes('audio:close'));
  });
}

test('answering preserves microphone mute and camera-off from the ringing preview', async t => {
  const original = globalThis.fetch; t.after(() => { globalThis.fetch = original; });
  const events = fixture(); const client = await loadClient();
  await client.startLocalPreview('video');
  await client.setAudioMuted(true); await client.setVideoOff(true);
  events.length = 0;
  const result = await client.joinChannel('private-call', 'user', 'User', 'video');
  assert.equal(result.isAudioMuted, true);
  assert.equal(result.isVideoOff, true);
  assert.ok(events.indexOf('audio:enabled:false') < events.indexOf('rtc:publish'));
  assert.ok(events.indexOf('video:enabled:false') < events.indexOf('rtc:publish'));
  assert.equal(events.includes('audio:enabled:true'), false);
  assert.equal(events.includes('video:enabled:true'), false);
  await client.leaveChannel();
});

test('cancelling a pending microphone prompt closes it without opening a camera afterwards', async t => {
  const original = globalThis.fetch; t.after(() => { globalThis.fetch = original; });
  const events = fixture(); const client = await loadClient();
  const sdk = (globalThis as any).__rtcFixture;
  const capture = sdk.createMicrophoneAudioTrack;
  let release!: (value: unknown) => void;
  sdk.createMicrophoneAudioTrack = () => new Promise(resolve => { release = resolve; });
  const pending = client.startLocalPreview('video');
  await client.leaveChannel();
  release(await capture());
  await assert.rejects(pending, /cancelled/);
  assert.equal(events.includes('camera'), false);
  assert.ok(events.includes('audio:close'));
  assert.equal(client.getLocalStream(), null);
});

test('failed camera preview closes the microphone and never reports local media ready', async t => {
  const original = globalThis.fetch; t.after(() => { globalThis.fetch = original; });
  const events = fixture('camera'); const client = await loadClient();
  await assert.rejects(client.startLocalPreview('video'), /NotAllowedError/);
  assert.equal(client.getStats().hasLocalMedia, false);
  assert.ok(events.includes('audio:close'));
});

test('context does not fabricate support conversations or accept calls on a recipient’s behalf', () => {
  const source = readFileSync(new URL('../src/context/NanivioContext.tsx', import.meta.url), 'utf8');
  assert.doesNotMatch(source, /usr_nanivio_service|usr_partner|Nanivio Live Support & Services/);
  const force = source.slice(source.indexOf('const forceConnectCall'), source.indexOf('const acceptIncomingCall'));
  assert.doesNotMatch(force, /joinChannel|acceptCall|status: 'connected'/);
  assert.match(source, /await agoraClient\.joinChannel/);
  assert.match(source, /mediaError: denied/);
});
