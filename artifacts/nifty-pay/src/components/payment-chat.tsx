/**
 * In-chat P2P payments UI:
 *  - PaymentAttachment: custom Stream attachment renderer for payment / money-request bubbles
 *  - PaymentSheet: bottom sheet to send money or request money inside a chat
 */
import { useState, useEffect, useMemo } from 'react';
import { Attachment as DefaultAttachment, type AttachmentProps } from 'stream-chat-react';
import { useGetWallets, getGetWalletsQueryKey, getGetTransactionsQueryKey, getGetDashboardSummaryQueryKey } from '@workspace/api-client-react';
import { useQueryClient } from '@tanstack/react-query';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { cn } from '@/lib/utils';
import { X, ShieldCheck, ArrowUpRight, HandCoins, CheckCircle2, XCircle, Clock } from 'lucide-react';

const API = `${import.meta.env.BASE_URL}api`;

function authHeaders(): Record<string, string> {
  const token = localStorage.getItem('nanivio_token') ?? sessionStorage.getItem('nanivio_token');
  return { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) };
}

export interface PayRequestInfo {
  requestId: number;
  amount: number;
  currency: string;
  requesterUserId: string; // stream/db id as string
  requesterName: string;
  note?: string | null;
}

/* ────────────────────────── attachment bubbles ────────────────────────── */

let _openPayForRequest: ((info: PayRequestInfo) => void) | null = null;
/** chat.tsx registers a handler so the request bubble's Pay button can open the sheet. */
export function registerPayForRequestHandler(fn: ((info: PayRequestInfo) => void) | null) {
  _openPayForRequest = fn;
}

