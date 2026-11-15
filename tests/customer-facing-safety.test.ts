import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { saveUserSettings } from '../src/lib/userSettingsPersistence';
import { INITIAL_USER_SETTINGS } from '../src/data/mockData';

test('settings are only confirmed after a successful server response', async () => {
  const saved = { ...INITIAL_USER_SETTINGS, privacy: { ...INITIAL_USER_SETTINGS.privacy, onlineStatus: 'nobody' as const } };
  const sent: RequestInit[] = [];
  const response = await saveUserSettings(saved, 'browser-session', undefined, async (_path, init) => {
    sent.push(init!);
    return new Response(JSON.stringify({ success: true, settings: saved }), { status: 200 });
  });
  assert.equal(response.privacy.onlineStatus, 'nobody');
  assert.equal(sent[0].method, 'PUT');
  assert.deepEqual(JSON.parse(String(sent[0].body)), saved);
});

test('settings reject HTTP and application failures instead of appearing saved', async () => {
  for (const result of [
    new Response(JSON.stringify({ success: false }), { status: 403 }),
    new Response(JSON.stringify({ success: false }), { status: 200 }),
    new Response(JSON.stringify({ success: true }), { status: 200 }),
  ]) {
    await assert.rejects(
      saveUserSettings(INITIAL_USER_SETTINGS, null, undefined, async () => result),
      /not saved|not confirmed/,
    );
  }
});

test('unconnected driver safety controls cannot claim to dispatch help or share a trip', () => {
  const source = readFileSync('src/components/services/NanivioDrivePartnerApp.tsx', 'utf8');
  assert.doesNotMatch(source, /Emergency SOS Alert Dispatched|Live Trip GPS Tracking Link copied/);
  assert.match(source, /cannot dispatch emergency services/);
  assert.match(source, /Live trip sharing is unavailable/);
});

test('channel chat cannot attach an example PDF', () => {
  const source = readFileSync('src/components/chat/StreamChatInterface.tsx', 'utf8');
  assert.doesNotMatch(source, /Document_Attachment\.pdf|example\.com\/docs\/file\.pdf|attachmentSimulation/);
  assert.match(source, /if \(!inputText\.trim\(\)\) return/);
});
