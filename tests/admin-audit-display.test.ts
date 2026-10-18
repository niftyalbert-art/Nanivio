import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { formatAdminAuditDetails } from '../src/lib/adminAuditDisplay';

test('audit bootstrap metadata reproduces the React crash and now renders as readable text', () => {
  const details = { message: 'Nanivio authentication initialized from deployment configuration.' };
  assert.throws(
    () => renderToStaticMarkup(React.createElement('td', null, details as any)),
    /Objects are not valid as a React child/,
  );
  const html = renderToStaticMarkup(React.createElement('td', null, formatAdminAuditDetails(details)));
  assert.ok(html.includes(details.message));
  assert.doesNotMatch(html, /\[object Object\]/);
});

test('structured audit metadata preserves nested fields and safely escapes markup', () => {
  const details = {
    message: '<script>untrusted markup</script>',
    previousStatus: 'ACTIVE',
    newStatus: 'SUSPENDED',
    context: { reason: 'Review required', flags: ['a', 'b'] },
  };
  const text = formatAdminAuditDetails(details);
  assert.deepEqual(JSON.parse(text), details);
  const html = renderToStaticMarkup(React.createElement('td', null, text));
  assert.ok(html.includes('&lt;script&gt;'));
  assert.doesNotMatch(html, /<script>/);
});

test('legacy strings, nulls, arrays, zero, false and malformed details cannot become object children', () => {
  assert.equal(formatAdminAuditDetails('Legacy audit message'), 'Legacy audit message');
  assert.equal(formatAdminAuditDetails(0), '0');
  assert.equal(formatAdminAuditDetails(false), 'false');
  const circular: any = {};
  circular.self = circular;
  for (const input of [null, undefined, {}, ['a', { value: 1 }], circular, () => {}, Symbol('invalid')]) {
    const text = formatAdminAuditDetails(input);
    assert.equal(typeof text, 'string');
    assert.doesNotThrow(() => renderToStaticMarkup(React.createElement('td', null, text)));
  }
});

test('audit table uses the formatter and passes the limit before its search and action filters', () => {
  const source = readFileSync(new URL('../src/components/admin/AdminAuditTrail.tsx', import.meta.url), 'utf8');
  assert.match(source, /\{formatAdminAuditDetails\(log\.details\)\}/);
  assert.doesNotMatch(source, /\{log\.details\}/);
  assert.match(source, /fetchAdminAuditLogs\(\s*100,\s*searchTargetNvId \|\| undefined,\s*selectedActionType/);
  assert.match(source, /log\.adminName \|\| log\.adminNvId/);
});
