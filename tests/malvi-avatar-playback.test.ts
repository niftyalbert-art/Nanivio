import assert from 'node:assert/strict';
import test from 'node:test';
import { malviAvatarSoundBlocked, playMalviAvatar } from '../src/lib/malviAvatarPlayback.ts';

function video(muted = false, volume = 1) {
  return { muted, volume, paused: true, play: async function () { this.paused = false; } };
}

test('silent SDK fallback is blocked even when video play resolves successfully', async () => {
  const element = video(true);
  await assert.rejects(playMalviAvatar(element), /Enable sound/);
  assert.equal(element.paused, false);
  assert.equal(malviAvatarSoundBlocked(element), true);
});

test('Enable sound restores volume and unmutes within the user gesture before playback', async () => {
  const element = video(true, 0);
  let calls = 0;
  element.play = async () => {
    calls++;
    assert.equal(element.muted, false);
    assert.equal(element.volume, 1);
    element.paused = false;
  };
  await playMalviAvatar(element, true);
  assert.equal(calls, 1);
  assert.equal(malviAvatarSoundBlocked(element), false);
});

test('autoplay rejection remains visible and cannot be marked as audible', async () => {
  const element = video();
  element.play = async () => { throw new DOMException('blocked', 'NotAllowedError'); };
  await assert.rejects(playMalviAvatar(element, true), /blocked/);
  assert.equal(malviAvatarSoundBlocked(element), true);
});

test('zero volume, paused video and late SDK muting are detected', async () => {
  const element = video(false, 0);
  await assert.rejects(playMalviAvatar(element), /Enable sound/);
  await playMalviAvatar(element, true);
  element.muted = true;
  assert.equal(malviAvatarSoundBlocked(element), true);
  element.muted = false;
  element.paused = true;
  assert.equal(malviAvatarSoundBlocked(element), true);
});
