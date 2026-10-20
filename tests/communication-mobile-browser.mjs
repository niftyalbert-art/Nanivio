// Isolated UI fixtures only: no authentication bypass, public test route, or real messages.
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { spawn } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import WebSocket from 'ws';

const built = await build({
  stdin: {
    resolveDir: process.cwd(), loader: 'tsx',
    contents: `
      import React from 'react';
      import {createRoot} from 'react-dom/client';
      import {ChatView} from './src/components/chat/ChatView';
      import {ErrorBoundary} from './src/components/common/ErrorBoundary';
      import {VideoCallScreen} from './src/components/calls/VideoCallScreen';
      import {Navbar} from './src/components/Navbar';
      import {BottomNavigationBar} from './src/components/BottomNavigationBar';
      const me={id:'fixture-self',name:'Fixture Self',initials:'FS',myLanguage:'en',avatar:'',role:'user'};
      const peer={id:'fixture-peer',name:'A long international contact name for responsive testing',initials:'FP',myLanguage:'en',avatar:'',role:'user'};
      const values={
        currentUser:me,myLanguage:'en',activeTab:'chat',activeConversationId:'fixture-conversation',
        conversations:[{id:'fixture-conversation',title:peer.name,participants:[me,peer],unreadCount:0}],
        messages:{'fixture-conversation':[{id:'fixture-message',senderId:peer.id,senderName:peer.name,
          senderLang:'en',text:'Isolated layout test: '+ 'LongUnbrokenMessage'.repeat(16),timestamp:1,status:'sent'}]},
        contacts:[],callLogs:[],replyingToMessage:null,currentPlan:{tier:'free',groupCallLimit:4},
        userSettings:{privacy:{blockedUsers:[],restrictedUsers:[]}},
        globalLangpretationEnabled:false,streamState:{status:'DISCONNECTED'},
        activeCall:{id:'fixture-call',type:'audio_1on1',status:'connected',host:me,participants:[me,peer],
          durationSeconds:42,langpretationEnabled:false,langpretationState:'OFF'},
        agoraStats:{connectionState:'CONNECTED',hasLocalMedia:false,hasRemoteMedia:false},
        adminFeatures:{},langpretationMeter:{},inCallNotice:null,wallets:[],billingSummary:null,
        isSettingsModalOpen:false,isEditProfileModalOpen:false,
        sendMessage:async(text)=>{window.__fixtureSent={text};},
      };
      window.__communicationFixture=new Proxy(values,{get:(target,key)=>key in target?target[key]:(()=>{})});
      let root;
      window.__renderCommunicationFixture=(screen)=>{
        root?.unmount(); root=createRoot(document.getElementById('fixture-root'));
        values.activeTab=screen==='chat'?'chat':'calls';
        values.activeCall.type=screen==='video'?'video_1on1':'audio_1on1';
        root.render(screen==='chat'
          ? <div className="nanivio-app nv-theme-dark chat-app-shell h-[100dvh] max-h-[100dvh] flex flex-col w-full max-w-full overflow-x-hidden relative"><Navbar/>
              <main className="nanivio-main chat-main flex min-h-0 flex-1 flex-col overflow-hidden pb-[calc(4.5rem+env(safe-area-inset-bottom))] w-full max-w-full overflow-x-hidden"><ErrorBoundary fallbackTitle="Fixture chat failure"><ChatView/></ErrorBoundary></main><BottomNavigationBar/></div>
          : <div className="nv-theme-dark"><VideoCallScreen onEndCall={()=>{}}/></div>);
      };
    `,
  },
  bundle: true, write: false, format: 'iife', platform: 'browser',
  define: { 'process.env.NODE_ENV': '"test"' },
  plugins: [{ name: 'isolated-communication-fixture', setup(builder) {
    builder.onResolve({ filter: /context\/NanivioContext$/ }, () => ({ path: 'context', namespace: 'fixture' }));
    builder.onResolve({ filter: /lib\/agoraClient$/ }, () => ({ path: 'agora', namespace: 'fixture' }));
    builder.onResolve({ filter: /services\/speechService$/ }, () => ({ path: 'speech', namespace: 'fixture' }));
    builder.onLoad({ filter: /.*/, namespace: 'fixture' }, args => ({ loader: 'js', contents:
      args.path === 'context' ? 'export const useNanivio=()=>window.__communicationFixture;'
      : args.path === 'agora' ? `export const agoraClient={getLocalStream:()=>null,getRemoteStream:()=>null,
          subscribeLocalStream:()=>()=>{},subscribeRemoteStream:()=>()=>{},setRemoteAudioMuted:()=>{}};`
      : 'export const speechService={stopListening(){},stopSpeaking(){},stopAudioVisualizer(){}};',
    }));
  } }],
});

