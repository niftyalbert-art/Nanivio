import React, { useCallback, useEffect, useRef, useState } from 'react';
import QRCode from 'qrcode';
import { AlertCircle, Check, CheckCircle2, Clock3, Copy, LoaderCircle, RefreshCw, ShieldAlert, WalletCards } from 'lucide-react';
import { cryptoBillingClient, type CryptoInvoice, type CryptoPurchase } from '../../lib/cryptoBillingClient';
import { useNanivio } from '../../context/NanivioContext';

type Props = { isOpen: boolean; onClose: () => void; onSuccess: () => void; purchase: CryptoPurchase };
type CopyTarget = 'address' | 'amount' | null;

const fullAmount = (value: string) => {
  const match = /^(\d+)(?:\.(\d+))?$/.exec(value);
  if (!match) return value;
  const fraction = match[2] || '';
  return fraction.length <= 6 ? `${match[1]}.${fraction.padEnd(6, '0')}` : value;
};
const validInvoiceTerms = (item: CryptoInvoice) => {
  const discount = Number(item.matchingDiscount);
  const amount = item.amount;
  const expected = item.basePriceUSD - discount;
  const relationshipMatches = Math.abs(Number(amount) - expected) < 0.000001;
  return Number.isFinite(discount) && discount >= 0 && discount < 0.01 &&
    /^\d+\.\d{6}$/.test(amount) && Number.isFinite(item.basePriceUSD) && item.basePriceUSD > 0 &&
    Number.isFinite(expected) && relationshipMatches;
};
const purposeMatches = (invoice: CryptoInvoice, purchase: CryptoPurchase) =>
  invoice.purpose === purchase.purpose && invoice.planTier === purchase.planTier && invoice.billingCycle === purchase.billingCycle &&
  invoice.packageId === purchase.packageId &&
  (purchase.purpose !== 'COMMUNICATION_TOPUP' || purchase.amount === undefined || invoice.basePriceUSD === purchase.amount);

