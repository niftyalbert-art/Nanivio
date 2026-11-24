import assert from 'node:assert/strict';
import test from 'node:test';
import { once } from 'node:events';
import { readFileSync } from 'node:fs';
import crypto from 'node:crypto';
import express from 'express';
import ts from 'typescript';
import { Type } from '@google/genai';
import { createMalviTextDiagnostics } from '../src/server/assistant/textDiagnostics.ts';
import { safeMalviTextFailure } from '../src/shared/malviTextDiagnostics.ts';
import { MALVI_IDENTITY, MALVI_IDENTITY_PROMPT, MALVI_SHARED_BEHAVIOR_POLICY } from '../src/shared/malviIdentity.ts';
import { MEMORY_TOOL, conversationMemoryContext } from '../src/server/assistant/conversationMemory.ts';
import { WEB_TOOL } from '../src/server/assistant/webResearch.ts';
import { MEDIA_TOOL } from '../src/server/assistant/mediaResearch.ts';
import { MAPS_TOOL } from '../src/server/assistant/mapTools.ts';
import { malviTextRequestOptions } from '../src/server/assistant/textRequestOptions.ts';

test('failure codes and phase timings exclude raw errors and remain stable', async () => {
  let clock = 0;
  const logs: unknown[] = [];
  const trace = createMalviTextDiagnostics({ now: () => clock, log: item => logs.push(item) });
  clock = 2; trace.mark('prepare-context');
  clock = 5; trace.mark('load-memory');
  clock = 7; trace.mark('queue-initial');
  clock = 11;
  const error = Object.assign(new Error('SECRET_KEY SECRET_HISTORY SECRET_URL'), { status: 429 });
  await assert.rejects(trace.generate('provider-initial', async () => { clock = 20; throw error; }));
  const result = trace.fail(error);
  assert.equal(result.code, 'MALVI_TEXT_CAPACITY');
  assert.equal(result.diagnostics.stage, 'provider-initial');
  assert.equal(result.diagnostics.elapsedMs, 20);
  assert.deepEqual(result.diagnostics.stagesMs, {
    validation: 2, 'prepare-context': 3, 'load-memory': 2, 'queue-initial': 4, 'provider-initial': 9,
  });
  assert.equal(result.diagnostics.upstreamStatus, 429);
  assert.equal(trace.fail(new Error('DIFFERENT_SECRET')), result);
  assert.equal(logs.length, 1);
  assert.doesNotMatch(JSON.stringify({ result, logs }), /SECRET|KEY|HISTORY|URL/);
  assert.match(result.reference, /^NVMT-[a-f0-9-]{36}$/);
});

for (const [status, code] of [
  [400, 'MALVI_TEXT_REQUEST_REJECTED'], [401, 'MALVI_TEXT_AUTH'], [403, 'MALVI_TEXT_AUTH'],
  [404, 'MALVI_TEXT_MODEL_UNAVAILABLE'], [408, 'MALVI_TEXT_TIMEOUT'],
  [429, 'MALVI_TEXT_CAPACITY'], [500, 'MALVI_TEXT_UPSTREAM_UNAVAILABLE'],
  [503, 'MALVI_TEXT_UPSTREAM_UNAVAILABLE'], [504, 'MALVI_TEXT_TIMEOUT'],
] as const) test(`provider HTTP ${status} receives its safe diagnostic code`, async () => {
  const trace = createMalviTextDiagnostics({ log: () => {} });
  await assert.rejects(trace.generate('provider-followup', async () => { throw { status, message: 'PRIVATE' }; }));
  const result = trace.fail(null);
  assert.equal(result.code, code);
  assert.equal(result.diagnostics.stage, 'provider-followup');
});

