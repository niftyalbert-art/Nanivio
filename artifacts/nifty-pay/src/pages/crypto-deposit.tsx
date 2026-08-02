import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useRoute, useLocation } from 'wouter';
import { useAuth } from '@/contexts/auth';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { useToast } from '@/hooks/use-toast';
import {
  Bitcoin, CheckCircle2, XCircle, Clock, AlertTriangle, Copy,
  ArrowLeft, RefreshCw, Zap, ShieldCheck, Wallet
} from 'lucide-react';

const API = import.meta.env.BASE_URL.replace(/\/$/, '') + '/api';

// Reusable QR via free public API — no npm package needed
function QRCode({ data, size = 200 }: { data: string; size?: number }) {
  const url = `https://api.qrserver.com/v1/create-qr-code/?size=${size}x${size}&data=${encodeURIComponent(data)}&format=svg&qzone=1`;
  return (
    <img
      src={url}
      alt="Deposit address QR code"
      width={size}
      height={size}
      className="rounded-xl border border-border bg-white p-2 mx-auto"
      loading="lazy"
    />
  );
}

type Step = 'select_wallet' | 'enter_amount' | 'waiting' | 'completed' | 'expired';

function statusBadge(status: string) {
  switch (status) {
    case 'waiting':    return <Badge className="bg-amber-500/10 text-amber-500 border-amber-500/20 gap-1"><Clock className="w-3 h-3"/>Waiting for Payment</Badge>;
    case 'detecting':  return <Badge className="bg-blue-500/10 text-blue-500 border-blue-500/20 gap-1"><RefreshCw className="w-3 h-3 animate-spin"/>Detecting on Blockchain</Badge>;
    case 'completed':  return <Badge className="bg-emerald-500/10 text-emerald-500 border-emerald-500/20 gap-1"><CheckCircle2 className="w-3 h-3"/>Completed ✓</Badge>;
    case 'expired':    return <Badge className="bg-muted text-muted-foreground gap-1"><AlertTriangle className="w-3 h-3"/>Expired</Badge>;
    default:           return <Badge variant="outline">{status}</Badge>;
  }
}

