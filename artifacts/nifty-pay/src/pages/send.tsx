import { useState } from 'react';
import {
  useGetWallets, useGetExchangeRates, useCreateTransaction,
  getGetWalletsQueryKey, getGetTransactionsQueryKey, getGetDashboardSummaryQueryKey,
} from '@workspace/api-client-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import { Clock, Smartphone, Building2, ArrowLeft, ChevronRight } from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import { useLocation } from 'wouter';
import { useToast } from '@/hooks/use-toast';

// Networks per country
const MOBILE_NETWORKS: Record<string, { name: string; flag: string }[]> = {
  Ghana: [
    { name: 'MTN Mobile Money', flag: '🟡' },
    { name: 'Telecel Cash (Vodafone)', flag: '🔴' },
    { name: 'AirtelTigo Money', flag: '🔵' },
  ],
  Nigeria: [
    { name: 'MTN MoMo', flag: '🟡' },
    { name: 'Opay', flag: '🟢' },
    { name: 'Palmpay', flag: '🔵' },
    { name: 'Kuda', flag: '🟣' },
  ],
  Kenya: [{ name: 'M-Pesa', flag: '🟢' }, { name: 'Airtel Money', flag: '🔴' }, { name: 'Equitel', flag: '🔵' }],
  Philippines: [{ name: 'GCash', flag: '🔵' }, { name: 'Maya', flag: '🟢' }, { name: 'ShopeePay', flag: '🟠' }],
  Uganda: [{ name: 'MTN Mobile Money', flag: '🟡' }, { name: 'Airtel Money', flag: '🔴' }],
  Tanzania: [{ name: 'M-Pesa', flag: '🟢' }, { name: 'Airtel Money', flag: '🔴' }, { name: 'Tigo Pesa', flag: '🔵' }],
  Senegal: [{ name: 'Orange Money', flag: '🟠' }, { name: 'Wave', flag: '🔵' }, { name: 'Free Money', flag: '🟢' }],
  Bangladesh: [{ name: 'bKash', flag: '🔴' }, { name: 'Nagad', flag: '🟠' }, { name: 'Rocket', flag: '🟣' }],
  Pakistan: [{ name: 'JazzCash', flag: '🔴' }, { name: 'EasyPaisa', flag: '🟢' }],
  Egypt: [{ name: 'Vodafone Cash', flag: '🔴' }, { name: 'Fawry', flag: '🟣' }, { name: 'Orange Money', flag: '🟠' }],
  India: [{ name: 'UPI / IMPS', flag: '🇮🇳' }, { name: 'PhonePe', flag: '🟣' }, { name: 'Paytm', flag: '🔵' }],
  Malaysia: [{ name: "Touch 'n Go", flag: '🔵' }, { name: 'Boost', flag: '🟠' }, { name: 'GrabPay', flag: '🟢' }],
  Indonesia: [{ name: 'OVO', flag: '🟣' }, { name: 'GoPay', flag: '🟢' }, { name: 'DANA', flag: '🔵' }],
  Togo: [{ name: 'Flooz (Moov)', flag: '🔵' }, { name: 'T-Money (Togocel)', flag: '🟡' }],
  'Ivory Coast': [{ name: 'MTN Mobile Money', flag: '🟡' }, { name: 'Orange Money', flag: '🟠' }, { name: 'Wave', flag: '🔵' }],
  Cameroon: [{ name: 'MTN Mobile Money', flag: '🟡' }, { name: 'Orange Money', flag: '🟠' }],
};

const COUNTRIES = [
  'Ghana', 'Nigeria', 'Kenya', 'Philippines', 'India', 'Pakistan',
  'Uganda', 'Tanzania', 'UAE', 'USA', 'UK', 'Bangladesh', 'Egypt',
  'Morocco', 'Senegal', 'Malaysia', 'Indonesia', 'Brazil', 'Togo',
  'Ivory Coast', 'Cameroon',
];

