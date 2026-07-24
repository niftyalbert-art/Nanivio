import { useState } from 'react';
import {
  useGetWallets, useCreateTransaction,
  getGetWalletsQueryKey, getGetTransactionsQueryKey, getGetDashboardSummaryQueryKey,
} from '@workspace/api-client-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import { Clock, ArrowLeft, ChevronRight, Building2, Smartphone, Wallet } from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import { useLocation } from 'wouter';
import { useToast } from '@/hooks/use-toast';

type DeliveryMethod = 'botim' | 'emoney' | 'bank';
type Step = 'details' | 'method' | 'receiver' | 'review' | 'success';

const DELIVERY_METHODS = [
  {
    id: 'botim' as DeliveryMethod,
    label: 'Botim',
    icon: '📱',
    description: 'Send to receiver\'s Botim account',
    color: 'text-blue-400',
    bg: 'bg-blue-500/10',
  },
  {
    id: 'emoney' as DeliveryMethod,
    label: 'eMoney',
    icon: '💰',
    description: 'Send to receiver\'s eMoney account',
    color: 'text-green-400',
    bg: 'bg-green-500/10',
  },
  {
    id: 'bank' as DeliveryMethod,
    label: 'Bank Transfer',
    icon: '🏦',
    description: 'Send directly to a bank account',
    color: 'text-purple-400',
    bg: 'bg-purple-500/10',
  },
];

const COUNTRIES = [
  'Ghana', 'Nigeria', 'Kenya', 'Philippines', 'India', 'Pakistan',
  'Uganda', 'Tanzania', 'UAE', 'USA', 'UK', 'Bangladesh', 'Egypt',
  'Morocco', 'Senegal', 'Malaysia', 'Indonesia', 'Brazil', 'Togo',
  'Ivory Coast', 'Cameroon', 'South Africa', 'Zimbabwe',
];

