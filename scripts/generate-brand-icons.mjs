import { execFileSync } from 'node:child_process';
import { mkdirSync, copyFileSync, existsSync } from 'node:fs';

// Run manually when the owner supplies a replacement source image.
// Production serves committed assets; it does not require ImageMagick.
const source = process.argv[2];
if (!source || !existsSync(source)) {
  throw new Error('Usage: node scripts/generate-brand-icons.mjs path/to/official-logo.png');
}
mkdirSync('public/brand', { recursive: true });
const image = (...args) => execFileSync('magick', args);
const emblem = 'public/brand/nanivio-emblem.png';
// Normalize first: chat image previews can be smaller than the actual upload.
// Exclude the wordmark/tagline while retaining the entire globe, N and glow.
image(source, '-resize', '1024x1024', '-crop', '640x640+200+60', '+repage',
  '-resize', '512x512', '-depth', '8', '-strip', emblem);
for (const [name, size] of [
  ['nanivio-icon-192.png', '192x192'],
  ['nanivio-icon-512.png', '512x512'],
  ['nanivio-apple-touch.png', '180x180'],
  ['nanivio-favicon-32.png', '32x32'],
]) {
  image(emblem, '-resize', size, '-strip', `public/brand/${name}`);
}
image(emblem, '-resize', '384x384', '-background', '#020617', '-gravity', 'center',
  '-extent', '512x512', '-strip', 'public/brand/nanivio-maskable-512.png');
image(emblem, '-define', 'icon:auto-resize=64,48,32,16', 'public/brand/nanivio-favicon.ico');
for (const [legacy, current] of [
  ['apple-touch-icon.png', 'nanivio-apple-touch.png'],
  ['pwa-192x192.png', 'nanivio-icon-192.png'],
  ['pwa-512x512.png', 'nanivio-icon-512.png'],
  ['pwa-maskable-512x512.png', 'nanivio-maskable-512.png'],
  ['favicon.ico', 'nanivio-favicon.ico'],
]) {
  copyFileSync(`public/brand/${current}`, `public/${legacy}`);
}
console.log('Generated official Nanivio app and browser icons.');
