import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {build} from 'esbuild';
import vm from 'node:vm';
import ts from 'typescript';
import {ChatSendError} from '../src/lib/chatSendFeedback.ts';

test('actual chat recorder target follows the recipient rather than a fixed Twi default',()=>{
  const source=ts.createSourceFile('ChatView.tsx',readFileSync('src/components/chat/ChatView.tsx','utf8'),ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);
  let expression='';
  function visit(node:ts.Node){
    if(ts.isJsxSelfClosingElement(node)&&node.tagName.getText(source)==='VoiceNoteRecorder'){
      const attr=node.attributes.properties.find(p=>ts.isJsxAttribute(p)&&p.name.getText(source)==='targetLang') as ts.JsxAttribute;
      assert.ok(attr?.initializer&&ts.isJsxExpression(attr.initializer));
      expression=(attr.initializer as ts.JsxExpression).expression!.getText(source);
    }
    ts.forEachChild(node,visit);
  }
  visit(source);assert.ok(expression);
  for(const [sender,target] of [['en','ak'],['ak','en'],['en','fr']]){
    assert.equal(vm.runInNewContext(expression,{
      currentUser:{id:'self'},activeConv:{participants:[{id:'self',myLanguage:sender},{id:'other',myLanguage:target}]},
    }),target);
  }
});

// Exercise the real recorder handlers with isolated hooks and an already
// prepared recording. No microphone, paid speech calls, or real accounts.
const bundle=await build({
  entryPoints:['src/components/chat/VoiceNoteRecorder.tsx'],bundle:true,write:false,platform:'browser',format:'cjs',
  tsconfigRaw:{compilerOptions:{jsx:'react'}},
  plugins:[{name:'isolated-recorder',setup(builder){
    builder.onResolve({filter:/^react$/},()=>({path:'react',namespace:'fixture'}));
    builder.onResolve({filter:/^lucide-react$/},()=>({path:'icons',namespace:'fixture'}));
    builder.onResolve({filter:/NanivioContext$/},()=>({path:'context',namespace:'fixture'}));
    builder.onResolve({filter:/chatSendFeedback$/},()=>({path:'feedback',namespace:'fixture'}));
    builder.onLoad({filter:/.*/,namespace:'fixture'},({path})=>({loader:'js',contents:
      path==='react'?`
        export function useState(initial){const i=hooks.cursor++;if(!(i in hooks.values))hooks.values[i]=typeof initial==='function'?initial():initial;
          return [hooks.values[i],v=>{hooks.values[i]=typeof v==='function'?v(hooks.values[i]):v}];}
        export function useRef(value){const i=hooks.cursor++;return hooks.values[i]??(hooks.values[i]={current:value});}
        export function useEffect(){}
        export default {createElement:(type,props,...children)=>({type,props:props||{},children})};`
      :path==='icons'?'export const Mic=()=>null,Square=Mic,Trash2=Mic,Send=Mic,Radio=Mic,Sparkles=Mic,Volume2=Mic;'
      :path==='feedback'?'export const ChatSendError=globalThis.TestChatSendError;export const chatSendFeedback=e=>e.code==="unconfirmed"?"Delivery is not confirmed yet. Your draft is still here.":"Chat is temporarily unavailable. Your draft is still here.";'
      :'export const useNanivio=()=>({myLanguage:"en",globalLangpretationEnabled:true});',
    }));
  }}],
});
function recorder(send:(payload:any)=>Promise<void>){
  const prepared={duration:2,transcript:'fixture',audioBlobUrl:'blob:original',isLangpretation:true,
    translatedAudioUrl:'blob:translated',translatedTranscript:'fixture translation',sourceLang:'en',targetLang:'ak'};
  const hooks={cursor:0,values:{5:prepared} as Record<number,any>};
  const context=vm.createContext({module:{exports:{}},hooks,TestChatSendError:ChatSendError,console,URL,
    fetch:()=>{throw new Error('Retry must not regenerate speech.');}});
  vm.runInContext(bundle.outputFiles[0].text,context);
  function render(){hooks.cursor=0;return (context.module as any).exports.VoiceNoteRecorder({targetLang:'ak',onSend:send,onCancel(){}});}
  function find(node:any,predicate:(n:any)=>boolean):any{
    if(!node)return;if(Array.isArray(node)){for(const item of node){const hit=find(item,predicate);if(hit)return hit;}return;}
    if(predicate(node))return node;return find(node.children,predicate);
  }
  const sendButton=()=>find(render(),n=>n.type==='button'&&n.props.onClick?.name==='handleFinish');
  return {prepared,hooks,render,sendButton,find};
}
test('failed delivery keeps prepared original and translated audio; retry sends the same recording without speech calls',async()=>{
  const sent:any[]=[];
  const f=recorder(async payload=>{sent.push(payload);if(sent.length===1)throw new ChatSendError('unavailable');});
  await f.sendButton().props.onClick();
  assert.equal(f.hooks.values[5],f.prepared);
  assert.match(JSON.stringify(f.render()),/Your recording is kept here/);
  await f.sendButton().props.onClick();
  assert.equal(sent.length,2);assert.equal(sent[0],sent[1]);
  assert.equal(f.hooks.values[5],null);
});
test('unconfirmed delivery keeps the recording but blocks retries that could duplicate a saved message',async()=>{
  let calls=0;
  const f=recorder(async()=>{calls++;throw new ChatSendError('unconfirmed');});
  await f.sendButton().props.onClick();
  assert.equal(f.sendButton().props.disabled,true);
  await f.sendButton().props.onClick();
  assert.equal(calls,1);assert.equal(f.hooks.values[5],f.prepared);
});
test('a pending upload/send cannot be started twice',async()=>{
  let complete!:()=>void,calls=0;
  const f=recorder(()=>{calls++;return new Promise<void>(resolve=>{complete=resolve;});});
  const first=f.sendButton().props.onClick();
  await f.sendButton().props.onClick();
  assert.equal(calls,1);
  complete();await first;
});
