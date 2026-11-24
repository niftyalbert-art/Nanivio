import { readFile } from 'node:fs/promises';

// Follow the real entry's CSS order: index.css alone is not the app's theme.
// This helper only reads public development styles, never account information.
export async function loadPresentationStyles(origin) {
  const entry = await readFile(new URL('../../src/main.tsx', import.meta.url), 'utf8');
  const imports = [...entry.matchAll(/import\s+['"](\.[^'"]+\.css)['"]/g)].map(match => match[1]);
  if (!imports.length) throw new Error('No presentation styles found in the app entry.');
  const styles = await Promise.all(imports.map(async path => {
    const url = new URL(`/src/${path.replace(/^\.\//, '')}?direct`, origin);
    const response = await fetch(url);
    if (!response.ok) throw new Error(`Presentation stylesheet unavailable: ${url.pathname} (${response.status})`);
    return `/* Entry stylesheet: ${path} */\n${await response.text()}`;
  }));
  return styles.join('\n');
}
