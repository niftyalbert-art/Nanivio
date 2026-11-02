import React from 'react';
import test from 'node:test';
import assert from 'node:assert/strict';
import { renderToStaticMarkup } from 'react-dom/server';
import { MalviAllowanceNotice } from '../src/components/malvi/MalviAllowanceNotice.tsx';
const render = (seconds: number | null, unavailable = false) =>
  renderToStaticMarkup(<MalviAllowanceNotice remainingSeconds={seconds} unavailable={unavailable} onViewPlans={() => {}} />);

test('shows actual time separately from the idle timer without unnecessary prompts', () => {
  const html = render(180);
  assert.match(html, /Malvi time left/);
  assert.match(html, /03:00/);
  assert.doesNotMatch(html, /role="alert"|role="status"|<button/);
  assert.match(html, /aria-label="Malvi time remaining" aria-live="off"/);
});
test('warns politely at one minute and urgently at thirty seconds', () => {
  assert.match(render(60), /role="status" aria-live="polite"/);
  assert.match(render(60), /One minute or less/);
  assert.match(render(30), /role="alert" aria-live="assertive"/);
  assert.match(render(30), /30 seconds or less/);
  assert.match(render(1), /End &amp; view plans/);
  assert.match(render(0), /Malvi time used up/);
  assert.doesNotMatch(render(61), /<button|role="alert"|role="status"/);
});
test('unknown time is never shown as an exhausted or invented balance', () => {
  assert.match(render(null), /Checking remaining time/);
  assert.doesNotMatch(render(null), /00:00|used up|<button/);
  const unavailable = render(null, true);
  assert.match(unavailable, /Remaining time unavailable/);
  assert.match(unavailable, /End &amp; view plans/);
  assert.doesNotMatch(unavailable, /00:00|used up/);
});
