import test from 'node:test';
import assert from 'node:assert/strict';
import { callMediaErrorMessage, callMediaFailureDetails, CallMediaSetupError, finishAnsweredCall } from '../src/lib/callMediaErrors';
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
  const remote = {
    setVolume: (volume: number) => events.push(`remote:volume:${volume}`),
    play: () => events.push('remote:play'),
  };
  const handlers = new Map<string, Function>();
  const client = {
    remoteUsers: [{ audioTrack: remote }], on: (event: string, handler: Function) => handlers.set(event, handler),
    emit: (event: string, ...args: any[]) => handlers.get(event)?.(...args),
    subscribe: async () => {},
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
    constructor(public tracks: any[] = []) {} getTracks() { return this.tracks; }
    getAudioTracks() { return this.tracks.filter(track => track.kind === 'audio'); }
    getVideoTracks() { return this.tracks.filter(track => track.kind === 'video'); }
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

test('late-mounted call displays immediately receive existing local and remote media', async t => {
  const original = globalThis.fetch; t.after(() => { globalThis.fetch = original; });
  fixture(); const client = await loadClient();
  await client.joinChannel('private-call', 'user', 'User', 'video');
  const sdk = (globalThis as any).__rtcFixture.createClient();
  const audio = { kind: 'audio' };
  await sdk.emit('user-published', { audioTrack: {
    setVolume() {}, play() {}, getMediaStreamTrack: () => audio,
  } }, 'audio');
  const local: any[] = [], remote: any[] = [];
  const offLocal = client.subscribeLocalStream((stream: any) => local.push(stream));
  const offRemote = client.subscribeRemoteStream((stream: any) => remote.push(stream));
  assert.equal(local[0], client.getLocalStream());
  assert.equal(remote[0].getAudioTracks()[0], audio);
  offLocal(); offRemote(); await client.leaveChannel();
});

test('remote audio/video publication and removal create fresh React-visible stream snapshots', async t => {
  const original = globalThis.fetch; t.after(() => { globalThis.fetch = original; });
  fixture(); const client = await loadClient();
  await client.joinChannel('private-call', 'user', 'User', 'video');
  const sdk = (globalThis as any).__rtcFixture.createClient();
  const audio = { kind: 'audio' }, video = { kind: 'video' };
  const user = {
    audioTrack: { setVolume() {}, play() {}, getMediaStreamTrack: () => audio },
    videoTrack: { getMediaStreamTrack: () => video },
  };
  const snapshots: any[] = [];
  const off = client.subscribeRemoteStream((stream: any) => snapshots.push(stream));
  await sdk.emit('user-published', user, 'audio');
  await sdk.emit('user-published', user, 'video');
  assert.notEqual(snapshots[1], snapshots[2]);
  assert.deepEqual(snapshots[1].getTracks(), [audio]);
  assert.deepEqual(snapshots[2].getTracks(), [audio, video]);
  sdk.emit('user-unpublished', user, 'video');
  assert.notEqual(snapshots[2], snapshots[3]);
  assert.deepEqual(snapshots[3].getTracks(), [audio]);
  off(); await client.leaveChannel();
});

test('a muted previous call cannot silence the next call and Speaker retries playback', async t => {
  const original = globalThis.fetch; t.after(() => { globalThis.fetch = original; });
  const events = fixture(); const client = await loadClient();
  await client.joinChannel('first', 'user', 'User', 'audio');
  client.setRemoteAudioMuted(true);
  await client.leaveChannel();
  await client.joinChannel('second', 'user', 'User', 'audio');
  const sdk = (globalThis as any).__rtcFixture.createClient();
  let volume = -1;
  await sdk.emit('user-published', { audioTrack: {
    setVolume(value: number) { volume = value; }, play() {}, getMediaStreamTrack: () => ({ kind: 'audio' }),
  } }, 'audio');
  assert.equal(volume, 100);
  client.setRemoteAudioMuted(false);
  assert.ok(events.includes('remote:play'));
  await client.leaveChannel();
});

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
    await assert.rejects(client.joinChannel('private-call', 'user', 'User', 'video'), (error: any) => {
      assert.equal(error.name, 'CallMediaSetupError');
      assert.equal(error.stage, failure === 'register' ? 'registration' : failure);
      assert.equal(error.httpStatus, failure === 'token' || failure === 'register' ? 503 : undefined);
      return true;
    });
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

test('overlapping preview requests share one microphone/camera acquisition', async t => {
  const original = globalThis.fetch; t.after(() => { globalThis.fetch = original; });
  const events = fixture(); const client = await loadClient();
  const sdk = (globalThis as any).__rtcFixture;
  const capture = sdk.createMicrophoneAudioTrack;
  let release!: (value: unknown) => void;
  sdk.createMicrophoneAudioTrack = () => new Promise(resolve => { release = resolve; });
  const first = client.startLocalPreview('video');
  const second = client.startLocalPreview('video');
  release(await capture());
  const [a, b] = await Promise.all([first, second]);
  assert.equal(a, b);
  assert.equal(events.filter(e => e === 'microphone').length, 1);
  assert.equal(events.filter(e => e === 'camera').length, 1);
  await client.leaveChannel();
});

test('answering during pending camera capture waits for cancelled preview cleanup before reopening devices', async t => {
  const original = globalThis.fetch; t.after(() => { globalThis.fetch = original; });
  const events = fixture(); const client = await loadClient();
  const sdk = (globalThis as any).__rtcFixture;
  const capture = sdk.createCameraVideoTrack;
  let release!: (value: unknown) => void;
  let pendingTrack: unknown;
  sdk.createCameraVideoTrack = async () => {
    const track = await capture();
    if (release) return track;
    pendingTrack = track;
    return new Promise(resolve => { release = resolve; });
  };
  const preview = client.startLocalPreview('video');
  const rejected = assert.rejects(preview, /cancelled/);
  await new Promise(resolve => setImmediate(resolve));
  assert.ok(release);
  const joining = client.joinChannel('private-call', 'user', 'User', 'video');
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(events.filter(e => e === 'camera').length, 1);
  release(pendingTrack);
  await rejected;
  await joining;
  assert.equal(events.filter(e => e === 'camera').length, 2);
  assert.ok(events.indexOf('video:close') < events.lastIndexOf('camera'));
  await client.leaveChannel();
});

test('device errors identify local camera failure separately from permission and network errors', () => {
  const message = callMediaErrorMessage({ code: 'NOT_READABLE', message: 'NotReadableError: Could not start video source' }, 'video');
  assert.match(message, /camera or microphone could not start/);
  assert.match(message, /Close other apps or browser tabs/);
  assert.doesNotMatch(message, /credit|token|Agora account/i);
  assert.match(callMediaErrorMessage(new Error('NotAllowedError'), 'audio'), /Access to your microphone was denied/);
  assert.match(callMediaErrorMessage(new Error('NotFoundError'), 'video'), /No available/);
  assert.match(callMediaErrorMessage(new Error('NETWORK_TIMEOUT'), 'video'), /Check your connection/);
});

test('answer flow preserves the actual media error and does not start billing after failed media', async () => {
  let displayed = '';
  let billed = false;
  const error = new CallMediaSetupError('camera', { code: 'NOT_READABLE' });
  await finishAnsweredCall(async () => {
    displayed = callMediaErrorMessage(error, 'video');
    throw error;
  }, async () => { billed = true; }, () => { displayed = 'Billing error'; });
  assert.match(displayed, /camera or microphone could not start/);
  assert.equal(billed, false);
});

test('answer flow only shows billing failure after successful media, and successful billing is unchanged', async () => {
  const events: string[] = [];
  await finishAnsweredCall(async () => { events.push('media'); },
    async () => { events.push('billing'); throw new Error('private billing details'); },
    () => { events.push('billing-failure'); });
  assert.deepEqual(events, ['media', 'billing', 'billing-failure']);
  events.length = 0;
  await finishAnsweredCall(async () => { events.push('media'); },
    async () => { events.push('billing'); },
    () => { events.push('billing-failure'); });
  assert.deepEqual(events, ['media', 'billing']);
});

test('call errors distinguish authorization, service configuration, devices and network without exposing original details', () => {
  assert.match(callMediaErrorMessage(new CallMediaSetupError('token', new Error('private'), 401), 'audio'), /Sign in again/);
  assert.match(callMediaErrorMessage(new CallMediaSetupError('token', new Error('private'), 403), 'video'), /could not be authorized/);
  assert.match(callMediaErrorMessage(new CallMediaSetupError('join', { code: 'INVALID_TOKEN' }), 'audio'), /contact Nanivio support/);
  assert.match(callMediaErrorMessage(new CallMediaSetupError('microphone', { name: 'NotAllowedError' }), 'audio'), /Allow access/);
  assert.match(callMediaErrorMessage(new CallMediaSetupError('join', { code: 'CAN_NOT_GET_GATEWAY_SERVER' }), 'video'), /VPN or firewall/);
  assert.match(callMediaErrorMessage(new CallMediaSetupError('registration', new Error('private'), 503), 'video'), /server could not finish/);
  const failure = new CallMediaSetupError('join', { code: 'INVALID_TOKEN', message: 'private credential' });
  assert.deepEqual(callMediaFailureDetails(failure), { stage: 'join', code: 'INVALID_TOKEN' });
  assert.doesNotMatch(JSON.stringify(callMediaFailureDetails(failure)), /private credential/);
  assert.equal(callMediaFailureDetails({ code: 'private-credential' }).code, 'UNCLASSIFIED');
  assert.doesNotMatch(callMediaErrorMessage(failure, 'audio'), /INVALID_TOKEN|private credential/);
});

test('audio and video token failures preserve the server support code and never join media', async () => {
  for (const type of ['audio', 'video'] as const) {
    const events = fixture('none');
    const originalFetch = globalThis.fetch;
    globalThis.fetch = async (input, init) => String(input).includes('/api/agora/token')
      ? Response.json({ success: false, code: 'CALL_USAGE_SETUP_REQUIRED', error: 'Usage setup unavailable.' }, { status: 503 })
      : originalFetch(input, init);
    try {
      const client = await loadClient();
      await assert.rejects(client.joinChannel('private-call', 'user', 'User', type), (error: any) =>
        error.stage === 'token' && error.httpStatus === 503 && error.serviceCode === 'CALL_USAGE_SETUP_REQUIRED');
      assert.equal(events.includes('rtc:join'), false);
      assert.equal(events.includes('microphone'), false);
    } finally {
      globalThis.fetch = originalFetch;
    }
  }
});

test('registration retains unreadable and interrupted response causes instead of inventing a failed HTTP-200 result', async () => {
  for (const cause of ['SyntaxError', 'AbortError'] as const) {
    fixture('none');
    const originalFetch = globalThis.fetch;
    globalThis.fetch = async (input, init) => {
      if (!String(input).endsWith('/join')) return originalFetch(input, init);
      if (cause === 'SyntaxError') return new Response('<html>private upstream content</html>', { status: 200 });
      const response = Response.json({ success: true });
      response.json = async () => { throw new DOMException('private transport detail', 'AbortError'); };
      return response;
    };
    try {
      const client = await loadClient();
      await assert.rejects(client.joinChannel('private-call', 'user', 'User', 'video'), (error: any) =>
        error.stage === 'registration' && error.httpStatus === 200 && error.original.name === cause);
    } finally { globalThis.fetch = originalFetch; }
    const error = new CallMediaSetupError('registration', { name: cause, message: 'private' }, 200);
    assert.equal(callMediaFailureDetails(error).code, cause);
    assert.doesNotMatch(callMediaErrorMessage(error, 'video'), /private/);
    assert.match(callMediaErrorMessage(error, 'video'), cause === 'SyntaxError' ? /CALL_RESPONSE_INVALID/ : /timed out or was interrupted/);
  }
});

test('call display components never acquire a second camera', () => {
  for (const name of ['ActiveCallModal', 'LiveCallVideoStage']) {
    const source = readFileSync(new URL(`../src/components/calls/${name}.tsx`, import.meta.url), 'utf8');
    assert.doesNotMatch(source, /startLocalPreview|createCameraVideoTrack|getUserMedia/);
  }
});

test('context does not fabricate support conversations or accept calls on a recipient’s behalf', () => {
  const source = readFileSync(new URL('../src/context/NanivioContext.tsx', import.meta.url), 'utf8');
  assert.doesNotMatch(source, /usr_nanivio_service|usr_partner|Nanivio Live Support & Services/);
  const force = source.slice(source.indexOf('const forceConnectCall'), source.indexOf('const acceptIncomingCall'));
  assert.doesNotMatch(force, /joinChannel|acceptCall|status: 'connected'/);
  assert.match(source, /await agoraClient\.joinChannel/);
  assert.match(source, /mediaError: callMediaErrorMessage\(error, type\)/);
});
