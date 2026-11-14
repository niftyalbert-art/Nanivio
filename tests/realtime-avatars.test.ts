import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { avatarForSignaling, connectedAvatarForSignaling, MAX_SIGNAL_AVATAR_LENGTH } from '../src/server/realtimeAvatars';
import { RealtimeAvatarCache, verifiedDirectoryAvatar } from '../src/lib/realtimeAvatars';

const photo = 'data:image/svg+xml;base64,' + Buffer.from(
  '<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64"><rect width="64" height="64" fill="teal"/><!--'
  + 'p'.repeat(497000) + '--></svg>').toString('base64');
const revision = createHash('sha256').update(photo).digest('hex');
const person = { userId: 'peer', nvId: '0486222222', avatarRevision: revision };
const flush = () => new Promise<void>(resolve => setImmediate(resolve));

function fixture(t: any, limits?: { entries: number; characters: number; concurrent: number }) {
  const pending: Array<{ userId: string; revision: string; signal: AbortSignal;
    resolve: (avatar: string) => void; reject: (error: Error) => void }> = [];
  const loaded: Array<{ userId: string; avatar: string; revision: string }> = [];
  const failed: string[] = [];
  const cache = new RealtimeAvatarCache((request, signal) => new Promise((resolve, reject) => {
    pending.push({ ...request, signal, resolve, reject });
  }), (userId, avatar, revision) => loaded.push({ userId, avatar, revision }), id => failed.push(id), limits);
  cache.reset('viewer');
  t.after(() => cache.reset());
  return { cache, pending, loaded, failed };
}

test('large photos become stable short references without changing the original photo', () => {
  const wire = avatarForSignaling(photo);
  assert.equal(wire.avatar, undefined); assert.equal(wire.avatarRevision, revision);
  assert.ok(JSON.stringify(wire).length < 100);
  assert.equal(connectedAvatarForSignaling({ avatar: photo }).avatarRevision, revision);
  assert.equal(photo.length > 660000, true);
});

test('small photo URLs and absent photos keep their existing representation', () => {
  assert.deepEqual(avatarForSignaling('/photos/profile.png'), { avatar: '/photos/profile.png' });
  assert.deepEqual(avatarForSignaling(), {});
  assert.equal(avatarForSignaling('a'.repeat(MAX_SIGNAL_AVATAR_LENGTH)).avatar?.length, MAX_SIGNAL_AVATAR_LENGTH);
  assert.equal(avatarForSignaling('a'.repeat(MAX_SIGNAL_AVATAR_LENGTH + 1)).avatar, undefined);
});

test('photo hydration returns immediately and coalesces repeated updates', async t => {
  const f = fixture(t);
  assert.equal(f.cache.hydrate(person).avatar, undefined);
  f.cache.hydrate(person); f.cache.hydrate(person);
  await flush(); assert.equal(f.pending.length, 1); assert.equal(f.loaded.length, 0);
  f.pending[0].resolve(photo); await flush();
  assert.equal(f.loaded[0].avatar === photo, true);
  assert.equal(f.cache.hydrate(person).avatar === photo, true);
  await flush(); assert.equal(f.pending.length, 1);
});

test('changing accounts rejects late results even if a loader ignores cancellation', async t => {
  const f = fixture(t); f.cache.hydrate(person); await flush();
  f.cache.reset('other-viewer');
  assert.equal(f.pending[0].signal.aborted, true);
  f.pending[0].resolve(photo); await flush(); assert.equal(f.loaded.length, 0);
  f.cache.hydrate(person); await flush(); assert.equal(f.pending.length, 2);
});

test('signout and stale profile revisions cannot restore a previous photo', async t => {
  const f = fixture(t); f.cache.hydrate(person); await flush();
  const updated = { ...person, avatarRevision: 'b'.repeat(64) };
  f.cache.hydrate(updated); await flush();
  assert.equal(f.pending[0].signal.aborted, true);
  f.pending[0].resolve(photo); await flush(); assert.equal(f.loaded.length, 0);
  f.pending[1].resolve('new-photo'); await flush();
  assert.equal(f.loaded[0].avatar, 'new-photo');
  f.cache.reset(); f.cache.hydrate(person); await flush();
  assert.equal(f.pending.length, 2);
});

