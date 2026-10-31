// Actual call UI, isolated media/provider/context fixtures. No accounts, paid requests or live calls.
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { launchBrowser } from '../scripts/live-call-checks/cdp.mjs';

const fixtureModules = {
  context: 'export const useNanivio=()=>window.__callValue;',
  media: `import React from 'react'; export const LiveCallVideoStage=()=> <div>Isolated call media fixture</div>;`,
  agora: `export const agoraClient={
    getLocalStream:()=>window.__callStream,setRemoteAudioMuted(){},restoreOriginalAudioTrack(){},
  };`,
  readiness: `export async function waitForCallTranslation(){
    window.__callActions.push({type:'readiness'});
    if(window.__denyCall)throw new Error('Your translation allowance is used up.');
  }`,
  live: `export class LiveCallTranslation {
    constructor(){window.__callActions.push({type:'service'});}
    async start(source,target,consent,stream){
      window.__callActions.push({type:'stream-start',source,target,consent,borrowed:stream===window.__callStream});
      return true;
    }
    unlock(){return Promise.resolve();}setMuted(){}
    stop(){window.__callActions.push({type:'stream-stop'});}dispose(){this.stop();}
  }`,
  speech: `export const speechService={
    async startListening(language,onText,onError,options){
      window.__speechOptions=options;
      window.__callActions.push({type:'phrase-start',language,target:options.targetLanguage,
        borrowed:options.inputStream===window.__callStream});
      return true;
    },
    stopListening(){window.__callActions.push({type:'phrase-stop'});},
    stopSpeaking(){},stopAudioVisualizer(){},
  };`,
};
const bundle = await build({
  stdin: {
    resolveDir:process.cwd(),loader:'tsx',contents:`
      import React from 'react';
      import {createRoot} from 'react-dom/client';
      import {VideoCallScreen} from './src/components/calls/VideoCallScreen';
      const noop=()=>{};
      const me={id:'self-fixture',name:'Fixture Self',initials:'FS',myLanguage:'en',isMuted:false};
      const peer={id:'peer-fixture',name:'Fixture Peer',initials:'FP',myLanguage:'fr'};
      window.__callActions=[];
      window.__callStream={fixture:true};
      window.__callValue={
        activeCall:{id:'call-fixture',type:'video_1on1',status:'connected',host:me,participants:[me,peer],
          langpretationEnabled:true,langpretationState:'ON',durationSeconds:0},
        messages:{},activeConversationId:null,currentUser:me,myLanguage:'en',
        toggleCallLangpretation:noop,toggleCallMute:noop,toggleCallVideo:noop,setMyLanguage:noop,
        sendMessage:noop,inCallNotice:null,dismissInCallNotice:noop,currentPlan:{},
        billingSummary:null,wallets:[],langpretationMeter:null,adminFeatures:{langpretationEnabled:true},
        agoraStats:{hasRemoteMedia:true,hasLocalMedia:true},
        processLiveSpeechUtterance:async(id,text,audio)=>window.__callActions.push({type:'raw-audio',id,text,audio:audio.audioBase64}),
      };
      const root=createRoot(document.getElementById('fixture-root'));
      window.__renderCall=()=>root.render(<React.StrictMode><VideoCallScreen onEndCall={()=>{}}/></React.StrictMode>);
      window.__unmountCall=()=>root.unmount();
      window.__renderCall();
    `,
  },
  bundle:true,write:false,format:'iife',platform:'browser',
  define:{'process.env.NODE_ENV':'"test"'},
  plugins:[{name:'call-fixtures',setup(builder){
    for (const [pattern,name] of [
      [/context\/NanivioContext$/,'context'],[/\/LiveCallVideoStage$/,'media'],
      [/lib\/agoraClient$/,'agora'],[/services\/callTranslationReadiness$/,'readiness'],
      [/services\/liveCallTranslation$/,'live'],[/services\/speechService$/,'speech'],
    ]) builder.onResolve({filter:pattern},()=>({path:name,namespace:'fixture'}));
    builder.onLoad({filter:/.*/,namespace:'fixture'},({path})=>({loader:'tsx',resolveDir:process.cwd(),contents:fixtureModules[path]}));
  }}],
});
const browser=await launchBrowser();
try {
  const page=await browser.page('about:blank');
  const {frameTree}=await page.command('Page.getFrameTree');
  await page.command('Page.setDocumentContent',{frameId:frameTree.frame.id,
    html:'<html><head><meta name="viewport" content="width=device-width,initial-scale=1"></head><body><div id="fixture-root"></div></body></html>'});
  await page.evaluate('window.addEventListener("error",event=>{window.__callUiError=String(event.error?.stack||event.message)})');
  await page.evaluate(bundle.outputFiles[0].text);
  const wait=async expression=>{
    for(let i=0;i<100;i++){
      if(await page.evaluate(`Boolean(${expression})`))return;
      await new Promise(resolve=>setTimeout(resolve,30));
    }
    throw new Error(`Call UI condition timed out: ${expression}\n${JSON.stringify(await page.evaluate('({text:document.body.textContent,error:window.__callUiError,actions:window.__callActions})'))}`);
  };
  await wait('document.body.textContent.includes("LISTENING") && window.__callActions.some(e=>e.type==="stream-start")');
  assert.equal(await page.evaluate('window.__callActions.filter(e=>e.type==="stream-start").length'),1,
    'StrictMode cleanup cannot start duplicate provider sessions');
  assert.equal(await page.evaluate('window.__callActions.find(e=>e.type==="stream-start").borrowed'),true);
  await page.evaluate('document.querySelector(\'[aria-label="Stop live translation"]\').click()');
  await wait('document.body.textContent.includes("NOT LISTENING")');
  await page.evaluate('document.querySelector(\'[aria-label="Start live translation"]\').click()');
  await wait('window.__callActions.filter(e=>e.type==="stream-start").length===2');

  await page.evaluate('window.__callValue.activeCall.langpretationEnabled=false;window.__renderCall()');
  await wait('!document.querySelector(\'[aria-label="Stop live translation"]\')');
  await page.evaluate('window.__denyCall=true;window.__callValue.activeCall.langpretationEnabled=true;window.__renderCall()');
  await wait('document.body.textContent.includes("allowance is used up")');
  assert.equal(await page.evaluate('window.__callActions.filter(e=>e.type==="stream-start").length'),2,
    'Denied allowance cannot start a paid provider stream');

  await page.evaluate('window.__denyCall=false;window.__callValue.activeCall.participants[1].myLanguage="ak";window.__renderCall()');
  await wait('window.__speechOptions?.targetLanguage==="ak"');
  assert.equal(await page.evaluate('window.__callActions.find(e=>e.type==="phrase-start").borrowed'),true);
  await page.evaluate('window.__speechOptions.onAudio("microphone-wav-fixture",new AbortController().signal)');
  assert.deepEqual(await page.evaluate('window.__callActions.find(e=>e.type==="raw-audio")'),
    {type:'raw-audio',id:'self-fixture',text:'',audio:'microphone-wav-fixture'});
  await page.evaluate('window.__callValue.activeCall.participants[0].isMuted=true;window.__renderCall()');
  await wait('document.body.textContent.includes("NOT LISTENING")');
  await page.evaluate('window.__callValue.activeCall.participants[0].isMuted=false;window.__callValue.activeCall.participants[1].myLanguage="en";window.__renderCall()');
  await wait('document.body.textContent.includes("Original call audio is used")');
  assert.equal(await page.evaluate('window.__callActions.filter(e=>e.type==="stream-start").length'),2);
  await page.evaluate('window.__unmountCall()');
  console.log(JSON.stringify({passed:true,isolatedFixture:true,paidRequests:0,
    checks:['automatic activation','StrictMode duplicate prevention','pause and resume',
      'switch off cleanup','allowance failure visibility','specialist raw WAV',
      'call microphone reuse','mute cleanup','same-language original audio']},null,2));
} finally {
  await browser.close();
}