// ── Deep-link: /crypto/deposit/:id — shows existing deposit ───────────────────
function DepositDetailView({ id }: { id: string }) {
  const { token } = useAuth();
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const headers = { Authorization: `Bearer ${token}` };

  const { data: deposit, isLoading } = useQuery({
    queryKey: ['crypto-deposit', id],
    queryFn: () => fetch(`${API}/crypto/deposits/${id}`, { headers }).then(async r => {
      const d = await r.json(); if (!r.ok) throw new Error(d.error); return d;
    }),
    enabled: !!token && !!id,
    refetchInterval: (q) => {
      const s = (q.state.data as any)?.status;
      return s === 'waiting' || s === 'detecting' ? 8000 : false;
    },
  });

  const copyAddress = () => {
    navigator.clipboard?.writeText(deposit?.depositAddress ?? '').catch(() => {});
    toast({ title: '📋 Address copied to clipboard' });
  };

  if (isLoading) return <div className="space-y-4 p-4"><Skeleton className="h-64"/></div>;
  if (!deposit) return <div className="p-8 text-center text-muted-foreground">Deposit not found</div>;

  const d = deposit as any;
  const isActive = ['waiting', 'detecting'].includes(d.status);
  const timeLeft = d.expiresAt ? Math.max(0, Math.floor((new Date(d.expiresAt).getTime() - Date.now()) / 1000)) : null;

  return (
    <div className="space-y-5">
      {/* Status */}
      <Card className={d.status === 'completed' ? 'border-emerald-500/30 bg-emerald-500/5' : d.status === 'expired' ? 'border-red-500/20' : 'border-amber-500/20 bg-amber-500/5'}>
        <CardContent className="p-5 text-center space-y-3">
          <div className="w-16 h-16 rounded-full bg-background flex items-center justify-center mx-auto">
            {d.status === 'completed' ? <CheckCircle2 className="w-8 h-8 text-emerald-500" /> :
             d.status === 'detecting' ? <RefreshCw className="w-8 h-8 text-blue-500 animate-spin" /> :
             d.status === 'expired'   ? <XCircle className="w-8 h-8 text-red-500" /> :
             <Clock className="w-8 h-8 text-amber-500" />}
          </div>
          {statusBadge(d.status)}
          <p className="text-3xl font-bold font-mono">{Number(d.amount).toLocaleString('en-US', { minimumFractionDigits: 2 })} USDT</p>
          <p className="text-sm text-muted-foreground">TRC20 Network</p>

          {isActive && timeLeft !== null && timeLeft > 0 && (
            <div className="inline-flex items-center gap-1.5 bg-amber-500/10 text-amber-600 rounded-full px-3 py-1 text-xs font-semibold">
              <Clock className="w-3 h-3" />
              Expires in {Math.floor(timeLeft/60)}:{String(timeLeft % 60).padStart(2,'0')}
            </div>
          )}

          {d.status === 'completed' && (
            <div className="space-y-1">
              <p className="text-sm font-semibold text-emerald-600">Your wallet has been credited!</p>
              {d.receivedAmount && <p className="text-xs text-muted-foreground">Received: {Number(d.receivedAmount).toLocaleString('en-US', { minimumFractionDigits: 2 })} USDT</p>}
            </div>
          )}

          {d.status === 'detecting' && (
            <p className="text-xs text-muted-foreground">Transaction found on blockchain — verifying confirmations. This usually takes 2–5 minutes.</p>
          )}

          {d.status === 'waiting' && (
            <div className="flex items-center gap-2 bg-emerald-500/5 rounded-xl px-3 py-2 border border-emerald-500/20 text-xs text-emerald-600 font-semibold justify-center">
              <Zap className="w-3.5 h-3.5" /> Auto-detecting — no action needed from you
            </div>
          )}
        </CardContent>
      </Card>

      {/* Payment instructions (while waiting) */}
      {isActive && (
        <Card>
          <CardContent className="p-5 space-y-4">
            <div className="text-center space-y-1">
              <p className="text-sm font-semibold">Send exactly this amount to:</p>
              <p className="text-xs text-muted-foreground">Scan the QR or copy the address. Send via <strong>TRC20 network only</strong>.</p>
            </div>

            <QRCode data={d.depositAddress} size={220} />

            <div className="space-y-2">
              <Label className="text-xs">Deposit Address (TRC20)</Label>
              <div className="flex gap-2 items-center">
                <code className="flex-1 text-xs bg-muted rounded-lg px-3 py-2.5 font-mono break-all border border-border">{d.depositAddress}</code>
                <Button size="sm" variant="outline" className="h-10 shrink-0 gap-1.5" onClick={copyAddress}>
                  <Copy className="w-3.5 h-3.5" /> Copy
                </Button>
              </div>
            </div>

            <div className="bg-amber-500/5 border border-amber-500/20 rounded-xl p-3 space-y-2">
              <p className="text-xs font-semibold text-amber-600 dark:text-amber-400 flex items-center gap-1.5">
                <AlertTriangle className="w-3.5 h-3.5" /> Important
              </p>
              <ul className="text-xs text-muted-foreground space-y-1 list-disc list-inside">
                <li>Send <strong>exactly {Number(d.amount).toLocaleString('en-US', { minimumFractionDigits: 2 })} USDT</strong></li>
                <li>Only on the <strong>TRC20 (TRON)</strong> network</li>
                <li>Sending any other token or on the wrong network loses your funds permanently</li>
                <li>Detected automatically within 60 seconds of confirmation</li>
              </ul>
            </div>

            <div className="grid grid-cols-3 gap-2 text-center text-xs">
              {['Send USDT TRC20', 'Blockchain detects', 'Wallet credited'].map((step, i) => (
                <div key={step} className="space-y-1">
                  <div className="w-7 h-7 rounded-full bg-primary/10 text-primary flex items-center justify-center mx-auto font-bold text-sm">{i+1}</div>
                  <p className="text-muted-foreground leading-tight">{step}</p>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Details */}
      <Card>
        <CardContent className="p-4 space-y-1">
          <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">Deposit Details</p>
          {[
            { label: 'Deposit ID',  value: `#${d.id}` },
            { label: 'Network',     value: 'USDT TRC20' },
            { label: 'Amount',      value: `${Number(d.amount).toLocaleString('en-US', { minimumFractionDigits: 2 })} USDT` },
            { label: 'Created',     value: new Date(d.createdAt).toLocaleString() },
            ...(d.transactionHash ? [{ label: 'TX Hash', value: d.transactionHash, mono: true }] : []),
            ...(d.fromAddress ? [{ label: 'Sent From', value: d.fromAddress, mono: true }] : []),
          ].map(({ label, value, mono }: any) => (
            <div key={label} className="flex items-start justify-between gap-3 py-1.5 border-b border-border/50 last:border-0">
              <span className="text-xs text-muted-foreground shrink-0">{label}</span>
              <span className={`text-xs font-semibold text-right truncate max-w-[200px] ${mono ? 'font-mono' : ''}`}>{value}</span>
            </div>
          ))}
        </CardContent>
      </Card>

      {!isActive && (
        <Button variant="outline" className="w-full" onClick={() => setLocation('/crypto/deposit')}>
          New Crypto Deposit
        </Button>
      )}
    </div>
  );
}

// ── Main page: create deposit ─────────────────────────────────────────────────
export default function CryptoDepositPage() {
  const [matched, params] = useRoute('/crypto/deposit/:id');
  const [, setLocation] = useLocation();
  const { token } = useAuth();
  const { toast } = useToast();
  const qc = useQueryClient();

  const [step, setStep] = useState<Step>('select_wallet');
  const [selectedWalletId, setSelectedWalletId] = useState('');
  const [amount, setAmount] = useState('');
  const [createdId, setCreatedId] = useState<string | null>(null);

  const headers = { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` };

  const { data: wallets } = useQuery({
    queryKey: ['wallets'],
    queryFn: () => fetch(`${API}/wallets`, { headers }).then(r => r.json()),
    enabled: !!token,
  });

  const createDeposit = useMutation({
    mutationFn: () => fetch(`${API}/crypto/deposits`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ amount: parseFloat(amount), walletId: selectedWalletId }),
    }).then(async r => { const d = await r.json(); if (!r.ok) throw new Error(d.error); return d; }),
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ['crypto-deposits'] });
      setLocation(`/crypto/deposit/${data.id}`);
    },
    onError: (e: any) => toast({ title: 'Error', description: e.message, variant: 'destructive' }),
  });

  // If we have an :id param, show the detail view
  if (matched && params?.id) {
    return (
      <div className="p-4 md:p-8 max-w-2xl mx-auto space-y-5">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="sm" className="px-2" onClick={() => setLocation('/crypto/deposit')}>
            <ArrowLeft className="w-4 h-4 mr-1" /> Back
          </Button>
          <div>
            <h1 className="text-xl font-bold">Crypto Deposit</h1>
            <p className="text-xs text-muted-foreground">USDT TRC20 · Auto-detection</p>
          </div>
        </div>
        <DepositDetailView id={params.id} />
      </div>
    );
  }

  const walletList = ((wallets as any[]) ?? []).filter((w: any) => w.currencyCode === 'USD');

  return (
    <div className="p-4 md:p-8 max-w-2xl mx-auto space-y-5">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="sm" className="px-2" onClick={() => setLocation('/deposit')}>
          <ArrowLeft className="w-4 h-4 mr-1" /> Back
        </Button>
        <div>
          <h1 className="text-xl font-bold flex items-center gap-2"><Bitcoin className="w-5 h-5 text-orange-500" /> Crypto Deposit</h1>
          <p className="text-xs text-muted-foreground">Deposit USDT TRC20 — automatically detected on blockchain</p>
        </div>
      </div>

      {/* How it works */}
      <div className="grid grid-cols-3 gap-2 text-center text-xs">
        {[
          { icon: Wallet, label: 'Select wallet to credit', color: 'text-primary bg-primary/10' },
          { icon: Bitcoin, label: 'Send USDT TRC20 to our address', color: 'text-orange-500 bg-orange-500/10' },
          { icon: Zap, label: 'Auto-detected & credited', color: 'text-emerald-500 bg-emerald-500/10' },
        ].map(({ icon: Icon, label, color }, i) => (
          <div key={i} className="flex flex-col items-center gap-2">
            <div className={`w-10 h-10 rounded-full flex items-center justify-center ${color}`}>
              <Icon className="w-5 h-5" />
            </div>
            <p className="text-muted-foreground leading-tight">{label}</p>
          </div>
        ))}
      </div>

      {/* Step 1: Select wallet */}
      <Card>
        <CardContent className="p-4 space-y-3">
          <Label className="text-sm font-semibold">Step 1 — Which wallet should be credited?</Label>
          <div className="rounded-lg bg-amber-500/8 border border-amber-500/20 px-3 py-2 flex items-start gap-2">
            <span className="text-amber-500 text-xs mt-0.5">⚠</span>
            <p className="text-xs text-muted-foreground">USDT is credited 1:1 as USD. Only your <span className="font-semibold text-foreground">USD wallet</span> is eligible.</p>
          </div>
          <div className="space-y-2">
            {walletList.length === 0 && <p className="text-xs text-muted-foreground">No USD wallet found. Please create a USD wallet first.</p>}
            {walletList.map((w: any) => (
              <button
                key={w.id}
                type="button"
                onClick={() => setSelectedWalletId(String(w.id))}
                className={`w-full text-left rounded-xl border-2 p-3.5 transition-all flex items-center gap-3 ${
                  selectedWalletId === String(w.id) ? 'border-primary bg-primary/5' : 'border-border hover:border-primary/40 bg-card'
                }`}
              >
                <span className="text-2xl">{w.flag || '💰'}</span>
                <div className="flex-1">
                  <p className="font-semibold text-sm">{w.currencyName}</p>
                  <p className="text-xs text-muted-foreground">Balance: {Number(w.balance ?? 0).toLocaleString('en-US', { minimumFractionDigits: 2 })} {w.currencyCode}</p>
                </div>
                {selectedWalletId === String(w.id) && <CheckCircle2 className="w-5 h-5 text-primary shrink-0" />}
              </button>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Step 2: Enter amount */}
      {selectedWalletId && (
        <Card>
          <CardContent className="p-4 space-y-3">
            <Label className="text-sm font-semibold">Step 2 — How much USDT will you send?</Label>
            <p className="text-xs text-muted-foreground">Enter the exact amount you plan to send. Our system will match your blockchain transaction automatically.</p>
            <div className="relative">
              <Input
                type="number"
                min="1"
                step="any"
                placeholder="e.g. 100"
                value={amount}
                onChange={e => setAmount(e.target.value)}
                className="pr-16 text-lg font-mono"
              />
              <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground font-semibold">USDT</span>
            </div>

            {/* Security reminder */}
            <div className="flex items-start gap-2 bg-blue-500/5 rounded-xl border border-blue-500/20 p-3">
              <ShieldCheck className="w-4 h-4 text-blue-500 shrink-0 mt-0.5" />
              <p className="text-xs text-blue-700 dark:text-blue-400">
                <strong>Secure & automatic.</strong> We monitor the blockchain 24/7. You'll never need to submit a transaction hash or receipt — confirmation is fully automated.
              </p>
            </div>

            <Button
              className="w-full font-bold"
              size="lg"
              disabled={!amount || parseFloat(amount) <= 0 || createDeposit.isPending}
              onClick={() => createDeposit.mutate()}
            >
              {createDeposit.isPending
                ? <><RefreshCw className="w-4 h-4 mr-2 animate-spin" />Creating deposit…</>
                : 'Generate Deposit Address →'}
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Recent deposit history */}
      <RecentDeposits />
    </div>
  );
}

function RecentDeposits() {
  const { token } = useAuth();
  const [, setLocation] = useLocation();
  const headers = { Authorization: `Bearer ${token}` };

  const { data: deposits } = useQuery({
    queryKey: ['crypto-deposits'],
    queryFn: () => fetch(`${API}/crypto/deposits`, { headers }).then(r => r.json()),
    enabled: !!token,
    refetchInterval: 30000,
  });

  const list = (deposits as any[]) ?? [];
  if (list.length === 0) return null;

  return (
    <div className="space-y-2">
      <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Recent Deposits</p>
      {list.slice(0, 5).map((d: any) => (
        <button
          key={d.id}
          type="button"
          onClick={() => setLocation(`/crypto/deposit/${d.id}`)}
          className="w-full text-left rounded-xl border border-border bg-card hover:bg-muted/30 transition-colors p-3 flex items-center gap-3"
        >
          <div className="w-9 h-9 rounded-full bg-orange-500/10 flex items-center justify-center shrink-0">
            <Bitcoin className="w-4 h-4 text-orange-500" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="font-semibold text-sm">{Number(d.amount).toLocaleString('en-US', { minimumFractionDigits: 2 })} USDT</p>
            <p className="text-xs text-muted-foreground">{new Date(d.createdAt).toLocaleDateString()} · #{d.id}</p>
          </div>
          {statusBadge(d.status)}
        </button>
      ))}
    </div>
  );
}
