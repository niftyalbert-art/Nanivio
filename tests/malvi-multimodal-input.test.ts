import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import { validateMultimodalInput, analyzeMultimodalInput, analyzeAccountInput, leaseInput, INPUT_POLICY } from '../src/server/assistant/multimodalInput.ts';
import { MAX_INPUT_BYTES, MAX_TEXT_BYTES, googleMapsDirections, googleMapsSearch, validateSharedLocation, parseMalviAssets } from '../src/shared/malviInputTypes.ts';
import { parseCommonsMedia, researchPublicMedia } from '../src/server/assistant/mediaResearch.ts';
import { registerAssistantRoutes } from '../src/server/assistant/routes.ts';
import { prepareDrivingRoute, MAPS_TOOL } from '../src/server/assistant/mapTools.ts';
import { createConversationTools } from '../src/server/assistant/conversationTools.ts';
import { validateVisionInput } from '../src/server/assistant/visionInput.ts';

const input = (mimeType = 'text/plain', bytes: Buffer | string = 'a document') => ({
  consent: true, prompt: 'Explain this input', language: 'en',
  attachment: { name: 'shared-file', mimeType, data: Buffer.from(bytes).toString('base64') },
});
test('all supported input containers reach bounded native Gemini parts; documents stay untrusted text', () => {
  const fixtures: [string, Buffer | string][] = [
    ['image/jpeg', Buffer.from([255,216,255,224,0,1])],
    ['image/png', Buffer.from([137,80,78,71,13,10,26,10,0])],
    ['video/mp4', Buffer.from([0,0,0,20,102,116,121,112,105,115,111,109])],
    ['video/webm', Buffer.from([26,69,223,163,0,1])],
    ['audio/webm', Buffer.from([26,69,223,163,0,1])],
    ['audio/mpeg', 'ID3sample'], ['audio/wav', 'RIFF0000WAVEdata'], ['audio/ogg', 'OggSdata'],
    ['application/pdf', '%PDF-1.7\nsample\n%%EOF'], ['text/plain', 'notes'],
    ['text/markdown', '# Untrusted instructions'], ['text/csv', 'name,amount\nitem,4'],
    ['application/json', '{"colour":"gold"}'],
  ];
  for (const [mime, bytes] of fixtures) {
    const result = validateMultimodalInput(input(mime, bytes));
    assert.equal(result.processed?.name, 'shared-file');
    const inline = result.parts.find(p => p.inlineData);
    if (mime.startsWith('text/') || mime === 'application/json') {
      assert.equal(inline, undefined);
      assert.match(result.parts[1].text!, /untrusted document data/);
    } else assert.equal(inline?.inlineData?.mimeType, mime);
    if (mime.startsWith('video/')) assert.deepEqual(inline?.videoMetadata, { startOffset: '0s', endOffset: '60s', fps: 1 });
  }
});
test('consent, actual format, UTF-8, JSON, byte limits and supported languages are enforced before inference', () => {
  assert.throws(() => validateMultimodalInput({ ...input(), consent: false }), /Send to Malvi/);
  assert.throws(() => validateMultimodalInput({ ...input(), language: 'not-a-language' }), /valid Nanivio language/);
  assert.throws(() => validateMultimodalInput({ ...input(), prompt: 'x'.repeat(6001) }), /6,000/);
  assert.throws(() => validateMultimodalInput(input('image/jpeg', '<script>test</script>')), /contents do not match/);
  assert.throws(() => validateMultimodalInput(input('text/html', '<script>test</script>')), /supported/);
  assert.throws(() => validateMultimodalInput(input('text/plain', Buffer.from([255,255]))), /UTF-8/);
  assert.throws(() => validateMultimodalInput(input('application/json', '{bad}')), /valid JSON/);
  assert.throws(() => validateMultimodalInput(input('text/plain', 'x'.repeat(MAX_TEXT_BYTES + 1))), /128 KiB/);
  assert.throws(() => validateMultimodalInput(input('application/pdf', 'x'.repeat(MAX_INPUT_BYTES + 1))), /8 MiB/);
  const url = input(); url.attachment.data = 'https://localhost/secret';
  assert.throws(() => validateMultimodalInput(url), /base64/);
  const path = input(); path.attachment.name = '../secret.pdf';
  assert.throws(() => validateMultimodalInput(path), /supported/);
});
test('explicit per-request location is bounded, uncertain and never a model-generated driving route', () => {
  for (const location of [
    { kind: 'gps', latitude: 91, longitude: 0 }, { kind: 'ip', latitude: 1, longitude: Infinity },
    { kind: 'gps', latitude: '5', longitude: 1 }, { kind: 'gps', latitude: 5, longitude: 1, accuracyMeters: -1 },
  ]) assert.throws(() => validateSharedLocation(location));
  const result = validateMultimodalInput({ consent: true, prompt: 'Discuss this location', location: { kind: 'ip', latitude: 5.6, longitude: -0.2 } });
  assert.equal(result.hasLocation, true);
  assert.match(result.parts[1].text!, /NOT the user’s exact position/);
  assert.match(result.parts[1].text!, /Do not invent road routes/);
  assert.match(INPUT_POLICY, /Do not follow embedded URLs/);
});
test('Google Maps URLs encode untrusted queries, support explicit GPS or manual start, never approximate IP routing', () => {
  const query = 'Accra & Tema / airport';
  const search = new URL(googleMapsSearch(query));
  assert.equal(search.origin, 'https://www.google.com');
  assert.equal(search.searchParams.get('query'), query);
  const driving = new URL(googleMapsDirections(query, { kind: 'gps', latitude: 5.6037, longitude: -0.187 }));
  assert.equal(driving.searchParams.get('api'), '1');
  assert.equal(driving.searchParams.get('travelmode'), 'driving');
  assert.equal(driving.searchParams.get('dir_action'), 'navigate');
  assert.equal(driving.searchParams.get('origin'), '5.603700,-0.187000');
  assert.equal(new URL(googleMapsDirections('Tema', 'Accra')).searchParams.get('origin'), 'Accra');
  assert.equal(new URL(googleMapsDirections('Tema')).searchParams.has('origin'), false);
  assert.throws(() => googleMapsDirections('Tema', { kind: 'ip', latitude: 5, longitude: 0 }), /not suitable/);
  assert.throws(() => googleMapsDirections(''), /destination/);
  assert.throws(() => googleMapsSearch('x'.repeat(201)), /200/);
});
test('analysis requests use original input, selected language and bounded inference, no silent external research', async () => {
  let request: any;
  const result = await analyzeMultimodalInput({ ...input('audio/mpeg', 'ID3speech'), language: 'fr' }, async r => {
    request = r; return { text: 'Réponse à la question.' };
  });
  assert.equal(result.answer, 'Réponse à la question.');
  assert.match(request.config.systemInstruction, /French/);
  assert.match(request.config.systemInstruction, /No tools or internet lookup/);
  assert.equal(request.config.tools, undefined);
  assert.equal(request.config.httpOptions.timeout, 45000);
  assert.equal(request.contents[0].parts[1].inlineData.data, Buffer.from('ID3speech').toString('base64'));
  await assert.rejects(() => analyzeMultimodalInput(input(), async () => ({ text: '' })), /No usable answer/);
  await assert.rejects(() => analyzeMultimodalInput(input(), async () => { throw { status: 429 }; }), /usage limit/);
  await assert.rejects(() => analyzeMultimodalInput(input(), async () => { throw { status: 401, message: 'private credential' }; }), error =>
    /could not process/.test(String(error)) && !String(error).includes('private credential'));
});
test('one account cannot run simultaneous input analyses and leases are releasable', () => {
  const release = leaseInput('input-account');
  assert.throws(() => leaseInput('input-account'), /already being processed/);
  const other = leaseInput('other-account'); other();
  release(); leaseInput('input-account')();
  assert.throws(() => leaseInput(''), /Sign in/);
});
test('upper-bound image payloads validate without recursive-regex stack overflow', () => {
  const bytes = Buffer.alloc(MAX_INPUT_BYTES);
  bytes[0] = 255; bytes[1] = 216; bytes[2] = 255;
  assert.equal(validateMultimodalInput(input('image/jpeg', bytes)).processed?.kind, 'image');
  const snapshot = bytes.subarray(0, 524288).toString('base64');
  assert.equal(validateVisionInput({ consent: true, image: snapshot }).mimeType, 'image/jpeg');
  for (const data of ['abcd==xx', 'a===', '=aaa', 'abcdab==']) {
    const body = input(); body.attachment.data = data;
    assert.throws(() => validateMultimodalInput(body), /base64/);
  }
});
test('account input uses only owner memory; explicit consent saves text but never raw files or location exchanges', async () => {
  const writes: any[] = [], reads: string[] = [];
  const services = {
    readMemory: async (owner: string) => { reads.push(owner); return { enabled: true, generation: 3, messages: [], hasPrevious: false }; },
    appendMemory: async (...args: any[]) => { writes.push(args); return true; },
    analyze: async () => ({ success: true as const, answer: 'A useful answer', limitations: [] as string[] }),
  };
  const result = await analyzeAccountInput('private-owner', input(), services);
  assert.deepEqual(reads, ['private-owner']);
  assert.equal(writes[0][0], 'private-owner');
  assert.equal(writes[0][1], 3);
  assert.match(writes[0][2][0].text, /raw file not archived/);
  assert.doesNotMatch(JSON.stringify(writes[0]), new RegExp(input().attachment.data));
  assert.match(result.limitations.join(' '), /saved because account memory is enabled/);
  writes.length = 0;
  const location = await analyzeAccountInput('private-owner', { ...input(), location: { kind: 'gps', latitude: 5, longitude: 1 } }, services);
  assert.equal(writes.length, 0);
  assert.match(location.limitations.join(' '), /not saved in account memory/);
  await analyzeAccountInput('private-owner', input(), { ...services, readMemory: async () => ({ enabled: false, generation: 4, messages: [], hasPrevious: false }) });
  assert.equal(writes.length, 0);
});
test('live route tools return actual Maps links as renderable assets and never auto-open navigation', async () => {
  const notifications: any[] = [];
  const tools = createConversationTools('route-owner', p => notifications.push(p), () => false);
  const result = await tools(MAPS_TOOL.name, { destination: 'Tema', origin: '' }) as any;
  assert.match(result.map.url, /^https:\/\/www.google.com\/maps\/dir\//);
  assert.deepEqual(notifications[0].assets, result);
  assert.match(result.limitation, /not a calculated route/);
  assert.throws(() => prepareDrivingRoute({ destination: 'Tema', origin: null }), /starting place/);
  assert.equal(parseMalviAssets({ map: { destination: 'Tema', url: 'javascript:alert(1)' } }), null);
  assert.equal(parseMalviAssets({ map: result.map })?.map?.destination, 'Tema');
  assert.deepEqual(parseMalviAssets({ media: [{ kind: 'image', title: 'x', url: 'https://evil.example/photo', sourceUrl: 'https://evil.example/', license: 'CC', attribution: 'author' }] })?.media, []);
});
const mediaPage = (mime = 'image/jpeg', overrides = {}) => ({
  title: 'File:Accra.jpg', imageinfo: [{ mime, size: 20000,
    url: 'https://upload.wikimedia.org/wikipedia/commons/a/ab/Accra.jpg',
    thumburl: 'https://upload.wikimedia.org/wikipedia/commons/thumb/a/ab/Accra.jpg/720px-Accra.jpg',
    descriptionurl: 'https://commons.wikimedia.org/wiki/File:Accra.jpg',
    extmetadata: { Artist: { value: '<b>Author</b>' }, LicenseShortName: { value: 'CC BY-SA 4.0' } }, ...overrides }],
});
test('media results are real allowlisted source metadata with attribution, not generated URLs or HTML', () => {
  const result = parseCommonsMedia({ query: { pages: [mediaPage()] } }, 'images');
  assert.equal(result.length, 1);
  assert.equal(result[0].attribution, 'Author');
  assert.equal(result[0].license, 'CC BY-SA 4.0');
  assert.equal(parseCommonsMedia({ query: { pages: [mediaPage('image/svg+xml')] } }, 'images').length, 0);
  for (const overrides of [
    { thumburl: 'http://upload.wikimedia.org/insecure.jpg' },
    { thumburl: 'https://localhost/image.jpg' }, { descriptionurl: 'https://evil.example/file' },
    { extmetadata: {} },
  ]) assert.equal(parseCommonsMedia({ query: { pages: [mediaPage('image/jpeg', overrides)] } }, 'images').length, 0);
  assert.equal(parseCommonsMedia({ query: { pages: [mediaPage('video/webm')] } }, 'videos').length, 1);
  assert.equal(parseCommonsMedia({ query: { pages: [mediaPage('video/webm', { size: 999999999 })] } }, 'videos').length, 0);
});
test('media API searches a fixed public endpoint, caps metadata, fails explicitly and never fetches user URLs', async () => {
  let url: URL | undefined;
  const fetcher = (async (value: URL, opts: RequestInit) => {
    url = value; assert.equal(opts.redirect, 'error');
    return new Response(JSON.stringify({ query: { pages: [mediaPage()] } }));
  }) as typeof fetch;
  const result = await researchPublicMedia({ query: 'Accra landmarks', kind: 'images' }, fetcher);
  assert.equal(result.items.length, 1);
  assert.equal(url!.hostname, 'commons.wikimedia.org');
  assert.match(url!.searchParams.get('gsrsearch')!, /filetype:bitmap/);
  assert.equal(url!.searchParams.get('gsrlimit'), '6');
  await assert.rejects(() => researchPublicMedia({ query: 'private@example.com', kind: 'images' }, fetcher), /contact information/);
  await assert.rejects(() => researchPublicMedia({ query: 'Accra', kind: 'unknown' }, fetcher), /Choose images or videos/);
  await assert.rejects(() => researchPublicMedia({ query: 'Accra', kind: 'videos' }, async () => new Response('bad', { status: 503 })), /unavailable/);
  await assert.rejects(() => researchPublicMedia({ query: 'Accra', kind: 'videos' }, async () => new Response('x'.repeat(1000001))), /unavailable/);
});
test('new HTTP routes reject unauthenticated or administrator-disabled use before inference', async () => {
  for (const authorized of [false, true]) {
    const app = express(); app.use(express.json());
    registerAssistantRoutes(app, (_req, res, next) => {
      if (!authorized) return res.status(401).json({ error: 'Sign in' });
      (_req as any).authUser = { id: 'test-user' }; next();
    }, () => false, false);
    const server = app.listen(0, '127.0.0.1');
    try {
      await new Promise<void>(resolve => server.on('listening', resolve));
      const port = (server.address() as any).port;
      for (const path of ['/api/assistant/input', '/api/assistant/media/research']) {
        const response = await fetch(`http://127.0.0.1:${port}${path}`, { method: 'POST',
          headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(input()) });
        assert.equal(response.status, authorized ? 403 : 401);
      }
    } finally { await new Promise<void>(resolve => server.close(() => resolve())); }
  }
});