test('removing a photo or losing presence cancels its pending read', async t => {
  const f = fixture(t); f.cache.hydrate(person); await flush();
  f.cache.hydrate({ userId: person.userId }); await flush();
  assert.equal(f.pending[0].signal.aborted, true);
  f.pending[0].resolve(photo); await flush(); assert.equal(f.loaded.length, 0);
  f.cache.hydrate(person); await flush(); f.cache.prune(new Set()); await flush();
  assert.equal(f.pending[1].signal.aborted, true);
  f.pending[1].resolve(photo); await flush(); assert.equal(f.loaded.length, 0);
});

test('invalid references do not trigger directory requests', async t => {
  const f = fixture(t);
  f.cache.hydrate({ ...person, avatarRevision: '../untrusted-url' });
  f.cache.hydrate({ ...person, nvId: '' });
  await flush(); assert.equal(f.pending.length, 0);
});

test('photo reads have bounded concurrency and continue after completion', async t => {
  const f = fixture(t);
  for (const userId of ['one', 'two', 'three']) f.cache.hydrate({ ...person, userId });
  await flush(); assert.equal(f.pending.length, 2);
  f.pending[0].resolve(photo); await flush(); assert.equal(f.pending.length, 3);
});

test('failed reads back off instead of retrying on every presence update', async t => {
  const f = fixture(t); let now = Date.now();
  t.mock.method(Date, 'now', () => now);
  f.cache.hydrate(person); await flush(); f.pending[0].reject(Error('fixture failure')); await flush();
  assert.deepEqual(f.failed, ['peer']);
  f.cache.hydrate(person); await flush(); assert.equal(f.pending.length, 1);
  now += 30001; f.cache.hydrate(person); await flush(); assert.equal(f.pending.length, 2);
});

test('stalled photo reads expire without holding every subsequent photo', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const f = fixture(t, { entries: 2, characters: 100, concurrent: 1 });
  f.cache.hydrate(person); f.cache.hydrate({ ...person, userId: 'next' }); await flush();
  assert.equal(f.pending.length, 1);
  t.mock.timers.tick(10001); await flush();
  assert.deepEqual(f.failed, ['peer']);
  assert.equal(f.pending[0].signal.aborted, true); assert.equal(f.pending.length, 2);
  f.pending[0].resolve(photo); await flush(); assert.equal(f.loaded.length, 0);
});

test('detached photo cache is bounded and visible matching photos avoid re-fetching', async t => {
  const f = fixture(t, { entries: 1, characters: 100, concurrent: 2 });
  f.cache.hydrate(person); await flush(); f.pending[0].resolve('first'); await flush();
  const second = { ...person, userId: 'second' };
  f.cache.hydrate(second); await flush(); f.pending[1].resolve('second'); await flush();
  assert.equal(f.cache.hydrate(person, { ...person, avatar: 'first' }).avatar, 'first');
  await flush(); assert.equal(f.pending.length, 2);
  assert.equal(f.cache.hydrate(second).avatar, 'second');
});

test('directory identity and photo fingerprint must match before a photo is accepted', async () => {
  const expected = { userId: 'peer', revision };
  const body = { success: true, user: { id: 'peer', avatar: photo } };
  assert.equal(await verifiedDirectoryAvatar(body, expected) === photo, true);
  await assert.rejects(verifiedDirectoryAvatar({ ...body, user: { id: 'other', avatar: photo } }, expected),
    /PROFILE_PHOTO_UNAVAILABLE/);
  await assert.rejects(verifiedDirectoryAvatar({ success: false }, expected), /PROFILE_PHOTO_UNAVAILABLE/);
  await assert.rejects(verifiedDirectoryAvatar(body, { ...expected, revision: 'c'.repeat(64) }), /PROFILE_PHOTO_CHANGED/);
});
