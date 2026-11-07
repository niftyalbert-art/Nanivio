import assert from 'node:assert/strict';
import test from 'node:test';
import { billingClient } from '../src/lib/billingClient.ts';
import { authClient } from '../src/lib/authClient.ts';
import {
  normalizeBillingTransaction, normalizeBillingInvoice, normalizeBillingDispute,
  formatBillingAmount,
} from '../src/lib/billingPresentation.ts';

const iso = '2026-10-14T12:00:00Z';
const epoch = Date.parse(iso);

test('database-shaped invoice uses public ID, dates and decimal display values without mutating input', () => {
  const item = Object.freeze({ id: 'line', serviceType: 'COMMUNICATION', quantity: '2', unitPrice: '6.25', subtotal: '12.50', discount: '0', total: '12.50' });
  const row = Object.freeze({
    id: 'storage-uuid', invoice_id: 'inv_public', invoice_number: 'INV-1',
    user_id: 'owner', transaction_reference: 'ref', subtotal: '12.50', tax_amount: '0',
    platform_fee: '0.00', discount_total: '0', credit_total: '0', total: '12.50',
    issued_at: iso, paid_at: iso, due_date: iso, payment_method: 'Paystack',
    items: Object.freeze([item]),
  });
  const result = normalizeBillingInvoice(row);
  assert.equal(result.id, 'inv_public');
  assert.equal(result.invoiceNumber, 'INV-1');
  assert.equal(result.userId, 'owner');
  assert.equal(result.transactionReference, 'ref');
  assert.equal(result.paymentMethod, 'Paystack');
  assert.equal(result.issuedAt, epoch);
  assert.equal(result.paidAt, epoch);
  assert.equal(result.dueDate, epoch);
  assert.equal(result.total, 12.5);
  for (const field of ['taxAmount', 'platformFee', 'discountTotal', 'creditTotal'] as const) assert.equal(result[field], 0);
  assert.equal(result.items[0].unitPrice, 6.25);
  assert.equal(result.items[0].quantity, 2);
  assert.equal(result.items[0].discount, 0);
  assert.equal(row.total, '12.50');
  assert.equal(item.unitPrice, '6.25');
});

test('database-shaped dispute maps only available fields without inventing case details', () => {
  const row = Object.freeze({
    id: 'storage-uuid', dispute_id: 'disp_public', transaction_id: 'tx', user_id: 'owner',
    amount: '0.00', currency: 'GHS', explanation: 'Please check', resolution: 'Reviewed',
    created_at: iso, updated_at: iso,
  });
  const result = normalizeBillingDispute(row);
  assert.equal(result.id, 'disp_public');
  assert.equal(result.transactionId, 'tx');
  assert.equal(result.userId, 'owner');
  assert.equal(result.userExplanation, 'Please check');
  assert.equal(result.adminResolution, 'Reviewed');
  assert.equal(result.createdAt, epoch);
  assert.equal(result.updatedAt, epoch);
  assert.equal(result.amount, 0);
  assert.equal(result.caseNumber, undefined);
  assert.equal(result.transactionReference, undefined);
  assert.equal(row.amount, '0.00');
});

test('canonical records keep IDs, values and epoch dates, including zero', () => {
  const tx = normalizeBillingTransaction({ transactionId: 'tx', transaction_id: 'old', total: 0, createdAt: 0, created_at: iso });
  assert.equal(tx.transactionId, 'tx');
  assert.equal(tx.total, 0);
  assert.equal(tx.createdAt, 0);
  const invoice = normalizeBillingInvoice({ id: 'inv', invoiceNumber: 'INV', issuedAt: 0, issued_at: iso, paidAt: epoch, total: 0, items: [{ unitPrice: 0, total: 0 }] });
  assert.equal(invoice.id, 'inv');
  assert.equal(invoice.invoiceNumber, 'INV');
  assert.equal(invoice.issuedAt, 0);
  assert.equal(invoice.paidAt, epoch);
  assert.equal(invoice.total, 0);
  assert.equal(invoice.items[0].total, 0);
  const dispute = normalizeBillingDispute({ id: 'disp', caseNumber: 'CASE', userExplanation: 'Canonical', explanation: 'Old', amount: 0, refundAmount: '0', createdAt: 0, resolutionTimestamp: epoch });
  assert.equal(dispute.id, 'disp');
  assert.equal(dispute.caseNumber, 'CASE');
  assert.equal(dispute.userExplanation, 'Canonical');
  assert.equal(dispute.amount, 0);
  assert.equal(dispute.refundAmount, 0);
  assert.equal(dispute.createdAt, 0);
  assert.equal(dispute.resolutionTimestamp, epoch);
});

test('missing and invalid amounts and dates remain unavailable, never invented zero', () => {
  for (const value of [undefined, null, '', ' ', 'bad', Infinity, false]) {
    assert.equal(formatBillingAmount(normalizeBillingTransaction({ total: value }).total), 'Unavailable');
    const invoice = normalizeBillingInvoice({ total: value, issuedAt: value, items: [{ total: value }] });
    assert.equal(formatBillingAmount(invoice.total), 'Unavailable');
    assert.equal(formatBillingAmount(invoice.items[0].total), 'Unavailable');
    assert.equal(invoice.issuedAt, undefined);
    assert.equal(formatBillingAmount(normalizeBillingDispute({ amount: value }).amount), 'Unavailable');
  }
  assert.deepEqual(normalizeBillingInvoice({}).items, []);
  assert.equal(normalizeBillingInvoice({}).taxAmount, undefined);
});

