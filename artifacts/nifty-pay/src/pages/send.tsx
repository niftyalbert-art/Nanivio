import { useState, useRef } from 'react';
import {
  useGetWallets, useCreateTransaction, useGetSupportedCountries,
  getGetWalletsQueryKey, getGetTransactionsQueryKey, getGetDashboardSummaryQueryKey,
} from '@workspace/api-client-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import { Clock, ArrowLeft, ChevronRight, ChevronUp, ChevronDown, Building2, Smartphone, Search } from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import { useLocation } from 'wouter';
import { useToast } from '@/hooks/use-toast';

type TransferType = 'bank' | 'mobile_money';
type Step = 'country' | 'type' | 'receiver' | 'amount' | 'review' | 'success';

const API = import.meta.env.BASE_URL.replace(/\/$/, '') + '/api';

// Mobile money providers keyed by country code
const MOBILE_MONEY_PROVIDERS: Record<string, { label: string; icon: string }[]> = {
  // West Africa
  GH: [
    { icon: '🟡', label: 'MTN Mobile Money (MoMo)' },
    { icon: '🔴', label: 'Telecel Cash (Vodafone Cash)' },
    { icon: '🔵', label: 'AirtelTigo Money' },
  ],
  NG: [
    { icon: '🟢', label: 'Opay' },
    { icon: '🟣', label: 'PalmPay' },
    { icon: '🔵', label: 'Airtel Money' },
    { icon: '🟡', label: 'MTN MoMo' },
    { icon: '🟠', label: 'Kuda' },
    { icon: '⚫', label: 'Moniepoint' },
  ],
  SN: [
    { icon: '🟠', label: 'Orange Money' },
    { icon: '🟡', label: 'Wave' },
    { icon: '🟢', label: 'Free Money' },
    { icon: '🔵', label: 'Wari' },
  ],
  CI: [
    { icon: '🟠', label: 'Orange Money' },
    { icon: '🟡', label: 'MTN MoMo' },
    { icon: '🟢', label: 'Wave' },
    { icon: '🔵', label: 'Moov Money' },
  ],
  BJ: [
    { icon: '🟡', label: 'MTN MoMo' },
    { icon: '🔵', label: 'Moov Money' },
    { icon: '🟠', label: 'Celtiis Cash' },
  ],
  LR: [
    { icon: '🟠', label: 'Orange Money' },
    { icon: '🟡', label: 'MTN MoMo' },
    { icon: '🔵', label: 'Lonestar Money' },
  ],
  GN: [
    { icon: '🟠', label: 'Orange Money' },
    { icon: '🟡', label: 'MTN MoMo' },
    { icon: '🔵', label: 'Cellcom Money' },
  ],
  ML: [
    { icon: '🟠', label: 'Orange Money' },
    { icon: '🟡', label: 'Moov Money' },
    { icon: '🔵', label: 'Sama Money' },
  ],
  BF: [
    { icon: '🟠', label: 'Orange Money' },
    { icon: '🔵', label: 'Moov Money' },
  ],
  TG: [
    { icon: '🟠', label: 'Flooz (Moov)' },
    { icon: '🔵', label: 'T-Money (Togocel)' },
  ],
  // Central Africa
  CM: [
    { icon: '🟡', label: 'MTN MoMo' },
    { icon: '🟠', label: 'Orange Money' },
    { icon: '🔵', label: 'Express Union Mobile Money' },
    { icon: '🟣', label: 'Yoomee Money' },
  ],
  CG: [
    { icon: '🟠', label: 'Orange Money' },
    { icon: '🔵', label: 'Airtel Money' },
    { icon: '🟡', label: 'MTN MoMo' },
  ],
  // East Africa
  KE: [
    { icon: '🟢', label: 'M-Pesa (Safaricom)' },
    { icon: '🔵', label: 'Airtel Money' },
    { icon: '🟠', label: 'T-Kash (Telkom)' },
  ],
  UG: [
    { icon: '🟡', label: 'MTN MoMo' },
    { icon: '🔵', label: 'Airtel Money' },
  ],
  TZ: [
    { icon: '🟢', label: 'M-Pesa (Vodacom)' },
    { icon: '🔵', label: 'Airtel Money' },
    { icon: '🟡', label: 'Tigo Pesa' },
    { icon: '🟠', label: 'HaloPesa' },
  ],
  RW: [
    { icon: '🟡', label: 'MTN MoMo' },
    { icon: '🔵', label: 'Airtel Money' },
  ],
  ET: [
    { icon: '🟢', label: 'Telebirr (Ethio Telecom)' },
    { icon: '🔵', label: 'M-Pesa' },
  ],
  // Southern Africa
  ZA: [
    { icon: '🟢', label: 'M-Pesa (Vodacom)' },
    { icon: '🔵', label: 'MTN MoMo' },
    { icon: '🟠', label: 'FNB eWallet' },
  ],
  ZM: [
    { icon: '🟡', label: 'MTN MoMo' },
    { icon: '🔵', label: 'Airtel Money' },
    { icon: '🟢', label: 'Zamtel Kwacha' },
  ],
  ZW: [
    { icon: '🟢', label: 'EcoCash' },
    { icon: '🔵', label: 'OneMoney' },
    { icon: '🟠', label: 'Telecash' },
  ],
  // South / Southeast Asia
  PH: [
    { icon: '🔵', label: 'GCash' },
    { icon: '🔴', label: 'PayMaya (Maya)' },
    { icon: '🟢', label: 'ShopeePay' },
    { icon: '🟠', label: 'Coins.ph' },
  ],
  IN: [
    { icon: '🔵', label: 'Paytm' },
    { icon: '🟠', label: 'PhonePe' },
    { icon: '🟢', label: 'Google Pay (GPay)' },
    { icon: '🔴', label: 'Amazon Pay' },
  ],
  PK: [
    { icon: '🔵', label: 'JazzCash' },
    { icon: '🟠', label: 'Easypaisa' },
    { icon: '🟢', label: 'NayaPay' },
  ],
  BD: [
    { icon: '🔴', label: 'bKash' },
    { icon: '🟠', label: 'Nagad' },
    { icon: '🔵', label: 'Rocket (DBBL)' },
  ],
  LK: [
    { icon: '🔴', label: 'Dialog Genie' },
    { icon: '🟢', label: 'eZ Cash (Mobitel)' },
    { icon: '🔵', label: 'Hutch Money' },
  ],
  MY: [
    { icon: '🔵', label: 'Touch \'n Go eWallet' },
    { icon: '🟠', label: 'Boost' },
    { icon: '🟢', label: 'GrabPay' },
    { icon: '🔴', label: 'MAE (Maybank)' },
  ],
  TH: [
    { icon: '🔵', label: 'PromptPay' },
    { icon: '🟢', label: 'TrueMoney Wallet' },
    { icon: '🟠', label: 'AirPay' },
    { icon: '🔴', label: 'Rabbit LINE Pay' },
  ],
  // Middle East
  AE: [
    { icon: '🔵', label: 'Botim Pay' },
    { icon: '🟠', label: 'NOW Money' },
    { icon: '🟢', label: 'YAP' },
  ],
  EG: [
    { icon: '🟠', label: 'Fawry' },
    { icon: '🔵', label: 'Vodafone Cash' },
    { icon: '🟢', label: 'Orange Cash' },
    { icon: '🔴', label: 'Etisalat Cash' },
  ],
  MA: [
    { icon: '🟠', label: 'Orange Money' },
    { icon: '🔵', label: 'Inwi Money' },
    { icon: '🟢', label: 'Maroc Telecom Cash' },
  ],
  // Americas
  MX: [
    { icon: '🔵', label: 'OXXO Pay' },
    { icon: '🟢', label: 'Mercado Pago' },
    { icon: '🟠', label: 'CoDi (Banco de México)' },
  ],
  BR: [
    { icon: '🔵', label: 'PIX' },
    { icon: '🟢', label: 'Mercado Pago' },
    { icon: '🟠', label: 'PicPay' },
  ],
};

