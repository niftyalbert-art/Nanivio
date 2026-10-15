import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { test } from 'node:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { NanivioCelebrationVideoEffect } from '../src/components/common/NanivioCelebrationVideoEffect';

const componentSource = readFileSync(
  new URL('../src/components/common/NanivioCelebrationVideoEffect.tsx', import.meta.url), 'utf8',
);
const appSource = readFileSync(new URL('../src/App.tsx', import.meta.url), 'utf8');

for (const mode of ['signin', 'signup'] as const) {
  test(`${mode} uses the uploaded signature with sound and no skip or volume controls`, () => {
    const html = renderToStaticMarkup(React.createElement(NanivioCelebrationVideoEffect, {
      mode, onComplete: () => assert.fail('Rendering must not complete authentication'),
    }));
    assert.match(html, /<video/);
    assert.match(html, /7fa9a39190244f62ad3b118c4449b4fe_1792033302425\.mp4/);
    assert.match(html, /autoPlay=""/i);
    assert.doesNotMatch(html, /muted=""|controls=""/i);
    assert.match(html, /playsInline=""/i);
    assert.match(html, /object-contain/);
    assert.doesNotMatch(html, /Skip video|Turn video sound on|Mute video sound|<button/);
    assert.match(html, mode === 'signup' ? /account was created successfully/ : /signed in successfully/);
    assert.doesNotMatch(html, /<canvas|loop=/);
  });
}

test('the real clip is present and the old fixed-duration imitation is removed', () => {
  assert.ok(existsSync(new URL(
    '../attached_assets/7fa9a39190244f62ad3b118c4449b4fe_1792033302425.mp4', import.meta.url,
  )));
  assert.doesNotMatch(componentSource, /setTimeout|requestAnimationFrame|cinematicAudio/);
  assert.match(componentSource, /onEnded=\{complete\}/);
  assert.match(componentSource, /completedRef\.current/);
  assert.doesNotMatch(appSource, /autoCloseDuration/);
  assert.doesNotMatch(appSource, /OpeningAnimation|showIntro|nanivio_intro_seen/);
  assert.match(appSource, /isAuthenticated && activeCelebrationEffect\?\.show/);
  assert.doesNotMatch(componentSource, /Escape|setMuted|VolumeX|Volume2/);
  assert.match(componentSource, /video\.muted = false/);
  assert.match(componentSource, /video\.volume = 1/);
});