export const CryptoSubscriptionCheckout: React.FC<Props> = ({ isOpen, onClose, onSuccess, purchase }) => {
  const { refreshBilling } = useNanivio();
  const [enabled, setEnabled] = useState<boolean | null>(null);
  const [listAvailable, setListAvailable] = useState(true);
  const [disabledReason, setDisabledReason] = useState('');
  const [invoice, setInvoice] = useState<CryptoInvoice | null>(null);
  const [loading, setLoading] = useState(false);
  const [checking, setChecking] = useState(false);
  const [pollingActive, setPollingActive] = useState(true);
  const [txHash, setTxHash] = useState('');
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  const [qrData, setQrData] = useState('');
  const [topUpAmount, setTopUpAmount] = useState(purchase.amount ? String(purchase.amount) : '');
  const [copied, setCopied] = useState<CopyTarget>(null);
  const [pageVisible, setPageVisible] = useState(() => typeof document === 'undefined' || document.visibilityState === 'visible');
  const successCalled = useRef(false);
  const checkRef = useRef(false);
  const refreshedInvoiceId = useRef<string | null>(null);
  const activePurchaseKey = useRef<string | null>(null);
  const wasVisible = useRef(false);
  const onSuccessRef = useRef(onSuccess);
  const refreshBillingRef = useRef(refreshBilling);
  onSuccessRef.current = onSuccess;
  refreshBillingRef.current = refreshBilling;
  const visible = isOpen;

  const setInvoiceState = useCallback((next: CryptoInvoice) => {
    setInvoice(next);
    if (next.status === 'ACTIVATED' && refreshedInvoiceId.current !== next.id) {
      refreshedInvoiceId.current = next.id;
      void refreshBillingRef.current().catch(() => {
        setNotice('Payment is verified. Account details could not refresh just now; close this receipt and refresh billing to retry.');
      });
    }
    if (next.status === 'ACTIVATED' && !successCalled.current) {
      successCalled.current = true;
      onSuccessRef.current();
    }
  }, []);

  const recover = useCallback(async () => {
    setLoading(true); setError('');
    setPollingActive(true);
    setListAvailable(true);
    const [configResult, listResult] = await Promise.allSettled([
      cryptoBillingClient.config(),
      cryptoBillingClient.list(),
    ]);
    if (configResult.status === 'fulfilled') {
      const supported = configResult.value.supportedPurposes ||
        ['SUBSCRIPTION', 'MALVI_SUBSCRIPTION'];
      const productSupported = supported.includes(purchase.purpose);
      setEnabled(configResult.value.enabled && configResult.value.eligible !== false && productSupported);
      setDisabledReason(!productSupported
        ? 'USDT top-ups and minute purchases need the expanded crypto database setup. Do not send funds yet.'
        : configResult.value.reason || '');
    } else {
      setEnabled(false);
      setDisabledReason(configResult.reason instanceof Error ? configResult.reason.message : 'Crypto availability could not be confirmed.');
    }
    if (listResult.status === 'fulfilled') {
      const matching = listResult.value.invoices
        .filter(item => purposeMatches(item, purchase) && (item.status === 'PENDING' || item.status === 'REVIEW' || item.status === 'EXPIRED' || item.status === 'ACTIVATED'))
        .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
      const ownPending = matching.find(item => (item.status === 'PENDING' || item.status === 'REVIEW') &&
        Date.parse(item.expiresAt) > Date.now()) || matching[0];
      if (ownPending) setInvoiceState(ownPending);
      else setInvoice(null);
    } else {
      setPollingActive(false);
      setListAvailable(false);
      const reason = listResult.reason instanceof Error ? listResult.reason.message : 'Invoice history is temporarily unavailable.';
      setError(`Could not recover existing crypto invoices (${reason}). Paystack remains available.`);
    }
    setLoading(false);
  }, [purchase.purpose, purchase.planTier, purchase.billingCycle, purchase.packageId, purchase.amount, setInvoiceState]);

  useEffect(() => {
    if (!visible) {
      wasVisible.current = false;
      activePurchaseKey.current = null;
      return;
    }
    const purchaseKey = `${purchase.purpose}:${purchase.planTier}:${purchase.billingCycle}:${purchase.packageId}:${purchase.amount}`;
    if (wasVisible.current && activePurchaseKey.current === purchaseKey) return;
    wasVisible.current = true;
    activePurchaseKey.current = purchaseKey;
    successCalled.current = false;
    refreshedInvoiceId.current = null;
    setInvoice(null); setTxHash(''); setNotice(''); setError('');
    void recover();
  }, [visible, purchase.purpose, purchase.planTier, purchase.billingCycle, recover]);

  useEffect(() => {
    const updateVisibility = () => setPageVisible(document.visibilityState === 'visible');
    document.addEventListener('visibilitychange', updateVisibility);
    return () => document.removeEventListener('visibilitychange', updateVisibility);
  }, []);

  useEffect(() => {
    if (!invoice) { setQrData(''); return; }
    let active = true;
    QRCode.toDataURL(invoice.receivingAddress, { width: 220, margin: 1, errorCorrectionLevel: 'M' })
      .then(value => { if (active) setQrData(value); })
      .catch(() => { if (active) setQrData(''); });
    return () => { active = false; };
  }, [invoice?.id, invoice?.receivingAddress]);

  const checkInvoice = useCallback(async (transactionId?: string) => {
    if (!invoice || checkRef.current || invoice.status === 'ACTIVATED') return;
    checkRef.current = true; setChecking(true); setError('');
    try {
      const result = await cryptoBillingClient.check(invoice.id, transactionId);
      setInvoiceState(result.invoice);
      setNotice(result.message || (result.invoice.status === 'REVIEW' ? 'Payment is under review. We will update this invoice when verified.' : 'Invoice status refreshed.'));
    } catch (err) {
      setPollingActive(false);
      setError(err instanceof Error ? err.message : 'Could not verify this payment. Try again later.');
    } finally { checkRef.current = false; setChecking(false); }
  }, [invoice, setInvoiceState]);

  useEffect(() => {
    if (!visible || !pageVisible || !pollingActive || !invoice || invoice.status !== 'PENDING' || Date.parse(invoice.expiresAt) <= Date.now()) return;
    const timer = window.setInterval(() => {
      if (Date.parse(invoice.expiresAt) <= Date.now()) { setPollingActive(false); return; }
      void checkInvoice();
    }, 15000);
    return () => window.clearInterval(timer);
  }, [visible, pageVisible, pollingActive, invoice?.id, invoice?.status, invoice?.expiresAt, checkInvoice]);

  const createInvoice = async () => {
    setLoading(true); setError(''); setNotice('');
    successCalled.current = false;
    refreshedInvoiceId.current = null;
    try {
      const value = Number(topUpAmount);
      if (purchase.purpose === 'COMMUNICATION_TOPUP' &&
          (!/^\d+(?:\.\d{1,2})?$/.test(topUpAmount) || value < 0.01 || value > 100000)) {
        throw new Error('Enter a USD credit amount between 0.01 and 100,000, with at most two decimal places.');
      }
      const result = await cryptoBillingClient.create(purchase.purpose === 'COMMUNICATION_TOPUP'
        ? { ...purchase, amount: value } : purchase);
      setPollingActive(true);
      setInvoiceState(result.invoice);
    } catch (err) { setError(err instanceof Error ? err.message : 'Could not create an invoice. Paystack remains available.'); }
    finally { setLoading(false); }
  };

  const acknowledgeSuccess = () => {
    if (!invoice || invoice.status !== 'ACTIVATED') return;
    onClose();
  };

  const copy = async (target: Exclude<CopyTarget, null>, value: string) => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(target); window.setTimeout(() => setCopied(null), 1800);
    } catch { setError('Clipboard access was unavailable. Select and copy the value manually.'); }
  };

  if (!isOpen) return null;
  const expired = !!invoice && (invoice.status === 'EXPIRED' || Date.parse(invoice.expiresAt) <= Date.now());
  const termsValid = !!invoice && validInvoiceTerms(invoice);
  const protocolValid = !!invoice && invoice.network === 'TRON' && invoice.token === 'USDT';
  const remaining = invoice ? Math.max(0, Math.ceil((Date.parse(invoice.expiresAt) - Date.now()) / 60000)) : 0;

  return <div className="fixed inset-0 z-[60] flex items-center justify-center overflow-y-auto bg-slate-950/75 p-3 backdrop-blur-sm sm:p-5">
    <section role="dialog" aria-modal="true" aria-labelledby="crypto-checkout-title" className="my-auto w-full max-w-xl overflow-hidden rounded-2xl border border-slate-700 bg-slate-900 text-slate-100 shadow-2xl">
      <header className="flex items-center justify-between border-b border-slate-800 bg-slate-950/60 px-5 py-4">
        <div className="flex items-center gap-3">
          <span className="flex h-10 w-10 items-center justify-center rounded-xl border border-emerald-400/30 bg-emerald-400/10 text-emerald-300"><WalletCards className="h-5 w-5" /></span>
          <div><h2 id="crypto-checkout-title" className="font-bold">Pay with USDT</h2><p className="text-xs text-slate-400">Direct TRON mainnet payment</p></div>
        </div>
        <button type="button" onClick={() => invoice?.status === 'ACTIVATED' ? acknowledgeSuccess() : onClose()} className="rounded-lg px-3 py-2 text-sm text-slate-400 hover:bg-slate-800 hover:text-white">{invoice?.status === 'ACTIVATED' ? 'Close receipt' : 'Close'}</button>
      </header>
      <div className="space-y-4 p-5">
        <div className="rounded-xl border border-amber-400/30 bg-amber-400/5 p-3 text-xs leading-5 text-amber-100">
          <p className="flex items-start gap-2 font-semibold"><ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" />Send USDT on TRON (TRC20) only.</p>
          <p className="mt-1 text-amber-100/80">Sending another token or using another network may permanently lose your funds. Nanivio is a communication service, not a bank or crypto exchange. Never share a seed phrase or private key.</p>
        </div>
        {error && <div role="alert" className="flex gap-2 rounded-xl border border-rose-400/30 bg-rose-400/10 p-3 text-xs text-rose-200"><AlertCircle className="h-4 w-4 shrink-0" />{error}</div>}
        {loading && <div role="status" className="space-y-3 rounded-xl border border-slate-800 p-4"><div className="h-4 w-2/3 animate-pulse rounded bg-slate-700" /><div className="h-3 w-full animate-pulse rounded bg-slate-800" /><div className="h-10 animate-pulse rounded bg-slate-800" /></div>}
        {!loading && enabled === false && <div className="rounded-xl border border-slate-700 bg-slate-950/50 p-4 text-sm">
          <p className="font-semibold">Crypto checkout is currently unavailable.</p><p className="mt-1 text-xs text-slate-400">{disabledReason || 'This payment method is not enabled for your account right now.'} You can still complete this purchase with Paystack.</p>
        </div>}
        {!loading && enabled === null && <div className="rounded-xl border border-amber-400/30 bg-amber-400/5 p-3 text-xs text-amber-100">Crypto availability could not be confirmed. {disabledReason} Existing invoices were checked where available; Paystack remains usable.</div>}
        {!loading && enabled !== true && <button type="button" onClick={() => void recover()} className="min-h-11 rounded-xl border border-slate-600 px-4 py-2 text-sm text-slate-200">Retry USDT availability</button>}
        {!loading && enabled && !listAvailable && <div className="rounded-xl border border-amber-400/30 bg-amber-400/5 p-4 text-sm"><p className="font-semibold text-amber-100">Crypto invoice recovery is unavailable.</p><p className="mt-1 text-xs text-slate-300">We cannot safely create another invoice until existing payment requests can be checked. Use Paystack for now.</p></div>}
        {!loading && enabled && listAvailable && !invoice && <div className="space-y-4">
          <div className="rounded-xl border border-slate-700 bg-slate-950/50 p-4">
            <p className="text-xs uppercase tracking-wider text-slate-400">Purchase</p>
            <p className="mt-1 font-semibold">{purchase.purpose === 'COMMUNICATION_TOPUP'
              ? 'USD Nanivio credit top-up' : purchase.purpose === 'COMMUNICATION_MINUTES'
                ? `Communication minute pack · ${purchase.packageId || 'Selected pack'}`
                : `${purchase.planTier} · ${purchase.billingCycle === 'ANNUAL' ? 'Annual' : 'Monthly'}`}</p>
            <p className="mt-2 text-xs text-slate-400">The published USD plan price is denominated as USDT at merchant 1:1 pricing. The invoice shows the exact charge and any matching discount.</p>
          </div>
          {purchase.purpose === 'COMMUNICATION_TOPUP' && <label className="block text-sm text-slate-200">
            USD Nanivio credit to add
            <input type="number" min="0.01" max="100000" step="0.01" inputMode="decimal" value={topUpAmount}
              onChange={event => setTopUpAmount(event.target.value)}
              className="mt-2 w-full rounded-xl border border-slate-600 bg-slate-950 p-3 text-white" />
            <span className="mt-2 block text-xs text-slate-400">1 USDT per USD of service credit, minus a small matching discount. This adds USD Nanivio service credit, not cash or a bank balance.</span>
          </label>}
          <button type="button" onClick={createInvoice} className="w-full rounded-xl bg-emerald-400 px-4 py-3 text-sm font-bold text-slate-950 hover:bg-emerald-300">Create USDT invoice</button>
        </div>}
        {!loading && invoice && <div className="space-y-4">
          <div className="flex items-center justify-between rounded-xl border border-slate-700 bg-slate-950/50 p-3 text-xs">
            <span className="text-slate-400">Invoice status</span>
            <strong className={`inline-flex items-center gap-1.5 ${invoice.status === 'ACTIVATED' ? 'text-emerald-300' : invoice.status === 'REVIEW' ? 'text-amber-200' : expired ? 'text-rose-300' : 'text-sky-200'}`}>
              {invoice.status === 'ACTIVATED' ? <CheckCircle2 className="h-4 w-4" /> : invoice.status === 'REVIEW' ? <AlertCircle className="h-4 w-4" /> : <Clock3 className="h-4 w-4" />}
              {expired && invoice.status === 'PENDING' ? 'EXPIRED' : invoice.status}
            </strong>
          </div>
          {(!termsValid || !protocolValid) && invoice.status !== 'ACTIVATED' && <div role="alert" className="rounded-xl border border-rose-400/30 bg-rose-400/10 p-3 text-xs text-rose-200">Invoice terms or network could not be validated. Do not send funds. Contact support or use Paystack.</div>}
          {invoice.status === 'ACTIVATED' ? <div className="rounded-xl border border-emerald-400/30 bg-emerald-400/10 p-4 text-sm text-emerald-100"><p className="font-bold">USDT payment verified · purchase delivered</p><p className="mt-1 text-xs">{invoice.activation?.message || 'Your crypto payment was verified and your purchase is ready.'}</p><button type="button" onClick={acknowledgeSuccess} className="mt-4 w-full rounded-xl bg-emerald-300 px-4 py-3 text-sm font-bold text-slate-950 hover:bg-emerald-200">Close confirmation</button>
            {enabled && listAvailable ? <button type="button" onClick={createInvoice} className="mt-2 w-full rounded-xl border border-emerald-300/40 px-4 py-2.5 text-sm font-semibold text-emerald-100 hover:bg-emerald-300/10">Start a new invoice</button> : <p className="mt-3 text-xs text-emerald-100/70">A new invoice for another period is currently unavailable.</p>}</div> :
            expired ? <div className="rounded-xl border border-rose-400/30 bg-rose-400/10 p-4 text-sm text-rose-100"><p className="font-bold">Invoice expired</p><p className="mt-1 text-xs">This invoice can no longer be used. Create a fresh invoice to renew the payment request.</p></div> :
            (!termsValid || !protocolValid) ? null :
              <div className="grid gap-4 sm:grid-cols-[160px_1fr]">
                <div className="flex min-h-40 items-center justify-center rounded-xl bg-white p-2">{qrData ? <img src={qrData} alt="QR code containing only the TRON receiving address" className="h-36 w-36" /> : <div className="h-36 w-36 animate-pulse rounded bg-slate-200" />}</div>
                <div className="space-y-3">
                  <div className="rounded-xl border border-slate-700 bg-slate-950 p-3">
                    <p className="text-[11px] uppercase tracking-wider text-slate-500">Exact amount · USDT</p>
                    <div className="mt-1 flex items-center justify-between gap-2"><code className="break-all text-lg font-bold tracking-tight text-white">{fullAmount(invoice.amount)}</code><button aria-label="Copy exact USDT amount" type="button" onClick={() => void copy('amount', fullAmount(invoice.amount))} className="rounded-lg p-2 text-slate-300 hover:bg-slate-800">{copied === 'amount' ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}</button></div>
                    <p className="mt-2 text-[11px] text-slate-400">Published base price: ${invoice.basePriceUSD.toFixed(2)} USD · merchant pricing 1:1</p>
                    <p className="text-[11px] text-slate-400">Matching discount: {fullAmount(invoice.matchingDiscount)} USDT</p>
                  </div>
                  <div className="rounded-xl border border-slate-700 bg-slate-950 p-3">
                    <p className="text-[11px] uppercase tracking-wider text-slate-500">TRON receiving address</p>
                    <div className="mt-1 flex items-start justify-between gap-2"><code className="break-all text-xs leading-5 text-slate-200">{invoice.receivingAddress}</code><button aria-label="Copy receiving address" type="button" onClick={() => void copy('address', invoice.receivingAddress)} className="rounded-lg p-2 text-slate-300 hover:bg-slate-800">{copied === 'address' ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}</button></div>
                  </div>
                </div>
              </div>}
          {copied && <p role="status" className="text-xs text-emerald-300">{copied === 'amount' ? 'Exact amount copied.' : 'Address copied.'}</p>}
          {invoice.status !== 'ACTIVATED' && <>
            {!expired && <p className="text-xs text-slate-400">Invoice expires in approximately {remaining} minute{remaining === 1 ? '' : 's'}. Send the exact amount shown above.</p>}
            {expired && <p className="text-xs text-amber-200">If you sent this transfer before the invoice expired, submit its transaction hash for verification. A late confirmation may be placed under review.</p>}
            <label className="block text-xs font-semibold text-slate-300">Transaction hash <span className="font-normal text-slate-500">(optional; a hash alone does not confirm payment)</span>
              <input value={txHash} onChange={event => setTxHash(event.target.value)} placeholder={expired ? 'Transaction hash for a transfer sent before expiry' : 'Paste transaction hash to help locate your payment'} className="mt-1.5 w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2.5 font-mono text-xs text-white placeholder:text-slate-600 focus:border-emerald-400 focus:outline-none" />
            </label>
            <button type="button" disabled={checking || (expired && !txHash.trim())} onClick={() => void checkInvoice(txHash.trim() || undefined)} className="flex w-full items-center justify-center gap-2 rounded-xl border border-slate-700 bg-slate-800 px-4 py-3 text-sm font-bold hover:bg-slate-700 disabled:opacity-60">
              {checking ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}{expired ? 'Submit hash for late-payment review' : 'Check payment status'}
            </button>
          </>}
          {invoice.status === 'REVIEW' && <p className="text-xs text-amber-200">This payment needs review. A submitted transaction hash is not proof of payment or activation.</p>}
          {notice && <p role="status" className="text-xs text-slate-300">{notice}</p>}
          {expired && <button type="button" onClick={createInvoice} className="w-full rounded-xl bg-emerald-400 px-4 py-3 text-sm font-bold text-slate-950 hover:bg-emerald-300">Create a new invoice</button>}
        </div>}
      </div>
    </section>
  </div>;
};

export default CryptoSubscriptionCheckout;