function fmt(n: number) {
  return Number(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function StatusPill({ status }: { status: string }) {
  const map: Record<string, { label: string; cls: string; Icon: any }> = {
    completed: { label: 'Paid', cls: 'bg-emerald-500/15 text-emerald-400', Icon: CheckCircle2 },
    paid:      { label: 'Paid', cls: 'bg-emerald-500/15 text-emerald-400', Icon: CheckCircle2 },
    pending:   { label: 'Pending', cls: 'bg-amber-500/15 text-amber-400', Icon: Clock },
    declined:  { label: 'Declined', cls: 'bg-red-500/15 text-red-400', Icon: XCircle },
  };
  const s = map[status] ?? map.pending;
  return (
    <span className={cn('inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold', s.cls)}>
      <s.Icon className="w-3 h-3" /> {s.label}
    </span>
  );
}

function PaymentBubble({ att, myStreamId }: { att: any; myStreamId: string }) {
  const sentByMe = att.from_user_id === myStreamId;
  return (
    <div className="w-64 max-w-full rounded-2xl border border-emerald-500/25 bg-gradient-to-br from-emerald-500/15 to-teal-600/10 p-3.5 space-y-2" data-testid="payment-bubble">
      <div className="flex items-center justify-between gap-2">
        <span className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-emerald-400">
          <ArrowUpRight className="w-3.5 h-3.5" /> {sentByMe ? 'You sent' : `${att.from_name ?? 'They'} sent`}
        </span>
        <StatusPill status={att.status ?? 'completed'} />
      </div>
      <p className="text-2xl font-extrabold font-mono leading-none">
        {fmt(att.amount)} <span className="text-sm font-bold">{att.currency}</span>
      </p>
      {att.to_currency && att.to_currency !== att.currency && (
        <p className="text-[11px] text-muted-foreground">≈ {fmt(att.to_amount)} {att.to_currency} received</p>
      )}
      {att.note && <p className="text-xs text-foreground/80 italic">“{att.note}”</p>}
      <p className="text-[10px] text-muted-foreground">
        {sentByMe ? `to ${att.to_name ?? 'contact'}` : 'added to your wallet'} · Nanivio Pay
      </p>
    </div>
  );
}

function RequestBubble({ att, myStreamId }: { att: any; myStreamId: string }) {
  const { toast } = useToast();
  const [declining, setDeclining] = useState(false);
  const iAmPayer = att.payer_user_id === myStreamId;
  const pending = (att.status ?? 'pending') === 'pending';

  const decline = async () => {
    setDeclining(true);
    try {
      const r = await fetch(`${API}/p2p/requests/${att.request_id}/decline`, { method: 'POST', headers: authHeaders() });
      if (!r.ok) {
        const e = await r.json().catch(() => ({} as any));
        throw new Error(e.error ?? 'Could not decline');
      }
    } catch (e: any) {
      toast({ title: 'Decline failed', description: e.message, variant: 'destructive' });
    } finally {
      setDeclining(false);
    }
  };

  return (
    <div className="w-64 max-w-full rounded-2xl border border-sky-500/25 bg-gradient-to-br from-sky-500/15 to-indigo-600/10 p-3.5 space-y-2" data-testid="request-bubble">
      <div className="flex items-center justify-between gap-2">
        <span className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-sky-400">
          <HandCoins className="w-3.5 h-3.5" /> {att.requester_user_id === myStreamId ? 'You requested' : `${att.requester_name ?? 'They'} requested`}
        </span>
        <StatusPill status={att.status ?? 'pending'} />
      </div>
      <p className="text-2xl font-extrabold font-mono leading-none">
        {fmt(att.amount)} <span className="text-sm font-bold">{att.currency}</span>
      </p>
      {att.note && <p className="text-xs text-foreground/80 italic">“{att.note}”</p>}
      {iAmPayer && pending && (
        <div className="flex gap-2 pt-1">
          <Button
            size="sm"
            className="flex-1 h-9 font-bold bg-emerald-500 hover:bg-emerald-600 text-white"
            data-testid="request-pay-btn"
            onClick={() => _openPayForRequest?.({
              requestId: att.request_id,
              amount: Number(att.amount),
              currency: att.currency,
              requesterUserId: att.requester_user_id,
              requesterName: att.requester_name ?? 'Contact',
              note: att.note,
            })}
          >
            Pay
          </Button>
          <Button size="sm" variant="outline" className="flex-1 h-9 font-bold" disabled={declining} onClick={decline} data-testid="request-decline-btn">
            {declining ? '…' : 'Decline'}
          </Button>
        </div>
      )}
      {!iAmPayer && pending && <p className="text-[10px] text-muted-foreground">Waiting for {att.payer_name ?? 'them'} to respond…</p>}
    </div>
  );
}

/** Factory: builds an Attachment override bound to the current user's stream id. */
export function makePaymentAttachment(myStreamId: string) {
  return function PaymentAttachment(props: AttachmentProps) {
    const atts = props.attachments ?? [];
    const payment = atts.find((a: any) => a.type === 'nanivio_payment') as any;
    const request = atts.find((a: any) => a.type === 'nanivio_payment_request') as any;
    if (payment) return <PaymentBubble att={payment} myStreamId={myStreamId} />;
    if (request) return <RequestBubble att={request} myStreamId={myStreamId} />;
    return <DefaultAttachment {...props} />;
  };
}

/* ────────────────────────── payment sheet ────────────────────────── */

export function PaymentSheet({
  open, onClose, chatId, otherUserId, otherName, payRequest,
}: {
  open: boolean;
  onClose: () => void;
  chatId: string;
  otherUserId: string;  // stream id == String(db id)
  otherName: string;
  /** When set, the sheet is locked to paying this money request. */
  payRequest?: PayRequestInfo | null;
}) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { data: wallets } = useGetWallets();

  const [mode, setMode] = useState<'pay' | 'request'>('pay');
  const [walletId, setWalletId] = useState('');
  const [amount, setAmount] = useState('');
  const [note, setNote] = useState('');
  const [pin, setPin] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  // when paying a request from a different-currency wallet
  const [convertedAmount, setConvertedAmount] = useState<number | null>(null);

  const isPayingRequest = !!payRequest;
  const spendableWallets = useMemo(() => (wallets ?? []).filter(w => !w.isCrypto), [wallets]);
  const selectedWallet = spendableWallets.find(w => w.id === Number(walletId));

  // reset on open
  useEffect(() => {
    if (!open) return;
    setMode('pay');
    setNote('');
    setPin('');
    setError('');
    setConvertedAmount(null);
    if (payRequest) {
      setAmount(String(payRequest.amount));
      const match = spendableWallets.find(w => w.currencyCode === payRequest.currency);
      setWalletId(match ? String(match.id) : (spendableWallets[0] ? String(spendableWallets[0].id) : ''));
    } else {
      setAmount('');
      setWalletId(spendableWallets[0] ? String(spendableWallets[0].id) : '');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, payRequest?.requestId, wallets?.length]);

  // convert requested amount into the selected wallet's currency
  useEffect(() => {
    if (!isPayingRequest || !selectedWallet || !payRequest) return;
    if (selectedWallet.currencyCode === payRequest.currency) {
      setConvertedAmount(null);
      setAmount(String(payRequest.amount));
      return;
    }
    let cancel = false;
    fetch(`${API}/rates?from=${selectedWallet.currencyCode}&to=${payRequest.currency}`)
      .then(r => (r.ok ? r.json() : null))
      .then((d: any) => {
        if (cancel || !d?.rate) return;
        const amt = Math.round((payRequest.amount / d.rate) * 100) / 100;
        setConvertedAmount(amt);
        setAmount(String(amt));
      })
      .catch(() => {});
    return () => { cancel = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isPayingRequest, walletId, payRequest?.requestId]);

  if (!open) return null;
  const numAmount = Number(amount) || 0;
  const effectiveMode = isPayingRequest ? 'pay' : mode;

  const submit = async () => {
    setError('');
    if (!selectedWallet || numAmount <= 0) { setError('Enter a valid amount.'); return; }
    setBusy(true);
    try {
      if (effectiveMode === 'pay') {
        if (!/^\d{4}$/.test(pin)) { setError('Enter your 4-digit PIN.'); setBusy(false); return; }
        const r = await fetch(`${API}/p2p/transfers`, {
          method: 'POST', headers: authHeaders(),
          body: JSON.stringify({
            toUserId: Number(otherUserId),
            fromWalletId: selectedWallet.id,
            amount: numAmount,
            note: note || undefined,
            pin,
            chatId,
            ...(payRequest ? { requestId: payRequest.requestId } : {}),
          }),
        });
        const d = await r.json().catch(() => ({} as any));
        if (!r.ok) throw new Error(d.message ?? d.error ?? 'Transfer failed');
        queryClient.invalidateQueries({ queryKey: getGetWalletsQueryKey() });
        queryClient.invalidateQueries({ queryKey: getGetTransactionsQueryKey() });
        queryClient.invalidateQueries({ queryKey: getGetDashboardSummaryQueryKey() });
        toast({
          title: 'Money sent 💸',
          description: `${fmt(Number(d.fromAmount ?? numAmount))} ${d.fromCurrency ?? selectedWallet.currencyCode} sent to ${otherName}${d.toCurrency && d.toCurrency !== d.fromCurrency ? ` (received ${fmt(Number(d.toAmount))} ${d.toCurrency})` : ''}.`,
        });
      } else {
        const r = await fetch(`${API}/p2p/requests`, {
          method: 'POST', headers: authHeaders(),
          body: JSON.stringify({
            fromUserId: Number(otherUserId),
            chatId,
            amount: numAmount,
            currencyCode: selectedWallet.currencyCode,
            note: note || undefined,
          }),
        });
        const d = await r.json().catch(() => ({} as any));
        if (!r.ok) throw new Error(d.message ?? d.error ?? 'Request failed');
        toast({ title: 'Request sent', description: `Asked ${otherName} for ${fmt(numAmount)} ${selectedWallet.currencyCode}.` });
      }
      onClose();
    } catch (e: any) {
      setError(e.message ?? 'Something went wrong.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="absolute inset-0 z-40 flex items-end" onClick={onClose}>
      <div className="absolute inset-0 bg-black/50 backdrop-blur-[2px]" />
      <div
        className="relative w-full max-h-[85%] overflow-y-auto overscroll-contain rounded-t-3xl border-t border-white/10 bg-card/95 backdrop-blur-xl p-4 pb-6 space-y-4 animate-in slide-in-from-bottom-4 duration-300"
        onClick={e => e.stopPropagation()}
        data-testid="payment-sheet"
      >
        <div className="mx-auto w-10 h-1 rounded-full bg-white/20" />
        <div className="flex items-center justify-between">
          <p className="font-bold text-sm">
            {isPayingRequest ? `Pay ${payRequest!.requesterName}'s request` : `Money · ${otherName}`}
          </p>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground"><X className="w-4 h-4" /></button>
        </div>

        {!isPayingRequest && (
          <div className="grid grid-cols-2 gap-2 p-1 rounded-xl bg-white/[0.04]">
            {(['pay', 'request'] as const).map(m => (
              <button
                key={m}
                onClick={() => { setMode(m); setError(''); }}
                data-testid={`mode-${m}`}
                className={cn(
                  'h-9 rounded-lg text-sm font-bold transition-colors',
                  mode === m ? 'bg-primary text-primary-foreground shadow' : 'text-muted-foreground hover:text-foreground',
                )}
              >
                {m === 'pay' ? '💸 Send' : '🙏 Request'}
              </button>
            ))}
          </div>
        )}

        {isPayingRequest && (
          <div className="p-3 rounded-xl bg-sky-500/10 border border-sky-500/20 text-xs">
            Requested: <span className="font-bold font-mono">{fmt(payRequest!.amount)} {payRequest!.currency}</span>
            {payRequest!.note && <span className="italic"> — “{payRequest!.note}”</span>}
          </div>
        )}

        <div className="space-y-2">
          <Label className="text-xs">{effectiveMode === 'pay' ? 'From wallet' : 'Currency (your wallet)'}</Label>
          <Select value={walletId} onValueChange={setWalletId}>
            <SelectTrigger data-testid="wallet-select"><SelectValue placeholder="Select wallet" /></SelectTrigger>
            <SelectContent>
              {spendableWallets.map(w => (
                <SelectItem key={w.id} value={String(w.id)}>
                  {w.flag} {w.currencyCode} — {Number(w.balance).toLocaleString('en-US', { minimumFractionDigits: 2 })}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2">
          <Label className="text-xs">Amount {selectedWallet ? `(${selectedWallet.currencyCode})` : ''}</Label>
          <Input
            type="number" inputMode="decimal" min="0" step="0.01" placeholder="0.00"
            value={amount}
            onChange={e => setAmount(e.target.value)}
            disabled={isPayingRequest}
            className="text-lg font-mono font-bold"
            data-testid="amount-input"
          />
          {isPayingRequest && convertedAmount !== null && (
            <p className="text-[11px] text-muted-foreground">
              ≈ {fmt(payRequest!.amount)} {payRequest!.currency} converted from your {selectedWallet?.currencyCode} wallet
            </p>
          )}
          {effectiveMode === 'pay' && <p className="text-[11px] text-muted-foreground">A small transfer fee may apply.</p>}
        </div>

        <div className="space-y-2">
          <Label className="text-xs">Note (optional)</Label>
          <Input value={note} onChange={e => setNote(e.target.value)} maxLength={200} placeholder="What's it for?" data-testid="note-input" />
        </div>

        {effectiveMode === 'pay' && (
          <div className="space-y-2">
            <Label className="text-xs flex items-center gap-1"><ShieldCheck className="w-3.5 h-3.5 text-primary" /> 4-digit PIN</Label>
            <Input
              type="password" inputMode="numeric" maxLength={4} placeholder="••••"
              value={pin}
              onChange={e => setPin(e.target.value.replace(/\D/g, '').slice(0, 4))}
              className="text-center text-xl tracking-[0.5em] font-mono max-w-[140px]"
              data-testid="pin-input"
            />
          </div>
        )}

        {error && <p className="text-sm text-destructive" data-testid="payment-error">{error}</p>}

        <Button
          className="w-full h-11 font-bold"
          disabled={busy || !selectedWallet || numAmount <= 0 || (effectiveMode === 'pay' && pin.length !== 4)}
          onClick={submit}
          data-testid="payment-submit"
        >
          {busy
            ? 'Processing…'
            : effectiveMode === 'pay'
              ? `Send ${numAmount > 0 ? fmt(numAmount) : ''} ${selectedWallet?.currencyCode ?? ''}`
              : `Request ${numAmount > 0 ? fmt(numAmount) : ''} ${selectedWallet?.currencyCode ?? ''}`}
        </Button>
      </div>
    </div>
  );
}