function getProviders(countryCode: string): { icon: string; label: string }[] {
  return MOBILE_MONEY_PROVIDERS[countryCode] ?? [];
}

async function fetchRate(from: string, to: string) {
  const r = await fetch(`${API}/rates?from=${from}&to=${to}`);
  if (!r.ok) return null;
  return r.json() as Promise<{ rate: number; fee: number; feeAmount: number; inverseRate: number }>;
}

export default function Send() {
  const [, setLocation] = useLocation();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const { data: wallets, isLoading: walletsLoading } = useGetWallets();
  const { data: countries, isLoading: countriesLoading } = useGetSupportedCountries();
  const createTransaction = useCreateTransaction();

  const countryListRef = useRef<HTMLDivElement>(null);
  const [step, setStep] = useState<Step>('country');
  const [countrySearch, setCountrySearch] = useState('');

  // Selections
  const [selectedCountryCode, setSelectedCountryCode] = useState('');
  const [transferType, setTransferType] = useState<TransferType | null>(null);

  // Receiver details — bank
  const [bankName, setBankName] = useState('');
  const [accountNumber, setAccountNumber] = useState('');
  const [accountName, setAccountName] = useState('');

  // Receiver details — mobile money
  const [mobileProvider, setMobileProvider] = useState('');
  const [mobileNumber, setMobileNumber] = useState('');
  const [mobileName, setMobileName] = useState('');

  // Amount step
  const [fromWalletId, setFromWalletId] = useState('');
  const [amount, setAmount] = useState('');
  const [note, setNote] = useState('');

  // Rate info fetched when entering review
  const [rateInfo, setRateInfo] = useState<{ rate: number; fee: number; feeAmount: number } | null>(null);
  const [rateLoading, setRateLoading] = useState(false);

  const selectedCountry = countries?.find(c => c.code === selectedCountryCode);
  const selectedWallet = wallets?.find(w => w.id === Number(fromWalletId));
  const numAmount = Number(amount) || 0;

  const filteredCountries = countries?.filter(c =>
    c.name.toLowerCase().includes(countrySearch.toLowerCase()) ||
    c.currencyCode.toLowerCase().includes(countrySearch.toLowerCase())
  ) ?? [];

  const canProceedFromReceiver = () => {
    if (transferType === 'bank') return !!(bankName && accountNumber && accountName);
    if (transferType === 'mobile_money') return !!(mobileProvider && mobileNumber && mobileName);
    return false;
  };

  const getReceiverNote = () => {
    if (transferType === 'bank') {
      return `Type: Bank Transfer | Bank: ${bankName} | Account: ${accountNumber} | Name: ${accountName}${note ? ` | Note: ${note}` : ''}`;
    }
    return `Type: Mobile Money | Provider: ${mobileProvider} | Number: ${mobileNumber} | Name: ${mobileName}${note ? ` | Note: ${note}` : ''}`;
  };

  const getRecipientName = () => {
    if (transferType === 'bank') return accountName;
    return mobileName;
  };

  const enterReview = async () => {
    if (!selectedWallet || !selectedCountry) return;
    setRateLoading(true);
    try {
      const info = await fetchRate(selectedWallet.currencyCode, selectedCountry.currencyCode);
      setRateInfo(info);
    } catch {
      // use null if failed
    }
    setRateLoading(false);
    setStep('review');
  };

  const handleConfirm = () => {
    if (!selectedCountry) return;
    createTransaction.mutate(
      {
        data: {
          fromWalletId: Number(fromWalletId),
          toCurrencyCode: selectedCountry.currencyCode,
          fromAmount: numAmount,
          recipientName: getRecipientName(),
          recipientCountry: selectedCountry.name,
          note: getReceiverNote(),
        },
      },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getGetWalletsQueryKey() });
          queryClient.invalidateQueries({ queryKey: getGetTransactionsQueryKey() });
          queryClient.invalidateQueries({ queryKey: getGetDashboardSummaryQueryKey() });
          setStep('success');
        },
        onError: (e: any) => toast({
          title: 'Transfer failed',
          description: e?.message || 'Something went wrong. Please try again.',
          variant: 'destructive',
        }),
      }
    );
  };

  const reset = () => {
    setStep('country'); setCountrySearch(''); setSelectedCountryCode('');
    setTransferType(null); setBankName(''); setAccountNumber(''); setAccountName('');
    setMobileProvider(''); setMobileNumber(''); setMobileName('');
    setFromWalletId(''); setAmount(''); setNote(''); setRateInfo(null);
  };

  const isLoading = walletsLoading || countriesLoading;

  if (isLoading) {
    return (
      <div className="p-4 md:p-8 max-w-2xl mx-auto space-y-4">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-80" />
      </div>
    );
  }

  // ── SUCCESS ─────────────────────────────────────────────────────────────────
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
                We're processing your transfer of{' '}
                <span className="font-bold font-mono">{numAmount.toLocaleString()} {selectedWallet?.currencyCode}</span>{' '}
                to <span className="font-bold">{getRecipientName()}</span>{' '}
                in <span className="font-bold">{selectedCountry?.name}</span>.
              </p>
            </div>
            <Badge className="bg-amber-500/10 text-amber-500 border-amber-500/20 px-4 py-1.5 text-sm">⏳ Pending</Badge>
            <p className="text-xs text-muted-foreground">Funds are being processed within 24 hours. Updates will be shown in your account shortly.</p>
            <div className="pt-2 space-y-2">
              <Button className="w-full max-w-xs" onClick={() => setLocation('/account')}>View in Account</Button>
              <Button variant="outline" className="w-full max-w-xs" onClick={reset}>Send Another</Button>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  // ── REVIEW ──────────────────────────────────────────────────────────────────
  if (step === 'review') {
    const toAmount = rateInfo ? (numAmount - (rateInfo.feeAmount ?? 0)) * rateInfo.rate : null;
    const rows = [
      { label: 'From', value: `${selectedWallet?.flag} ${selectedWallet?.currencyName}` },
      { label: 'Amount', value: `${numAmount.toLocaleString()} ${selectedWallet?.currencyCode}`, mono: true, large: true },
      { label: 'Fee', value: rateInfo ? `${rateInfo.feeAmount?.toFixed(2)} ${selectedWallet?.currencyCode} (${rateInfo.fee}%)` : '—' },
      { label: 'Exchange Rate', value: rateInfo ? `1 ${selectedWallet?.currencyCode} = ${rateInfo.rate.toFixed(4)} ${selectedCountry?.currencyCode}` : '—' },
      { label: 'Recipient Gets ≈', value: toAmount ? `${toAmount.toFixed(2)} ${selectedCountry?.currencyCode}` : '—', mono: true },
      { label: 'Destination', value: `${selectedCountry?.flag} ${selectedCountry?.name}` },
      { label: 'Transfer Type', value: transferType === 'bank' ? '🏦 Bank Transfer' : '📱 Mobile Money' },
      ...(transferType === 'bank'
        ? [
            { label: 'Bank', value: bankName },
            { label: 'Account Number', value: accountNumber, mono: true },
            { label: 'Account Name', value: accountName },
          ]
        : [
            { label: 'Provider', value: mobileProvider },
            { label: 'Mobile Number', value: mobileNumber, mono: true },
            { label: 'Receiver Name', value: mobileName },
          ]),
      ...(note ? [{ label: 'Note', value: note }] : []),
    ];

    return (
      <div className="p-4 md:p-8 max-w-2xl mx-auto space-y-5">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="sm" className="px-2" onClick={() => setStep('amount')}>
            <ArrowLeft className="w-4 h-4 mr-1" /> Back
          </Button>
          <div>
            <h1 className="text-xl font-bold">Review Transfer</h1>
            <p className="text-xs text-muted-foreground">Confirm the details before sending</p>
          </div>
        </div>

        {rateLoading ? (
          <Skeleton className="h-64" />
        ) : (
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
        )}

        <div className="p-3 bg-amber-500/10 border border-amber-500/20 rounded-lg">
          <p className="text-xs text-amber-600 dark:text-amber-400">
            ⚠️ Funds will be deducted immediately. Transfers are typically processed within 24 hours.
          </p>
        </div>

        <Button size="lg" className="w-full font-bold" onClick={handleConfirm} disabled={createTransaction.isPending || rateLoading}>
          {createTransaction.isPending ? 'Processing...' : 'Confirm & Send'}
        </Button>
      </div>
    );
  }

  // ── AMOUNT ──────────────────────────────────────────────────────────────────
  if (step === 'amount') {
    return (
      <div className="p-4 md:p-8 max-w-2xl mx-auto space-y-5">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="sm" className="px-2" onClick={() => setStep('receiver')}>
            <ArrowLeft className="w-4 h-4 mr-1" /> Back
          </Button>
          <div>
            <h1 className="text-xl font-bold">Amount to Send</h1>
            <p className="text-xs text-muted-foreground">
              {selectedCountry?.flag} {selectedCountry?.name} · {transferType === 'bank' ? '🏦 Bank Transfer' : '📱 Mobile Money'}
            </p>
          </div>
        </div>

        <Card>
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
              <Label className="text-sm">Amount</Label>
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

            <div className="space-y-1.5">
              <Label className="text-sm">Note / Reference <span className="text-muted-foreground">(optional)</span></Label>
              <Input placeholder="e.g. School fees, rent, family support..." value={note} onChange={e => setNote(e.target.value)} />
            </div>
          </CardContent>
        </Card>

        <Button
          size="lg" className="w-full font-bold"
          onClick={enterReview}
          disabled={!fromWalletId || !amount || numAmount <= 0 || numAmount > (selectedWallet?.balance ?? 0)}
        >
          Review Transfer <ChevronRight className="w-4 h-4 ml-1" />
        </Button>
      </div>
    );
  }

  // ── RECEIVER DETAILS ─────────────────────────────────────────────────────────
  if (step === 'receiver') {
    return (
      <div className="p-4 md:p-8 max-w-2xl mx-auto space-y-5">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="sm" className="px-2" onClick={() => setStep('type')}>
            <ArrowLeft className="w-4 h-4 mr-1" /> Back
          </Button>
          <div>
            <h1 className="text-xl font-bold">Receiver Details</h1>
            <p className="text-xs text-muted-foreground">
              {selectedCountry?.flag} {selectedCountry?.name} · {transferType === 'bank' ? '🏦 Bank Transfer' : '📱 Mobile Money'}
            </p>
          </div>
        </div>

        <Card>
          <CardContent className="p-4 space-y-4">
            {transferType === 'bank' && (
              <>
                <div className="space-y-1.5">
                  <Label className="text-sm">Bank Name</Label>
                  <Input placeholder={`e.g. ${selectedCountry?.name === 'Ghana' ? 'GCB Bank' : selectedCountry?.name === 'Nigeria' ? 'Access Bank' : 'Local Bank'}`} value={bankName} onChange={e => setBankName(e.target.value)} />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-sm">Account Number / IBAN</Label>
                  <Input placeholder="Account number" value={accountNumber} onChange={e => setAccountNumber(e.target.value)} className="font-mono" />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-sm">Account Name</Label>
                  <Input placeholder="Name exactly as on account" value={accountName} onChange={e => setAccountName(e.target.value)} />
                </div>
              </>
            )}

            {transferType === 'mobile_money' && (
              <>
                {/* Provider picker: eMoney + Botim always, then country-specific below */}
                <div className="space-y-3">
                  <Label className="text-sm">Mobile Money Provider</Label>

                  {/* eMoney & Botim — always shown as feature cards */}
                  <div className="grid grid-cols-2 gap-3">
                    {[
                      { label: 'eMoney', icon: '💰', desc: 'eMoney wallet', bg: 'bg-green-500/10' },
                      { label: 'Botim', icon: '📱', desc: 'Botim account', bg: 'bg-blue-500/10' },
                    ].map(p => {
                      const selected = mobileProvider === p.label;
                      return (
                        <button
                          key={p.label}
                          type="button"
                          onClick={() => setMobileProvider(p.label)}
                          className={`rounded-xl border-2 p-4 flex flex-col items-center gap-2 transition-all text-center
                            ${selected ? 'border-primary bg-primary/10' : 'border-border hover:border-primary/40 bg-card'}`}
                        >
                          <div className={`w-10 h-10 rounded-full ${p.bg} flex items-center justify-center text-xl`}>
                            {p.icon}
                          </div>
                          <span className={`font-bold text-sm ${selected ? 'text-primary' : ''}`}>{p.label}</span>
                          <span className="text-xs text-muted-foreground">{p.desc}</span>
                          {selected && <span className="text-[10px] text-primary font-semibold">✓ Selected</span>}
                        </button>
                      );
                    })}
                  </div>

                  {/* Country-specific providers as compact rows */}
                  {(() => {
                    const extra = getProviders(selectedCountry?.code ?? '');
                    if (extra.length === 0) return null;
                    return (
                      <div className="space-y-1.5">
                        <p className="text-xs text-muted-foreground font-medium">Also available in {selectedCountry?.name}</p>
                        {extra.map(p => {
                          const selected = mobileProvider === p.label;
                          return (
                            <button
                              key={p.label}
                              type="button"
                              onClick={() => setMobileProvider(p.label)}
                              className={`w-full text-left rounded-lg border-2 px-3 py-2.5 flex items-center gap-3 transition-all text-sm
                                ${selected ? 'border-primary bg-primary/10 font-semibold' : 'border-border hover:border-primary/40 bg-card'}`}
                            >
                              <span className="text-base leading-none w-5 text-center">{p.icon}</span>
                              <span className="flex-1">{p.label}</span>
                              {selected && <span className="text-primary text-xs">✓</span>}
                            </button>
                          );
                        })}
                      </div>
                    );
                  })()}
                </div>

                <div className="space-y-1.5">
                  <Label className="text-sm">
                    {mobileProvider === 'Botim' ? 'Botim Phone Number' : mobileProvider === 'eMoney' ? 'eMoney Account Number' : 'Account / Phone Number'}
                  </Label>
                  <Input
                    type={mobileProvider === 'Botim' ? 'tel' : 'text'}
                    placeholder={mobileProvider === 'Botim' ? '+971 50 000 0000' : mobileProvider === 'eMoney' ? 'e.g. EMNY-12345678' : 'Account or phone number'}
                    value={mobileNumber}
                    onChange={e => setMobileNumber(e.target.value)}
                    className="font-mono"
                  />
                  {mobileProvider === 'Botim' && (
                    <p className="text-xs text-muted-foreground">Enter the phone number registered on the receiver's Botim account</p>
                  )}
                </div>
                <div className="space-y-1.5">
                  <Label className="text-sm">Receiver's Name</Label>
                  <Input placeholder="Full name" value={mobileName} onChange={e => setMobileName(e.target.value)} />
                </div>
              </>
            )}
          </CardContent>
        </Card>

        <Button
          size="lg" className="w-full font-bold"
          onClick={() => setStep('amount')}
          disabled={!canProceedFromReceiver()}
        >
          Continue <ChevronRight className="w-4 h-4 ml-1" />
        </Button>
      </div>
    );
  }

  // ── TRANSFER TYPE ────────────────────────────────────────────────────────────
  if (step === 'type') {
    const types = [
      {
        id: 'bank' as TransferType,
        label: 'Bank Transfer',
        description: 'Send directly to a bank account',
        icon: Building2,
        bg: 'bg-purple-500/10',
        color: 'text-purple-400',
      },
      {
        id: 'mobile_money' as TransferType,
        label: 'Mobile Money',
        description: 'Send to a mobile money wallet (M-Pesa, MoMo, etc.)',
        icon: Smartphone,
        bg: 'bg-green-500/10',
        color: 'text-green-400',
      },
    ];

    return (
      <div className="p-4 md:p-8 max-w-2xl mx-auto space-y-5">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="sm" className="px-2" onClick={() => setStep('country')}>
            <ArrowLeft className="w-4 h-4 mr-1" /> Back
          </Button>
          <div>
            <h1 className="text-xl font-bold">Transfer Type</h1>
            <p className="text-xs text-muted-foreground">{selectedCountry?.flag} {selectedCountry?.name} · {selectedCountry?.currencyCode}</p>
          </div>
        </div>

        <div className="space-y-3">
          {types.map((t) => {
            const Icon = t.icon;
            return (
              <button
                key={t.id}
                type="button"
                onClick={() => { setTransferType(t.id); setStep('receiver'); }}
                className="w-full text-left rounded-xl border-2 border-border hover:border-primary/50 bg-card p-4 transition-all flex items-center gap-4"
              >
                <div className={`w-12 h-12 rounded-full ${t.bg} flex items-center justify-center shrink-0`}>
                  <Icon className={`w-6 h-6 ${t.color}`} />
                </div>
                <div className="flex-1">
                  <p className="font-bold text-base">{t.label}</p>
                  <p className="text-xs text-muted-foreground">{t.description}</p>
                </div>
                <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0" />
              </button>
            );
          })}
        </div>
      </div>
    );
  }

  // ── STEP 1: COUNTRY SELECTION ────────────────────────────────────────────────
  return (
    <div className="p-4 md:p-8 max-w-2xl mx-auto space-y-5">
      <div>
        <h1 className="text-xl md:text-2xl font-bold tracking-tight">Send Money</h1>
        <p className="text-sm text-muted-foreground">Choose the destination country</p>
      </div>

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <Input
          placeholder="Search country or currency..."
          value={countrySearch}
          onChange={e => setCountrySearch(e.target.value)}
          className="pl-9"
        />
      </div>

      {/* Country list with scroll controls */}
      <div className="flex flex-col gap-2">
        {/* Scroll up bar */}
        <button
          type="button"
          aria-label="Scroll up"
          onClick={() => countryListRef.current?.scrollBy({ top: -200, behavior: 'smooth' })}
          className="w-full flex items-center justify-center gap-1.5 py-2 rounded-xl border border-border bg-card hover:bg-muted/60 transition-colors text-muted-foreground text-xs font-medium"
        >
          <ChevronUp className="w-4 h-4" />
          Scroll up
        </button>

        {/* Scrollable list */}
        <div
          ref={countryListRef}
          className="space-y-2 overflow-y-auto max-h-[52vh] scroll-smooth [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        >
          {filteredCountries.length === 0 && (
            <p className="text-sm text-muted-foreground text-center py-8">No countries found</p>
          )}
          {filteredCountries.map(c => (
            <button
              key={c.code}
              type="button"
              onClick={() => { setSelectedCountryCode(c.code); setStep('type'); }}
              className="w-full text-left rounded-xl border border-border hover:border-primary/50 hover:bg-muted/30 bg-card p-3.5 transition-all flex items-center gap-3.5"
            >
              <span className="text-2xl leading-none">{c.flag}</span>
              <div className="flex-1 min-w-0">
                <p className="font-semibold text-sm">{c.name}</p>
                <p className="text-xs text-muted-foreground">{c.currencyName} · {c.currencyCode}</p>
              </div>
              {c.popular && (
                <Badge variant="secondary" className="text-[10px] shrink-0">Popular</Badge>
              )}
              <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0" />
            </button>
          ))}
        </div>

        {/* Scroll down bar */}
        <button
          type="button"
          aria-label="Scroll down"
          onClick={() => countryListRef.current?.scrollBy({ top: 200, behavior: 'smooth' })}
          className="w-full flex items-center justify-center gap-1.5 py-2 rounded-xl border border-border bg-card hover:bg-muted/60 transition-colors text-muted-foreground text-xs font-medium"
        >
          <ChevronDown className="w-4 h-4" />
          Scroll down
        </button>
      </div>
    </div>
  );
}
