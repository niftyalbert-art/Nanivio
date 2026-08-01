import { useState } from 'react';
import {
  useGetWallets,
  useCreateWithdrawal,
  getGetWithdrawalsQueryKey,
  getGetWalletsQueryKey,
  getGetDashboardSummaryQueryKey,
} from '@workspace/api-client-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import { Clock, ArrowLeft, Smartphone, Building2, ShieldCheck } from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import { useToast } from '@/hooks/use-toast';
import { Link } from 'wouter';

// Mobile money networks by country
const MOBILE_MONEY_NETWORKS: Record<string, string[]> = {
  Ghana: ['MTN Mobile Money', 'Vodafone Cash', 'AirtelTigo Money'],
  Nigeria: ['MTN MoMo', 'Opay', 'Palmpay', 'Kuda'],
  Kenya: ['M-Pesa', 'Airtel Money', 'Equitel'],
  Philippines: ['GCash', 'Maya', 'ShopeePay'],
  India: ['UPI / IMPS', 'Paytm', 'PhonePe'],
  Pakistan: ['JazzCash', 'EasyPaisa'],
  Uganda: ['MTN Mobile Money', 'Airtel Money'],
  Tanzania: ['M-Pesa', 'Airtel Money', 'Tigo Pesa'],
  UAE: ['Botim', 'eMoney'],
  USA: ['Zelle', 'Venmo', 'Cash App'],
  UK: ['Faster Payments', 'Revolut'],
  Bangladesh: ['bKash', 'Nagad', 'Rocket'],
  Egypt: ['Vodafone Cash', 'Fawry', 'Orange Money'],
  Morocco: ['Orange Money', 'CIH Mobile'],
  'Sri Lanka': ['eZ Cash', 'Dialog Mobile Money'],
  Senegal: ['Orange Money', 'Wave', 'Free Money'],
  Malaysia: ['Touch \'n Go', 'Boost', 'GrabPay'],
  Mexico: ['SPEI', 'CoDi'],
  Brazil: ['Pix', 'Nubank'],
  Cameroon: ['MTN MoMo', 'Orange Money'],
  Ethiopia: ['Telebirr', 'M-Pesa'],
};

const COUNTRIES_WITH_MOBILE_MONEY = Object.keys(MOBILE_MONEY_NETWORKS);

