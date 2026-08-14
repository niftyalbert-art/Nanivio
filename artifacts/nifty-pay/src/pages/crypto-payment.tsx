import { useState } from 'react';
import { useRoute, useLocation } from 'wouter';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/contexts/auth';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { useToast } from '@/hooks/use-toast';
import {
  CheckCircle2, XCircle, Clock, AlertTriangle, Copy, ArrowLeft,
  RefreshCw, ExternalLink, Bitcoin, Wallet
} from 'lucide-react';

import { API_BASE as API } from '@/lib/api';

// Reusable QR code image — uses the free, open-source qrserver.com API
function QRCode({ data, size = 200 }: { data: string; size?: number }) {
  const url = `https://api.qrserver.com/v1/create-qr-code/?size=${size}x${size}&data=${encodeURIComponent(data)}&format=svg&qzone=1`;
  return (
    <img
      src={url}
      alt="Wallet address QR code"
      width={size}
      height={size}
      className="rounded-xl border border-border bg-white p-2 mx-auto"
      loading="lazy"
    />
  );
}

function StatusIcon({ status }: { status: string }) {
  switch (status) {
    case 'waiting_for_payment': return <Clock className="w-8 h-8 text-amber-500" />;
    case 'confirming':          return <RefreshCw className="w-8 h-8 text-blue-500 animate-spin" />;
    case 'completed':           return <CheckCircle2 className="w-8 h-8 text-emerald-500" />;
    case 'failed':
    case 'expired':             return <XCircle className="w-8 h-8 text-red-500" />;
    default:                    return <AlertTriangle className="w-8 h-8 text-muted-foreground" />;
  }
}

function StatusBadge({ status }: { status: string }) {
  switch (status) {
    case 'waiting_for_payment': return <Badge className="bg-amber-500/10 text-amber-500 border-amber-500/20">Waiting for Payment</Badge>;
    case 'confirming':          return <Badge className="bg-blue-500/10 text-blue-500 border-blue-500/20">Confirming on Blockchain</Badge>;
    case 'completed':           return <Badge className="bg-emerald-500/10 text-emerald-500 border-emerald-500/20">Completed ✓</Badge>;
    case 'failed':              return <Badge className="bg-red-500/10 text-red-500 border-red-500/20">Failed</Badge>;
    case 'expired':             return <Badge className="bg-muted text-muted-foreground">Expired</Badge>;
    default:                    return <Badge variant="outline">{status}</Badge>;
  }
}

