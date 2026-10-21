import test from 'node:test';
import assert from 'node:assert/strict';
import { createReferenceSearch, referenceText, validateReferenceRequest } from '../src/server/assistant/referenceSources.ts';
import { createReferenceToolRunner, REFERENCE_TOOL_NAME } from '../src/server/assistant/referenceTools.ts';
import { createGeminiReferenceBridge, createOpenAIReferenceBridge } from '../src/server/assistant/referenceToolBridges.ts';
import { parseMalviReferenceCitations } from '../src/lib/malviLiveClient.ts';

const wikiPage = { query: { pages: [{ title: 'Ghana', extract: 'Ghana is a country in West Africa.' }] } };
const entity = { search: [{ id: 'Q117', label: 'Ghana', description: 'country in West Africa' }] };
const scientificFeed = `<?xml version="1.0"?><feed xmlns="http://www.w3.org/2005/Atom"><entry>
  <id>http://arxiv.org/abs/2401.12345v2</id><title>Gene editing &amp; repair</title>
  <summary>Research on <i>genome</i> repair.</summary><published>2024-01-20T00:00:00Z</published>
</entry></feed>`;
const pubmedXml = `<PubmedArticleSet><PubmedArticle><MedlineCitation><PMID Version="1">123456</PMID>
  <Article><Journal><JournalIssue><PubDate><Year>2025</Year></PubDate></JournalIssue></Journal>
  <ArticleTitle>Editing <i>genes</i> safely</ArticleTitle>
  <Abstract><AbstractText Label="METHODS">A small study of gene editing.</AbstractText><AbstractText Label="RESULTS">Further trials are needed.</AbstractText></Abstract>
  </Article></MedlineCitation></PubmedArticle></PubmedArticleSet>`;

test('reference queries validate groups and reject identifiers, URLs, control characters and oversized input', () => {
  assert.deepEqual(validateReferenceRequest({ query: '  Ghana   history ', group: 'general' }), { query: 'Ghana history', group: 'general' });
  for (const input of [
    null, { query: 'ab', group: 'general' }, { query: 'x'.repeat(181), group: 'both' },
    { query: 'alice@example.com', group: 'general' }, { query: 'https://example.com', group: 'general' },
    { query: 'Ghana\nsecret', group: 'general' }, { query: 'Ghana', group: 'arbitrary' },
  ]) assert.throws(() => validateReferenceRequest(input));
});

test('general reference queries only Wikipedia/Wikidata, with canonical citations and shared in-flight/cache results', async () => {
  const requested: URL[] = [];
  const search = createReferenceSearch(async (input, init) => {
    const url = new URL(String(input));
    requested.push(url);
    assert.equal(init?.redirect, 'error');
    assert.ok(init?.signal);
    return Response.json(url.hostname === 'en.wikipedia.org' ? wikiPage : entity);
  });
  const request = { query: 'Ghana', group: 'general' };
  const [first, second] = await Promise.all([search(request), search(request)]);
  assert.deepEqual(first, second);
  assert.equal(first.results.length, 2);
  assert.deepEqual(first.searched, ['Wikipedia', 'Wikidata']);
  assert.deepEqual(first.unavailable, []);
  assert.equal(first.results[0].url, 'https://en.wikipedia.org/wiki/Ghana');
  assert.equal(first.results[1].url, 'https://www.wikidata.org/wiki/Q117');
  assert.match(first.results[1].caveat, /does not verify/);
  await search({ query: 'GHANA', group: 'general' });
  assert.equal(requested.length, 2);
  assert.deepEqual(requested.map(url => url.hostname).sort(), ['en.wikipedia.org', 'www.wikidata.org']);
});

test('scientific retrieval reads arXiv abstracts and PubMed metadata/abstracts, not full papers or PDFs', async () => {
  const requested: URL[] = [];
  const search = createReferenceSearch(async input => {
    const url = new URL(String(input));
    requested.push(url);
    if (url.hostname === 'export.arxiv.org') return new Response(scientificFeed);
    if (url.pathname.endsWith('esearch.fcgi')) return Response.json({ esearchresult: { idlist: ['123456'] } });
    return new Response(pubmedXml);
  });
  const result = await search({ query: 'gene editing', group: 'scientific' });
  assert.deepEqual(result.searched, ['arXiv', 'PubMed']);
  assert.equal(result.results.length, 2);
  assert.deepEqual(result.unavailable, []);
  assert.equal(result.results[0].url, 'https://arxiv.org/abs/2401.12345v2');
  assert.match(result.results[0].caveat, /preprint/);
  assert.equal(result.results[0].title, 'Gene editing & repair');
  assert.equal(result.results[1].title, 'Editing genes safely');
  assert.match(result.results[1].summary, /Further trials/);
  assert.match(result.results[1].caveat, /not quality endorsement/);
  assert.equal(result.results[1].published, '2025');
  assert.equal(requested.length, 3);
  assert.equal(requested[0].searchParams.get('search_query'), 'all:"gene" AND all:"editing"');
  assert.ok(requested.every(url => url.protocol === 'https:' && !url.pathname.endsWith('.pdf')));
  assert.equal(requested[2].searchParams.get('id'), '123456');
});