test('current aborts are timeouts but an earlier expired signal cannot mask invalid JSON', async () => {
  for (const abortDuringGeneration of [true, false]) {
    const controller = new AbortController();
    const trace = createMalviTextDiagnostics({ log: () => {},
      requestOptions: () => ({ ...malviTextRequestOptions(), abortSignal: controller.signal }) });
    if (abortDuringGeneration) {
      await assert.rejects(trace.generate('provider-initial', async () => {
        controller.abort(); throw new Error('PRIVATE');
      }));
      assert.equal(trace.fail(null).code, 'MALVI_TEXT_TIMEOUT');
    } else {
      await trace.generate('provider-initial', async () => 'ok');
      controller.abort();
      trace.mark('parse-reply');
      const result = trace.fail(new SyntaxError('PRIVATE MODEL REPLY'));
      assert.equal(result.code, 'MALVI_TEXT_INVALID_REPLY');
      assert.equal(result.diagnostics.stage, 'parse-reply');
    }
  }
});

test('queue, context and logger failures do not expose exceptions', () => {
  const queue = createMalviTextDiagnostics({ log: () => { throw Error('PRIVATE LOGGER'); } });
  queue.mark('queue-initial');
  assert.equal(queue.fail({ code: 'MALVI_INFERENCE_BUSY', status: 503 }).code, 'MALVI_TEXT_QUEUE_BUSY');
  const context = createMalviTextDiagnostics({ log: () => {} });
  context.mark('prepare-context');
  const result = context.fail({ message: 'PRIVATE', get status() { throw Error('PRIVATE'); } });
  assert.equal(result.code, 'MALVI_TEXT_CONTEXT_FAILED');
  assert.doesNotMatch(JSON.stringify(result), /PRIVATE/);
});

test('customer details use known codes and a validated reference only', () => {
  const result = safeMalviTextFailure({ code: 'MALVI_TEXT_TIMEOUT', error: 'PRIVATE',
    message: 'PRIVATE', reference: 'NVMT-00000000-0000-4000-8000-000000000000' });
  assert.equal(result?.code, 'MALVI_TEXT_TIMEOUT');
  assert.ok(result?.reference);
  assert.doesNotMatch(JSON.stringify(result), /PRIVATE/);
  assert.equal(safeMalviTextFailure({ code: '__proto__' }), null);
  assert.equal(safeMalviTextFailure({ code: 'UNKNOWN' }), null);
  assert.equal(safeMalviTextFailure({ code: 'MALVI_TEXT_TIMEOUT', reference: 'PRIVATE' })?.reference, undefined);
});

// Exercise the actual route handler in an isolated Express fixture. Only its
// dependencies are injected; production auth, database and providers are untouched.
function actualHandler(dependencies: Record<string, unknown>) {
  const source = readFileSync('server.ts', 'utf8');
  const file = ts.createSourceFile('server.ts', source, ts.ScriptTarget.Latest, true);
  let handler = '';
  function visit(node: ts.Node) {
    if (ts.isCallExpression(node) && node.expression.getText(file) === 'app.post'
      && ts.isStringLiteral(node.arguments[0]) && node.arguments[0].text === '/api/malvi/chat') {
      handler = node.arguments.at(-1)!.getText(file);
    }
    ts.forEachChild(node, visit);
  }
  visit(file); assert.ok(handler);
  const js = ts.transpileModule(`const handler = ${handler};`, {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None },
  }).outputText;
  return Function(...Object.keys(dependencies), `${js};return handler;`)(...Object.values(dependencies));
}

