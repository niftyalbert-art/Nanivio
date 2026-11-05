import type { Express, RequestHandler } from 'express';
import { cryptoCommand, publicCryptoInvoice, activateCryptoInvoice } from './repository';
import { TronReader, tronAddressHex, TRON_USDT_CONTRACT } from './tron';
import { cryptoCheckoutAccess } from './access';

type Dependencies = {
  user: RequestHandler; admin: RequestHandler;
  userId: (request: any) => string;
  quote: (input: Record<string, any>) => Promise<any>;
  command?: typeof cryptoCommand;
  startReconciler?: boolean;
};

const reader = new TronReader();
const inFlight = new Map<string, Promise<any>>();
const lastCheck = new Map<string, number>();

async function checkInvoice(row: any, transactionId?: string, actorId = 'SYSTEM', acceptLate = false) {
  if (row.status === 'ACTIVATED') return row;
  // Keep an administrator's explicit late approval separate from background checks.
  const key = `${row.id}:${transactionId || 'scan'}:${acceptLate}`;
  if (inFlight.has(key)) return inFlight.get(key)!;
  const work = (async () => {
    const candidates = transactionId ? [transactionId] : await reader.candidates(
      row.receiving_address, String(row.amount_units), Date.parse(row.created_at),
    );
    let lastError: unknown;
    for (const candidate of candidates) {
      try {
        const proof = await reader.proof(candidate, row.receiving_address, String(row.amount_units));
        const result = await activateCryptoInvoice(row.id, proof, actorId, acceptLate);
        return result.invoice;
      } catch (error) {
        if (transactionId) throw error;
        lastError = error;
      }
    }
    if (lastError) throw lastError;
    return row;
  })();
  inFlight.set(key, work);
  try { return await work; } finally { inFlight.delete(key); }
}

async function availability(commandRpc = cryptoCommand) {
  if (process.env.TRON_USDT_ENABLED !== 'true') {
    return { success: true, enabled: false, reason: 'USDT checkout is not enabled. Paystack remains available.' };
  }
  try {
    const address = process.env.TRON_USDT_RECEIVING_ADDRESS || '';
    if (tronAddressHex(address) === '0'.repeat(40) || address === TRON_USDT_CONTRACT) {
      throw new Error('A spendable receiving wallet, not a burn/token contract address, is required.');
    }
    await commandRpc('PREFLIGHT');
    return { success: true, enabled: true };
  } catch {
    return { success: true, enabled: false, reason: 'USDT checkout needs a valid receiving wallet and database setup. No crypto payment should be sent yet.' };
  }
}

