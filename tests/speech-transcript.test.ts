import test from 'node:test';
import assert from 'node:assert/strict';
import {usableSpeechTranscript} from '../src/shared/speechTranscript.ts';

test('empty, oversized and unbroken model repetition loops are not usable speech',()=>{
  for(const text of [null,undefined,{},'', '   ','a'.repeat(12001),
    'habari jili jilin'+'om'.repeat(150),'0'+'nan'.repeat(100),
    'lannu'+'lannu'.repeat(100),'あ'.repeat(128)]){
    assert.equal(usableSpeechTranscript(text),false);
  }
});
test('normal repeated words, unfamiliar dialects and short numeric replies remain valid',()=>{
  for(const text of ['0','Maakye. Wo ho te sɛn?','Sannu.','Oli otya?',
    'No, no, no. Please wait.', 'no '.repeat(200),'Habari.','哈哈！'.repeat(80),
    'Tomorrow at 9:30.','Meda wo ase.']){
    assert.equal(usableSpeechTranscript(text),true);
  }
});