type Step = 'details' | 'method' | 'recipient' | 'review' | 'success';

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
  const [transferType, setTransferType] = useState<'mobile_money' | 'bank' | null>(null);
  const [mobileNetwork, setMobileNetwork] = useState('');
  const [mobileNumber, setMobileNumber] = useState('');
  const [recipientName, setRecipientName] = useState('');
  const [bankName, setBankName] = useState('');
  const [accountNumber, setAccountNumber] = useState('');
  const [accountName, setAccountName] = useState('');
  const [note, setNote] = useState('');

  const selectedWallet = wallets?.find(w => w.id === Number(fromWalletId));
  const hasMobile = !!MOBILE_NETWORKS[recipientCountry];
  const networks = MOBILE_NETWORKS[recipientCountry] ?? [];

  // Derive toCurrencyCode from country for exchange rate lookup
  const COUNTRY_CURRENCY: Record<string, string> = {
    Ghana: 'GHS', Nigeria: 'NGN', Kenya: 'KES', Philippines: 'PHP', India: 'INR',
    Pakistan: 'PKR', UAE: 'AED', USA: 'USD', UK: 'GBP', Bangladesh: 'BDT',
    Indonesia: 'IDR', Malaysia: 'MYR', Egypt: 'EGP', Brazil: 'BRL',
  };
  const toCurrency = COUNTRY_CURRENCY[recipientCountry] || 'USD';

  const { data: rates } = useGetExchangeRates(
    { from: selectedWallet?.currencyCode || 'AED', to: toCurrency },
    { query: { enabled: !!selectedWallet && !!recipientCountry && selectedWallet.currencyCode !== toCurrency } }
  );

  const numAmount = Number(amount) || 0;
  const recipientGets = rates ? numAmount * rates.rate : numAmount;

  const recipientDetail = transferType === 'mobile_money' ? mobileNumber : accountNumber;

  const handleConfirm = () => {
    createTransaction.mutate(
      {
        data: {
          fromWalletId: Number(fromWalletId),
          toCurrencyCode: toCurrency,
          fromAmount: numAmount,
          recipientName: recipientName || accountName,
          recipientCountry,
          note: [
            transferType === 'mobile_money' ? `${mobileNetwork}: ${mobileNumber}` : `${bankName} / ${accountNumber} / ${accountName}`,
            note,
          ].filter(Boolean).join(' | ') || undefined,
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

  if (walletsLoading) {
    return <div className="p-4 md:p-8 max-w-2xl mx-auto space-y-4"><Skeleton className="h-8 w-48" /><Skeleton className="h-80" /></div>;
  }

  // ── SUCCESS ──────────────────────────────────────────────────────────
  if (step === 'success') {
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
                We're processing your transfer of <span className="font-bold font-mono">{numAmount.toLocaleString()} {selectedWallet?.currencyCode}</span> to <span className="font-bold">{recipientName || accountName}</span> in {recipientCountry}.
              </p>
            </div>
            <Badge className="bg-amber-500/10 text-amber-500 border-amber-500/20 px-4 py-1.5 text-sm">⏳ Pending</Badge>
            <p className="text-xs text-muted-foreground">Our team will send the funds shortly. You'll see the update in your transactions.</p>
            <div className="pt-2 space-y-2">
              <Button className="w-full max-w-xs" onClick={() => setLocation('/transactions')}>View Transactions</Button>
              <Button variant="outline" className="w-full max-w-xs" onClick={() => { setStep('details'); setFromWalletId(''); setAmount(''); setRecipientCountry(''); setTransferType(null); setMobileNetwork(''); setMobileNumber(''); setRecipientName(''); setBankName(''); setAccountNumber(''); setAccountName(''); setNote(''); }}>
                Send Another
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  // ── REVIEW ──────────────────────────────────────────────────────────
  if (step === 'review') {
    const rows = [
      { label: 'From Wallet', value: `${selectedWallet?.flag} ${selectedWallet?.currencyName}` },
      { label: 'You Send', value: `${numAmount.toLocaleString()} ${selectedWallet?.currencyCode}`, mono: true, large: true },
      ...(rates ? [{ label: 'Exchange Rate', value: `1 ${selectedWallet?.currencyCode} = ${rates.rate.toFixed(4)} ${toCurrency}` }] : []),
      { label: 'Recipient Gets (approx)', value: `${recipientGets.toLocaleString(undefined, { maximumFractionDigits: 2 })} ${toCurrency}`, mono: true, highlight: true },
      { label: 'Country', value: recipientCountry },
      { label: 'Method', value: transferType === 'mobile_money' ? `📱 ${mobileNetwork}` : `🏦 ${bankName}` },
      { label: 'Recipient', value: recipientName || accountName },
      { label: 'Account / Number', value: recipientDetail, mono: true },
      ...(note ? [{ label: 'Note', value: note }] : []),
    ];
    return (
      <div className="p-4 md:p-8 max-w-2xl mx-auto space-y-5">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="sm" className="px-2" onClick={() => setStep('recipient')}><ArrowLeft className="w-4 h-4 mr-1" /> Back</Button>
          <div><h1 className="text-xl font-bold">Review Transfer</h1><p className="text-xs text-muted-foreground">Check details before confirming</p></div>
        </div>
        <Card>
          <CardContent className="p-4 space-y-1">
            {rows.map(({ label, value, mono, large, highlight }) => (
              <div key={label} className={`flex justify-between items-start gap-4 py-2.5 border-b border-border last:border-0 ${highlight ? 'bg-primary/5 rounded-lg px-3 -mx-3' : ''}`}>
                <span className="text-sm text-muted-foreground shrink-0">{label}</span>
                <span className={`text-sm text-right break-all font-semibold ${mono ? 'font-mono' : ''} ${large ? 'text-lg font-bold' : ''} ${highlight ? 'text-primary text-base font-bold' : ''}`}>{value}</span>
              </div>
            ))}
          </CardContent>
        </Card>
        <div className="p-3 bg-amber-500/10 border border-amber-500/20 rounded-lg">
          <p className="text-xs text-amber-600 dark:text-amber-400">⚠️ Funds will be deducted from your wallet immediately. Transfers are processed within 24 hours.</p>
        </div>
        <Button size="lg" className="w-full font-bold" onClick={handleConfirm} disabled={createTransaction.isPending}>
          {createTransaction.isPending ? 'Processing...' : 'Confirm Send'}
        </Button>
      </div>
    );
  }

  // ── RECIPIENT DETAILS ────────────────────────────────────────────────
  if (step === 'recipient') {
    return (
      <div className="p-4 md:p-8 max-w-2xl mx-auto space-y-5">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="sm" className="px-2" onClick={() => setStep('method')}><ArrowLeft className="w-4 h-4 mr-1" /> Back</Button>
          <div>
            <h1 className="text-xl font-bold">Recipient Details</h1>
            <p className="text-xs text-muted-foreground">{transferType === 'mobile_money' ? `📱 ${mobileNetwork}` : '🏦 Bank Transfer'} · {recipientCountry}</p>
          </div>
        </div>

        <Card>
          <CardContent className="p-4 space-y-4">
            {transferType === 'mobile_money' ? (
              <>
                <div className="space-y-1.5">
                  <Label className="text-sm">Recipient Name</Label>
                  <Input placeholder="Full name of recipient" value={recipientName} onChange={e => setRecipientName(e.target.value)} />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-sm">{mobileNetwork} Number</Label>
                  <Input type="tel" placeholder="+233 000 000 000" value={mobileNumber} onChange={e => setMobileNumber(e.target.value)} className="font-mono" />
                  <p className="text-xs text-muted-foreground">Enter the recipient's registered mobile money number</p>
                </div>
              </>
            ) : (
              <>
                <div className="space-y-1.5">
                  <Label className="text-sm">Bank Name</Label>
                  <Input placeholder="e.g. GCB Bank, Access Bank" value={bankName} onChange={e => setBankName(e.target.value)} />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-sm">Account Number</Label>
                  <Input placeholder="Account / IBAN number" value={accountNumber} onChange={e => setAccountNumber(e.target.value)} className="font-mono" />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-sm">Account Name</Label>
                  <Input placeholder="Name on the account" value={accountName} onChange={e => setAccountName(e.target.value)} />
                </div>
              </>
            )}
            <div className="space-y-1.5">
              <Label className="text-sm">Note / Reference (Optional)</Label>
              <Input placeholder="e.g. School fees, rent..." value={note} onChange={e => setNote(e.target.value)} />
            </div>
          </CardContent>
        </Card>

        <Button
          size="lg" className="w-full font-bold"
          onClick={() => setStep('review')}
          disabled={transferType === 'mobile_money' ? (!mobileNumber || !recipientName) : (!bankName || !accountNumber || !accountName)}
        >
          Review Transfer <ChevronRight className="w-4 h-4 ml-1" />
        </Button>
      </div>
    );
  }

  // ── METHOD SELECTION ────────────────────────────────────────────────
  if (step === 'method') {
    return (
      <div className="p-4 md:p-8 max-w-2xl mx-auto space-y-5">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="sm" className="px-2" onClick={() => setStep('details')}><ArrowLeft className="w-4 h-4 mr-1" /> Back</Button>
          <div>
            <h1 className="text-xl font-bold">Transfer Method</h1>
            <p className="text-xs text-muted-foreground">Sending to {recipientCountry} · {numAmount.toLocaleString()} {selectedWallet?.currencyCode}</p>
          </div>
        </div>

        <div className="space-y-3">
          {/* Bank Transfer */}
          <button
            type="button"
            onClick={() => { setTransferType('bank'); setStep('recipient'); }}
            className="w-full text-left rounded-xl border-2 border-border hover:border-primary/40 bg-card p-4 transition-all flex items-center justify-between"
          >
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-blue-500/10 flex items-center justify-center">
                <Building2 className="w-5 h-5 text-blue-500" />
              </div>
              <div>
                <p className="font-bold text-sm">Bank Transfer</p>
                <p className="text-xs text-muted-foreground">Send directly to a bank account</p>
              </div>
            </div>
            <ChevronRight className="w-4 h-4 text-muted-foreground" />
          </button>

          {/* Mobile Money */}
          {hasMobile && (
            <div className="space-y-2">
              <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground px-1">Mobile Money</p>
              {networks.map((net) => (
                <button
                  key={net.name}
                  type="button"
                  onClick={() => { setTransferType('mobile_money'); setMobileNetwork(net.name); setStep('recipient'); }}
                  className="w-full text-left rounded-xl border-2 border-border hover:border-primary/40 bg-card p-4 transition-all flex items-center justify-between"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-green-500/10 flex items-center justify-center">
                      <span className="text-xl">{net.flag}</span>
                    </div>
                    <div>
                      <p className="font-bold text-sm">{net.name}</p>
                      <p className="text-xs text-muted-foreground">Mobile Money · {recipientCountry}</p>
                    </div>
                  </div>
                  <ChevronRight className="w-4 h-4 text-muted-foreground" />
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    );
  }

  // ── STEP 1: DETAILS ──────────────────────────────────────────────────
  return (
    <div className="p-4 md:p-8 max-w-2xl mx-auto space-y-5">
      <div>
        <h1 className="text-xl md:text-2xl font-bold tracking-tight">Send Money</h1>
        <p className="text-sm text-muted-foreground">Transfer funds to anyone, anywhere</p>
      </div>

      <Card>
        <CardHeader className="p-4 pb-0">
          <CardTitle className="text-base">Transfer Details</CardTitle>
          <CardDescription className="text-xs">Choose your wallet, amount, and destination country</CardDescription>
        </CardHeader>
        <CardContent className="p-4 space-y-4">
          <div className="space-y-1.5">
            <Label className="text-sm">From Wallet</Label>
            <Select value={fromWalletId} onValueChange={setFromWalletId}>
              <SelectTrigger><SelectValue placeholder="Select wallet" /></SelectTrigger>
              <SelectContent>
                {wallets?.map(w => (
                  <SelectItem key={w.id} value={String(w.id)}>{w.flag} {w.currencyName} — {w.balance.toLocaleString('en-US', { minimumFractionDigits: 2 })} {w.currencyCode}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label className="text-sm">Amount to Send</Label>
            <div className="relative">
              <Input type="number" step="0.01" min="0.01" max={selectedWallet?.balance} placeholder="0.00"
                value={amount} onChange={e => setAmount(e.target.value)} className="pr-16 font-mono text-lg" />
              <span className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">{selectedWallet?.currencyCode || '---'}</span>
            </div>
            {selectedWallet && <p className="text-xs text-muted-foreground">Available: <span className="font-mono font-semibold">{selectedWallet.balance.toLocaleString('en-US', { minimumFractionDigits: 2 })} {selectedWallet.currencyCode}</span></p>}
          </div>

          <div className="space-y-1.5">
            <Label className="text-sm">Recipient's Country</Label>
            <Select value={recipientCountry} onValueChange={v => { setRecipientCountry(v); setTransferType(null); setMobileNetwork(''); }}>
              <SelectTrigger><SelectValue placeholder="Select country" /></SelectTrigger>
              <SelectContent>
                {COUNTRIES.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>

          {rates && recipientCountry && amount && (
            <div className="bg-primary/5 border border-primary/20 rounded-lg p-3">
              <div className="flex justify-between text-xs text-muted-foreground mb-1">
                <span>Exchange rate</span><span className="font-mono">1 {selectedWallet?.currencyCode} = {rates.rate.toFixed(4)} {toCurrency}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-sm font-semibold">Recipient gets ~</span>
                <span className="text-sm font-bold font-mono text-primary">{recipientGets.toLocaleString(undefined, { maximumFractionDigits: 2 })} {toCurrency}</span>
              </div>
            </div>
          )}

          <Button
            size="lg" className="w-full font-bold"
            onClick={() => setStep('method')}
            disabled={!fromWalletId || !amount || !recipientCountry || Number(amount) <= 0}
          >
            Choose Transfer Method <ChevronRight className="w-4 h-4 ml-1" />
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
