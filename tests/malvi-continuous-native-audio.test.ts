import test from 'node:test';
import assert from 'node:assert/strict';
import { GeminiNativeVoice } from '../src/server/assistant/geminiNativeVoice.ts';
import { MalviCaptionPlayer, estimatedMalviCaptionTrack } from '../src/lib/malviSpeechTiming.ts';

const pcm = () => Buffer.alloc(24000,16).toString('base64');
test('native PCM continues while transcription is between updates',()=>{
  const voice=new GeminiNativeVoice();
  voice.append(pcm(),'audio/pcm;rate=24000');
  assert.equal(voice.ready(''),false,'first speech still needs its transcript');
  assert.equal(voice.ready('Hello.'),true);
  assert.ok(voice.finish('Hello.',false)?.pcm24k);
  for(let i=0;i<4;i++){
    voice.append(pcm(),'audio/pcm;rate=24000');
    assert.equal(voice.ready(''),true,'do not wait seconds for another subtitle delta');
    const packet=voice.finish('',false);
    assert.ok(packet?.pcm24k);
    assert.equal(packet?.text,'');
    assert.ok(packet!.durationMs>0);
  }
  assert.ok(voice.finish('',true));
  voice.append(pcm(),'audio/pcm;rate=24000');
  assert.equal(voice.ready(''),false,'next utterance must establish its own transcript');
});
test('audio-only continuation retains the actual previous subtitle, never a prior conversation',()=>{
  const updates: Array<[string,boolean]> = [];
  const player=new MalviCaptionPlayer((text,speaking)=>updates.push([text,speaking]));
  const first=player.enqueue(estimatedMalviCaptionTrack('Ready to continue.',1000));
  player.start(()=>300,first);
  const actual=updates.at(-1)![0];
  assert.ok(actual);
  player.finish(first);
  const continuation=player.enqueue(estimatedMalviCaptionTrack('',400,400,true));
  player.start(()=>0,continuation);
  assert.deepEqual(updates.at(-1),[actual,true]);
  player.cancel();
  const newSession=player.enqueue(estimatedMalviCaptionTrack('',400,400,true));
  player.start(()=>0,newSession);
  assert.deepEqual(updates.at(-1),['',true]);
  player.cancel();
});