for (const mode of ['provider', 'timeout', 'queue', 'parse', 'empty', 'context',
  'not-configured', 'success', 'followup', 'followup-failure'] as const) {
  test(`actual text endpoint reports ${mode} safely without real provider calls`, async () => {
    const logs: unknown[] = [], writes: unknown[] = [];
    let calls = 0;
    const ai = { models: { generateContent: async () => {
      calls++;
      if (mode === 'provider') throw Object.assign(new Error('PRIVATE PROVIDER SECRET'), { status: 429 });
      if (mode === 'timeout') throw new DOMException('PRIVATE TIMEOUT', 'TimeoutError');
      if (mode === 'followup-failure' && calls === 2) throw { status: 503, message: 'PRIVATE FOLLOWUP' };
      if (mode === 'parse') return { text: 'PRIVATE INVALID JSON' };
      if (mode === 'empty') return { text: '{}' };
      if (mode.startsWith('followup') && calls === 1) return { functionCalls: [{ name: MEMORY_TOOL.name, args: { query: 'test' } }] };
      return { text: '{"reply":"Fixture answer"}' };
    } } };
    const handler = actualHandler({
      createMalviTextDiagnostics: () => createMalviTextDiagnostics({ log: value => logs.push(value) }),
      getNanivioAppKnowledge: async () => { if (mode === 'context') throw Error('PRIVATE CONTEXT SECRET'); return ''; },
      readConversationMemory: async () => ({ enabled: true, generation: 0, messages: [], hasPrevious: false }),
      authenticatedUserId: () => 'fixture-owner',
      normalizedBillingEnabled: () => false, getPersistentMalviSubscription: async () => null,
      LANGUAGE_NAMES: { en: 'English' }, getAI: () => mode === 'not-configured' ? null : ai,
      adminFeatureSwitches: {}, adminPricingEngine: {}, MALVI_IDENTITY, MALVI_IDENTITY_PROMPT,
      MALVI_SHARED_BEHAVIOR_POLICY, conversationMemoryContext,
      Type, MEMORY_TOOL, WEB_TOOL, MEDIA_TOOL, MAPS_TOOL,
      malviInferenceQueue: { run: async (_tier: unknown, work: () => Promise<unknown>) => {
        if (mode === 'queue') throw { code: 'MALVI_INFERENCE_BUSY', status: 503, message: 'PRIVATE QUEUE' };
        return work();
      } },
      createConversationTools: () => async () => ({ enabled: true, context: '', found: 0 }),
      appendConversationMemory: async (...args: unknown[]) => { writes.push(args); return true; }, crypto,
    });
    const app = express(); app.use(express.json()); app.post('/test', handler);
    const server = app.listen(0, '127.0.0.1'); await once(server, 'listening');
    try {
      const response = await fetch(`http://127.0.0.1:${(server.address() as any).port}/test`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: 'Fixture question', history: [] }),
      });
      const body = await response.json();
      assert.doesNotMatch(JSON.stringify({ body, logs }), /PRIVATE|SECRET/);
      if (mode === 'success' || mode === 'followup') {
        assert.equal(response.status, 200); assert.equal(body.reply, 'Fixture answer');
        assert.equal(logs.length, 0); assert.equal(writes.length, 1);
        assert.equal(calls, mode === 'followup' ? 2 : 1);
      } else {
        const expected = mode === 'provider' ? 'MALVI_TEXT_CAPACITY'
          : mode === 'timeout' ? 'MALVI_TEXT_TIMEOUT'
          : mode === 'queue' ? 'MALVI_TEXT_QUEUE_BUSY'
          : mode === 'followup-failure' ? 'MALVI_TEXT_UPSTREAM_UNAVAILABLE'
          : mode === 'context' ? 'MALVI_TEXT_CONTEXT_FAILED'
            : mode === 'not-configured' ? 'MALVI_TEXT_NOT_CONFIGURED' : 'MALVI_TEXT_INVALID_REPLY';
        assert.equal(body.code, expected);
        assert.equal(logs.length, 1); assert.equal(writes.length, 0);
        assert.equal(body.reference, (logs[0] as any).reference);
        assert.ok(body.diagnostics.stagesMs);
        if (mode === 'followup-failure') assert.equal(body.diagnostics.stage, 'provider-followup');
      }
    } finally {
      server.closeAllConnections();
      await new Promise<void>(resolve => server.close(() => resolve()));
    }
  });
}