export default function Send() {
  const [, setLocation] = useLocation();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const { data: wallets, isLoading: walletsLoading } = useGetWallets();
  const createTransaction = useCreateTransaction();

  const [step, setStep] = useState<Step>('details');
  const [fromWalletId, setFromWalletId] = useState('');
  const [amount, setAmount] = useState('');
  const [recipientCountry, setRecipientCountry] = useState('');
  const [deliveryMethod, setDeliveryMethod] = useState<DeliveryMethod | null>(null);

  // Botim fields
  const [botimNumber, setBotimNumber] = useState('');
  const [botimName, setBotimName] = useState('');

  // eMoney fields
  const [emoneyAccount, setEmoneyAccount] = useState('');
  const [emoneyName, setEmoneyName] = useState('');

  // Bank fields
  const [bankName, setBankName] = useState('');
  const [accountNumber, setAccountNumber] = useState('');
  const [accountName, setAccountName] = useState('');

  const [note, setNote] = useState('');

  const selectedWallet = wallets?.find(w => w.id === Number(fromWalletId));
  const numAmount = Number(amount) || 0;
  const selectedMethodInfo = DELIVERY_METHODS.find(m => m.id === deliveryMethod);

  const canProceedToReview = () => {
    if (!deliveryMethod) return false;
    if (deliveryMethod === 'botim') return !!(botimNumber && botimName);
    if (deliveryMethod === 'emoney') return !!(emoneyAccount && emoneyName);
    if (deliveryMethod === 'bank') return !!(bankName && accountNumber && accountName);
    return false;
  };

  const getReceiverSummary = () => {
    if (deliveryMethod === 'botim') return { label: 'Botim Number', value: botimNumber, name: botimName };
    if (deliveryMethod === 'emoney') return { label: 'eMoney Account', value: emoneyAccount, name: emoneyName };
    return { label: 'Account Number', value: accountNumber, name: accountName };
  };

  const handleConfirm = () => {
    const receiverSummary = getReceiverSummary();
    const noteStr = [
      `Method: ${selectedMethodInfo?.label}`,
      `Receiver: ${receiverSummary.value}`,
      deliveryMethod === 'bank' ? `Bank: ${bankName}` : null,
      note || null,
    ].filter(Boolean).join(' | ');

    createTransaction.mutate(
      {
        data: {
          fromWalletId: Number(fromWalletId),
          toCurrencyCode: selectedWallet?.currencyCode || 'USD',
          fromAmount: numAmount,
          recipientName: receiverSummary.name,
          recipientCountry: recipientCountry || 'N/A',
          note: noteStr,
        },
      },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getGetWalletsQueryKey() });
          queryClient.invalidateQueries({ queryKey: getGetTransactionsQueryKey() });
          queryClient.invalidateQueries({ queryKey: getGetDashboardSummaryQueryKey() });
          setStep('success');
        },
        onError: () => toast({ title: 'Transfer failed', description: 'Something went wrong. Please try again.', variant: 'destructive' }),
      }
    );
  };

  const reset = () => {
    setStep('details'); setFromWalletId(''); setAmount(''); setRecipientCountry('');
    setDeliveryMethod(null); setBotimNumber(''); setBotimName('');
    setEmoneyAccount(''); setEmoneyName('');
    setBankName(''); setAccountNumber(''); setAccountName('');
    setNote('');
  };

  if (walletsLoading) {
    return <div className="p-4 md:p-8 max-w-2xl mx-auto space-y-4"><Skeleton className="h-8 w-48" /><Skeleton className="h-80" /></div>;
  }

  // ── SUCCESS ──────────────────────────────────────────────────────────
  if (step === 'success') {
    const receiverSummary = getReceiverSummary();
    return (
      <div className="p-4 md:p-8 max-w-2xl mx-auto flex items-center justify-center min-h-[60vh]">
        <Card className="w-full">
          <CardContent className="pt-10 pb-10 text-center space-y-5">
            <div className="w-20 h-20 mx-auto rounded-full bg-amber-500/10 flex items-center justify-center">
              <Clock className="w-10 h-10 text-amber-500" />
            </div>
            <div className="space-y-2">
              <h2 className="text-2xl font-bold">Transfer Pending</h2>
              <p className="text-sm text-muted-foreground max-w-xs mx-auto">
                We're processing your transfer of{' '}
                <span className="font-bold font-mono">{numAmount.toLocaleString()} {selectedWallet?.currencyCode}</span>{' '}
                via <span className="font-bold">{selectedMethodInfo?.label}</span> to{' '}
                <span className="font-bold">{receiverSummary.name}</span>.
              </p>
            </div>
            <Badge className="bg-amber-500/10 text-amber-500 border-amber-500/20 px-4 py-1.5 text-sm">⏳ Pending</Badge>
            <p className="text-xs text-muted-foreground">Our team will send the funds to {receiverSummary.value} shortly. You'll see the update in your account.</p>
            <div className="pt-2 space-y-2">
              <Button className="w-full max-w-xs" onClick={() => setLocation('/account')}>View in Account</Button>
              <Button variant="outline" className="w-full max-w-xs" onClick={reset}>Send Another</Button>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  // ── REVIEW ──────────────────────────────────────────────────────────
  if (step === 'review') {
    const receiverSummary = getReceiverSummary();
    const rows = [
      { label: 'From Wallet', value: `${selectedWallet?.flag} ${selectedWallet?.currencyName}` },
      { label: 'Amount', value: `${numAmount.toLocaleString()} ${selectedWallet?.currencyCode}`, mono: true, large: true },
      { label: 'Delivery Method', value: `${selectedMethodInfo?.icon} ${selectedMethodInfo?.label}` },
      { label: 'Recipient Name', value: receiverSummary.name },
      { label: receiverSummary.label, value: receiverSummary.value, mono: true },
      ...(deliveryMethod === 'bank' ? [{ label: 'Bank', value: bankName }] : []),
      ...(recipientCountry ? [{ label: 'Country', value: recipientCountry }] : []),
      ...(note ? [{ label: 'Note', value: note }] : []),
    ];

    return (
      <div className="p-4 md:p-8 max-w-2xl mx-auto space-y-5">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="sm" className="px-2" onClick={() => setStep('receiver')}>
            <ArrowLeft className="w-4 h-4 mr-1" /> Back
          </Button>
          <div>
            <h1 className="text-xl font-bold">Review Transfer</h1>
            <p className="text-xs text-muted-foreground">Confirm the details before sending</p>
          </div>
        </div>

        <Card>
          <CardContent className="p-4 space-y-0">
            {rows.map(({ label, value, mono, large }, i) => (
              <div key={label} className={`flex justify-between items-start gap-4 py-2.5 ${i < rows.length - 1 ? 'border-b border-border' : ''}`}>
                <span className="text-sm text-muted-foreground shrink-0">{label}</span>
                <span className={`text-sm text-right break-all font-semibold ${mono ? 'font-mono' : ''} ${large ? 'text-lg font-bold' : ''}`}>{value}</span>
              </div>
            ))}
          </CardContent>
        </Card>

        <div className="p-3 bg-amber-500/10 border border-amber-500/20 rounded-lg">
          <p className="text-xs text-amber-600 dark:text-amber-400">
            ⚠️ Funds will be deducted immediately. Transfers are processed within 24 hours.
          </p>
        </div>

        <Button size="lg" className="w-full font-bold" onClick={handleConfirm} disabled={createTransaction.isPending}>
          {createTransaction.isPending ? 'Processing...' : 'Confirm Send'}
        </Button>
      </div>
    );
  }

  // ── RECEIVER DETAILS ─────────────────────────────────────────────────
  if (step === 'receiver') {
    return (
      <div className="p-4 md:p-8 max-w-2xl mx-auto space-y-5">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="sm" className="px-2" onClick={() => setStep('method')}>
            <ArrowLeft className="w-4 h-4 mr-1" /> Back
          </Button>
          <div>
            <h1 className="text-xl font-bold">Receiver Details</h1>
            <p className="text-xs text-muted-foreground">{selectedMethodInfo?.icon} {selectedMethodInfo?.label} · {numAmount.toLocaleString()} {selectedWallet?.currencyCode}</p>
          </div>
        </div>

        <Card>
          <CardContent className="p-4 space-y-4">
            {/* Botim Fields */}
            {deliveryMethod === 'botim' && (
              <>
                <div className="space-y-1.5">
                  <Label className="text-sm">Receiver's Name</Label>
                  <Input placeholder="Full name" value={botimName} onChange={e => setBotimName(e.target.value)} />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-sm">Receiver's Botim Number</Label>
                  <Input type="tel" placeholder="+971 50 000 0000" value={botimNumber} onChange={e => setBotimNumber(e.target.value)} className="font-mono" />
                  <p className="text-xs text-muted-foreground">Enter the phone number registered on the receiver's Botim account</p>
                </div>
              </>
            )}

            {/* eMoney Fields */}
            {deliveryMethod === 'emoney' && (
              <>
                <div className="space-y-1.5">
                  <Label className="text-sm">Receiver's Name</Label>
                  <Input placeholder="Full name" value={emoneyName} onChange={e => setEmoneyName(e.target.value)} />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-sm">Receiver's eMoney Account ID</Label>
                  <Input placeholder="e.g. EMNY-12345678" value={emoneyAccount} onChange={e => setEmoneyAccount(e.target.value)} className="font-mono" />
                  <p className="text-xs text-muted-foreground">Enter the receiver's eMoney account or reference ID</p>
                </div>
              </>
            )}

            {/* Bank Fields */}
            {deliveryMethod === 'bank' && (
              <>
                <div className="space-y-1.5">
                  <Label className="text-sm">Bank Name</Label>
                  <Input placeholder="e.g. GCB Bank, Access Bank, Barclays" value={bankName} onChange={e => setBankName(e.target.value)} />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-sm">Account Number / IBAN</Label>
                  <Input placeholder="Account number" value={accountNumber} onChange={e => setAccountNumber(e.target.value)} className="font-mono" />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-sm">Account Name</Label>
                  <Input placeholder="Name on the account" value={accountName} onChange={e => setAccountName(e.target.value)} />
                </div>
              </>
            )}

            {/* Country (optional) */}
            <div className="space-y-1.5">
              <Label className="text-sm">Recipient Country <span className="text-muted-foreground">(optional)</span></Label>
              <Select value={recipientCountry} onValueChange={setRecipientCountry}>
                <SelectTrigger><SelectValue placeholder="Select country" /></SelectTrigger>
                <SelectContent>
                  {COUNTRIES.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>

            {/* Note */}
            <div className="space-y-1.5">
              <Label className="text-sm">Note / Reference <span className="text-muted-foreground">(optional)</span></Label>
              <Input placeholder="e.g. School fees, rent, family support..." value={note} onChange={e => setNote(e.target.value)} />
            </div>
          </CardContent>
        </Card>

        <Button
          size="lg" className="w-full font-bold"
          onClick={() => setStep('review')}
          disabled={!canProceedToReview()}
        >
          Review Transfer <ChevronRight className="w-4 h-4 ml-1" />
        </Button>
      </div>
    );
  }

  // ── METHOD SELECTION ──────────────────────────────────────────────────
  if (step === 'method') {
    return (
      <div className="p-4 md:p-8 max-w-2xl mx-auto space-y-5">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="sm" className="px-2" onClick={() => setStep('details')}>
            <ArrowLeft className="w-4 h-4 mr-1" /> Back
          </Button>
          <div>
            <h1 className="text-xl font-bold">Delivery Method</h1>
            <p className="text-xs text-muted-foreground">Sending {numAmount.toLocaleString()} {selectedWallet?.currencyCode} — how should the receiver get it?</p>
          </div>
        </div>

        <div className="space-y-3">
          {DELIVERY_METHODS.map((method) => (
            <button
              key={method.id}
              type="button"
              onClick={() => { setDeliveryMethod(method.id); setStep('receiver'); }}
              className="w-full text-left rounded-xl border-2 border-border hover:border-primary/50 bg-card p-4 transition-all flex items-center gap-4"
            >
              <div className={`w-12 h-12 rounded-full ${method.bg} flex items-center justify-center shrink-0 text-2xl`}>
                {method.icon}
              </div>
              <div className="flex-1">
                <p className="font-bold text-base">{method.label}</p>
                <p className="text-xs text-muted-foreground">{method.description}</p>
              </div>
              <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0" />
            </button>
          ))}
        </div>
      </div>
    );
  }

  // ── STEP 1: TRANSFER DETAILS ──────────────────────────────────────────
  return (
    <div className="p-4 md:p-8 max-w-2xl mx-auto space-y-5">
      <div>
        <h1 className="text-xl md:text-2xl font-bold tracking-tight">Send Money</h1>
        <p className="text-sm text-muted-foreground">Transfer funds to anyone, anywhere</p>
      </div>

      <Card>
        <CardHeader className="p-4 pb-0">
          <CardTitle className="text-base">Transfer Details</CardTitle>
          <CardDescription className="text-xs">Choose your wallet and how much to send</CardDescription>
        </CardHeader>
        <CardContent className="p-4 space-y-4">
          <div className="space-y-1.5">
            <Label className="text-sm">From Wallet</Label>
            <Select value={fromWalletId} onValueChange={setFromWalletId}>
              <SelectTrigger><SelectValue placeholder="Select wallet" /></SelectTrigger>
              <SelectContent>
                {wallets?.map(w => (
                  <SelectItem key={w.id} value={String(w.id)}>
                    {w.flag} {w.currencyName} — {w.balance.toLocaleString('en-US', { minimumFractionDigits: 2 })} {w.currencyCode}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label className="text-sm">Amount to Send</Label>
            <div className="relative">
              <Input
                type="number" step="0.01" min="0.01"
                max={selectedWallet?.balance}
                placeholder="0.00"
                value={amount} onChange={e => setAmount(e.target.value)}
                className="pr-16 font-mono text-lg"
              />
              <span className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">
                {selectedWallet?.currencyCode || '---'}
              </span>
            </div>
            {selectedWallet && (
              <p className="text-xs text-muted-foreground">
                Available: <span className="font-mono font-semibold">{selectedWallet.balance.toLocaleString('en-US', { minimumFractionDigits: 2 })} {selectedWallet.currencyCode}</span>
              </p>
            )}
          </div>

          <Button
            size="lg" className="w-full font-bold"
            onClick={() => setStep('method')}
            disabled={!fromWalletId || !amount || numAmount <= 0 || numAmount > (selectedWallet?.balance ?? 0)}
          >
            Choose Delivery Method <ChevronRight className="w-4 h-4 ml-1" />
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
