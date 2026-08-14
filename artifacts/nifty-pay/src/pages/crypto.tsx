import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useLocation } from 'wouter';
import { useAuth } from '@/contexts/auth';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { useToast } from '@/hooks/use-toast';
import { Bitcoin, Wallet, QrCode, Clock, CheckCircle2, XCircle, AlertTriangle, ChevronRight, ArrowLeft, Copy, RefreshCw } from 'lucide-react';

import { API_BASE as API } from '@/lib/api';

// ── Network configuration (mirrors backend) ───────────────────────────────────
const SUPPORTED_NETWORKS = [
  { id: 'TRC20', symbol: 'USDT', label: 'USDT TRC20', networkName: 'TRON Network', icon: '💵', color: 'text-green-500', bg: 'bg-green-500/10' },
  // Add more networks here as they become available
  { id: 'ERC20',  symbol: 'USDT', label: 'USDT ERC20',  networkName: 'Ethereum',       icon: '💎', color: 'text-blue-500',   bg: 'bg-blue-500/10',   disabled: true },
  { id: 'BEP20',  symbol: 'USDT', label: 'USDT BEP20',  networkName: 'BNB Chain',       icon: '🟡', color: 'text-yellow-500', bg: 'bg-yellow-500/10', disabled: true },
  { id: 'BTC',    symbol: 'BTC',  label: 'Bitcoin',     networkName: 'Bitcoin Network', icon: '₿',  color: 'text-orange-500', bg: 'bg-orange-500/10', disabled: true },
];

const WALLET_TYPES = [
  { id: 'trust_wallet',   label: 'Trust Wallet',    icon: '🛡️' },
  { id: 'metamask',       label: 'MetaMask',         icon: '🦊' },
  { id: 'coinbase',       label: 'Coinbase Wallet',  icon: '🔵' },
  { id: 'bybit',          label: 'Bybit Wallet',     icon: '🟡' },
  { id: 'binance',        label: 'Binance Wallet',   icon: '🟠' },
  { id: 'manual',         label: 'Other / Manual',   icon: '✏️' },
];

type PaymentStep = 'choose_method' | 'choose_network' | 'enter_details' | 'submitting';

function statusBadge(status: string) {
  switch (status) {
    case 'waiting_for_payment': return <Badge className="bg-amber-500/10 text-amber-500 border-amber-500/20 gap-1"><Clock className="w-3 h-3"/>Waiting</Badge>;
    case 'confirming':          return <Badge className="bg-blue-500/10 text-blue-500 border-blue-500/20 gap-1"><RefreshCw className="w-3 h-3"/>Confirming</Badge>;
    case 'completed':           return <Badge className="bg-emerald-500/10 text-emerald-500 border-emerald-500/20 gap-1"><CheckCircle2 className="w-3 h-3"/>Completed</Badge>;
    case 'failed':              return <Badge className="bg-red-500/10 text-red-500 border-red-500/20 gap-1"><XCircle className="w-3 h-3"/>Failed</Badge>;
    case 'expired':             return <Badge className="bg-muted text-muted-foreground gap-1"><AlertTriangle className="w-3 h-3"/>Expired</Badge>;
    default:                    return <Badge variant="outline">{status}</Badge>;
  }
}

