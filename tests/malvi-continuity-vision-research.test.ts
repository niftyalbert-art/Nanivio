import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
import { conversationMemoryContext, memoryQuery, readConversationMemory } from '../src/server/assistant/conversationMemory.ts';
import express from 'express';
import { registerAssistantRoutes } from '../src/server/assistant/routes.ts';
import { malviGreetingInstruction } from '../src/server/assistant/malviSystemPrompt.ts';
import { validateVisionInput } from '../src/server/assistant/visionInput.ts';
import { claimResearch, parseGroundedResearch, researchPublicWeb, safeResearchUrl, validateWebQuery } from '../src/server/assistant/webResearch.ts';
import { parseMalviReferenceCitations } from '../src/lib/malviLiveClient.ts';
import { GeminiNativeVoice } from '../src/server/assistant/geminiNativeVoice.ts';

test('real SQL archive enforces opt-in, account isolation, idempotency and revocation generations', async () => {
  const db = new PGlite();
  try {
    await db.exec(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
      CREATE TABLE public.nanivio_users(id TEXT PRIMARY KEY);
      INSERT INTO public.nanivio_users VALUES('a'),('b');`);
    await db.exec(await fs.readFile('migrations/011_malvi_conversation_memory.sql','utf8'));
    const append = (owner: string, generation: number, text: string, key = text) =>
      db.query<{ok:boolean}>('SELECT nanivio_append_malvi_memory($1,$2,$3::jsonb) AS ok',
        [owner,generation,JSON.stringify([{key,role:'user',text}])]);
    assert.equal((await append('a',0,'no consent')).rows[0].ok,false);
    await db.query('SELECT nanivio_set_malvi_memory($1,true)', ['a']);
    assert.equal((await append('a',1,'Remember the blue bicycle')).rows[0].ok,true);
    await append('a',1,'Remember the blue bicycle');
    assert.equal((await db.query('SELECT * FROM nanivio_malvi_messages')).rows.length,1);
    assert.equal((await db.query('SELECT * FROM nanivio_malvi_messages WHERE user_id=$1',['b'])).rows.length,0);
    await db.query('SELECT nanivio_set_malvi_memory($1,false)', ['a']);
    assert.equal((await append('a',1,'late revoked write')).rows[0].ok,false);
    await db.query('SELECT nanivio_set_malvi_memory($1,true)', ['a']);
    assert.equal((await append('a',1,'late write after re-enable')).rows[0].ok,false);
    assert.equal((await append('a',3,'older astronomy topic')).rows[0].ok,true);
    assert.equal((await db.query("SELECT text FROM nanivio_malvi_messages WHERE user_id='a' AND to_tsvector('simple',text) @@ websearch_to_tsquery('simple','astronomy')")).rows.length,1);
    // Delete cannot affect another account and tombstones all delayed writes.
    await db.query('SELECT nanivio_set_malvi_memory($1,true)', ['b']);
    await append('b',1,'B private history');
    await db.query('SELECT nanivio_set_malvi_memory($1,false,true)', ['a']);
    assert.equal((await append('a',3,'late after delete')).rows[0].ok,false);
    assert.equal((await db.query("SELECT * FROM nanivio_malvi_messages WHERE user_id='a'")).rows.length,0);
    assert.equal((await db.query("SELECT * FROM nanivio_malvi_messages WHERE user_id='b'")).rows.length,1);
    const grants = await db.query<{allowed:boolean}>(`SELECT has_table_privilege('authenticated','nanivio_malvi_messages','SELECT') AS allowed`);
    assert.equal(grants.rows[0].allowed,false);
    const rpc = await db.query<{allowed:boolean}>(`SELECT has_function_privilege('anon','nanivio_set_malvi_memory(text,boolean,boolean)','EXECUTE') AS allowed`);
    assert.equal(rpc.rows[0].allowed,false);
  } finally { await db.close(); }
});

test('returning sessions ask to continue without introducing themselves again', () => {
  assert.match(malviGreetingInstruction('en',true), /continue their previous conversation/);
  assert.doesNotMatch(malviGreetingInstruction('en',true), /Hello, I'm Malvi/);
  assert.match(malviGreetingInstruction('fr',true), /French/);
  assert.match(malviGreetingInstruction('en'), /Hello, I'm Malvi/);
});

test('memory context is bounded and explicitly untrusted; disabled memory is absent', () => {
  const state = { enabled: true, generation: 1, hasPrevious: true,
    messages: Array.from({length:24},(_,i) => ({ id:String(i),role:'user' as const,text:'x'.repeat(12000),created_at:'2026-10-24' })) };
  assert.ok(conversationMemoryContext(state).length < 26000);
  assert.match(conversationMemoryContext(state), /untrusted quoted data/);
  assert.equal(conversationMemoryContext({...state,enabled:false}),'');
  assert.throws(() => memoryQuery('x'.repeat(181)), /180/);
});

test('repository always scopes both consent and message queries to the authenticated owner', async () => {
  const calls: any[] = [];
  let enabled = true;
  const db = { from(table: string) {
    const call: any = {table}; calls.push(call);
    const chain: any = {
      select: () => chain, eq: (column: string,value: string) => {call[column]=value;return chain;},
      abortSignal: () => chain, order: () => chain,
      textSearch: (_column: string,value: string) => {call.query=value;return chain;},
      maybeSingle: async () => ({data:{enabled,generation:4},error:null}),
      limit: () => chain,
      then: (resolve: any) => Promise.resolve({data:[{id:'1',role:'user',text:'own topic',created_at:'2026-10-24'}],error:null}).then(resolve),
    };
    return chain;
  }};
  const result = await readConversationMemory('owner-a','topic',db as any);
  assert.equal(result.hasPrevious,true);
  assert.deepEqual(calls.map(c=>c.user_id),['owner-a','owner-a']);
  assert.equal(calls[1].query,'topic');
  enabled = false; calls.length = 0;
  assert.equal((await readConversationMemory('owner-b','',db as any)).messages.length,0);
  assert.equal(calls.length,1);
});

test('memory, snapshot and research HTTP APIs reject unauthenticated requests before provider/database work', async () => {
  const app = express(); app.use(express.json());
  registerAssistantRoutes(app,(_req,res)=>{res.status(401).json({success:false});},()=>true,false);
  const server = app.listen(0,'127.0.0.1');
  await new Promise<void>(resolve=>server.once('listening',resolve));
  try {
    const port = (server.address() as any).port;
    for (const [method,path] of [['GET','memory'],['PUT','memory'],['DELETE','memory'],['POST','research'],['POST','session/11111111-1111-4111-8111-111111111111/vision']]) {
      const response = await fetch(`http://127.0.0.1:${port}/api/assistant/${path}`,{method});
      assert.equal(response.status,401);
      assert.equal(response.headers.get('set-cookie'),null);
    }
  } finally { await new Promise<void>(resolve=>server.close(()=>resolve())); }
});

