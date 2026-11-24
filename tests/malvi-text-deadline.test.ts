import assert from 'node:assert/strict';
import test from 'node:test';
import http from 'node:http';
import { once } from 'node:events';
import { readFileSync } from 'node:fs';
import { GoogleGenAI } from '@google/genai';
import ts from 'typescript';
import { malviTextRequestOptions, MALVI_TEXT_TIMEOUT_MS } from '../src/server/assistant/textRequestOptions.ts';

async function fixture(status = 200) {
  const requests: { deadline: number; body: any }[] = [];
  const server = http.createServer(async (req, res) => {
    let raw = '';
    for await (const chunk of req) raw += chunk;
    const deadline = Number(req.headers['x-server-timeout']);
    requests.push({ deadline, body: JSON.parse(raw) });
    res.setHeader('Content-Type', 'application/json');
    if (deadline < 10) {
      res.writeHead(400).end(JSON.stringify({ error: { code: 400, status: 'INVALID_ARGUMENT',
        message: `Manually set deadline ${deadline}s is too short. Minimum allowed deadline is 10s.` } }));
    } else if (status !== 200) {
      res.writeHead(status).end(JSON.stringify({ error: {
        code: status, status: 'UNAVAILABLE', message: 'Synthetic upstream failure',
      } }));
    } else {
      res.end(JSON.stringify({ candidates: [{ content: { role: 'model',
        parts: [{ text: '{"reply":"Test noted."}' }] }, finishReason: 'STOP' }] }));
    }
  });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const port = (server.address() as { port: number }).port;
  const client = new GoogleGenAI({ apiKey: 'synthetic-fixture-key',
    httpOptions: { baseUrl: `http://127.0.0.1:${port}`, retryOptions: { attempts: 1 } } });
  return { client, requests, close: async () => {
    server.closeAllConnections();
    await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
  } };
}

test('actual SDK reproduces the invalid old deadline and accepts the corrected request', async () => {
  const api = await fixture();
  try {
    await assert.rejects(api.client.models.generateContent({
      model: 'gemini-3.8-flash', contents: 'Synthetic fixture only.',
      config: { httpOptions: { timeout: 8000, retryOptions: { attempts: 1 } } },
    }), /Minimum allowed deadline is 10s/);
    assert.equal(api.requests[0].deadline, 8);
    const response = await api.client.models.generateContent({
      model: 'gemini-3.8-flash', contents: 'Synthetic fixture only.',
      config: { responseMimeType: 'application/json', ...malviTextRequestOptions() },
    });
    assert.equal(JSON.parse(response.text || '{}').reply, 'Test noted.');
    assert.equal(api.requests.length, 2);
    assert.equal(api.requests[1].deadline, 15);
    assert.equal(api.requests[1].body.generationConfig.responseMimeType, 'application/json');
  } finally { await api.close(); }
});

test('upstream failures do not cause hidden retries', async () => {
  const api = await fixture(503);
  try {
    await assert.rejects(api.client.models.generateContent({
      model: 'gemini-3.8-flash', contents: 'Synthetic fixture only.',
      config: malviTextRequestOptions(),
    }), /Synthetic upstream failure/);
    assert.equal(api.requests.length, 1);
  } finally { await api.close(); }
});

test('each dispatch gets a fresh bounded cancellation signal', () => {
  const first = malviTextRequestOptions(), second = malviTextRequestOptions();
  assert.ok(MALVI_TEXT_TIMEOUT_MS >= 10_000 && MALVI_TEXT_TIMEOUT_MS <= 20_000);
  assert.notEqual(first.abortSignal, second.abortSignal);
  assert.equal(first.abortSignal.aborted, false);
  assert.equal(first.httpOptions.timeout, MALVI_TEXT_TIMEOUT_MS);
  assert.equal(first.httpOptions.retryOptions.attempts, 1);
});

test('both text generation stages use the same valid deadline without the stale race', () => {
  const source = readFileSync('server.ts', 'utf8');
  const parsed = ts.createSourceFile('server.ts', source, ts.ScriptTarget.Latest, true);
  let route = '';
  function visit(node: ts.Node) {
    if (ts.isCallExpression(node) && node.expression.getText(parsed) === 'app.post'
      && ts.isStringLiteral(node.arguments[0]) && node.arguments[0].text === '/api/malvi/chat') {
      route = node.getText(parsed);
    }
    ts.forEachChild(node, visit);
  }
  visit(parsed);
  assert.ok(route);
  assert.equal((route.match(/\.\.\.malviTextRequestOptions\(\)/g) || []).length, 2);
  assert.doesNotMatch(route, /Malvi AI timeout after 8000ms|timeout: 8000/);
});
