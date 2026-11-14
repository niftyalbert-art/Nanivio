import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { readFileSync } from 'node:fs';
import express from 'express';
import http from 'node:http';
import { createCallStartupTracing, CALL_STARTUP_TRACE_VERSION } from '../src/server/callStartupTrace';

function fixture(t: any, extra: Record<string, any> = {}) {
  let time = 0;
  const logs: any[] = [];
  const trace = createCallStartupTracing({
    now: () => time, newId: () => '11111111-1111-4111-8111-111111111111',
    log: record => logs.push(record), ...extra,
  });
  const response: any = new EventEmitter();
  response.statusCode = 200;
  response.headers = {};
  response.setHeader = (key: string, value: string) => { response.headers[key] = value; };
  t.after(() => response.emit('close'));
  return { trace, logs, response, advance: (ms: number) => { time += ms; } };
}
const invoke = (handler: any, response: any, next = () => {}) => handler({
  body: { password: 'must-not-log', channelName: 'private-channel', email: 'private-email' },
  headers: { authorization: 'private-bearer', cookie: 'private-cookie',
    'x-nanivio-call-trace': 'untrusted-correlation' },
  url: '/api/agora/join?token=private-query',
  authUser: { id: 'private-account' },
}, response, next);

test('tracing records authentication and registration without changing the response', t => {
  const f = fixture(t);
  let next = 0;
  invoke(f.trace.begin('join'), f.response, () => next++);
  f.advance(910); invoke(f.trace.authenticated, f.response, () => next++);
  f.advance(12); f.response.emit('finish'); f.response.emit('close');
  assert.equal(next, 2);
  assert.deepEqual(f.logs.map(r => r.event), ['received', 'phase', 'finished']);
  assert.equal(f.logs[1].phase, 'authentication');
  assert.equal(f.logs[1].phaseElapsedMs, 910);
  assert.equal(f.logs[1].nextPhase, 'registration');
  assert.equal(f.logs[2].phaseElapsedMs, 12);
  assert.equal(f.logs[2].elapsedMs, 922);
  assert.equal(f.logs[2].status, 200);
  assert.equal(f.response.headers['X-Nanivio-Call-Trace-Version'], CALL_STARTUP_TRACE_VERSION);
  assert.equal(f.response.listenerCount('finish') + f.response.listenerCount('close'), 0);
});

test('token phases retain separate authentication, allowance and signing timings', t => {
  const f = fixture(t);
  invoke(f.trace.begin('token'), f.response);
  f.advance(300); invoke(f.trace.authenticated, f.response);
  f.advance(2); f.trace.phase(f.response, 'allowance');
  f.advance(400); f.trace.phase(f.response, 'signing');
  f.advance(1); f.response.emit('finish');
  assert.deepEqual(f.logs.filter(r => r.event === 'phase').map(r => [r.phase, r.nextPhase, r.phaseElapsedMs]), [
    ['authentication', 'authorization', 300], ['authorization', 'allowance', 2],
    ['allowance', 'signing', 400],
  ]);
  assert.equal(f.logs.at(-1).elapsedMs, 703);
});

test('a slow request identifies its current phase without cancelling or retrying it', t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const f = fixture(t);
  let next = 0;
  invoke(f.trace.begin('join'), f.response, () => next++);
  f.advance(5000); t.mock.timers.tick(5000);
  assert.equal(next, 1);
  assert.equal(f.logs.at(-1).event, 'slow');
  assert.equal(f.logs.at(-1).phase, 'authentication');
  f.advance(1200); invoke(f.trace.authenticated, f.response);
  f.response.emit('finish');
  assert.equal(f.logs.at(-1).elapsedMs, 6200);
  t.mock.timers.tick(60000);
  assert.equal(f.logs.filter(r => r.event === 'slow').length, 1);
});