test('vision requires explicit consent, bounded real JPEG/PNG signature, never external URLs', () => {
  const image = Buffer.from([0xff,0xd8,0xff,0xe0,0,1]).toString('base64');
  assert.throws(() => validateVisionInput({image}), /Tap Share/);
  assert.equal(validateVisionInput({consent:true,image}).mimeType,'image/jpeg');
  assert.throws(() => validateVisionInput({consent:true,image:'https://example.com/a.jpg'}), /valid JPEG/);
  assert.throws(() => validateVisionInput({consent:true,image:Buffer.from('<script>bad</script>').toString('base64')}), /JPEG/);
  assert.throws(() => validateVisionInput({consent:true,image:'a'.repeat(700001)}), /512/);
});

test('web queries exclude obvious personal contact data and credentials', () => {
  assert.deepEqual(validateWebQuery({query:'Ghana renewable energy news',scope:'web'}),{query:'Ghana renewable energy news',scope:'web'});
  assert.equal(validateWebQuery({query:'public NASA posts',scope:'public-social'}).scope,'public-social');
  for (const query of ['someone@example.com','api_key: abc123','call +233 123456789']) {
    assert.throws(() => validateWebQuery({query,scope:'web'}), /account details/);
  }
});

test('grounding must contain real citation metadata; a model assertion is not proof', () => {
  assert.equal(parseGroundedResearch({text:'I searched the web and know everything'}).verified,false);
  assert.equal(parseGroundedResearch({text:'Fake',candidates:[{groundingMetadata:{groundingChunks:[{web:{uri:'https://example.com',title:'Example'}}]}}]}).verified,false);
  const response = parseGroundedResearch({text:'A public claim.',candidates:[{groundingMetadata:{
    webSearchQueries:['public example'],
    groundingChunks:[{web:{uri:'https://example.com/source',title:'Primary source'}}],
    groundingSupports:[{segment:{text:'A public claim.'},groundingChunkIndices:[0]}],
    searchEntryPoint:{renderedContent:'<div>Google suggestions</div>'},
  }}]});
  assert.equal(response.verified,true);
  assert.deepEqual(response.citations[0].urls,['https://example.com/source']);
  assert.equal(parseMalviReferenceCitations(response.results).length,1);
  for (const url of ['javascript:alert(1)','http://example.com','https://localhost/x','https://127.0.0.1/x','https://x:pass@example.com']) assert.equal(safeResearchUrl(url),null);
  assert.equal(parseMalviReferenceCitations([{source:'Web',title:'bad',url:'https://127.0.0.1',caveat:''}]).length,0);
});

test('public research uses a bounded grounded request, not private conversations or arbitrary fetches', async () => {
  let request: any;
  await researchPublicWeb({query:'NASA latest public mission',scope:'public-social'}, async options => {
    request = options; return {text:'No sources returned'};
  });
  assert.deepEqual(request.config.tools,[{googleSearch:{}}]);
  assert.match(request.contents,/publicly indexed social-media/);
  assert.equal(request.config.httpOptions.timeout,12000);
  assert.equal(request.config.maxOutputTokens,1800);
  for(let i=0;i<4;i++) claimResearch('test-research-owner',1000);
  assert.throws(()=>claimResearch('test-research-owner',1000), /four public research/);
  assert.doesNotThrow(()=>claimResearch('test-research-owner',61001));
});

test('native speech releases after 400 ms rather than waiting for a complete answer', () => {
  const voice = new GeminiNativeVoice();
  voice.append(Buffer.alloc(20160).toString('base64'),'audio/pcm;rate=24000');
  assert.equal(voice.ready('Hello'),true);
  assert.equal(voice.ready(''),false);
  const output = voice.finish('Hello',false);
  assert.ok(output && output.speechDurationMs >= 400 && output.speechDurationMs < 500);
});