test('partial source failures are disclosed without losing successful references or fabricating results', async () => {
  const search = createReferenceSearch(async input => {
    if (new URL(String(input)).hostname === 'www.wikidata.org') return new Response('busy', { status: 429 });
    return Response.json(wikiPage);
  });
  const result = await search({ query: 'Ghana', group: 'general' });
  assert.deepEqual(result.unavailable, ['Wikidata']);
  assert.equal(result.results.length, 1);
  assert.equal(result.results[0].source, 'Wikipedia');
});

test('oversized API responses fail closed and return explicit unavailability', async () => {
  const search = createReferenceSearch(async () => new Response('x'.repeat(520_000)));
  const result = await search({ query: 'Ghana', group: 'general' });
  assert.deepEqual(result.results, []);
  assert.deepEqual(result.unavailable, ['Wikipedia', 'Wikidata']);
});

test('empty results remain empty and cannot be mistaken for confirmed knowledge', async () => {
  const search = createReferenceSearch(async input => Response.json(
    new URL(String(input)).hostname === 'en.wikipedia.org' ? {} : { search: [] },
  ));
  assert.deepEqual((await search({ query: 'nonexistent-topic', group: 'general' })).results, []);
});

test('markup is treated as plain text and citation links cannot redirect the UI to arbitrary hosts or protocols', () => {
  assert.equal(referenceText('<b>Genes</b> &amp; &#x44;NA'), 'Genes & DNA');
  const result = parseMalviReferenceCitations([
    { source: 'Wikipedia', title: 'Valid', url: 'https://en.wikipedia.org/wiki/Ghana', caveat: 'Reference' },
    { source: 'Wikipedia', title: 'Bad', url: 'javascript:alert(1)' },
    { source: 'Wikipedia', title: 'Spoof', url: 'https://en.wikipedia.org.evil.example/wiki/Ghana' },
    { source: 'PubMed', title: 'Wrong host', url: 'https://example.com/' },
  ]);
  assert.equal(result.length, 1);
  assert.equal(result[0].title, 'Valid');
});

test('tool runner blocks other actions, concurrent lookups and late session output', async () => {
  let calls = 0, closed = false;
  let finish!: (value: any) => void;
  const notifications: any[] = [];
  const run = createReferenceToolRunner(payload => notifications.push(payload), () => closed, async () => {
    calls++;
    return new Promise(resolve => { finish = resolve; });
  });
  assert.match((await run('pay', {})).error!, /read-only/);
  const first = run(REFERENCE_TOOL_NAME, { query: 'Ghana', group: 'general' });
  assert.match((await run(REFERENCE_TOOL_NAME, { query: 'Ghana', group: 'general' })).error!, /already running/);
  await run(REFERENCE_TOOL_NAME, { query: 'DNA', group: 'scientific' });
  assert.equal(calls, 1);
  closed = true;
  finish({ results: [], unavailable: [], searched: ['Wikipedia', 'Wikidata'] });
  assert.match((await first).error!, /ended/);
  assert.equal(notifications.length, 1);
  assert.equal(notifications[0].status, 'searching');
});

test('Gemini tool bridge returns matching IDs, suppresses duplicates and respects cancellation', async () => {
  const emitted: any[] = [];
  const bridge = createGeminiReferenceBridge(async () => ({ results: [] }), event => emitted.push(event), () => false);
  const call = { toolCall: { functionCalls: [{ id: 'one', name: REFERENCE_TOOL_NAME, args: { query: 'Ghana', group: 'general' } }] } };
  await bridge(call);
  assert.equal(emitted[0].functionResponses[0].id, 'one');
  assert.equal(emitted[0].functionResponses[0].name, REFERENCE_TOOL_NAME);
  await bridge(call);
  assert.equal(emitted.length, 1);
  await bridge({ toolCallCancellation: { ids: ['two'] } });
  await bridge({ toolCall: { functionCalls: [{ id: 'two', name: REFERENCE_TOOL_NAME, args: {} }] } });
  assert.equal(emitted.length, 1);
});

test('OpenAI bridge accepts only completed function items and returns call_id results before continuation', async () => {
  const emitted: any[] = [], calls: any[] = [];
  const bridge = createOpenAIReferenceBridge(async (name, args) => { calls.push({ name, args }); return { results: [] }; }, event => emitted.push(event), () => false);
  await bridge({ type: 'response.event', event: { type: 'response.function_call_arguments.done', arguments: '{}' } });
  assert.equal(calls.length, 0);
  const event = { type: 'response.event', delegation_id: 'delegation', event: {
    type: 'response.output_item.done', item: { type: 'function_call', call_id: 'call-one', name: REFERENCE_TOOL_NAME, arguments: '{"query":"Ghana","group":"general"}' },
  } };
  await bridge(event);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].args.query, 'Ghana');
  assert.equal(emitted[0].type, 'response.item.create');
  assert.equal(emitted[0].item.type, 'function_call_output');
  assert.equal(emitted[0].item.call_id, 'call-one');
  assert.equal(emitted[1].type, 'response.create');
  await bridge(event);
  assert.equal(calls.length, 1);
});