export default function Withdraw() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { data: wallets, isLoading } = useGetWallets();
  const createWithdrawal = useCreateWithdrawal();

  const [step, setStep] = useState<'form' | 'confirm' | 'pin' | 'success'>('form');
  const [walletId, setWalletId] = useState('');
  const [amount, setAmount] = useState('');
  const [withdrawalType, setWithdrawalType] = useState<'mobile_money' | 'bank'>('mobile_money');
  const [recipientCountry, setRecipientCountry] = useState('');
  // Mobile money
  const [mobileNumber, setMobileNumber] = useState('');
  const [mobileNetwork, setMobileNetwork] = useState('');
  // Bank
  const [bankName, setBankName] = useState('');
  const [accountNumber, setAccountNumber] = useState('');
  const [accountName, setAccountName] = useState('');
  // PIN
  const [pin, setPin] = useState('');
  const [pinError, setPinError] = useState('');

  const selectedWallet = wallets?.find(w => w.id === Number(walletId));
  const availableNetworks = MOBILE_MONEY_NETWORKS[recipientCountry] ?? [];
  const hasMobileMoney = COUNTRIES_WITH_MOBILE_MONEY.includes(recipientCountry);

  const canSubmit = walletId && amount && recipientCountry &&
    (withdrawalType === 'mobile_money' ? (mobileNumber && mobileNetwork) : (bankName && accountNumber && accountName));

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (step === 'form') { setStep('confirm'); return; }
    if (step === 'confirm') { setPin(''); setPinError(''); setStep('pin'); return; }
  };

  const handlePinConfirm = () => {
    setPinError('');
    createWithdrawal.mutate(
      {
        data: {
          walletId: Number(walletId),
          amount: Number(amount),
          withdrawalType,
          recipientCountry,
          mobileNumber: withdrawalType === 'mobile_money' ? mobileNumber : undefined,
          mobileNetwork: withdrawalType === 'mobile_money' ? mobileNetwork : undefined,
          bankName: withdrawalType === 'bank' ? bankName : undefined,
          accountNumber: withdrawalType === 'bank' ? accountNumber : undefined,
          accountName: withdrawalType === 'bank' ? accountName : undefined,
          pin,
        },
      },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getGetWithdrawalsQueryKey() });
          queryClient.invalidateQueries({ queryKey: getGetWalletsQueryKey() });
          queryClient.invalidateQueries({ queryKey: getGetDashboardSummaryQueryKey() });
          setStep('success');
        },
        onError: (err: any) => {
          const msg: string = err?.message ?? '';
          const isPinError = msg.toLowerCase().includes('pin') || msg.toLowerCase().includes('incorrect');
          if (isPinError) {
            setPinError('Incorrect PIN. Please try again.');
          } else {
            toast({ title: 'Withdrawal failed', description: msg || 'Please try again.', variant: 'destructive' });
          }
        },
      }
    );
  };

  if (isLoading) {
    return (
      <div className="p-4 md:p-8 max-w-2xl mx-auto space-y-4">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-80" />
      </div>
    );
  }

  if (step === 'success') {
    return (
      <div className="p-4 md:p-8 max-w-2xl mx-auto flex items-center justify-center min-h-[60vh]">
        <Card className="w-full">
          <CardContent className="pt-10 pb-10 text-center space-y-5">
            <div className="w-16 h-16 mx-auto rounded-full bg-amber-500/10 flex items-center justify-center">
              <Clock className="w-8 h-8 text-amber-500" />
            </div>
            <div className="space-y-1">
              <h2 className="text-xl md:text-2xl font-bold">Withdrawal Pending</h2>
              <p className="text-sm text-muted-foreground">
                Your withdrawal of {amount} {selectedWallet?.currencyCode} has been submitted and is pending approval. Funds are usually sent within 24 hours.
              </p>
            </div>
            <Badge className="bg-amber-500/10 text-amber-500 border-amber-500/20 px-4 py-1">Pending Review</Badge>
            <div className="pt-2 space-y-2">
              <Link href="/wallets">
                <Button className="w-full max-w-xs">View My Wallets</Button>
              </Link>
              <Button variant="outline" className="w-full max-w-xs" onClick={() => {
                setStep('form');
                setWalletId(''); setAmount(''); setRecipientCountry('');
                setMobileNumber(''); setMobileNetwork('');
                setBankName(''); setAccountNumber(''); setAccountName('');
              }}>
                New Withdrawal
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="p-4 md:p-8 max-w-2xl mx-auto space-y-5">
      <div className="flex items-center gap-3">
        <Link href="/wallets">
          <Button variant="ghost" size="sm" className="px-2">
            <ArrowLeft className="w-4 h-4 mr-1" /> Back
          </Button>
        </Link>
        <div>
          <h1 className="text-xl md:text-2xl font-bold tracking-tight">Withdraw Funds</h1>
          <p className="text-xs text-muted-foreground">Send money via mobile money or bank transfer</p>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        {step === 'form' && (
          <Card>
            <CardHeader className="p-4 pb-0">
              <CardTitle className="text-base">Withdrawal Details</CardTitle>
              <CardDescription className="text-xs">Funds are deducted immediately and sent within 24h</CardDescription>
            </CardHeader>
            <CardContent className="p-4 space-y-4">
              {/* Wallet */}
              <div className="space-y-1.5">
                <Label className="text-sm">From Wallet</Label>
                <Select value={walletId} onValueChange={setWalletId} required>
                  <SelectTrigger>
                    <SelectValue placeholder="Select wallet" />
                  </SelectTrigger>
                  <SelectContent>
                    {wallets?.map((w) => (
                      <SelectItem key={w.id} value={String(w.id)}>
                        {w.flag} {w.currencyName} — Balance: {w.balance.toLocaleString('en-US', { minimumFractionDigits: 2 })} {w.currencyCode}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {selectedWallet && (
                  <p className="text-xs text-muted-foreground">
                    Available: <span className="font-semibold font-mono">{selectedWallet.balance.toLocaleString('en-US', { minimumFractionDigits: 2 })} {selectedWallet.currencyCode}</span>
                  </p>
                )}
              </div>

              {/* Amount */}
              <div className="space-y-1.5">
                <Label className="text-sm">Amount</Label>
                <div className="relative">
                  <Input
                    type="number" step="0.01" min="0.01"
                    max={selectedWallet?.balance}
                    placeholder="0.00"
                    value={amount} onChange={(e) => setAmount(e.target.value)}
                    className="pr-16 font-mono" required
                  />
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">
                    {selectedWallet?.currencyCode || '---'}
                  </span>
                </div>
              </div>

              {/* Recipient Country */}
              <div className="space-y-1.5">
                <Label className="text-sm">Recipient's Country</Label>
                <Select value={recipientCountry} onValueChange={(v) => { setRecipientCountry(v); setMobileNetwork(''); }}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select country" />
                  </SelectTrigger>
                  <SelectContent>
                    {['Ghana', 'Nigeria', 'Kenya', 'Philippines', 'India', 'Pakistan', 'Uganda', 'Tanzania', 'UAE', 'USA', 'UK', 'Bangladesh', 'Egypt', 'Morocco', 'Sri Lanka', 'Senegal', 'Malaysia', 'Mexico', 'Brazil', 'Cameroon', 'Ethiopia'].sort().map(c => (
                      <SelectItem key={c} value={c}>{c}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Withdrawal Type Toggle */}
              {recipientCountry && (
                <div className="space-y-2">
                  <Label className="text-sm">Transfer Method</Label>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => setWithdrawalType('mobile_money')}
                      className={`flex items-center gap-2 p-3 rounded-lg border text-sm font-medium transition-all ${withdrawalType === 'mobile_money' ? 'border-primary bg-primary/10 text-primary' : 'border-border text-muted-foreground hover:border-primary/50'}`}
                    >
                      <Smartphone className="w-4 h-4 shrink-0" />
                      Mobile Money
                    </button>
                    <button
                      type="button"
                      onClick={() => setWithdrawalType('bank')}
                      className={`flex items-center gap-2 p-3 rounded-lg border text-sm font-medium transition-all ${withdrawalType === 'bank' ? 'border-primary bg-primary/10 text-primary' : 'border-border text-muted-foreground hover:border-primary/50'}`}
                    >
                      <Building2 className="w-4 h-4 shrink-0" />
                      Bank Transfer
                    </button>
                  </div>
                </div>
              )}

              {/* Mobile Money Fields */}
              {recipientCountry && withdrawalType === 'mobile_money' && (
                <div className="space-y-3 p-3 bg-muted/30 rounded-lg">
                  <div className="space-y-1.5">
                    <Label className="text-sm">Mobile Network</Label>
                    {availableNetworks.length > 0 ? (
                      <Select value={mobileNetwork} onValueChange={setMobileNetwork} required>
                        <SelectTrigger>
                          <SelectValue placeholder="Select network" />
                        </SelectTrigger>
                        <SelectContent>
                          {availableNetworks.map(n => (
                            <SelectItem key={n} value={n}>{n}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    ) : (
                      <Input
                        placeholder="Enter network name"
                        value={mobileNetwork} onChange={(e) => setMobileNetwork(e.target.value)}
                        required
                      />
                    )}
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-sm">Mobile Number</Label>
                    <Input
                      type="tel" placeholder="+1 000 000 0000"
                      value={mobileNumber} onChange={(e) => setMobileNumber(e.target.value)}
                      required
                    />
                  </div>
                </div>
              )}

              {/* Bank Fields */}
              {recipientCountry && withdrawalType === 'bank' && (
                <div className="space-y-3 p-3 bg-muted/30 rounded-lg">
                  <div className="space-y-1.5">
                    <Label className="text-sm">Bank Name</Label>
                    <Input placeholder="e.g. Access Bank" value={bankName} onChange={(e) => setBankName(e.target.value)} required />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-sm">Account Number / IBAN</Label>
                    <Input placeholder="Account number" value={accountNumber} onChange={(e) => setAccountNumber(e.target.value)} required className="font-mono" />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-sm">Account Name</Label>
                    <Input placeholder="Name on account" value={accountName} onChange={(e) => setAccountName(e.target.value)} required />
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {step === 'confirm' && (
          <Card>
            <CardHeader className="p-4 pb-0">
              <CardTitle className="text-base">Confirm Withdrawal</CardTitle>
              <CardDescription className="text-xs">Review before submitting</CardDescription>
            </CardHeader>
            <CardContent className="p-4 space-y-3">
              {[
                { label: 'From', value: `${selectedWallet?.flag} ${selectedWallet?.currencyName}` },
                { label: 'Amount', value: `${amount} ${selectedWallet?.currencyCode}`, mono: true },
                { label: 'Country', value: recipientCountry },
                { label: 'Method', value: withdrawalType === 'mobile_money' ? 'Mobile Money' : 'Bank Transfer' },
                ...(withdrawalType === 'mobile_money'
                  ? [{ label: 'Network', value: mobileNetwork }, { label: 'Mobile', value: mobileNumber, mono: true }]
                  : [{ label: 'Bank', value: bankName }, { label: 'Account', value: accountNumber, mono: true }, { label: 'Name', value: accountName }]
                ),
              ].map(({ label, value, mono }) => (
                <div key={label} className="flex justify-between items-start gap-4 py-2 border-b border-border last:border-0">
                  <span className="text-sm text-muted-foreground shrink-0">{label}</span>
                  <span className={`text-sm font-semibold text-right break-all ${mono ? 'font-mono' : ''}`}>{value}</span>
                </div>
              ))}
              <div className="p-3 bg-amber-500/10 border border-amber-500/20 rounded-lg mt-2">
                <p className="text-xs text-amber-600 dark:text-amber-400">
                  ⚠️ Funds will be deducted from your wallet immediately. Withdrawals are processed within 24 hours.
                </p>
              </div>
            </CardContent>
          </Card>
        )}

        <div className="flex gap-3">
          {step === 'confirm' && (
            <Button type="button" variant="outline" className="flex-1" onClick={() => setStep('form')}>
              Back
            </Button>
          )}
          <Button
            type="submit"
            className="flex-1"
            disabled={!canSubmit}
          >
            {step === 'form' ? 'Review Withdrawal' : 'Continue to PIN'}
          </Button>
        </div>
      </form>

      {/* ── PIN STEP ── */}
      {step === 'pin' && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 p-4">
          <div className="w-full max-w-sm bg-card rounded-2xl shadow-2xl p-6 space-y-5">
            <div className="flex items-center gap-3">
              <Button variant="ghost" size="sm" className="px-2" onClick={() => { setPin(''); setPinError(''); setStep('confirm'); }}>
                <ArrowLeft className="w-4 h-4" />
              </Button>
              <div>
                <h2 className="font-bold text-base">Confirm with PIN</h2>
                <p className="text-xs text-muted-foreground">Enter your 4-digit PIN to authorise this withdrawal</p>
              </div>
            </div>

            <div className="flex flex-col items-center gap-4">
              <div className="w-14 h-14 rounded-full bg-primary/10 flex items-center justify-center">
                <ShieldCheck className="w-7 h-7 text-primary" />
              </div>
              <div className="text-center space-y-0.5">
                <p className="font-semibold">
                  Withdrawing <span className="font-mono">{amount} {selectedWallet?.currencyCode}</span>
                </p>
                <p className="text-sm text-muted-foreground">via {withdrawalType === 'mobile_money' ? 'Mobile Money' : 'Bank Transfer'} · {recipientCountry}</p>
              </div>
            </div>

            <div className="space-y-2">
              <Label className="text-sm text-center block">4-Digit PIN</Label>
              <Input
                type="password"
                inputMode="numeric"
                pattern="\d{4}"
                maxLength={4}
                placeholder="••••"
                value={pin}
                onChange={e => { setPin(e.target.value.replace(/\D/g, '').slice(0, 4)); setPinError(''); }}
                className={`text-center text-2xl tracking-[0.5em] font-mono max-w-[160px] mx-auto block ${pinError ? 'border-destructive' : ''}`}
                autoFocus
                onKeyDown={e => { if (e.key === 'Enter' && pin.length === 4) handlePinConfirm(); }}
              />
              {pinError && <p className="text-sm text-destructive text-center">{pinError}</p>}
            </div>

            <Button
              className="w-full font-bold"
              onClick={handlePinConfirm}
              disabled={pin.length !== 4 || createWithdrawal.isPending}
            >
              {createWithdrawal.isPending ? 'Processing...' : 'Authorise Withdrawal'}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
