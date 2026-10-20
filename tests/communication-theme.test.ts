import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { transform } from 'esbuild';

const css = readFileSync(new URL('../src/index.css', import.meta.url), 'utf8');
const scope = css.match(/\.nv-theme-dark,\s*\.nanivio-auth\s*\{([^}]+)\}/)?.[1] || '';
const token = (name: string) => scope.match(new RegExp(`--nv-${name}:\\s*(#[a-f\\d]{6})`, 'i'))?.[1] || '';
function luminance(hex: string) {
  assert.match(hex, /^#[a-f\d]{6}$/i);
  return [1, 3, 5].map(index => {
    const n = parseInt(hex.slice(index, index + 2), 16) / 255;
    return n <= 0.04045 ? n / 12.92 : ((n + 0.055) / 1.055) ** 2.4;
  }).reduce((sum, n, index) => sum + n * [0.2126, 0.7152, 0.0722][index], 0);
}
const contrast = (a: string, b: string) =>
  (Math.max(luminance(a), luminance(b)) + 0.05) / (Math.min(luminance(a), luminance(b)) + 0.05);

test('charcoal/gold tokens are scoped to communication and auth rather than all routes', () => {
  assert.ok(scope);
  assert.ok(luminance(token('bg')) < 0.03);
  assert.match(token('gold'), /^#[a-f\d]{6}$/i);
  assert.doesNotMatch(css, /--color-emerald-\d+\s*:/);
});

test('Malvi remains outside the new theme without modifying its route or implementation', () => {
  const app = readFileSync(new URL('../src/App.tsx', import.meta.url), 'utf8');
  assert.match(app, /activeTab === 'malvi' \? '' : 'nv-theme-dark'/);
  assert.match(app, /activeTab === 'malvi' && <MalviView/);
});

test('normal text, muted labels, and primary action palette meet readable contrast', () => {
  assert.ok(contrast(token('text'), token('surface')) >= 7);
  assert.ok(contrast(token('muted'), token('surface')) >= 4.5);
  assert.ok(contrast(token('gold'), token('bg')) >= 7);
});

test('success, destructive, and gold actions remain distinct', () => {
  assert.notEqual(token('gold'), token('success'));
  assert.notEqual(token('gold'), token('danger'));
  assert.notEqual(token('success'), token('danger'));
  assert.match(css, /#toggle-global-langpretation/);
  assert.match(css, /\.chat-send-button/);
});

test('focused controls and blur removal stay scoped to the new theme', () => {
  assert.match(css, /\.nv-theme-dark[^{}]*focus-visible/);
  assert.match(css, /\.nanivio-auth[^{}]*blur-3xl[^{}]*\{\s*display:\s*none !important/);
  assert.match(css, /env\(safe-area-inset-bottom\)/);
});

test('theme stylesheet parses as production CSS', async () => {
  const result = await transform(css, { loader: 'css', minify: true });
  assert.equal(result.warnings.filter(warning => warning.id === 'css-syntax-error').length, 0);
});
