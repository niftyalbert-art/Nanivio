import { useState, useRef } from 'react';
import {
  useGetPaymentMethods,
  useGetWallets,
  useCreateDeposit,
  getGetDepositsQueryKey,
} from '@workspace/api-client-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import { CheckCircle2, Copy, Check, Upload, Clock, ArrowLeft, ChevronRight, ChevronDown } from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import { useToast } from '@/hooks/use-toast';
import { Link } from 'wouter';

export default function FundWallet() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const fileRef = useRef<HTMLInputElement>(null);

  const { data: methods, isLoading: methodsLoading } = useGetPaymentMethods();
  const { data: wallets, isLoading: walletsLoading } = useGetWallets();
  const createDeposit = useCreateDeposit();

  const [selectedMethodId, setSelectedMethodId] = useState<number | null>(null);
  const [selectedWalletId, setSelectedWalletId] = useState<string>('');
  const [amount, setAmount] = useState('');
  const [txId, setTxId] = useState('');
  const [receiptBase64, setReceiptBase64] = useState<string>('');
  const [receiptName, setReceiptName] = useState('');
  const [copied, setCopied] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

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

    // Compress before encoding — keeps payload well under the server limit
    const img = new Image();
    const objectUrl = URL.createObjectURL(file);
    img.onload = () => {
      const MAX = 1200;
      const scale = Math.min(1, MAX / Math.max(img.width, img.height));
      const canvas = document.createElement('canvas');
      canvas.width = Math.round(img.width * scale);
      canvas.height = Math.round(img.height * scale);
      canvas.getContext('2d')!.drawImage(img, 0, 0, canvas.width, canvas.height);
      setReceiptBase64(canvas.toDataURL('image/jpeg', 0.75));
      URL.revokeObjectURL(objectUrl);
    };
    img.src = objectUrl;
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedMethodId || !selectedWalletId || !amount || !txId || !receiptBase64) {
      toast({ title: 'Missing fields', description: 'Please complete all fields and upload your receipt.', variant: 'destructive' });
      return;
    }
    createDeposit.mutate(
      { data: { walletId: Number(selectedWalletId), paymentMethodId: selectedMethodId!, amount: Number(amount), externalTransactionId: txId, receiptImage: receiptBase64 } },
      {
        onSuccess: () => { queryClient.invalidateQueries({ queryKey: getGetDepositsQueryKey() }); setSuccess(true); },
        onError: () => toast({ title: 'Submission failed', description: 'Please try again.', variant: 'destructive' }),
      }
    );
  };

  if (methodsLoading || walletsLoading) {
    return <div className="p-4 md:p-8 max-w-2xl mx-auto space-y-4"><Skeleton className="h-8 w-48" /><Skeleton className="h-64" /></div>;
  }

  if (success) {
    return (
      <div className="p-4 md:p-8 max-w-2xl mx-auto flex items-center justify-center min-h-[60vh]">
        <Card className="w-full">
          <CardContent className="pt-10 pb-10 text-center space-y-5">
            <div className="w-20 h-20 mx-auto rounded-full bg-amber-500/10 flex items-center justify-center">
              <Clock className="w-10 h-10 text-amber-500" />
            </div>
            <div className="space-y-2">
              <h2 className="text-2xl font-bold">Pending Review</h2>
              <p className="text-sm text-muted-foreground max-w-xs mx-auto">
                Your deposit is under review. It will be credited to your <span className="font-semibold">{selectedWallet?.currencyCode}</span> wallet once confirmed — usually within 1–3 hours.
              </p>
            </div>
            <Badge className="bg-amber-500/10 text-amber-500 border-amber-500/20 px-4 py-1.5 text-sm">⏳ Pending</Badge>
            <div className="pt-2 space-y-2">
              <Link href="/wallets"><Button className="w-full max-w-xs">View My Wallets</Button></Link>
              <Button variant="outline" className="w-full max-w-xs" onClick={() => { setSuccess(false); setSelectedMethodId(null); setSelectedWalletId(''); setAmount(''); setTxId(''); setReceiptBase64(''); setReceiptName(''); }}>
                Make Another Deposit
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="p-4 md:p-8 max-w-2xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Link href="/wallets">
          <Button variant="ghost" size="sm" className="px-2"><ArrowLeft className="w-4 h-4 mr-1" /> Back</Button>
        </Link>
        <div>
          <h1 className="text-xl md:text-2xl font-bold tracking-tight">Top Up Wallet</h1>
          <p className="text-xs text-muted-foreground">Choose a payment method below and follow the steps</p>
        </div>
      </div>

      {/* Step 1: Choose deposit type */}
      <div className="space-y-2">
        <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Step 1 — Choose Deposit Type</p>
        <div className="space-y-2">
          {methods?.map((method) => {
            const isSelected = selectedMethodId === method.id;
            return (
              <div key={method.id}>
                <button
                  type="button"
                  onClick={() => setSelectedMethodId(isSelected ? null : method.id)}
                  className={`w-full text-left rounded-xl border-2 transition-all p-4 ${isSelected ? 'border-primary bg-primary/5' : 'border-border hover:border-primary/40 bg-card'}`}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <span className="text-2xl">{method.logoEmoji}</span>
                      <div>
                        <p className="font-bold text-sm">
                          {method.type === 'botim' ? 'Botim Deposit' : method.type === 'emoney' ? 'eMoney Deposit' : method.type === 'crypto' ? 'Crypto Deposit' : 'Bank Transfer'}
                        </p>
                        <p className="text-xs text-muted-foreground">{method.name}</p>
                      </div>
                    </div>
                    {isSelected ? <ChevronDown className="w-4 h-4 text-primary" /> : <ChevronRight className="w-4 h-4 text-muted-foreground" />}
                  </div>
                </button>

                {/* Expanded details */}
                {isSelected && (
                  <div className="border-2 border-t-0 border-primary rounded-b-xl bg-primary/5 p-4 space-y-3">
                    <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Payment Details — Copy &amp; Transfer</p>

                    {method.type === 'crypto' ? (
                      <>
                        <div className="flex items-center justify-between gap-2 bg-background/80 border border-border rounded-lg px-3 py-2.5">
                          <div className="min-w-0">
                            <p className="text-xs text-muted-foreground">Network / Coin</p>
                            <p className="font-semibold text-sm">{method.name}</p>
                          </div>
                        </div>
                        <div className="flex items-center justify-between gap-2 bg-background/80 border border-border rounded-lg px-3 py-2.5">
                          <div className="min-w-0 flex-1">
                            <p className="text-xs text-muted-foreground">Wallet Address</p>
                            <p className="font-mono font-bold text-xs break-all mt-0.5">{method.accountNumber}</p>
                          </div>
                          <Button variant="ghost" size="sm" className="shrink-0 h-8 w-8 p-0 ml-2" onClick={() => copyToClipboard(method.accountNumber, `acct-${method.id}`)}>
                            {copied === `acct-${method.id}` ? <Check className="w-3.5 h-3.5 text-emerald-500" /> : <Copy className="w-3.5 h-3.5" />}
                          </Button>
                        </div>
                      </>
                    ) : method.type === 'botim' || method.type === 'emoney' ? (
                      <>
                        <div className="flex items-center justify-between gap-2 bg-background/80 border border-border rounded-lg px-3 py-2.5">
                          <div className="min-w-0">
                            <p className="text-xs text-muted-foreground">Account / Number</p>
                            <p className="font-mono font-bold text-sm">{method.accountNumber}</p>
                          </div>
                          <Button variant="ghost" size="sm" className="shrink-0 h-8 w-8 p-0" onClick={() => copyToClipboard(method.accountNumber, `acct-${method.id}`)}>
                            {copied === `acct-${method.id}` ? <Check className="w-3.5 h-3.5 text-emerald-500" /> : <Copy className="w-3.5 h-3.5" />}
                          </Button>
                        </div>
                        <div className="flex items-center justify-between gap-2 bg-background/80 border border-border rounded-lg px-3 py-2.5">
                          <div className="min-w-0">
                            <p className="text-xs text-muted-foreground">Account Name</p>
                            <p className="font-semibold text-sm">{method.accountName}</p>
                          </div>
                          <Button variant="ghost" size="sm" className="shrink-0 h-8 w-8 p-0" onClick={() => copyToClipboard(method.accountName, `name-${method.id}`)}>
                            {copied === `name-${method.id}` ? <Check className="w-3.5 h-3.5 text-emerald-500" /> : <Copy className="w-3.5 h-3.5" />}
                          </Button>
                        </div>
                      </>
                    ) : (
                      /* Bank Transfer — full labeled details */
                      <>
                        <div className="flex items-center justify-between gap-2 bg-background/80 border border-border rounded-lg px-3 py-2.5">
                          <div className="min-w-0">
                            <p className="text-xs text-muted-foreground">Bank Name</p>
                            <p className="font-semibold text-sm">{method.name}</p>
                          </div>
                          <Button variant="ghost" size="sm" className="shrink-0 h-8 w-8 p-0" onClick={() => copyToClipboard(method.name, `bname-${method.id}`)}>
                            {copied === `bname-${method.id}` ? <Check className="w-3.5 h-3.5 text-emerald-500" /> : <Copy className="w-3.5 h-3.5" />}
                          </Button>
                        </div>
                        <div className="flex items-center justify-between gap-2 bg-background/80 border border-border rounded-lg px-3 py-2.5">
                          <div className="min-w-0">
                            <p className="text-xs text-muted-foreground">Account Holder Name</p>
                            <p className="font-semibold text-sm">{method.accountName}</p>
                          </div>
                          <Button variant="ghost" size="sm" className="shrink-0 h-8 w-8 p-0" onClick={() => copyToClipboard(method.accountName, `name-${method.id}`)}>
                            {copied === `name-${method.id}` ? <Check className="w-3.5 h-3.5 text-emerald-500" /> : <Copy className="w-3.5 h-3.5" />}
                          </Button>
                        </div>
                        <div className="flex items-center justify-between gap-2 bg-background/80 border border-border rounded-lg px-3 py-2.5">
                          <div className="min-w-0">
                            <p className="text-xs text-muted-foreground">IBAN / Account Number</p>
                            <p className="font-mono font-bold text-sm tracking-wide">{method.accountNumber}</p>
                          </div>
                          <Button variant="ghost" size="sm" className="shrink-0 h-8 w-8 p-0" onClick={() => copyToClipboard(method.accountNumber, `acct-${method.id}`)}>
                            {copied === `acct-${method.id}` ? <Check className="w-3.5 h-3.5 text-emerald-500" /> : <Copy className="w-3.5 h-3.5" />}
                          </Button>
                        </div>
                      </>
                    )}

                    <p className="text-xs text-muted-foreground leading-relaxed bg-amber-500/10 border border-amber-500/20 rounded-lg p-2.5">
                      📋 {method.instructions}
                    </p>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Step 2: Confirm details */}
      {selectedMethodId && (
        <form onSubmit={handleSubmit} className="space-y-4">
          <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Step 2 — Confirm Your Transfer</p>

          <Card>
            <CardContent className="p-4 space-y-4">
              {/* Wallet */}
              <div className="space-y-1.5">
                <Label className="text-sm">Credit to Wallet</Label>
                <Select value={selectedWalletId} onValueChange={setSelectedWalletId} required>
                  <SelectTrigger><SelectValue placeholder="Which wallet should we credit?" /></SelectTrigger>
                  <SelectContent>
                    {wallets?.map((w) => (
                      <SelectItem key={w.id} value={String(w.id)}>{w.flag} {w.currencyName} ({w.currencyCode})</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Amount */}
              <div className="space-y-1.5">
                <Label className="text-sm">Amount You Sent</Label>
                <div className="relative">
                  <Input type="number" step="0.01" min="0.01" placeholder="0.00" value={amount} onChange={e => setAmount(e.target.value)} className="pr-20 font-mono" required />
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">{selectedWallet?.currencyCode || '---'}</span>
                </div>
              </div>

              {/* Transaction ID */}
              <div className="space-y-1.5">
                <Label className="text-sm">Transaction / Reference ID</Label>
                <Input placeholder="e.g. TXN-829401847" value={txId} onChange={e => setTxId(e.target.value)} className="font-mono" required />
                <p className="text-xs text-muted-foreground">The reference number from your {selectedMethod?.name} confirmation screen.</p>
              </div>

              {/* Receipt Upload */}
              <div className="space-y-1.5">
                <Label className="text-sm">Upload Receipt Screenshot</Label>
                <div
                  className="border-2 border-dashed border-border rounded-xl p-5 text-center cursor-pointer hover:border-primary/50 transition-colors"
                  onClick={() => fileRef.current?.click()}
                >
                  {receiptBase64 ? (
                    <div className="space-y-1">
                      <CheckCircle2 className="w-7 h-7 text-emerald-500 mx-auto" />
                      <p className="text-sm font-medium text-emerald-600 dark:text-emerald-400">{receiptName}</p>
                      <p className="text-xs text-muted-foreground">Tap to change</p>
                    </div>
                  ) : (
                    <div className="space-y-1.5">
                      <Upload className="w-7 h-7 mx-auto text-muted-foreground" />
                      <p className="text-sm font-semibold">Tap to upload receipt</p>
                      <p className="text-xs text-muted-foreground">PNG, JPG — screenshot of your payment confirmation</p>
                    </div>
                  )}
                </div>
                <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handleFileChange} />
              </div>
            </CardContent>
          </Card>

          <Button
            type="submit"
            size="lg"
            className="w-full font-bold text-base"
            disabled={!selectedWalletId || !amount || !txId || !receiptBase64 || createDeposit.isPending}
          >
            {createDeposit.isPending ? 'Submitting...' : 'Confirm Deposit'}
          </Button>
          <p className="text-xs text-center text-muted-foreground">Your deposit will show as <span className="text-amber-500 font-medium">Pending</span> until our team verifies it.</p>
        </form>
      )}
    </div>
  );
}
