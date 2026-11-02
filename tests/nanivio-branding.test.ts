import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { NanivioLogo } from '../src/components/common/NanivioLogo.tsx';

test('all logo sizes use the actual official artwork without a replacement SVG', () => {
  for (const size of ['sm', 'md', 'lg', 'xl'] as const) {
    const html = renderToStaticMarkup(React.createElement(NanivioLogo, { size, compact: true }));
    assert.match(html, /src="\/brand\/nanivio-emblem\.png"/);
    assert.doesNotMatch(html, /<svg|hue-rotate|grayscale|drop-shadow/);
    assert.match(html, /alt="Nanivio"/);
  }
});

test('official branding preserves the wordmark and optional tagline', () => {
  const html = renderToStaticMarkup(React.createElement(NanivioLogo, { showTagline: true }));
  assert.match(html, /alt=""/);
  assert.match(html.replace(/<[^>]+>/g, ''), /NANIVIO/);
  assert.match(html, /CONNECT/);
});

test('official PNG assets exist at the requested icon dimensions', () => {
  for (const [name, size] of [
    ['nanivio-emblem.png', 512], ['nanivio-icon-192.png', 192],
    ['nanivio-icon-512.png', 512], ['nanivio-maskable-512.png', 512],
    ['nanivio-apple-touch.png', 180], ['nanivio-favicon-32.png', 32],
  ] as const) {
    const png = readFileSync(`public/brand/${name}`);
    assert.equal(png.subarray(1, 4).toString(), 'PNG');
    assert.equal(png.readUInt32BE(16), size);
    assert.equal(png.readUInt32BE(20), size);
  }
});

test('browser and installed-app declarations use new official asset URLs', () => {
  const html = readFileSync('index.html', 'utf8');
  const config = readFileSync('vite.config.ts', 'utf8');
  for (const path of ['/brand/nanivio-favicon-32.png', '/brand/nanivio-favicon.ico', '/brand/nanivio-apple-touch.png']) {
    assert.ok(html.includes(path));
    assert.ok(existsSync(`public${path}`));
  }
  for (const path of ['/brand/nanivio-icon-192.png', '/brand/nanivio-icon-512.png', '/brand/nanivio-maskable-512.png']) {
    assert.ok(config.includes(path));
  }
  assert.doesNotMatch(config, /icon\.svg/);
});

test('legacy PNG and ICO icon URLs serve the official replacements too', () => {
  for (const [legacy, official] of [
    ['apple-touch-icon.png', 'nanivio-apple-touch.png'],
    ['pwa-192x192.png', 'nanivio-icon-192.png'],
    ['pwa-512x512.png', 'nanivio-icon-512.png'],
    ['pwa-maskable-512x512.png', 'nanivio-maskable-512.png'],
    ['favicon.ico', 'nanivio-favicon.ico'],
  ]) {
    assert.ok(readFileSync(`public/${legacy}`).equals(readFileSync(`public/brand/${official}`)));
  }
});