const base = process.env.NANIVIO_TEST_URL || 'http://127.0.0.1:5000';
const cssResponse = await fetch(`${base}/src/index.css?direct`);
assert.equal(cssResponse.ok, true, 'Running Vite stylesheet unavailable');
const css = await cssResponse.text();
const profile = await mkdtemp(join(tmpdir(), 'nanivio-mobile-fixture-'));
const port = 9236;
const browser = spawn('/repl/tools/bin/chromium', [
  '--headless=new', '--no-sandbox', '--disable-dev-shm-usage',
  `--remote-debugging-port=${port}`, `--user-data-dir=${profile}`, 'about:blank',
], { stdio: 'ignore' });
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
let socket;
try {
  let target;
  for (let n = 0; n < 100; n++) {
    try { target = (await (await fetch(`http://127.0.0.1:${port}/json`)).json()).find(t => t.type === 'page'); } catch {}
    if (target) break;
    await delay(100);
  }
  assert.ok(target, 'Chromium did not start');
  socket = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise(resolve => socket.once('open', resolve));
  let sequence = 0;
  const pending = new Map();
  socket.on('message', raw => {
    const message = JSON.parse(raw);
    const request = pending.get(message.id);
    if (!request) return;
    pending.delete(message.id);
    message.error ? request.reject(message.error) : request.resolve(message.result);
  });
  const call = (method, params = {}) => new Promise((resolve, reject) => {
    const id = ++sequence;
    pending.set(id, { resolve, reject });
    socket.send(JSON.stringify({ id, method, params }));
  });
  const evaluate = async expression => {
    const result = await call('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
    if (result.exceptionDetails) throw new Error(JSON.stringify(result.exceptionDetails));
    return result.result.value;
  };
  await call('Page.enable');
  const { frameTree } = await call('Page.getFrameTree');
  await call('Page.setDocumentContent', { frameId: frameTree.frame.id,
    html: `<html><head><meta name="viewport" content="width=device-width, initial-scale=1"><style>${css}</style></head><body><div id="fixture-root"></div></body></html>` });
  await evaluate(built.outputFiles[0].text);
  await evaluate(`window.__originalChatFixture={
    conversations:window.__communicationFixture.conversations,
    messages:window.__communicationFixture.messages
  }`);
  const historyStates = [];
  for (const waveform of [null, undefined, [], [15, 60, 30]]) {
    await evaluate(`window.__communicationFixture.messages={'fixture-conversation':[{
      id:'fixture-voice-note',senderId:'fixture-peer',senderName:'Fixture Peer',
      senderLang:'en',text:'',timestamp:1,status:'sent',isVoiceNote:true,reactions:null,
      voiceNote:{id:'fixture-voice-note',duration:7,audioBlobUrl:'/fixture-only-audio.webm',
        waveform:${JSON.stringify(waveform) ?? 'undefined'},hasLangpretation:false,
        sourceLang:'en',targetLang:'en'}
    }]};window.__renderCommunicationFixture('chat')`);
    await delay(150);
    const voice = await evaluate(`({
      failed:document.body.textContent.includes('Fixture chat failure'),
      text:document.body.textContent,
      composer:!!document.querySelector('textarea[aria-label="Write a message"]'),
      playback:!!document.querySelector('button[title="Play Voice Note"]'),
      bars:document.querySelectorAll('[aria-label="Voice note waveform"] > div').length
    })`);
    assert.equal(voice.failed, false, `Voice-note history crashed with waveform ${JSON.stringify(waveform)}: ${voice.text}`);
    assert.ok(voice.composer && voice.playback, 'Voice-note history must preserve typing and playback controls');
    assert.equal(voice.bars, waveform?.length || 0, 'Missing waveforms must not show invented activity');
    historyStates.push(waveform === null ? 'null waveform' : waveform === undefined ? 'missing waveform' : `${waveform.length} waveform samples`);
  }
  await evaluate(`window.__communicationFixture.conversations=[];
    window.__communicationFixture.messages={};window.__renderCommunicationFixture('chat')`);
  await delay(100);
  assert.equal(await evaluate(`document.body.textContent.includes('Fixture chat failure')`), false, 'Empty chat history crashed');
  await evaluate(`Object.assign(window.__communicationFixture,window.__originalChatFixture);true`);
  const report = [];
  for (const [width, height] of [[320, 640], [390, 844], [390, 480], [768, 1024], [1366, 900]]) {
    await call('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: width < 768 });
    await evaluate(`window.__renderCommunicationFixture('chat')`);
    await delay(200);
    const chat = await evaluate(`(() => {
      const input=document.querySelector('textarea[aria-label="Write a message"]');
      const send=document.querySelector('#btn-chat-send-msg');
      const rect=el=>{const r=el.getBoundingClientRect();return {left:r.left,right:r.right,top:r.top,bottom:r.bottom,width:r.width,height:r.height};};
      return {input:rect(input),send:rect(send),nav:rect(document.querySelector('#nanivio-bottom-navigation')),
        pageWidth:document.documentElement.scrollWidth,viewport:innerWidth,
        categoryClosed:!document.querySelector('[aria-label="Conversation categories"]'),
        categoryButton:!!document.querySelector('[aria-label="Choose chat category"]')};
    })()`);
    assert.ok(chat.input.width >= 180, `Typing space too narrow at ${width}: ${chat.input.width}`);
    assert.ok(chat.input.left >= 0 && chat.send.right <= width, `Composer clipped at ${width}`);
    assert.ok(chat.send.bottom <= chat.nav.top + 1, `Composer behind navigation at ${width}`);
    assert.ok(chat.pageWidth <= width + 1, `Page overflows horizontally at ${width}`);
    assert.ok(chat.categoryClosed && chat.categoryButton, 'Category destinations should be collapsed under one button');
    assert.equal(await evaluate(`document.querySelector('#btn-chat-send-msg').getAttribute('aria-label')`), 'Record voice note');
    assert.equal(await evaluate(`document.querySelectorAll('.nv-chat-date-separator').length`), 1, 'Date separator missing');
    await evaluate(`if(innerWidth<1024)document.querySelector('button[title="Back to all conversations"]').click()`);
    await delay(50);
    await evaluate(`document.querySelector('[aria-label="Choose chat category"]').click()`);
    await delay(50);
    assert.equal(await evaluate(`!!document.querySelector('[aria-label="Conversation categories"]')`), true);
    await evaluate(`[...document.querySelectorAll('[aria-label="Conversation categories"] button')][0].click();if(innerWidth<1024)document.querySelector('.nv-chat-workspace .group.relative.w-full').click()`);
    await delay(50);
    await evaluate(`document.querySelector('[aria-label="Open emoji picker"]').click()`);
    await delay(50);
    const picker = await evaluate(`(() => {const r=document.querySelector('#emoji-picker-panel').getBoundingClientRect();return {left:r.left,right:r.right,top:r.top,bottom:r.bottom};})()`);
    assert.ok(picker.left >= 0 && picker.right <= width + 1 && picker.top >= 0, `Emoji picker clipped at ${width}`);
    await evaluate(`document.querySelector('#emoji-picker-panel button[aria-label^="Insert "]').click()`);
    await delay(50);
    assert.ok(await evaluate(`document.querySelector('textarea[aria-label="Write a message"]').value.length > 0`), 'Emoji did not enter message');
    assert.equal(await evaluate(`document.querySelector('#btn-chat-send-msg').getAttribute('aria-label')`), 'Send message');
    const multiline = await evaluate(`(() => {
      const input=document.querySelector('textarea[aria-label="Write a message"]');
      const enter=new KeyboardEvent('keydown',{key:'Enter',shiftKey:true,bubbles:true,cancelable:true});
      input.dispatchEvent(enter);return !enter.defaultPrevented;
    })()`);
    assert.ok(multiline, 'Shift+Enter must keep multiline typing available');
    await evaluate(`document.querySelector('button[title="Close emoji tray"]').click()`);
    if (width >= 768) {
      const composing = await evaluate(`(() => {
        const input=document.querySelector('textarea[aria-label="Write a message"]');
        const enter=new KeyboardEvent('keydown',{key:'Enter',isComposing:true,bubbles:true,cancelable:true});
        input.dispatchEvent(enter);return !enter.defaultPrevented;
      })()`);
      assert.ok(composing, 'IME composition must not send an unfinished message');
      await evaluate(`document.querySelector('textarea[aria-label="Write a message"]').dispatchEvent(
        new KeyboardEvent('keydown',{key:'Enter',bubbles:true,cancelable:true}))`);
    } else {
      const mobileEnter = await evaluate(`(() => {
        const input=document.querySelector('textarea[aria-label="Write a message"]');
        const enter=new KeyboardEvent('keydown',{key:'Enter',bubbles:true,cancelable:true});
        input.dispatchEvent(enter);return !enter.defaultPrevented;
      })()`);
      assert.ok(mobileEnter, 'Mobile Enter must allow a newline');
      await evaluate(`document.querySelector('#btn-chat-send-msg').click()`);
    }
    await delay(50);
    assert.ok(await evaluate(`window.__fixtureSent?.text.length > 0`), 'Emoji message did not use sendMessage');
    for (const screen of ['audio', 'video']) {
      await evaluate(`window.__renderCommunicationFixture('${screen}')`);
      await delay(100);
      const controls = await evaluate(`(() => {
        const buttons=[...document.querySelectorAll('button')].filter(e=>e.getBoundingClientRect().width);
        return {overflow:document.documentElement.scrollWidth>innerWidth+1,
          offscreen:buttons.filter(e=>{const r=e.getBoundingClientRect();return r.left<0||r.right>innerWidth+1||r.bottom>innerHeight+1;}).map(e=>e.title||e.textContent)};
      })()`);
      assert.equal(controls.overflow, false, `${screen} overflows at ${width}`);
      assert.deepEqual(controls.offscreen, [], `${screen} controls clipped at ${width}`);
    }
    report.push({ width, height, typingWidth: chat.input.width, emojiAndSend: true, callsFit: true });
  }
  await evaluate(`window.__communicationFixture.sendMessage=async()=>{throw new Error('Fixture send failure')};
    window.__renderCommunicationFixture('chat')`);
  await delay(100);
  await evaluate(`document.querySelector('[aria-label="Open emoji picker"]').click()`);
  await delay(50);
  await evaluate(`document.querySelector('#emoji-picker-panel button[aria-label^="Insert "]').click()`);
  await delay(50);
  await evaluate(`document.querySelector('#btn-chat-send-msg').click()`);
  await delay(100);
  assert.ok(await evaluate(`!!document.querySelector('textarea[aria-label="Write a message"]').value`), 'Failed send erased draft');
  assert.ok(await evaluate(`document.querySelector('[role="alert"]')?.textContent.includes('Message not sent')`), 'Failed send needs an explicit error');
  console.log(JSON.stringify({ isolatedFixture: true, historyStates, emptyHistory: true, failedSendKeepsDraft: true, report }, null, 2));
} finally {
  socket?.close();
  browser.kill('SIGTERM');
  await delay(100);
  await rm(profile, { recursive: true, force: true });
}
