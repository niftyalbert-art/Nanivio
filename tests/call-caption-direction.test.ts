import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {isIncomingCallCaption,buildPeerCallCaption} from '../src/shared/callCaption.ts';

const call={id:'connected-call',status:'connected',langpretationEnabled:true,
  participants:[{id:'me',myLanguage:'ak'},{id:'other',myLanguage:'ar'}]};
const incoming={callId:call.id,speakerId:'other',targetLang:'ak',translatedText:'Akwaaba.'};
test('incoming captions are accepted but my outgoing translation cannot overwrite them',()=>{
  assert.equal(isIncomingCallCaption(call,incoming,'me'),true);
  assert.equal(isIncomingCallCaption(call,{...incoming,speakerId:'me'},'me'),false);
  assert.equal(isIncomingCallCaption(call,incoming,'other'),false);
});
test('late, disabled and untranslated caption events are ignored',()=>{
  for(const payload of [null,{}, {...incoming,callId:'previous-call'},
    {...incoming,translatedText:''},{...incoming,translatedText:' '},
    {...incoming,speakerId:'outsider'},{...incoming,targetLang:'ar'},
    {...incoming,targetLang:undefined},{...incoming,translatedText:'x'.repeat(12001)}])
    assert.equal(isIncomingCallCaption(call,payload,'me'),false);
  assert.equal(isIncomingCallCaption({...call,status:'ended'},incoming,'me'),false);
  assert.equal(isIncomingCallCaption({...call,langpretationEnabled:false},incoming,'me'),false);
});
test('captions reach only the authenticated speaker’s other call participant',()=>{
  const session={callId:call.id,status:'connected',participants:['me','other']};
  const result=buildPeerCallCaption(session,'other','ar','ak',
    {transcript:'Original Arabic',translatedTranscript:'Akwaaba.'},'Caller');
  assert.equal(result?.recipientId,'me');
  assert.equal(isIncomingCallCaption(call,result?.payload,'me'),true);
  assert.equal(isIncomingCallCaption(call,result?.payload,'other'),false);
  const reverse=buildPeerCallCaption(session,'me','ak','ar',
    {transcript:'Original Twi',translatedTranscript:'مرحباً'});
  assert.equal(reverse?.recipientId,'other');
  assert.equal(isIncomingCallCaption(call,reverse?.payload,'other'),true);
});
test('ended, foreign, group, duplicate-member and malformed caption deliveries are rejected',()=>{
  const caption={transcript:'Original',translatedTranscript:'Translated'};
  const session={callId:call.id,status:'connected',participants:['me','other']};
  assert.equal(buildPeerCallCaption(session,'outsider','ar','ak',caption),null);
  for(const changed of [{status:'ended'},{participants:['me']},{participants:['me','me']},
    {participants:['me','other','third']}])
    assert.equal(buildPeerCallCaption({...session,...changed},'me','ar','ak',caption),null);
  for(const [source,target] of [['ar','ar'],['xx','ak'],['ar','xx']])
    assert.equal(buildPeerCallCaption(session,'me',source,target,caption),null);
  for(const changed of [{transcript:''},{translatedTranscript:''},{translatedTranscript:'x'.repeat(12001)}])
    assert.equal(buildPeerCallCaption(session,'me','ar','ak',{...caption,...changed}),null);
});
test('completion of local speech preserves the incoming transcript',()=>{
  const source=readFileSync('src/context/NanivioContext.tsx','utf8');
  const outgoing=source.slice(source.indexOf('// Outgoing results are spoken'),source.indexOf('// Same-language calls retain'));
  assert.match(outgoing,/if\(speakerId===currentUser\.id\)return/);
  assert.ok(outgoing.indexOf('speakerId===currentUser.id')<outgoing.indexOf('currentTranscript:'));
});
