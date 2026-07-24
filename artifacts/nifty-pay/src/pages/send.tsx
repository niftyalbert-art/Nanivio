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
import { ArrowRight, CheckCircle2 } from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import { useLocation } from 'wouter';
import { useToast } from '@/hooks/use-toast';

const CURRENCIES = [
  { code: 'USD', name: 'US Dollar', flag: '🇺🇸' },
  { code: 'AED', name: 'UAE Dirham', flag: '🇦🇪' },
  { code: 'GHS', name: 'Ghanaian Cedi', flag: '🇬🇭' },
  { code: 'PHP', name: 'Philippine Peso', flag: '🇵🇭' },
  { code: 'NGN', name: 'Nigerian Naira', flag: '🇳🇬' },
  { code: 'INR', name: 'Indian Rupee', flag: '🇮🇳' },
  { code: 'KES', name: 'Kenyan Shilling', flag: '🇰🇪' },
  { code: 'GBP', name: 'British Pound', flag: '🇬🇧' },
  { code: 'EUR', name: 'Euro', flag: '🇪🇺' },
  { code: 'USDT', name: 'Tether', flag: '₿' },
];

export default function Send() {
  const [, setLocation] = useLocation();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const { data: wallets, isLoading: walletsLoading } = useGetWallets();
  const createTransaction = useCreateTransaction();

  const [step, setStep] = useState<'form' | 'confirm' | 'success'>('form');
  const [fromWalletId, setFromWalletId] = useState<string>('');
  const [toCurrency, setToCurrency] = useState<string>('');
  const [amount, setAmount] = useState<string>('');
  const [recipientName, setRecipientName] = useState<string>('');
  const [recipientCountry, setRecipientCountry] = useState<string>('');
  const [note, setNote] = useState<string>('');

  const selectedWallet = wallets?.find(w => w.id === Number(fromWalletId));

  const { data: rates, isLoading: ratesLoading } = useGetExchangeRates(
    { from: selectedWallet?.currencyCode || '', to: toCurrency },
    {
      query: {
        enabled: !!selectedWallet && !!toCurrency && selectedWallet.currencyCode !== toCurrency,
        queryKey: selectedWallet && toCurrency ? ['exchange-rates', selectedWallet.currencyCode, toCurrency] : undefined,
        refetchInterval: 5000,
      },
    }
  );

  const numAmount = Number(amount) || 0;
  const feeAmount = rates?.feeAmount || 0;
  const recipientGets = rates ? numAmount * rates.rate : 0;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (step === 'form') {
      setStep('confirm');
    } else if (step === 'confirm') {
      createTransaction.mutate(
        {
          data: {
            fromWalletId: Number(fromWalletId),
            toCurrencyCode: toCurrency,
            fromAmount: numAmount,
            recipientName,
            recipientCountry,
            note: note || undefined,
          },
        },
        {
          onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: getGetWalletsQueryKey() });
            queryClient.invalidateQueries({ queryKey: getGetTransactionsQueryKey() });
            queryClient.invalidateQueries({ queryKey: getGetDashboardSummaryQueryKey() });
            setStep('success');
          },
          onError: () => {
            toast({ title: 'Transfer failed', description: 'Something went wrong. Please try again.', variant: 'destructive' });
          },
        }
      );
    }
  };

  if (walletsLoading) {
    return (
      <div className="p-4 md:p-8 max-w-2xl mx-auto space-y-6">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-80 md:h-96" />
      </div>
    );
  }

  if (step === 'success') {
    return (
      <div className="min-h-[50dvh] p-4 md:p-8 max-w-2xl mx-auto flex items-center justify-center">
        <Card className="w-full">
          <CardContent className="pt-10 pb-10 text-center space-y-5">
            <div className="w-16 h-16 md:w-20 md:h-20 mx-auto rounded-full bg-emerald-500/10 flex items-center justify-center">
              <CheckCircle2 className="w-8 h-8 md:w-10 md:h-10 text-emerald-500" />
            </div>
            <div className="space-y-1">
              <h2 className="text-xl md:text-3xl font-bold">Transfer Initiated</h2>
              <p className="text-sm text-muted-foreground">Your transfer is being processed. You'll receive a confirmation shortly.</p>
            </div>
            <div className="pt-2 space-y-3">
              <Button size="lg" className="w-full max-w-xs" onClick={() => setLocation('/transactions')} data-testid="button-view-transactions">
                View Transactions
              </Button>
              <Button
                size="lg"
                variant="outline"
                className="w-full max-w-xs"
                onClick={() => { setStep('form'); setFromWalletId(''); setToCurrency(''); setAmount(''); setRecipientName(''); setRecipientCountry(''); setNote(''); }}
                data-testid="button-send-another"
              >
                Send Another
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (step === 'confirm') {
    const toCurrencyInfo = CURRENCIES.find(c => c.code === toCurrency);
    return (
      <div className="p-4 md:p-8 max-w-2xl mx-auto space-y-5 md:space-y-8">
        <div>
          <h1 className="text-xl md:text-4xl font-bold tracking-tight mb-1">Confirm Transfer</h1>
          <p className="text-sm text-muted-foreground">Review the details before sending</p>
        </div>

        <Card>
          <CardContent className="p-4 md:p-8 space-y-4 md:space-y-6">
            <div className="space-y-3">
              {[
                { label: 'From', value: `${selectedWallet?.flag} ${selectedWallet?.currencyName}` },
                { label: 'To', value: `${toCurrencyInfo?.flag} ${toCurrencyInfo?.name}` },
              ].map(({ label, value }) => (
                <div key={label} className="flex justify-between items-center py-2.5 border-b border-border">
                  <span className="text-sm text-muted-foreground">{label}</span>
                  <span className="font-semibold text-sm">{value}</span>
                </div>
              ))}
              <div className="flex justify-between items-center py-2.5 border-b border-border">
                <span className="text-sm text-muted-foreground">You send</span>
                <span className="text-lg md:text-2xl font-bold font-mono">{numAmount.toFixed(2)} {selectedWallet?.currencyCode}</span>
              </div>
              <div className="flex justify-between items-center py-2.5 border-b border-border">
                <span className="text-sm text-muted-foreground">Exchange rate</span>
                <span className="font-mono text-sm">1 {selectedWallet?.currencyCode} = {rates?.rate.toFixed(4)} {toCurrency}</span>
              </div>
              <div className="flex justify-between items-center py-2.5 border-b border-border">
                <span className="text-sm text-muted-foreground">Transfer fee</span>
                <span className="font-mono text-sm">{feeAmount.toFixed(2)} {selectedWallet?.currencyCode}</span>
              </div>
              <div className="flex justify-between items-center py-3 bg-primary/5 rounded-lg px-3 md:px-4">
                <span className="font-semibold text-sm md:text-base">Recipient gets</span>
                <span className="text-lg md:text-2xl font-bold font-mono text-primary">{recipientGets.toFixed(2)} {toCurrency}</span>
              </div>
              <div className="pt-3 space-y-2">
                {[
                  { label: 'Recipient', value: recipientName },
                  { label: 'Country', value: recipientCountry },
                  ...(note ? [{ label: 'Note', value: note }] : []),
                ].map(({ label, value }) => (
                  <div key={label} className="flex justify-between text-sm">
                    <span className="text-muted-foreground">{label}</span>
                    <span className="font-semibold text-right max-w-[60%] break-words">{value}</span>
                  </div>
                ))}
              </div>
            </div>

            <div className="flex gap-3 pt-2">
              <Button type="button" variant="outline" className="flex-1" onClick={() => setStep('form')} data-testid="button-back">Back</Button>
              <Button type="button" className="flex-1" onClick={handleSubmit} disabled={createTransaction.isPending} data-testid="button-confirm-transfer">
                {createTransaction.isPending ? 'Processing...' : 'Confirm & Send'}
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="p-4 md:p-8 max-w-2xl mx-auto space-y-5 md:space-y-8">
      <div>
        <h1 className="text-xl md:text-4xl font-bold tracking-tight mb-1">Send Money</h1>
        <p className="text-sm text-muted-foreground">Transfer funds globally in seconds</p>
      </div>

      <form onSubmit={handleSubmit}>
        <Card>
          <CardHeader className="p-4 md:p-6 pb-0 md:pb-0">
            <CardTitle className="text-base md:text-xl">Transfer Details</CardTitle>
            <CardDescription className="text-xs md:text-sm">Choose your source wallet and destination currency</CardDescription>
          </CardHeader>
          <CardContent className="p-4 md:p-6 space-y-4 md:space-y-6">
            <div className="space-y-1.5">
              <Label htmlFor="from-wallet" className="text-sm">From Wallet</Label>
              <Select value={fromWalletId} onValueChange={setFromWalletId} required>
                <SelectTrigger id="from-wallet" data-testid="select-from-wallet">
                  <SelectValue placeholder="Select wallet" />
                </SelectTrigger>
                <SelectContent>
                  {wallets?.map((wallet) => (
                    <SelectItem key={wallet.id} value={String(wallet.id)}>
                      {wallet.flag} {wallet.currencyName} ({wallet.balance.toFixed(2)} {wallet.currencyCode})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="to-currency" className="text-sm">To Currency</Label>
              <Select value={toCurrency} onValueChange={setToCurrency} required>
                <SelectTrigger id="to-currency" data-testid="select-to-currency">
                  <SelectValue placeholder="Select currency" />
                </SelectTrigger>
                <SelectContent>
                  {CURRENCIES.filter(c => c.code !== selectedWallet?.currencyCode).map((currency) => (
                    <SelectItem key={currency.code} value={currency.code}>
                      {currency.flag} {currency.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="amount" className="text-sm">Amount</Label>
              <div className="relative">
                <Input
                  id="amount"
                  type="number"
                  step="0.01"
                  min="0.01"
                  placeholder="0.00"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  className="pr-16 font-mono text-base md:text-lg"
                  required
                  data-testid="input-amount"
                />
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground font-mono text-sm">
                  {selectedWallet?.currencyCode || 'USD'}
                </span>
              </div>
            </div>

            {rates && selectedWallet && toCurrency && amount && (
              <Card className="bg-muted/50 border-primary/20">
                <CardContent className="p-3 md:p-4 space-y-2 md:space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs md:text-sm text-muted-foreground">Exchange Rate</span>
                    <span className="font-mono text-xs md:text-sm">1 {selectedWallet.currencyCode} = {rates.rate.toFixed(4)} {toCurrency}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-xs md:text-sm text-muted-foreground">Fee ({rates.fee}%)</span>
                    <span className="font-mono text-xs md:text-sm">{feeAmount.toFixed(2)} {selectedWallet.currencyCode}</span>
                  </div>
                  <div className="flex items-center justify-between pt-2 border-t border-border">
                    <span className="font-semibold text-sm">Recipient Gets</span>
                    <span className="text-base md:text-xl font-bold font-mono text-primary">{recipientGets.toFixed(2)} {toCurrency}</span>
                  </div>
                </CardContent>
              </Card>
            )}

            <div className="pt-2 border-t border-border space-y-4">
              <h3 className="font-semibold text-sm md:text-base">Recipient Information</h3>
              <div className="space-y-1.5">
                <Label htmlFor="recipient-name" className="text-sm">Recipient Name</Label>
                <Input id="recipient-name" placeholder="Full name" value={recipientName} onChange={(e) => setRecipientName(e.target.value)} required data-testid="input-recipient-name" />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="recipient-country" className="text-sm">Recipient Country</Label>
                <Input id="recipient-country" placeholder="Country" value={recipientCountry} onChange={(e) => setRecipientCountry(e.target.value)} required data-testid="input-recipient-country" />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="note" className="text-sm">Note (Optional)</Label>
                <Input id="note" placeholder="Add a message" value={note} onChange={(e) => setNote(e.target.value)} data-testid="input-note" />
              </div>
            </div>

            <Button
              type="submit"
              size="lg"
              className="w-full"
              disabled={!fromWalletId || !toCurrency || !amount || !recipientName || !recipientCountry || ratesLoading}
              data-testid="button-continue"
            >
              Continue
              <ArrowRight className="ml-2 w-4 h-4" />
            </Button>
          </CardContent>
        </Card>
      </form>
    </div>
  );
}
