import test from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { createRequire } from 'node:module';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

async function component(path: string, name: string) {
  const built = await build({ entryPoints: [path], bundle: true, write: false,
    format: 'cjs', platform: 'node', packages: 'external',
    plugins: [{ name: 'isolated-communication-fixture', setup(builder) {
      builder.onResolve({ filter: /context\/NanivioContext$/ }, () => ({ path: 'context', namespace: 'fixture' }));
      builder.onResolve({ filter: /lib\/agoraClient$/ }, () => ({ path: 'agora', namespace: 'fixture' }));
      builder.onResolve({ filter: /services\/speechService$/ }, () => ({ path: 'speech', namespace: 'fixture' }));
      builder.onLoad({ filter: /.*/, namespace: 'fixture' }, args => ({ loader: 'js',
        contents: args.path === 'context'
          ? 'export const useNanivio=()=>globalThis.__communicationFixture;'
          : args.path === 'agora'
          ? 'export const agoraClient={getLocalStream:()=>null,getRemoteStream:()=>null,setRemoteAudioMuted:()=>{}};'
          : 'export const speechService={stopListening(){},stopSpeaking(){},stopAudioVisualizer(){}};' }));
    } }],
  });
  const module = { exports: {} as any };
  new Function('require', 'module', 'exports', built.outputFiles[0].text)(
    createRequire(import.meta.url), module, module.exports);
  return module.exports[name];
}

function fixture() {
  const me = { id: 'test-self', name: 'Test Self', initials: 'TS', myLanguage: 'en', avatar: '', role: 'user' };
  const peer = { id: 'test-peer', name: 'Test Peer', initials: 'TP', myLanguage: 'en', avatar: '', role: 'user' };
  const values = {
    currentUser: me, myLanguage: 'en', activeConversationId: 'test-conversation',
    conversations: [{ id: 'test-conversation', title: 'Test conversation', participants: [me, peer], unreadCount: 0 }],
    messages: { 'test-conversation': [{ id: 'test-message', senderId: peer.id, senderName: peer.name,
      senderLang: 'en', text: 'Synthetic regression fixture', timestamp: 1, status: 'sent' }] },
    contacts: [], replyingToMessage: null, currentPlan: { tier: 'free', groupCallLimit: 4 }, userSettings: { privacy: { blockedUsers: [], restrictedUsers: [] } },
    globalLangpretationEnabled: false, streamState: { status: 'DISCONNECTED' },
    activeCall: { id: 'test-call', type: 'audio_1on1', status: 'connecting', host: me,
      participants: [me, peer], durationSeconds: 42, langpretationEnabled: false, langpretationState: 'OFF' },
    agoraStats: { connectionState: 'CONNECTING', hasLocalMedia: false, hasRemoteMedia: false },
    adminFeatures: {}, langpretationMeter: {}, inCallNotice: null, wallets: [], billingSummary: null,
    isSettingsModalOpen: false, isEditProfileModalOpen: false,
  };
  (globalThis as any).__communicationFixture = new Proxy(values, { get: (target, key) =>
    key in target ? (target as any)[key] : () => {} });
  return values;
}

test('real ChatView renders a full thread, an accessible voice action for an empty draft and collapsed chat categories', async () => {
  fixture();
  const ChatView = await component('src/components/chat/ChatView.tsx', 'ChatView');
  const html = renderToStaticMarkup(React.createElement(ChatView));
  assert.match(html, /Synthetic regression fixture/);
  const action = html.match(/<button[^>]*id="btn-chat-send-msg"[^>]*>/)?.[0];
  assert.ok(action, 'Composer action must be present');
  assert.match(action, /aria-label="Record voice note"/);
  assert.doesNotMatch(action, /\sdisabled(?:=|\s|>)/);
  assert.match(html, /aria-label="Choose chat category"/);
  assert.match(html, /Attachments|Attachment options|Attach/);
  assert.doesNotMatch(html, /Nanivio Live Support &amp; Services/);
});

test('real call screen reports media errors and does not claim a working remote connection', async () => {
  const values = fixture();
  (values.activeCall as any).mediaError = 'Microphone access was denied. Allow access and call again.';
  const CallScreen = await component('src/components/calls/VideoCallScreen.tsx', 'VideoCallScreen');
  const html = renderToStaticMarkup(React.createElement(CallScreen, { onEndCall: () => {} }));
  assert.match(html, /Microphone access was denied/);
  assert.match(html, /role="alert"/);
  assert.doesNotMatch(html, /1080p 60fps|24ms|00:42|LIVE HD/);
  assert.match(html, /Connecting|connecting|Waiting|waiting/);
});

test('real ChatView labels an untranslated original when translation failed', async () => {
  const values = fixture();
  Object.assign(values.messages['test-conversation'][0], {
    translationStatus: 'unavailable', translationTargetLang: 'en',
  });
  const ChatView = await component('src/components/chat/ChatView.tsx', 'ChatView');
  const html = renderToStaticMarkup(React.createElement(ChatView));
  assert.match(html, /Synthetic regression fixture/);
  assert.match(html, /Translation unavailable/);
  assert.match(html, /showing original message/);
  assert.doesNotMatch(html, /Translated to/);
});

for (const type of ['audio_1on1', 'video_1on1']) {
  test(`${type} shows the local media stage before the remote participant publishes`, async () => {
    const values = fixture();
    values.activeCall.type = type;
    values.activeCall.status = 'ringing';
    values.agoraStats.hasLocalMedia = true;
    const CallScreen = await component('src/components/calls/VideoCallScreen.tsx', 'VideoCallScreen');
    const html = renderToStaticMarkup(React.createElement(CallScreen, { onEndCall: () => {} }));
    assert.match(html, /id="video-call-pip-window"/);
    assert.doesNotMatch(html, /Local media is not available yet/);
  });
}