export function registerCryptoBillingRoutes(app: Express, dependencies: Dependencies) {
  const commandRpc = dependencies.command || cryptoCommand;
  app.get('/api/billing/crypto/config', dependencies.user, async (req, res) => {
    const access = cryptoCheckoutAccess(dependencies.userId(req));
    if (!access.allowed) {
      return res.json({ success: true, enabled: false, eligible: false, accessMode: access.mode, reason: access.reason });
    }
    res.json({ ...await availability(commandRpc), eligible: true, accessMode: access.mode });
  });
  app.post('/api/billing/crypto/invoices', dependencies.user, async (req, res) => {
    const access = cryptoCheckoutAccess(dependencies.userId(req));
    if (!access.allowed) {
      return res.status(403).json({ success: false, code: 'CRYPTO_CHECKOUT_RESTRICTED', error: access.reason });
    }
    const ready = await availability(commandRpc);
    if (!ready.enabled) return res.status(503).json({ success: false, error: ready.reason });
    let purchase: any;
    try {
      if (!['SUBSCRIPTION', 'MALVI_SUBSCRIPTION'].includes(req.body?.purpose)) {
        throw new Error('USDT checkout is available for paid subscription plans only.');
      }
      // Ignore client prices, token addresses, wallet addresses, and benefits.
      purchase = await dependencies.quote({
        purpose: req.body.purpose, planTier: req.body.planTier,
        billingCycle: req.body.billingCycle, catalogVersion: req.body.catalogVersion, currency: 'USD',
      });
    } catch (error: any) {
      return res.status(400).json({ success: false, error: error.message });
    }
    try {
      const data = await commandRpc('CREATE', {
        userId: dependencies.userId(req), purchase, receivingAddress: process.env.TRON_USDT_RECEIVING_ADDRESS,
      });
      res.status(201).json({ success: true, invoice: publicCryptoInvoice(data.invoice) });
    } catch (error: any) {
      res.status(503).json({ success: false, error: error.message });
    }
  });
  app.get('/api/billing/crypto/invoices', dependencies.user, async (req, res) => {
    try {
      const data = await commandRpc('LIST', { userId: dependencies.userId(req) });
      res.json({ success: true, invoices: data.invoices.map(publicCryptoInvoice) });
    } catch (error: any) { res.status(503).json({ success: false, error: error.message }); }
  });
  app.get('/api/admin/billing/crypto/invoices', dependencies.admin, async (_req, res) => {
    try {
      const data = await commandRpc('LIST');
      res.json({ ...await availability(commandRpc), invoices: data.invoices.map(publicCryptoInvoice) });
    } catch (error: any) { res.status(503).json({ success: false, error: error.message }); }
  });

  const check: (admin: boolean) => RequestHandler = admin => async (req, res) => {
    try {
      const transactionId = req.body?.transactionId;
      if (!/^[0-9a-f-]{36}$/i.test(String(req.params.id)) ||
          (transactionId !== undefined && !/^[a-fA-F0-9]{64}$/.test(transactionId))) {
        return res.status(400).json({ success: false, error: 'Enter a valid invoice ID and, if supplied, a 64-character TRON transaction ID.' });
      }
      const actor = admin
        ? String((req as any).adminUser?.id || '')
        : dependencies.userId(req);
      if (!actor) return res.status(403).json({ success: false, error: 'An authenticated account is required to check payments.' });
      const data = await commandRpc('GET', { id: req.params.id });
      if (!admin && data.invoice.user_id !== actor) return res.status(404).json({ success: false, error: 'Invoice not found.' });
      if (data.invoice.status === 'ACTIVATED') return res.json({ success: true, invoice: publicCryptoInvoice(data.invoice) });
      const last = lastCheck.get(actor) || 0;
      if (Date.now() - last < 12_000) return res.status(429).json({ success: false, error: 'Wait a few seconds before checking this payment again.' });
      if (lastCheck.size > 5000) for (const [id, time] of lastCheck) if (Date.now() - time > 60_000) lastCheck.delete(id);
      lastCheck.set(actor, Date.now());
      const row = await checkInvoice(data.invoice, transactionId, actor, admin && req.body?.acceptLate === true);
      res.json({
        success: true, invoice: publicCryptoInvoice(row),
        ...(row.status === 'PENDING' ? { message: 'No matching solidified transfer found in the current history window. If you paid, enter your transaction ID. Do not send another payment.' } : {}),
      });
    } catch (error: any) {
      res.status(503).json({ success: false, error: error.message || 'Payment verification is unavailable. Do not pay again.' });
    }
  };
  app.post('/api/billing/crypto/invoices/:id/check', dependencies.user, check(false));
  app.post('/api/admin/billing/crypto/invoices/:id/check', dependencies.admin, check(true));

  if (dependencies.startReconciler === false) return;
  // Durable leases allow recovery even after the customer closes the page or
  // when checkout is disabled. Older invoices remain manually recoverable by txID.
  let running = false;
  let lastWarning = 0;
  const reconcile = async () => {
    if (running) return;
    running = true;
    try {
      const data = await commandRpc('QUEUE');
      for (const invoice of data.invoices) {
        try { await checkInvoice(invoice); }
        catch {
          if (Date.now() - lastWarning > 30 * 60_000) {
            console.warn('TRON payment recovery delayed; saved invoices remain available for verification.');
            lastWarning = Date.now();
          }
        }
      }
    } catch {
      // A disabled, not-yet-installed optional payment rail is expected.
      if (process.env.TRON_USDT_ENABLED === 'true' && Date.now() - lastWarning > 30 * 60_000) {
        console.warn('TRON payment recovery needs database setup. Checkout fails closed.');
        lastWarning = Date.now();
      }
    } finally { running = false; }
  };
  const timer = setInterval(() => { void reconcile(); }, 60_000);
  timer.unref();
}