test('disconnect is not reported as HTTP success and later phase marks are ignored', t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const f = fixture(t);
  invoke(f.trace.begin('join'), f.response);
  f.advance(1200); f.response.emit('close');
  invoke(f.trace.authenticated, f.response);
  f.response.emit('finish'); t.mock.timers.tick(60000);
  assert.deepEqual(f.logs.map(r => r.event), ['received', 'disconnected']);
  assert.equal('status' in f.logs.at(-1), false);
});

test('completed requests remove the watchdog and concurrent requests keep separate states', t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const a = fixture(t), b = fixture(t);
  invoke(a.trace.begin('token'), a.response); invoke(a.trace.begin('join'), b.response);
  a.response.emit('finish'); a.advance(5000); t.mock.timers.tick(5000);
  assert.deepEqual(a.logs.filter(r => r.event === 'slow').map(r => r.operation), ['join']);
});

test('records exclude credentials, identities and body data, including spoofed trace IDs', t => {
  const f = fixture(t);
  invoke(f.trace.begin('join'), f.response);
  f.trace.phase(f.response, 'private-channel' as any);
  f.response.emit('finish');
  const serialized = JSON.stringify([f.logs, f.response.headers]);
  for (const secret of ['must-not-log', 'private-', 'untrusted-correlation']) assert.equal(serialized.includes(secret), false);
  assert.equal(f.logs[0].traceId, '11111111-1111-4111-8111-111111111111');
});

test('diagnostic logger and header failures never prevent the existing middleware chain', t => {
  const f = fixture(t, { log() { throw new Error('diagnostic failure'); } });
  f.response.setHeader = () => { throw new Error('headers unavailable'); };
  let next = 0;
  assert.doesNotThrow(() => invoke(f.trace.begin('join'), f.response, () => next++));
  assert.doesNotThrow(() => invoke(f.trace.authenticated, f.response, () => next++));
  assert.doesNotThrow(() => f.response.emit('finish'));
  assert.equal(next, 2);
});

test('tracing initialization failure never prevents authentication', t => {
  const f = fixture(t, { newId() { throw new Error('diagnostic failure'); } });
  let next = 0;
  invoke(f.trace.begin('join'), f.response, () => next++);
  assert.equal(next, 1); assert.equal(f.logs.length, 0);
});

test('real HTTP authentication denial still prevents registration and exposes only generated trace headers', async t => {
  const logs: any[] = [], trace = createCallStartupTracing({ log: record => logs.push(record) });
  const app = express(); app.use(express.json()); let handlerCalls = 0;
  app.post('/api/agora/join', trace.begin('join'), (_req, res) => {
    res.status(401).json({ success: false, code: 'AUTH_REQUIRED' });
  }, trace.authenticated, (_req, res) => { handlerCalls++; res.json({ success: true }); });
  const server = http.createServer(app);
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise<void>(resolve => server.close(() => resolve())));
  const address = server.address() as any;
  const response = await fetch(`http://127.0.0.1:${address.port}/api/agora/join`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Nanivio-Call-Trace': 'spoofed' },
    body: JSON.stringify({ channelName: 'private-channel' }),
  });
  assert.equal(response.status, 401); assert.equal(handlerCalls, 0);
  assert.deepEqual(await response.json(), { success: false, code: 'AUTH_REQUIRED' });
  assert.match(response.headers.get('X-Nanivio-Call-Trace')!, /^[a-f0-9-]{36}$/);
  assert.equal(response.headers.get('X-Nanivio-Call-Trace-Version'), CALL_STARTUP_TRACE_VERSION);
  assert.equal(logs.at(-1).phase, 'authentication'); assert.equal(logs.at(-1).status, 401);
});

test('the application keeps authentication ahead of both token and registration handlers', () => {
  const server = readFileSync('server.ts', 'utf8');
  for (const operation of ['join', 'token']) assert.ok(server.includes(
    `app.post("/api/agora/${operation}", callStartupTracing.begin('${operation}'), requireAuthenticatedUser, callStartupTracing.authenticated,`,
  ));
});
