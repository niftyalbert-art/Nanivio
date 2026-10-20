import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { validateChatUpload, privateMessageMedia, MAX_CHAT_UPLOAD_BYTES } from '../src/server/chatAttachments.ts';
import { uploadStreamAttachment, addStreamMessage } from '../src/server/streamService.ts';

test('validates photos, videos and documents; browser MIME omission has an explicit allowlist', () => {
  for (const [name, type] of [['photo.jpg', 'image/jpeg'], ['clip.mp4', 'video/mp4'], ['report.pdf', 'application/pdf'], ['voice.m4a', 'audio/mp4']]) {
    assert.deepEqual(validateChatUpload(Buffer.from('fixture'), name, type), { name, type });
  }
  assert.equal(validateChatUpload(Buffer.from('fixture'), 'report.docx', 'application/octet-stream').type,
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
});

test('rejects empty, oversized, executable, HTML/SVG and mismatched file types', () => {
  for (const [name, type] of [['page.html', 'text/html'], ['script.js', 'application/octet-stream'],
    ['picture.svg', 'image/svg+xml'], ['photo.jpg', 'video/mp4'], ['program.exe', 'application/pdf']]) {
    assert.throws(() => validateChatUpload(Buffer.from('fixture'), name, type));
  }
  assert.throws(() => validateChatUpload(Buffer.alloc(0), 'file.pdf', 'application/pdf'));
  assert.throws(() => validateChatUpload(Buffer.alloc(MAX_CHAT_UPLOAD_BYTES + 1), 'clip.mp4', 'video/mp4'));
  assert.equal(validateChatUpload(Buffer.from('fixture'), '../a\n.pdf', 'application/pdf').name, '.._a_.pdf');
});

test('does not persist device-local URLs, fake filenames, script URLs or arbitrary client properties', () => {
  for (const url of ['blob:device-only', 'data:image/png;base64,AA==', '#', 'javascript:alert(1)', 'http://example.com/file']) {
    assert.throws(() => privateMessageMedia({ mediaType: 'image', mediaUrl: url }));
  }
  const result = privateMessageMedia({ mediaType: 'video', mediaUrl: 'https://cdn.example/real.mp4',
    mediaFileName: 'real.mp4', status: 'read', senderId: 'forged', secret: 'never-persist' });
  assert.equal(result.mediaType, 'video');
  assert.equal(result.mediaUrl, 'https://cdn.example/real.mp4');
  assert.equal('senderId' in result, false);
  assert.equal('secret' in result, false);
});

test('voice notes preserve durable original/translated recordings without fake waveform values', () => {
  const result = privateMessageMedia({ isVoiceNote: true, voiceNote: { id: 'vn_test', duration: 4,
    audioBlobUrl: 'https://cdn.example/voice.webm', translatedAudioUrl: 'https://cdn.example/translated.wav',
    hasLangpretation: true, transcript: 'original', translatedTranscript: 'translated' } });
  assert.equal(result.isVoiceNote, true);
  assert.equal(result.voiceNote?.audioBlobUrl, 'https://cdn.example/voice.webm');
  assert.equal(result.voiceNote?.hasLangpretation, true);
  assert.deepEqual(result.voiceNote?.waveform, []);
  assert.throws(() => privateMessageMedia({ isVoiceNote: true, voiceNote: { audioBlobUrl: 'blob:device' } }));
});

test('actual Stream upload checks membership first and transmits selected file bytes as multipart', async t => {
  // Isolated test credentials, never a real provider key or connection.
  process.env.STREAM_API_KEY = 'fixture-key'; process.env.STREAM_API_SECRET = 'fixture-secret';
  process.env.STREAM_API_BASE_URL = 'https://provider.invalid';
  const original = globalThis.fetch;
  t.after(() => { globalThis.fetch = original; });
  const calls: string[] = [];
  globalThis.fetch = async (url, options) => {
    calls.push(String(url));
    if (String(url).includes('/members?')) {
      return Response.json({ members: [{ user_id: 'actor', user: { id: 'actor', name: 'Actor' } }] });
    }
    assert.match(String(url), /\/channels\/messaging\/private_channel\/file\?api_key=/);
    assert.ok(options?.body instanceof FormData);
    const form = options.body as FormData;
    const file = form.get('file') as File;
    assert.equal(file.name, 'report.pdf');
    assert.equal(await file.text(), 'selected file bytes');
    assert.equal(form.get('user'), JSON.stringify({ id: 'actor' }));
    return Response.json({ file: 'https://cdn.example/uploaded-report.pdf' });
  };
  assert.equal(await uploadStreamAttachment('private_channel', 'actor', Buffer.from('selected file bytes'), 'report.pdf', 'application/pdf'),
    'https://cdn.example/uploaded-report.pdf');
  assert.equal(calls.length, 2);
});

test('nonmembers cannot upload and provider rejections cannot masquerade as successful transfers', async t => {
  const original = globalThis.fetch; t.after(() => { globalThis.fetch = original; });
  let uploads = 0;
  globalThis.fetch = async url => {
    if (String(url).includes('/members?')) return Response.json({ members: [] });
    uploads++; return Response.json({ file: 'https://cdn.example/forbidden.pdf' });
  };
  await assert.rejects(uploadStreamAttachment('private_channel', 'outsider', Buffer.from('fixture'), 'a.pdf', 'application/pdf'));
  assert.equal(uploads, 0);
  globalThis.fetch = async url => String(url).includes('/members?')
    ? Response.json({ members: [{ user_id: 'actor' }] })
    : Response.json({ error: 'provider payload must not escape' }, { status: 503 });
  await assert.rejects(uploadStreamAttachment('private_channel', 'actor', Buffer.from('fixture'), 'a.pdf', 'application/pdf'),
    error => error instanceof Error && error.message === 'Attachment upload failed. Please retry.');
});

test('application upload route requires authentication and active-account policy before binary parsing', () => {
  const source = readFileSync(new URL('../server.ts', import.meta.url), 'utf8');
  assert.match(source, /app\.post\("\/api\/stream\/channels\/:channelId\/attachments", requireAuthenticatedUser, requireActiveChatAccount,\s*express\.raw/);
  assert.match(source, /express\.raw\(\{ type: 'application\/octet-stream', limit: '20mb' \}\)/);
  const realtime = readFileSync(new URL('../src/server/realtimeServer.ts', import.meta.url), 'utf8');
  assert.match(realtime, /const nanivio = privateMessageMedia\(message\)/);
  assert.match(realtime, /attachments, nanivio, isVoiceNote/);
});

test('real message persistence uses provider asset fields and restores refreshed attachment URLs', async t => {
  const original = globalThis.fetch; t.after(() => { globalThis.fetch = original; });
  globalThis.fetch = async (url, options) => {
    if (String(url).includes('/members?')) return Response.json({ members: [{ user_id: 'actor' }] });
    const body = JSON.parse(String(options?.body));
    assert.equal(body.message.attachments[0].asset_url, 'https://cdn.example/original.mp4');
    return Response.json({ message: { ...body.message, id: 'persisted-message', user: { id: 'actor', name: 'Actor' },
      attachments: [{ ...body.message.attachments[0], asset_url: 'https://cdn.example/refreshed.mp4' }] } });
  };
  const saved = await addStreamMessage('private_channel', {
    id: 'client-message', channelId: 'private_channel', userId: 'actor', userName: 'Actor',
    text: 'Video', createdAt: 1, reactions: [],
    nanivio: privateMessageMedia({ mediaType: 'video', mediaUrl: 'https://cdn.example/original.mp4' }),
    attachments: [{ type: 'file', url: 'https://cdn.example/original.mp4', name: 'video.mp4' }],
  });
  assert.equal(saved.id, 'persisted-message');
  assert.equal(saved.nanivio?.mediaType, 'video');
  assert.equal(saved.nanivio?.mediaUrl, 'https://cdn.example/refreshed.mp4');
});

test('attachment and camera interfaces have no sample gallery or simulated captures', () => {
  for (const name of ['MediaAttachmentModal', 'LiveCameraModal']) {
    const source = readFileSync(new URL(`../src/components/chat/${name}.tsx`, import.meta.url), 'utf8');
    assert.doesNotMatch(source, /PRESET_|unsplash|mixkit|isSimulated|setEffectiveTier|url: '#'/);
    assert.match(source, /await onSendMedia/);
    assert.match(source, /role="alert"/);
  }
});
