import test from 'node:test';
import assert from 'node:assert/strict';
import { buildLangpretationReadiness } from '../src/shared/langpretationReadiness.ts';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import { getLanguageCapability } from '../src/lib/translator-engine/matrix/universal18Matrix.ts';
import { supportsPalabraPair } from '../src/shared/palabraLanguages.ts';

const available = { active: () => true, speech: () => true, translation: () => true };

test('readiness covers all 324 unique directed combinations without claiming live verification', () => {
  const report = buildLangpretationReadiness(available);
  assert.equal(report.total, 324);
  assert.equal(new Set(report.pairs.map(p => `${p.source}:${p.target}`)).size, 324);
  assert.equal(report.sameLanguage, 18);
  assert.equal(report.crossLanguage, 306);
  assert.equal(report.liveVerified, 0);
  assert.ok(report.pairs.every(p => p.liveVerified === false));
  assert.equal(report.blocked, 34, 'distinct Akuapem MT is not silently replaced with generic Twi');
  assert.ok(report.pairs.filter(p => !p.configured).every(p => p.source === 'tw-ak' || p.target === 'tw-ak'));
});

test('same-language calls need no speech or translation provider', () => {
  const report = buildLangpretationReadiness({ active: () => true, speech: () => false, translation: () => false });
  assert.equal(report.configured, 18);
  assert.ok(report.pairs.filter(p => p.configured).every(p => p.sameLanguage));
});

test('recognition and synthesis are checked independently in both directions', () => {
  const report = buildLangpretationReadiness({
    ...available, speech: (language, operation) => !(language === 'en' && operation === 'asr') && !(language === 'fr' && operation === 'tts'),
  });
  const pair = (source: string, target: string) => report.pairs.find(p => p.source === source && p.target === target)!;
  assert.deepEqual(pair('en', 'fr').blockers.map(b => b.stage), ['recognition', 'speech']);
  assert.equal(pair('fr', 'en').configured, true);
  assert.equal(pair('ak', 'fr').blockers[0].stage, 'speech');
  assert.equal(pair('en', 'ak').blockers[0].stage, 'recognition');
});

test('every missing pivot leg is reported rather than marked configured', () => {
  const report = buildLangpretationReadiness({ ...available, translation: () => false });
  const pair = report.pairs.find(p => p.source === 'ak' && p.target === 'lg')!;
  assert.equal(pair.blockers.length, 2);
  assert.match(pair.blockers[0].reason, /ak → en/);
  assert.match(pair.blockers[1].reason, /en → lg/);
});

test('disabled languages block inbound, outbound and same-language calls', () => {
  const report = buildLangpretationReadiness({ ...available, active: code => code !== 'en' });
  assert.ok(report.pairs.filter(p => p.source === 'en' || p.target === 'en').every(p => p.blockers.some(b => b.stage === 'language')));
});

// Exercise the actual handler with isolated configuration, not customer data.
const server = ts.createSourceFile('server.ts', readFileSync(new URL('../server.ts', import.meta.url), 'utf8'), ts.ScriptTarget.Latest, true);
let route: ts.CallExpression | undefined;
function visit(node: ts.Node) {
  if (ts.isCallExpression(node) && node.arguments.length > 0 && ts.isStringLiteral(node.arguments[0]) &&
      node.arguments[0].text === '/api/langpretation/admin/readiness') route = node;
  ts.forEachChild(node, visit);
}
visit(server);

async function requestReadiness(options: { rows?: { code: string; active: boolean }[]; error?: boolean } = {}) {
  assert.ok(route);
  const context = vm.createContext({
    buildLangpretationReadiness, getLanguageCapability,
    serverLanguageOverrides: new Map(),
    normalizedBillingEnabled: () => true,
    getServerSupabase: () => ({ from: () => ({ select: async () => ({
      data: options.rows || [], error: options.error ? { message: 'database fixture unavailable' } : null,
    }) }) }),
    speechConfigured: () => false,
    translationProviderConfigured: () => false,
    supportsPalabraPair,
    palabraConfigured: () => false,
  });
  const handler = vm.runInContext(ts.transpile(`(${route.arguments.at(-1)!.getText(server)})`, {
    target: ts.ScriptTarget.ES2022,
  }), context);
  const response = {
    code: 200, body: null as any,
    status(code: number) { this.code = code; return this; },
    json(body: any) { this.body = body; return this; },
  };
  await handler({}, response);
  return response;
}

test('readiness endpoint requires administrator authorization', () => {
  assert.ok(route);
  assert.equal(route.arguments[1].getText(server), 'requireAdmin');
});

test('actual handler honors saved language disabling and returns all 324 directions', async () => {
  const response = await requestReadiness({ rows: [{ code: 'en', active: false }] });
  assert.equal(response.code, 200);
  assert.equal(response.body.report.total, 324);
  assert.ok(response.body.report.pairs.filter((p: any) => p.source === 'en' || p.target === 'en')
    .every((p: any) => p.blockers.some((b: any) => b.stage === 'language')));
});

test('readiness does not show stale or default success if saved settings cannot be loaded', async () => {
  const response = await requestReadiness({ error: true });
  assert.equal(response.code, 503);
  assert.equal(response.body.success, false);
  assert.equal(response.body.report, undefined);
});
