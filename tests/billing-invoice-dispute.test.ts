import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import ts from 'typescript';
import { ownsBillingRecord } from '../src/server/billingAccess.ts';
import { normalizeBillingTransaction } from '../src/lib/billingPresentation.ts';

test('actual dispute handler reads persisted owner transactions by public ID without changing the stored ledger row', async () => {
  const source = readFileSync('server.ts', 'utf8');
  const start = source.indexOf('app.post("/api/billing/disputes/create"');
  const end = source.indexOf('// 11. Provider Earnings', start);
  const code = ts.transpileModule(source.slice(start, end), { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS } }).outputText;
  const persisted = Object.freeze({
    id: 'storage-uuid', transaction_id: 'tx_public', reference_id: 'pay_reference',
    user_id: 'owner', service_type: 'COMMUNICATION', total: '12.50', currency: 'GHS',
    status: 'COMPLETED',
  });
  const billingDb = { transactions: [], disputes: [] as any[] };
  let handler: any;
  let requestedId: string | undefined;
  new Function('app', 'requireAuthenticatedUser', 'authenticatedUserId', 'authDb',
    'normalizedBillingEnabled', 'getPersistentTransaction', 'normalizeBillingTransaction',
    'billingDb', 'ownsBillingRecord', code)(
    { post: (_path: string, _auth: any, fn: any) => { handler = fn; } },
    () => {}, (req: any) => req.authUser.id, { getUserById: () => ({ displayName: 'Owner' }) },
    () => true,
    async (ownerId: string, transactionId: string) => {
      requestedId = transactionId;
      return ownerId === persisted.user_id && transactionId === persisted.transaction_id ? persisted : null;
    },
    normalizeBillingTransaction, billingDb, ownsBillingRecord,
  );
  async function invoke(owner: string, transactionId: string) {
    let status = 200, body: any;
    const res = {
      status(code: number) { status = code; return this; },
      json(value: any) { body = value; return this; },
    };
    await handler({ authUser: { id: owner, accountStatus: 'ACTIVE', role: 'PERSONAL' },
      body: { transactionId, reason: 'INCORRECT_CHARGE', userExplanation: 'Please review' } }, res);
    return { status, body };
  }
  const accepted = await invoke('owner', 'tx_public');
  assert.equal(requestedId, 'tx_public');
  assert.equal(accepted.status, 200);
  assert.equal(accepted.body.dispute.transactionId, 'tx_public');
  assert.equal(accepted.body.dispute.transactionReference, 'pay_reference');
  assert.equal(accepted.body.dispute.amount, 12.5);
  assert.equal(persisted.status, 'COMPLETED');
  assert.equal(persisted.total, '12.50');
  assert.equal((await invoke('owner', 'pay_reference')).status, 404);
  assert.equal((await invoke('other-owner', 'tx_public')).status, 404);
  assert.equal(billingDb.disputes.length, 1);
  const repository = readFileSync('src/server/normalizedBillingRepository.ts', 'utf8');
  const lookup = repository.slice(repository.indexOf('export async function getPersistentTransaction('),
    repository.indexOf('export async function getPersistentInvoice('));
  assert.match(lookup, /\.eq\('user_id', userId\)\.eq\('transaction_id', transactionId\)/);
});