const reads = [
  { path: '/api/billing/transactions?serviceType=CALL+%26+VIDEO', key: 'transactions', read: () => billingClient.getTransactions('not-the-owner', 'CALL & VIDEO'), row: { transaction_id: 'tx', total: '7.25', created_at: iso }, id: 'transactionId', amount: 'total', date: 'createdAt' },
  { path: '/api/billing/invoices', key: 'invoices', read: () => billingClient.getInvoices('not-the-owner'), row: { id: 'uuid', invoice_id: 'inv', total: '7.25', issued_at: iso }, id: 'id', amount: 'total', date: 'issuedAt' },
  { path: '/api/billing/disputes', key: 'disputes', read: () => billingClient.getDisputes('not-the-owner'), row: { id: 'uuid', dispute_id: 'disp', amount: '7.25', created_at: iso }, id: 'id', amount: 'amount', date: 'createdAt' },
];

test('all history reads authenticate, adapt records, preserve empty success, and propagate rejection', async () => {
  const originalFetch = globalThis.fetch;
  const originalToken = authClient.getToken;
  authClient.getToken = () => 'fixture-token';
  try {
    for (const spec of reads) {
      globalThis.fetch = async (url, init) => {
        assert.equal(url, spec.path);
        const headers = new Headers(init?.headers);
        assert.equal(headers.get('Authorization'), 'Bearer fixture-token');
        assert.equal(headers.get('x-nanivio-token'), 'fixture-token');
        assert.doesNotMatch(String(url), /userId/);
        return Response.json({ success: true, [spec.key]: [spec.row] });
      };
      const [row] = await spec.read() as unknown as Record<string, unknown>[];
      assert.ok(row[spec.id]);
      assert.notEqual(row[spec.id], 'uuid');
      assert.equal(row[spec.amount], 7.25);
      assert.equal(row[spec.date], epoch);
      // The same client boundary must also accept already-canonical records.
      globalThis.fetch = async () => Response.json({ success: true, [spec.key]: [row] });
      assert.deepEqual((await spec.read())[0], row);
      globalThis.fetch = async () => Response.json({ success: true, [spec.key]: [{ [spec.id]: 'zero', [spec.amount]: '0' }, { [spec.id]: 'unknown' }] });
      const amounts = await spec.read() as unknown as Record<string, unknown>[];
      assert.equal(amounts[0][spec.amount], 0);
      assert.equal(amounts[1][spec.amount], undefined);
      globalThis.fetch = async () => Response.json({ success: true, [spec.key]: [] });
      assert.deepEqual(await spec.read(), []);
      for (const status of [401, 403, 502, 503]) {
        globalThis.fetch = async () => Response.json({ success: false, error: `Rejected ${status}` }, { status });
        await assert.rejects(spec.read, new RegExp(`Rejected ${status}`));
      }
      globalThis.fetch = async () => Response.json({ success: false, error: 'Read failed' });
      await assert.rejects(spec.read, /Read failed/);
      globalThis.fetch = async () => { throw new Error('Network failure'); };
      await assert.rejects(spec.read, /Network failure/);
    }
  } finally {
    globalThis.fetch = originalFetch;
    authClient.getToken = originalToken;
  }
});

test('invoice dispute resolves the associated owner transaction ID, never the payment reference', async () => {
  const originalFetch = globalThis.fetch;
  const invoice = normalizeBillingInvoice({
    invoice_id: 'inv', user_id: 'owner', transaction_reference: 'pay_reference',
  });
  try {
    globalThis.fetch = async () => Response.json({ success: true, transactions: [{
      id: 'storage-uuid', transaction_id: 'tx_public', reference_id: 'pay_reference',
      user_id: 'owner', total: '12.50',
    }] });
    assert.equal(await billingClient.getInvoiceTransactionId(invoice), 'tx_public');
    for (const transactions of [
      [], [{ transaction_id: 'other', reference_id: 'pay_reference', user_id: 'other-owner' }],
      [{ transaction_id: 'other', reference_id: 'other_reference', user_id: 'owner' }],
      [{ transaction_id: 'a', reference_id: 'pay_reference', user_id: 'owner' },
        { transaction_id: 'b', reference_id: 'pay_reference', user_id: 'owner' }],
    ]) {
      globalThis.fetch = async () => Response.json({ success: true, transactions });
      await assert.rejects(() => billingClient.getInvoiceTransactionId(invoice), /transaction for this invoice is unavailable/);
    }
    globalThis.fetch = async () => Response.json({ error: 'Not signed in' }, { status: 401 });
    await assert.rejects(() => billingClient.getInvoiceTransactionId(invoice), /Not signed in/);
  } finally { globalThis.fetch = originalFetch; }
});
