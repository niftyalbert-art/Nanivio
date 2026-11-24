import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { transform } from 'esbuild';

const css = readFileSync(new URL('../src/index.css', import.meta.url), 'utf8');
const sharedTheme = readFileSync(new URL('../src/styles/app-theme.css', import.meta.url), 'utf8');
const aurora = readFileSync(new URL('../src/styles/nanivio-aurora.css', import.meta.url), 'utf8');
const depth = readFileSync(new URL('../src/styles/reference-depth.css', import.meta.url), 'utf8');
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

test('the shared app palette uses the approved aurora base, violet and cool white', () => {
  assert.ok(scope);
  assert.ok(luminance(token('bg')) < 0.03);
  assert.match(token('gold'), /^#[a-f\d]{6}$/i);
  assert.equal(token('bg'), '#090c18');
  assert.equal(token('gold'), '#c4a3ff');
  assert.equal(token('text'), '#f4f5ff');
  assert.doesNotMatch(css, /--color-emerald-\d+\s*:/);
});

test('every app destination shares the visual shell while retaining the Malvi feature route', () => {
  const app = readFileSync(new URL('../src/App.tsx', import.meta.url), 'utf8');
  assert.match(app, /nanivio-app nv-theme-dark/);
  assert.doesNotMatch(app, /activeTab === 'malvi' \? '' : 'nv-theme-dark'/);
  assert.match(app, /activeTab === 'malvi' && <MalviView/);
});

test('normal text, muted labels, and primary action palette meet readable contrast', () => {
  assert.ok(contrast(token('text'), token('surface')) >= 7);
  assert.ok(contrast(token('muted'), token('surface')) >= 4.5);
  assert.ok(contrast(token('gold'), token('bg')) >= 7);
});

test('success, destructive, and violet actions remain distinct', () => {
  assert.notEqual(token('gold'), token('success'));
  assert.notEqual(token('gold'), token('danger'));
  assert.notEqual(token('success'), token('danger'));
  assert.match(css, /#toggle-global-langpretation/);
  assert.match(css, /\.chat-send-button/);
});

test('focused controls, reduced motion and glass fallbacks stay in the shared theme', () => {
  assert.match(css, /\.nv-theme-dark[^{}]*focus-visible/);
  assert.match(aurora, /prefers-reduced-motion/);
  assert.match(sharedTheme + aurora, /@supports\s+not[^{}]*backdrop-filter/);
  assert.match(css, /env\(safe-area-inset-bottom\)/);
});

test('theme stylesheet parses as production CSS', async () => {
  for (const stylesheet of [css, sharedTheme, depth, aurora]) {
    const result = await transform(stylesheet, { loader: 'css', minify: true });
    assert.equal(result.warnings.filter(warning => warning.id === 'css-syntax-error').length, 0);
  }
});