export default function CryptoPaymentPage() {
  const [, params] = useRoute('/crypto/:id');
  const [, setLocation] = useLocation();
  const { token } = useAuth();
  const { toast } = useToast();
  const qc = useQueryClient();
  const id = params?.id;

  const [txHash, setTxHash] = useState('');
  const [showTxField, setShowTxField] = useState(false);

  const headers = { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` };

  const { data: payment, isLoading } = useQuery({
    queryKey: ['crypto-payment', id],
    queryFn: () => fetch(`${API}/crypto/payments/${id}`, { headers }).then(async r => {
      const d = await r.json(); if (!r.ok) throw new Error(d.error); return d;
    }),
    enabled: !!token && !!id,
    refetchInterval: (q) => {
      const status = (q.state.data as any)?.status;
      // Poll while waiting or confirming
      return status === 'waiting_for_payment' || status === 'confirming' ? 8000 : false;
    },
  });

  const markPaid = useMutation({
    mutationFn: () => fetch(`${API}/crypto/payments/${id}/paid`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ transactionHash: txHash.trim() || undefined }),
    }).then(async r => { const d = await r.json(); if (!r.ok) throw new Error(d.error); return d; }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['crypto-payment', id] });
      qc.invalidateQueries({ queryKey: ['crypto-payments'] });
      toast({ title: '✅ Payment submitted', description: 'We will confirm your payment on the blockchain.' });
    },
    onError: (e: any) => toast({ title: 'Error', description: e.message, variant: 'destructive' }),
  });

  const cancel = useMutation({
    mutationFn: () => fetch(`${API}/crypto/payments/${id}/cancel`, { method: 'POST', headers }).then(async r => {
      const d = await r.json(); if (!r.ok) throw new Error(d.error); return d;
    }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['crypto-payment', id] });
      qc.invalidateQueries({ queryKey: ['crypto-payments'] });
      toast({ title: 'Payment cancelled' });
    },
    onError: (e: any) => toast({ title: 'Error', description: e.message, variant: 'destructive' }),
  });

  const copyAddress = () => {
    navigator.clipboard?.writeText(payment?.receiverAddress ?? '').catch(() => {});
    toast({ title: '📋 Address copied to clipboard' });
  };
  const copyHash = () => {
    navigator.clipboard?.writeText(payment?.transactionHash ?? '').catch(() => {});
    toast({ title: '📋 Transaction hash copied' });
  };

  if (isLoading) {
    return (
      <div className="p-4 md:p-8 max-w-2xl mx-auto space-y-4">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-64" />
        <Skeleton className="h-32" />
      </div>
    );
  }

  if (!payment) {
    return (
      <div className="p-4 md:p-8 max-w-2xl mx-auto text-center space-y-4 mt-16">
        <XCircle className="w-12 h-12 mx-auto text-muted-foreground" />
        <p className="text-lg font-semibold">Payment not found</p>
        <Button onClick={() => setLocation('/crypto')}>Back to Crypto Payments</Button>
      </div>
    );
  }

  const p = payment as any;
  const isWaiting    = p.status === 'waiting_for_payment';
  const isConfirming = p.status === 'confirming';
  const isCompleted  = p.status === 'completed';
  const isFinalised  = ['completed', 'failed', 'expired'].includes(p.status);

  // Time remaining (if waiting)
  const timeLeft = p.expiresAt ? Math.max(0, Math.floor((new Date(p.expiresAt).getTime() - Date.now()) / 1000)) : null;
  const minsLeft = timeLeft !== null ? Math.floor(timeLeft / 60) : null;
  const secsLeft = timeLeft !== null ? timeLeft % 60 : null;

  return (
    <div className="p-4 md:p-8 max-w-2xl mx-auto space-y-5">
      {/* Back button */}
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="sm" className="px-2" onClick={() => setLocation('/crypto')}>
          <ArrowLeft className="w-4 h-4 mr-1" /> All Payments
        </Button>
        <div>
          <h1 className="text-xl font-bold">Crypto Payment #{p.id}</h1>
          <p className="text-xs text-muted-foreground">{p.currency} · {p.network}</p>
        </div>
      </div>

      {/* Status card */}
      <Card className={
        isCompleted  ? 'border-emerald-500/30 bg-emerald-500/5' :
        isConfirming ? 'border-blue-500/30 bg-blue-500/5' :
        isWaiting    ? 'border-amber-500/30 bg-amber-500/5' :
        'border-red-500/30 bg-red-500/5'
      }>
        <CardContent className="p-5 text-center space-y-3">
          <div className="w-16 h-16 rounded-full bg-background flex items-center justify-center mx-auto">
            <StatusIcon status={p.status} />
          </div>
          <StatusBadge status={p.status} />
          <p className="text-3xl font-bold font-mono">{Number(p.amount).toLocaleString('en-US', { minimumFractionDigits: 2 })} {p.currency}</p>
          <p className="text-sm text-muted-foreground">{p.network} Network</p>

          {/* Countdown timer for waiting payments */}
          {isWaiting && timeLeft !== null && timeLeft > 0 && (
            <div className="inline-flex items-center gap-1.5 bg-amber-500/10 text-amber-600 rounded-full px-3 py-1 text-sm font-semibold">
              <Clock className="w-3.5 h-3.5" />
              Expires in {minsLeft}:{String(secsLeft).padStart(2, '0')}
            </div>
          )}

          {/* Confirming — blockchain progress */}
          {isConfirming && (
            <div className="bg-blue-500/10 rounded-xl p-3 space-y-1">
              <p className="text-sm font-semibold text-blue-600 dark:text-blue-400">Verifying on blockchain…</p>
              <p className="text-xs text-muted-foreground">
                {p.confirmations ?? 0} / {p.requiredConfirmations} confirmations received.
                This usually takes 10–30 minutes.
              </p>
              <div className="w-full bg-blue-500/20 rounded-full h-2 mt-2">
                <div
                  className="bg-blue-500 h-2 rounded-full transition-all"
                  style={{ width: `${Math.min(100, ((p.confirmations ?? 0) / p.requiredConfirmations) * 100)}%` }}
                />
              </div>
            </div>
          )}

          {isCompleted && p.completedAt && (
            <p className="text-xs text-muted-foreground">Completed {new Date(p.completedAt).toLocaleString()}</p>
          )}
        </CardContent>
      </Card>

      {/* Payment instructions — only show while waiting */}
      {isWaiting && (
        <div className="space-y-4">
          <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Send Payment Instructions</p>

          {/* QR code */}
          <Card>
            <CardContent className="p-5 space-y-4">
              <div className="text-center space-y-1">
                <p className="text-sm font-semibold">Scan QR code or copy address below</p>
                <p className="text-xs text-muted-foreground">Send exactly <strong className="font-mono">{Number(p.amount).toLocaleString('en-US', { minimumFractionDigits: 2 })} {p.currency}</strong> to this {p.network} address</p>
              </div>

              <QRCode data={p.receiverAddress} size={220} />

              {/* Wallet address */}
              <div className="space-y-2">
                <Label className="text-xs">Wallet Address ({p.network})</Label>
                <div className="flex gap-2 items-center">
                  <code className="flex-1 text-xs bg-muted rounded-lg px-3 py-2.5 font-mono break-all border border-border">
                    {p.receiverAddress}
                  </code>
                  <Button size="sm" variant="outline" className="h-10 shrink-0 gap-1.5" onClick={copyAddress}>
                    <Copy className="w-3.5 h-3.5" /> Copy
                  </Button>
                </div>
              </div>

              {/* Network warning */}
              <div className="flex items-start gap-2 rounded-lg bg-red-500/5 border border-red-500/20 p-3">
                <AlertTriangle className="w-4 h-4 text-red-500 shrink-0 mt-0.5" />
                <p className="text-xs text-red-600 dark:text-red-400 font-medium">
                  Only send {p.currency} on the <strong>{p.network}</strong> network. Sending on any other network will result in permanent loss of funds.
                </p>
              </div>

              {/* Steps */}
              <div className="space-y-2 pt-1">
                <p className="text-xs font-semibold">How to pay:</p>
                <ol className="text-xs text-muted-foreground space-y-1.5 list-decimal list-inside">
                  <li>Open your crypto wallet app (Trust Wallet, Bybit, Binance, etc.)</li>
                  <li>Select {p.currency} on the {p.network} network</li>
                  <li>Send exactly <strong>{Number(p.amount).toLocaleString('en-US', { minimumFractionDigits: 2 })} {p.currency}</strong> to the address above</li>
                  <li>Come back and tap "I Have Paid" below</li>
                </ol>
              </div>
            </CardContent>
          </Card>

          {/* Transaction hash (optional) */}
          {showTxField ? (
            <Card>
              <CardContent className="p-4 space-y-3">
                <div className="space-y-1.5">
                  <Label className="text-xs">Transaction Hash <span className="text-muted-foreground font-normal">(optional but speeds up confirmation)</span></Label>
                  <Input
                    placeholder="Paste your transaction hash here"
                    value={txHash}
                    onChange={e => setTxHash(e.target.value)}
                    className="font-mono text-xs"
                  />
                </div>
              </CardContent>
            </Card>
          ) : (
            <button type="button" className="text-xs text-primary underline underline-offset-2" onClick={() => setShowTxField(true)}>
              + Add transaction hash (optional)
            </button>
          )}

          {/* Action buttons */}
          <Button
            size="lg"
            className="w-full font-bold"
            onClick={() => markPaid.mutate()}
            disabled={markPaid.isPending}
          >
            {markPaid.isPending ? <><RefreshCw className="w-4 h-4 mr-2 animate-spin" />Submitting…</> : '✅ I Have Paid'}
          </Button>

          <Button variant="ghost" size="sm" className="w-full text-muted-foreground text-xs" onClick={() => cancel.mutate()} disabled={cancel.isPending}>
            Cancel this payment
          </Button>
        </div>
      )}

      {/* Payment details */}
      <Card>
        <CardContent className="p-4 space-y-2">
          <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">Payment Details</p>
          {[
            { label: 'Payment ID',    value: `#${p.id}` },
            { label: 'Network',       value: p.network },
            { label: 'Currency',      value: p.currency },
            { label: 'Method',        value: p.paymentMethod === 'connect_wallet' ? 'Connect Wallet' : 'Wallet Address' },
            { label: 'Created',       value: new Date(p.createdAt).toLocaleString() },
            ...(p.transactionHash ? [{ label: 'Tx Hash', value: p.transactionHash, mono: true, copy: copyHash }] : []),
            ...(p.senderWalletAddress ? [{ label: 'Your Wallet', value: p.senderWalletAddress, mono: true }] : []),
            ...(p.note ? [{ label: 'Note', value: p.note }] : []),
          ].map(({ label, value, mono, copy }: any) => (
            <div key={label} className="flex items-start justify-between gap-3 py-1.5 border-b border-border/50 last:border-0">
              <span className="text-xs text-muted-foreground shrink-0">{label}</span>
              <div className="flex items-center gap-1.5 min-w-0">
                <span className={`text-xs font-semibold text-right truncate max-w-[180px] ${mono ? 'font-mono' : ''}`}>{value}</span>
                {copy && (
                  <button type="button" onClick={copy} className="text-muted-foreground hover:text-foreground shrink-0">
                    <Copy className="w-3 h-3" />
                  </button>
                )}
              </div>
            </div>
          ))}
        </CardContent>
      </Card>

      {/* Create new payment if finalised */}
      {isFinalised && (
        <Button variant="outline" className="w-full" onClick={() => setLocation('/crypto')}>
          Create New Crypto Payment
        </Button>
      )}
    </div>
  );
}