export default function CryptoPage() {
  const [, setLocation] = useLocation();
  const { token } = useAuth();
  const { toast } = useToast();
  const qc = useQueryClient();

  // Form state
  const [step, setStep]               = useState<PaymentStep>('choose_method');
  const [paymentMethod, setPaymentMethod] = useState<'wallet_address' | 'connect_wallet' | null>(null);
  const [selectedNetwork, setSelectedNetwork] = useState('TRC20');
  const [amount, setAmount]           = useState('');
  const [walletType, setWalletType]   = useState('');
  const [senderWalletAddress, setSenderWalletAddress] = useState('');
  const [note, setNote]               = useState('');

  const headers = { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` };

  // History
  const { data: payments, isLoading } = useQuery({
    queryKey: ['crypto-payments'],
    queryFn: () => fetch(`${API}/crypto/payments`, { headers }).then(r => r.json()),
    enabled: !!token,
    refetchInterval: 15000,
  });

  // Create payment mutation
  const create = useMutation({
    mutationFn: () => fetch(`${API}/crypto/payments`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ amount: parseFloat(amount), network: selectedNetwork, paymentMethod, walletType: walletType || undefined, senderWalletAddress: senderWalletAddress.trim() || undefined, note: note.trim() || undefined }),
    }).then(async r => { const d = await r.json(); if (!r.ok) throw new Error(d.error ?? 'Failed'); return d; }),
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ['crypto-payments'] });
      setLocation(`/crypto/${data.id}`);
    },
    onError: (e: any) => toast({ title: 'Error', description: e.message, variant: 'destructive' }),
  });

  const reset = () => { setStep('choose_method'); setPaymentMethod(null); setAmount(''); setWalletType(''); setSenderWalletAddress(''); setNote(''); };

  const networkConfig = SUPPORTED_NETWORKS.find(n => n.id === selectedNetwork);

  // ── STEP: choose method ──────────────────────────────────────────────────────
  const renderChooseMethod = () => (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-bold">Choose Payment Method</h2>
        <p className="text-sm text-muted-foreground">How would you like to pay?</p>
      </div>
      {[
        {
          id: 'wallet_address' as const,
          label: 'Pay to Wallet Address',
          desc: 'We show you our wallet address + QR code. Pay from any compatible crypto wallet app.',
          icon: QrCode,
          bg: 'bg-primary/10',
          color: 'text-primary',
        },
        {
          id: 'connect_wallet' as const,
          label: 'Connect Your Wallet',
          desc: 'Enter your wallet address and pay from Trust Wallet, MetaMask, Bybit, Binance, or any compatible wallet.',
          icon: Wallet,
          bg: 'bg-blue-500/10',
          color: 'text-blue-500',
        },
      ].map(m => {
        const Icon = m.icon;
        return (
          <button
            key={m.id}
            type="button"
            onClick={() => { setPaymentMethod(m.id); setStep('choose_network'); }}
            className="w-full text-left rounded-xl border-2 border-border hover:border-primary/50 bg-card p-4 transition-all flex items-center gap-4"
          >
            <div className={`w-12 h-12 rounded-full ${m.bg} flex items-center justify-center shrink-0`}>
              <Icon className={`w-6 h-6 ${m.color}`} />
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-bold text-sm">{m.label}</p>
              <p className="text-xs text-muted-foreground mt-0.5">{m.desc}</p>
            </div>
            <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0" />
          </button>
        );
      })}
    </div>
  );

  // ── STEP: choose network ─────────────────────────────────────────────────────
  const renderChooseNetwork = () => (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="sm" className="px-2" onClick={() => setStep('choose_method')}>
          <ArrowLeft className="w-4 h-4 mr-1" /> Back
        </Button>
        <div>
          <h2 className="text-lg font-bold">Select Network</h2>
          <p className="text-sm text-muted-foreground">Choose the crypto network for your payment</p>
        </div>
      </div>
      <div className="space-y-2">
        {SUPPORTED_NETWORKS.map(n => (
          <button
            key={n.id}
            type="button"
            disabled={n.disabled}
            onClick={() => { if (!n.disabled) { setSelectedNetwork(n.id); setStep('enter_details'); } }}
            className={`w-full text-left rounded-xl border-2 p-4 transition-all flex items-center gap-4 ${
              n.disabled ? 'opacity-40 cursor-not-allowed border-border bg-muted/30' :
              selectedNetwork === n.id ? 'border-primary bg-primary/5' : 'border-border bg-card hover:border-primary/40'
            }`}
          >
            <span className="text-2xl shrink-0">{n.icon}</span>
            <div className="flex-1 min-w-0">
              <p className="font-bold text-sm">{n.label}</p>
              <p className="text-xs text-muted-foreground">{n.networkName}</p>
            </div>
            {n.disabled && <Badge variant="outline" className="text-xs shrink-0">Coming Soon</Badge>}
            {!n.disabled && <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0" />}
          </button>
        ))}
      </div>
    </div>
  );

  // ── STEP: enter details ──────────────────────────────────────────────────────
  const renderEnterDetails = () => (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="sm" className="px-2" onClick={() => setStep('choose_network')}>
          <ArrowLeft className="w-4 h-4 mr-1" /> Back
        </Button>
        <div>
          <h2 className="text-lg font-bold">Payment Details</h2>
          <p className="text-sm text-muted-foreground">{networkConfig?.icon} {networkConfig?.label} · {networkConfig?.networkName}</p>
        </div>
      </div>

      <Card>
        <CardContent className="p-4 space-y-4">
          {/* Amount */}
          <div className="space-y-1.5">
            <Label>Amount ({networkConfig?.symbol})</Label>
            <div className="relative">
              <Input
                type="number"
                min="0"
                step="any"
                placeholder="Enter amount"
                value={amount}
                onChange={e => setAmount(e.target.value)}
                className="pr-16 font-mono text-lg"
              />
              <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground font-semibold">{networkConfig?.symbol}</span>
            </div>
          </div>

          {/* Connect Wallet: wallet type selector */}
          {paymentMethod === 'connect_wallet' && (
            <>
              <div className="space-y-1.5">
                <Label>Your Wallet App</Label>
                <div className="grid grid-cols-3 gap-2">
                  {WALLET_TYPES.map(w => (
                    <button
                      key={w.id}
                      type="button"
                      onClick={() => setWalletType(w.id)}
                      className={`flex flex-col items-center gap-1 rounded-xl border-2 p-2.5 text-center transition-colors ${
                        walletType === w.id ? 'border-primary bg-primary/5' : 'border-border bg-card hover:border-primary/40'
                      }`}
                    >
                      <span className="text-xl">{w.icon}</span>
                      <span className="text-[10px] font-semibold leading-tight">{w.label}</span>
                    </button>
                  ))}
                </div>
              </div>

              <div className="space-y-1.5">
                <Label>Your Wallet Address <span className="text-muted-foreground font-normal">(optional)</span></Label>
                <Input
                  placeholder={`Your ${networkConfig?.networkName} wallet address`}
                  value={senderWalletAddress}
                  onChange={e => setSenderWalletAddress(e.target.value)}
                  className="font-mono text-xs"
                />
                <p className="text-xs text-muted-foreground">We only record your address — we never ask for private keys or seed phrases.</p>
              </div>
            </>
          )}

          {/* Optional note */}
          <div className="space-y-1.5">
            <Label>Note <span className="text-muted-foreground font-normal">(optional)</span></Label>
            <Input placeholder="What's this payment for?" value={note} onChange={e => setNote(e.target.value)} />
          </div>
        </CardContent>
      </Card>

      {/* Security notice */}
      <div className="rounded-xl bg-amber-500/5 border border-amber-500/20 p-3.5 space-y-1">
        <p className="text-xs font-semibold text-amber-600 dark:text-amber-400">🔒 Security reminder</p>
        <ul className="text-xs text-muted-foreground space-y-0.5 ml-1 list-disc list-inside">
          <li>Never share your private keys or seed phrases</li>
          <li>Always verify the wallet address before sending</li>
          <li>Double-check the network — sending on the wrong network loses funds</li>
          <li>You will approve every transaction in your own wallet app</li>
        </ul>
      </div>

      <Button
        className="w-full font-bold"
        size="lg"
        disabled={!amount || parseFloat(amount) <= 0 || create.isPending}
        onClick={() => create.mutate()}
      >
        {create.isPending ? <><RefreshCw className="w-4 h-4 mr-2 animate-spin" />Creating Payment…</> : `Create ${networkConfig?.symbol} Payment →`}
      </Button>
    </div>
  );

  return (
    <div className="p-4 md:p-8 max-w-2xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold tracking-tight flex items-center gap-2">
            <Bitcoin className="w-7 h-7 text-orange-500" /> Crypto Payment
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">Pay with USDT, Bitcoin, and more</p>
        </div>
      </div>

      {/* Create payment form */}
      <Card>
        <CardContent className="p-4">
          {step === 'choose_method'  && renderChooseMethod()}
          {step === 'choose_network' && renderChooseNetwork()}
          {step === 'enter_details'  && renderEnterDetails()}
        </CardContent>
      </Card>

      {/* Payment history */}
      <div className="space-y-2">
        <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Your Crypto Payments</p>
        {isLoading && <div className="space-y-2">{[...Array(3)].map((_, i) => <Skeleton key={i} className="h-16" />)}</div>}
        {!isLoading && (payments as any[])?.length === 0 && (
          <Card><CardContent className="py-8 text-center text-sm text-muted-foreground">No crypto payments yet</CardContent></Card>
        )}
        {(payments as any[] ?? []).map((p: any) => (
          <button
            key={p.id}
            type="button"
            onClick={() => setLocation(`/crypto/${p.id}`)}
            className="w-full text-left rounded-xl border border-border bg-card hover:bg-muted/30 transition-colors p-3.5 flex items-center gap-3"
          >
            <div className="w-10 h-10 rounded-full bg-orange-500/10 flex items-center justify-center shrink-0">
              <Bitcoin className="w-5 h-5 text-orange-500" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <p className="font-semibold text-sm">{p.amount?.toLocaleString('en-US', { minimumFractionDigits: 2 })} {p.currency}</p>
                <span className="text-xs text-muted-foreground">{p.network}</span>
              </div>
              <p className="text-xs text-muted-foreground">{new Date(p.createdAt).toLocaleDateString()} · #{p.id}</p>
            </div>
            <div className="shrink-0">{statusBadge(p.status)}</div>
          </button>
        ))}
      </div>
    </div>
  );
}
