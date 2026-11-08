import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {build} from 'esbuild';

const bundle=await build({
  entryPoints:['src/server/voiceNotePipeline.ts'],bundle:true,write:false,platform:'node',format:'cjs',
  plugins:[{name:'caption-pipeline-no-network',setup(builder){
    builder.onResolve({filter:/\/(speechProviders|translationRouter)\.ts$/},args=>({
      path:args.path.includes('speechProviders')?'speech':'translation',namespace:'caption-fixture',
    }));
    builder.onLoad({filter:/.*/,namespace:'caption-fixture'},args=>({contents:args.path==='speech'?`
      export class SpeechProviderError extends Error {
        constructor(status,message,diagnostic,upstreamDiagnostic){
          super(message);Object.assign(this,{status,diagnostic,upstreamDiagnostic});
        }
      }
      export function wavDurationSeconds(){return 0.25;}
      export async function transcribeProviderAudio(){events.push('recognition');return {text:'Original',provider:'fixture'};}
      export async function synthesizeProviderAudio(){events.push('synthesis');return await finishSynthesis();}
    `:`
      export async function translateWithProductionProviders(){events.push('translation');return {text:'Translated',provider:'fixture'};}
    `}));
  }}],
});

function fixture(){
  const events:string[]=[];
  let finish!:(value:any)=>void;
  const audio=new Promise(resolve=>{finish=resolve;});
  const context=vm.createContext({
    module:{exports:{}},Buffer,AbortSignal,performance,events,
    console:{warn(){},info(){}},finishSynthesis:()=>audio,
    fetch:()=>{throw new Error('Network is forbidden in this offline test.');},
  });
  vm.runInContext(bundle.outputFiles[0].text,context);
  return {api:(context.module as any).exports,events,finish};
}

test('actual speech pipeline exposes one caption before synthesized audio is available',async()=>{
  const f=fixture(),captions:any[]=[];
  const pending=f.api.processStagedVoiceNote(Buffer.from('fixture'),'ar','ak',undefined,
    (value:any)=>{f.events.push('caption');captions.push(value);});
  await new Promise(resolve=>setImmediate(resolve));
  assert.deepEqual(f.events,['recognition','translation','caption','synthesis']);
  assert.equal(captions.length,1);
  assert.equal(captions[0].translatedTranscript,'Translated');
  f.finish({audioBase64:'fixture-audio',durationSeconds:0.25});
  const result=await pending;
  assert.equal(result.audioBase64,'fixture-audio');
  assert.equal(captions.length,1);
});

test('cancellation after early text does not return late synthesized audio',async()=>{
  const f=fixture(),abort=new AbortController();
  const rejected=assert.rejects(
    f.api.processStagedVoiceNote(Buffer.from('fixture'),'ar','ak',abort.signal,()=>{}),
    (error:any)=>error.stage==='synthesis'&&error.status===499);
  await new Promise(resolve=>setImmediate(resolve));
  abort.abort();
  f.finish({audioBase64:'late-audio',durationSeconds:0.25});
  await rejected;
  assert.deepEqual(f.events,['recognition','translation','synthesis']);
});

test('voice notes without a caption callback retain their original response contract',async()=>{
  const f=fixture();
  const pending=f.api.processStagedVoiceNote(Buffer.from('fixture'),'ar','ak');
  await new Promise(resolve=>setImmediate(resolve));
  f.finish({audioBase64:'fixture-audio',durationSeconds:0.25});
  const result=await pending;
  assert.equal(result.transcript,'Original');assert.equal(result.translatedTranscript,'Translated');
  assert.equal(result.stagesMs,undefined);
  assert.deepEqual(f.events,['recognition','translation','synthesis']);
});
