import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {participantLanguage} from '../src/shared/participantLanguage.ts';
import {parsePalabraWav} from '../src/server/palabraSpeech.ts';

test('selected French replaces an old English profile without trusting arbitrary language values',()=>{
  assert.equal(participantLanguage('fr','en'),'fr');
  assert.equal(participantLanguage('en','fr'),'en');
  assert.equal(participantLanguage('administrator','fr'),'fr');
  assert.equal(participantLanguage({role:'admin'},'en'),'en');
  assert.equal(participantLanguage(undefined,'unsupported'),'en');
});

function wav(seconds:number){
  const audio=Buffer.alloc(44+seconds*32000);
  audio.write('RIFF');audio.writeUInt32LE(audio.length-8,4);audio.write('WAVEfmt ',8);
  audio.writeUInt32LE(16,16);audio.writeUInt16LE(1,20);audio.writeUInt16LE(1,22);
  audio.writeUInt32LE(16000,24);audio.writeUInt32LE(32000,28);
  audio.writeUInt16LE(2,32);audio.writeUInt16LE(16,34);
  audio.write('data',36);audio.writeUInt32LE(audio.length-44,40);return audio;
}
test('voice messages allow sixty seconds without relaxing the nine-second legacy call limit',()=>{
  assert.throws(()=>parsePalabraWav(wav(10)),/9 seconds/);
  assert.equal(parsePalabraWav(wav(60),60).seconds,60);
  assert.throws(()=>parsePalabraWav(wav(61),60),/60 seconds/);
});
test('international voice notes authorize allowance before their integrated audio request and debit only the recorded input',()=>{
  const server=readFileSync('server.ts','utf8');
  const route=server.slice(server.indexOf('app.post("/api/langpretation/voice-note/process-audio"'),server.indexOf('// Malvi production voice input'));
  assert.match(route,/requireAuthenticatedUser/);
  const providerStart=route.indexOf('if(supportsPalabraPair');
  const branch=route.slice(providerStart,route.indexOf('const result=await processStagedVoiceNote'));
  assert.ok(route.indexOf('langpretationMinutesRemaining')>=0&&route.indexOf('langpretationMinutesRemaining')<providerStart);
  assert.match(route,/parsePalabraWav\(audio,60\)/);
  assert.match(branch,/reservePalabraCapacity/);
  assert.match(branch,/recordTranslatedVoiceNoteUsage\(audio,/);
  assert.doesNotMatch(branch,/transcribeProviderAudio|synthesizeProviderAudio/);
  assert.match(route,/finally\{release\?\.\(\)/);
});
test('authenticated presence changes language preference but cannot replace account identity or roles',()=>{
  const server=readFileSync('src/server/realtimeServer.ts','utf8');
  assert.match(server,/myLanguage: participantLanguage\(payload\?\.myLanguage, user\.preferredLanguage\)/);
  assert.match(server,/userId: String\(user\.id\)/);
  assert.match(server,/role: String\(user\.role/);
  assert.doesNotMatch(server,/userId:.*payload.*userId/);
});
