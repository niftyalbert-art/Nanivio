import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const manifest = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
const lock = JSON.parse(readFileSync(new URL('../package-lock.json', import.meta.url), 'utf8'));

function assertPortableDownloads(packages) {
  for (const [path, entry] of Object.entries(packages)) {
    if (!entry.resolved) continue;
    const url = new URL(entry.resolved);
    assert.equal(url.protocol, 'https:', `${path}: dependency downloads must use HTTPS`);
    assert.equal(url.hostname, 'registry.npmjs.org', `${path}: use public npm tarball URLs, not workspace-only hosts`);
    assert.ok(!url.username && !url.password, `${path}: dependency URLs must not contain credentials`);
    assert.match(entry.integrity ?? '', /^sha(?:1|256|384|512)-[A-Za-z0-9+/]+={0,2}$/, `${path}: preserve the download integrity checksum`);
  }
}

test('committed lockfile uses portable, integrity-checked public npm downloads', () => {
  assert.ok(Object.values(lock.packages).some(entry => entry.resolved), 'The lockfile must contain resolved packages');
  assertPortableDownloads(lock.packages);
});

test('portability guard rejects workspace-only package download URLs', () => {
  assert.throws(() => assertPortableDownloads({
    'node_modules/example': {
      resolved: 'https://package-firewall.replit.internal/npm/example/-/example-1.0.0.tgz',
      integrity: 'sha512-AA==',
    },
  }), /public npm tarball URLs/);
});

test('portability guard rejects plaintext package downloads', () => {
  assert.throws(() => assertPortableDownloads({
    'node_modules/example': {
      resolved: 'http://registry.npmjs.org/example/-/example-1.0.0.tgz',
      integrity: 'sha512-AA==',
    },
  }), /HTTPS/);
});

test('lockfile dependency declarations match the package manifest', () => {
  assert.deepEqual(lock.packages[''].dependencies, manifest.dependencies);
  assert.deepEqual(lock.packages[''].devDependencies, manifest.devDependencies);
});

test('Render build checks portability before installing the locked build dependencies', () => {
  assert.equal(
    manifest.scripts['render-build'],
    'npm run test:dependencies && npm ci --include=dev && npm run build',
  );
});
