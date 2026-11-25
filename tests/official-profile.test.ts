import test from 'node:test';
import assert from 'node:assert/strict';
import {
  OfficialProfileError, readOfficialProfile, resetOfficialProfileCache, saveOfficialProfile, validateOfficialProfile,
} from '../src/server/officialProfile';

function fakeDb(row: Record<string, string> | null, failWrite = false) {
  const writes: unknown[] = [];
  const db: any = {
    from: () => ({
      select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: row, error: null }) }) }),
      upsert: async (value: unknown) => { writes.push(value); return { error: failWrite ? { message: 'missing' } : null }; },
    }),
  };
  return { db, writes };
}

test('valid details are trimmed and the QR choice defaults to the official design', () => {
  const profile = validateOfficialProfile({ address: ' Accra, Ghana ', email: 'hi@naniviio.com', phone: '+233 20 000 0000' });
  assert.equal(profile.address, 'Accra, Ghana');
  assert.equal(profile.qrMode, 'official');
  assert.equal(validateOfficialProfile({ qrMode: 'join' }).qrMode, 'join');
});

test('invalid details are rejected', () => {
  for (const input of [
    { email: 'not-an-email' }, { phone: 'call me' }, { website: 'http://naniviio.com' },
    { address: 'x'.repeat(301) }, { qrMode: 'other' }, { whatsapp: 'https://evil.example/' }, { email: 5 },
  ]) assert.throws(() => validateOfficialProfile(input), OfficialProfileError);
});

test('saved details are read back and a failed write explains the missing migration', async () => {
  resetOfficialProfileCache();
  const empty = fakeDb(null);
  assert.equal((await readOfficialProfile(empty.db)).address, '');
  const saved = fakeDb(null);
  const profile = await saveOfficialProfile({ address: 'Accra', qrMode: 'join' }, 'admin-1', saved.db);
  assert.equal(profile.qrMode, 'join');
  assert.equal((saved.writes[0] as any).updated_by, 'admin-1');
  assert.equal((await readOfficialProfile(empty.db)).address, 'Accra');
  resetOfficialProfileCache();
  await assert.rejects(saveOfficialProfile({}, 'admin-1', fakeDb(null, true).db), /036_nanivio_official_profile/);
  const stored = fakeDb({ address: 'Kumasi', email: '', phone: '', whatsapp: '', website: '', qr_mode: 'join' });
  assert.deepEqual(await readOfficialProfile(stored.db), {
    address: 'Kumasi', email: '', phone: '', whatsapp: '', website: '', qrMode: 'join',
  });
});
