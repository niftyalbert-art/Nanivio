import { useState, useRef } from 'react';
import {
  useGetPaymentMethods,
  useGetWallets,
  useCreateDeposit,
  getGetDepositsQueryKey,
} from '@workspace/api-client-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import { CheckCircle2, Copy, Check, Upload, Clock, ArrowLeft } from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import { useToast } from '@/hooks/use-toast';
import { Link } from 'wouter';

type Step = 'method' | 'confirm' | 'success';

export default function Deposit() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const fileRef = useRef<HTMLInputElement>(null);

  const { data: methods, isLoading: methodsLoading } = useGetPaymentMethods();
  const { data: wallets, isLoading: walletsLoading } = useGetWallets();
  const createDeposit = useCreateDeposit();

  const [step, setStep] = useState<Step>('method');
  const [selectedMethodId, setSelectedMethodId] = useState<number | null>(null);
  const [selectedWalletId, setSelectedWalletId] = useState<string>('');
  const [amount, setAmount] = useState('');
  const [txId, setTxId] = useState('');
  const [receiptBase64, setReceiptBase64] = useState<string>('');
  const [receiptName, setReceiptName] = useState('');
  const [copied, setCopied] = useState<string | null>(null);

  const selectedMethod = methods?.find(m => m.id === selectedMethodId);
  const selectedWallet = wallets?.find(w => w.id === Number(selectedWalletId));

  const copyToClipboard = (text: string, key: string) => {
    navigator.clipboard.writeText(text);
    setCopied(key);
    setTimeout(() => setCopied(null), 2000);
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setReceiptName(file.name);
    const reader = new FileReader();
    reader.onload = (ev) => {
      setReceiptBase64(ev.target?.result as string);
    };
    reader.readAsDataURL(file);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedMethodId || !selectedWalletId || !amount || !txId || !receiptBase64) {
      toast({ title: 'Missing fields', description: 'Please fill in all fields and upload your receipt.', variant: 'destructive' });
      return;
    }
    createDeposit.mutate(
      {
        data: {
          walletId: Number(selectedWalletId),
          paymentMethodId: selectedMethodId,
          amount: Number(amount),
          externalTransactionId: txId,
          receiptImage: receiptBase64,
        },
      },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getGetDepositsQueryKey() });
          setStep('success');
        },
        onError: () => {
          toast({ title: 'Submission failed', description: 'Please try again.', variant: 'destructive' });
        },
      }
    );
  };

  if (methodsLoading || walletsLoading) {
    return (
      <div className="p-4 md:p-8 max-w-2xl mx-auto space-y-4">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-64" />
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
              <h2 className="text-xl md:text-2xl font-bold">Deposit Pending</h2>
              <p className="text-sm text-muted-foreground">
                Your deposit is under review. It will be credited to your {selectedWallet?.currencyCode} wallet once confirmed by admin — usually within 1–3 hours.
              </p>
            </div>
            <Badge className="bg-amber-500/10 text-amber-500 border-amber-500/20 px-4 py-1">Pending Review</Badge>
            <div className="pt-2 space-y-2">
              <Link href="/wallets">
                <Button className="w-full max-w-xs">View My Wallets</Button>
              </Link>
              <Button variant="outline" className="w-full max-w-xs" onClick={() => {
                setStep('method');
                setSelectedMethodId(null);
                setSelectedWalletId('');
                setAmount('');
                setTxId('');
                setReceiptBase64('');
                setReceiptName('');
              }}>
                New Deposit
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
          <h1 className="text-xl md:text-2xl font-bold tracking-tight">Fund Your Wallet</h1>
          <p className="text-xs text-muted-foreground">Copy payment details, transfer funds, then confirm below</p>
        </div>
      </div>

      {/* Step indicator */}
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <span className={step === 'method' ? 'text-primary font-semibold' : ''}>1. Choose method</span>
        <span>→</span>
        <span className={step === 'confirm' ? 'text-primary font-semibold' : ''}>2. Confirm transfer</span>
      </div>

      {step === 'method' && (
        <div className="space-y-4">
          {/* Payment Methods */}
          <div className="space-y-2">
            <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">Select Payment Channel</h2>
            {methods?.map((method) => (
              <Card
                key={method.id}
                className={`cursor-pointer transition-all border-2 ${selectedMethodId === method.id ? 'border-primary bg-primary/5' : 'border-transparent hover:border-border'}`}
                onClick={() => setSelectedMethodId(method.id)}
              >
                <CardContent className="p-4">
                  <div className="flex items-start gap-3">
                    <span className="text-2xl shrink-0">{method.logoEmoji}</span>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between mb-2">
                        <p className="font-bold">{method.name}</p>
                        {selectedMethodId === method.id && (
                          <CheckCircle2 className="w-4 h-4 text-primary shrink-0" />
                        )}
                      </div>

                      {/* Copyable details */}
                      <div className="space-y-2 text-sm">
                        <div className="flex items-center justify-between gap-2 bg-muted/60 rounded-lg px-3 py-2">
                          <div className="min-w-0">
                            <p className="text-xs text-muted-foreground">Account / Number</p>
                            <p className="font-mono font-semibold text-xs md:text-sm truncate">{method.accountNumber}</p>
                          </div>
                          <Button
                            variant="ghost" size="sm"
                            className="shrink-0 h-7 w-7 p-0"
                            onClick={(e) => { e.stopPropagation(); copyToClipboard(method.accountNumber, `acct-${method.id}`); }}
                          >
                            {copied === `acct-${method.id}` ? <Check className="w-3.5 h-3.5 text-emerald-500" /> : <Copy className="w-3.5 h-3.5" />}
                          </Button>
                        </div>
                        <div className="flex items-center justify-between gap-2 bg-muted/60 rounded-lg px-3 py-2">
                          <div className="min-w-0">
                            <p className="text-xs text-muted-foreground">Account Name</p>
                            <p className="font-semibold text-xs md:text-sm truncate">{method.accountName}</p>
                          </div>
                          <Button
                            variant="ghost" size="sm"
                            className="shrink-0 h-7 w-7 p-0"
                            onClick={(e) => { e.stopPropagation(); copyToClipboard(method.accountName, `name-${method.id}`); }}
                          >
                            {copied === `name-${method.id}` ? <Check className="w-3.5 h-3.5 text-emerald-500" /> : <Copy className="w-3.5 h-3.5" />}
                          </Button>
                        </div>
                      </div>

                      <p className="text-xs text-muted-foreground mt-2 leading-relaxed">{method.instructions}</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>

          <Button
            className="w-full"
            disabled={!selectedMethodId}
            onClick={() => setStep('confirm')}
          >
            I've sent the money — Continue
          </Button>
        </div>
      )}

      {step === 'confirm' && (
        <form onSubmit={handleSubmit} className="space-y-4">
          <Card>
            <CardHeader className="p-4 pb-0">
              <CardTitle className="text-base">Confirm Your Transfer</CardTitle>
              <CardDescription className="text-xs">Fill in the details from your {selectedMethod?.name} receipt</CardDescription>
            </CardHeader>
            <CardContent className="p-4 space-y-4">
              {/* Wallet */}
              <div className="space-y-1.5">
                <Label className="text-sm">Credit to Wallet</Label>
                <Select value={selectedWalletId} onValueChange={setSelectedWalletId} required>
                  <SelectTrigger>
                    <SelectValue placeholder="Select wallet to receive funds" />
                  </SelectTrigger>
                  <SelectContent>
                    {wallets?.map((w) => (
                      <SelectItem key={w.id} value={String(w.id)}>
                        {w.flag} {w.currencyName} ({w.currencyCode})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Amount */}
              <div className="space-y-1.5">
                <Label className="text-sm">Amount Sent</Label>
                <div className="relative">
                  <Input
                    type="number" step="0.01" min="0.01" placeholder="0.00"
                    value={amount} onChange={(e) => setAmount(e.target.value)}
                    className="pr-20 font-mono" required
                  />
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">
                    {selectedWallet?.currencyCode || '---'}
                  </span>
                </div>
              </div>

              {/* Transaction ID */}
              <div className="space-y-1.5">
                <Label className="text-sm">Transaction / Reference ID</Label>
                <Input
                  placeholder="e.g. TXN-829401847"
                  value={txId} onChange={(e) => setTxId(e.target.value)}
                  required
                />
                <p className="text-xs text-muted-foreground">Enter the reference number from your {selectedMethod?.name} confirmation.</p>
              </div>

              {/* Receipt Upload */}
              <div className="space-y-1.5">
                <Label className="text-sm">Receipt Screenshot</Label>
                <div
                  className="border-2 border-dashed border-border rounded-lg p-4 text-center cursor-pointer hover:border-primary/50 transition-colors"
                  onClick={() => fileRef.current?.click()}
                >
                  {receiptBase64 ? (
                    <div className="space-y-1">
                      <CheckCircle2 className="w-6 h-6 text-emerald-500 mx-auto" />
                      <p className="text-sm font-medium text-emerald-600 dark:text-emerald-400">{receiptName}</p>
                      <p className="text-xs text-muted-foreground">Tap to change</p>
                    </div>
                  ) : (
                    <div className="space-y-1">
                      <Upload className="w-6 h-6 mx-auto text-muted-foreground" />
                      <p className="text-sm font-medium">Upload receipt</p>
                      <p className="text-xs text-muted-foreground">PNG, JPG, or JPEG</p>
                    </div>
                  )}
                </div>
                <input
                  ref={fileRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={handleFileChange}
                />
              </div>
            </CardContent>
          </Card>

          <div className="flex gap-3">
            <Button type="button" variant="outline" className="flex-1" onClick={() => setStep('method')}>
              Back
            </Button>
            <Button
              type="submit" className="flex-1"
              disabled={!selectedWalletId || !amount || !txId || !receiptBase64 || createDeposit.isPending}
            >
              {createDeposit.isPending ? 'Submitting...' : 'Submit Deposit'}
            </Button>
          </div>
        </form>
      )}
    </div>
  );
}
