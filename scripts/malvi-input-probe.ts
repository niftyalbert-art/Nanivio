import {readFile} from 'node:fs/promises';
import {GoogleGenAI,Modality,type Session} from '@google/genai';
import {getLiveBrainProviderConfig} from '../src/server/assistant/brainProviderConfig.ts';
import {MALVI_INPUT_ACTIVITY} from '../src/server/assistant/liveBrain.ts';
import {MALVI_GEMINI_VOICE} from '../src/server/assistant/geminiVoiceStyle.ts';

// Explicit one-turn billable diagnostic. No user session, tools, avatar or
// allowance writes. Input must be a caller-chosen, non-sensitive test clip.
const path=process.argv.find(arg=>arg.startsWith('--pcm='))?.slice(6);
if(!process.argv.includes('--confirm-billable')||!path){
  console.log('Not started. Supply --confirm-billable --pcm=<mono PCM16 16kHz test clip>.');
  process.exit(1);
}
const pcm=await readFile(path);
if(!pcm.length||pcm.length%2||pcm.length>128000){
  console.log('Not started. Test audio must be mono PCM16 16kHz, at most four seconds.');
  process.exit(1);
}
const config=getLiveBrainProviderConfig();
if(config.selectedProvider!=='gemini'||!config.configured){
  console.log('Not started. The selected live provider is not configured for this diagnostic.');
  process.exit(1);
}
let session:Session|undefined;
let finished=false,transcript='',audioBytes=0;
let firstTranscriptMs:number|null=null;
let setupReadyMs:number|null=null,inputPackets=0,messages=0;
const started=Date.now();
const finish=(success:boolean,reason:string)=>{
  if(finished)return;
  finished=true;clearTimeout(timer);
  try{session?.close();}catch{}
  console.log(JSON.stringify({success,reason,recognizedExpectedWord:/\bhello\b/i.test(transcript),
    firstTranscriptMs,setupReadyMs,inputPackets,messages,inputDurationMs:pcm.length/32,replyAudioBytes:audioBytes,
    avatarStarted:false,userAllowanceChanged:false}));
  setTimeout(()=>process.exit(success?0:1),200);
};
const timer=setTimeout(()=>finish(false,'No complete recognized turn within 25 seconds.'),25000);
try{
  session=await new GoogleGenAI({apiKey:process.env.GEMINI_API_KEY!}).live.connect({
    model:config.providers.gemini.model,
    config:{
      responseModalities:[Modality.AUDIO],inputAudioTranscription:{},
      systemInstruction:'Listen to the short English test greeting. After it finishes, reply only: Heard you.',
      speechConfig:{voiceConfig:{prebuiltVoiceConfig:{voiceName:MALVI_GEMINI_VOICE}}},
      realtimeInputConfig:{automaticActivityDetection:MALVI_INPUT_ACTIVITY},
    },
    callbacks:{
      onmessage(message){
        messages++;
        const text=message.serverContent?.inputTranscription?.text;
        if(text){transcript+=text;if(firstTranscriptMs===null)firstTranscriptMs=Date.now()-started;}
        for(const part of message.serverContent?.modelTurn?.parts||[]){
          if(part.inlineData?.mimeType?.startsWith('audio/pcm')&&part.inlineData.data){
            audioBytes+=Buffer.from(part.inlineData.data,'base64').length;
          }
        }
        if(message.serverContent?.turnComplete){
          const understood=/\bhello\b/i.test(transcript)&&audioBytes>0;
          finish(understood,understood?'The recorded Hello greeting was recognized and answered.':'The turn did not confirm the expected greeting and spoken reply.');
        }
      },
      onerror(){finish(false,'The live recognition connection reported an error. No credentials or raw provider error were logged.');},
      onclose(){if(!finished)finish(false,'The recognition connection closed before the test finished.');},
    },
  });
  setupReadyMs=Date.now()-started;
  if(finished)session.close();
  else{
    const samples=Buffer.concat([pcm,Buffer.alloc(64000)]); // Two seconds of natural end-of-turn silence.
    for(let offset=0;offset<samples.length&&!finished;offset+=6400){
      session.sendRealtimeInput({audio:{data:samples.subarray(offset,offset+6400).toString('base64'),mimeType:'audio/pcm;rate=16000'}});
      inputPackets++;
      await new Promise(resolve=>setTimeout(resolve,200));
    }
    if(!finished)session.sendRealtimeInput({audioStreamEnd:true});
  }
}catch{finish(false,'The bounded recognition check could not complete. No raw audio or credentials were logged.');}
