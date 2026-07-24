import { useState } from 'react';
import { useGetWallets, useTopUpWallet, getGetWalletsQueryKey, getGetDashboardSummaryQueryKey } from '@workspace/api-client-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ArrowUpRight, ArrowDownLeft, Plus } from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import { useToast } from '@/hooks/use-toast';
import { Link } from 'wouter';

export default function Wallets() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { data: wallets, isLoading } = useGetWallets();
  const topUpWallet = useTopUpWallet();

  const [dialogOpen, setDialogOpen] = useState(false);
  const [selectedWalletId, setSelectedWalletId] = useState<number | null>(null);
  const [topUpAmount, setTopUpAmount] = useState('');

  const selectedWallet = wallets?.find(w => w.id === selectedWalletId);

  const handleTopUp = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedWalletId) return;
    topUpWallet.mutate(
      { id: selectedWalletId, data: { amount: Number(topUpAmount) } },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getGetWalletsQueryKey() });
          queryClient.invalidateQueries({ queryKey: getGetDashboardSummaryQueryKey() });
          toast({ title: 'Money added', description: `${topUpAmount} ${selectedWallet?.currencyCode} added to your wallet` });
          setDialogOpen(false);
          setTopUpAmount('');
          setSelectedWalletId(null);
        },
        onError: () => {
          toast({ title: 'Failed', description: 'Something went wrong.', variant: 'destructive' });
        },
      }
    );
  };

  if (isLoading) {
    return (
      <div className="p-4 md:p-8 space-y-4">
        <Skeleton className="h-8 w-40" />
        <div className="space-y-3">{[...Array(4)].map((_, i) => <Skeleton key={i} className="h-36" />)}</div>
      </div>
    );
  }

  return (
    <div className="p-4 md:p-8 space-y-4 md:space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold tracking-tight">My Wallets</h1>
          <p className="text-sm text-muted-foreground mt-0.5">Tap a wallet to manage funds</p>
        </div>
        <Link href="/deposit">
          <Button size="sm" className="gap-1.5">
            <Plus className="w-3.5 h-3.5" />
            Deposit
          </Button>
        </Link>
      </div>

      <div className="space-y-3">
        {wallets?.map((wallet) => (
          <Card key={wallet.id} className="relative overflow-hidden" data-testid={`wallet-${wallet.id}`}>
            <div className="absolute top-0 right-0 w-28 h-28 bg-gradient-to-br from-primary/10 to-transparent rounded-full blur-2xl -mr-12 -mt-12 pointer-events-none" />
            <CardContent className="p-4 md:p-5">
              {/* Top row: flag + name + crypto badge */}
              <div className="flex items-start justify-between mb-4">
                <div className="flex items-center gap-3">
                  <span className="text-3xl md:text-4xl">{wallet.flag}</span>
                  <div>
                    <p className="font-bold text-base md:text-lg">{wallet.currencyName}</p>
                    <p className="text-xs text-muted-foreground">{wallet.currencyCode}</p>
                  </div>
                </div>
                {wallet.isCrypto && (
                  <Badge variant="outline" className="bg-primary/10 text-primary border-primary/20 text-xs">
                    Crypto
                  </Badge>
                )}
              </div>

              {/* Balance */}
              <div className="mb-4">
                <p className="text-xs text-muted-foreground mb-0.5">Available Balance</p>
                <p className="text-2xl md:text-3xl font-bold tracking-tight font-mono" data-testid={`text-balance-${wallet.id}`}>
                  {wallet.isCrypto ? wallet.cryptoSymbol : wallet.currencyCode}{' '}
                  {wallet.balance.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </p>
              </div>

              {/* Action buttons */}
              <div className="grid grid-cols-3 gap-2">
                <Link href="/send">
                  <Button variant="default" size="sm" className="w-full gap-1.5 text-xs md:text-sm" data-testid={`button-send-${wallet.id}`}>
                    <ArrowUpRight className="w-3.5 h-3.5" />
                    Send
                  </Button>
                </Link>
                <Link href="/deposit">
                  <Button variant="secondary" size="sm" className="w-full gap-1.5 text-xs md:text-sm">
                    <ArrowDownLeft className="w-3.5 h-3.5" />
                    Receive
                  </Button>
                </Link>
                <Dialog
                  open={dialogOpen && selectedWalletId === wallet.id}
                  onOpenChange={(open) => {
                    setDialogOpen(open);
                    if (open) setSelectedWalletId(wallet.id);
                    else setSelectedWalletId(null);
                  }}
                >
                  <DialogTrigger asChild>
                    <Button
                      variant="outline"
                      size="sm"
                      className="w-full gap-1.5 text-xs md:text-sm"
                      onClick={() => setSelectedWalletId(wallet.id)}
                      data-testid={`button-add-money-${wallet.id}`}
                    >
                      <Plus className="w-3.5 h-3.5" />
                      Top Up
                    </Button>
                  </DialogTrigger>
                  <DialogContent>
                    <DialogHeader>
                      <DialogTitle>Top Up {wallet.currencyName}</DialogTitle>
                      <DialogDescription>Add funds directly to your {wallet.currencyCode} wallet</DialogDescription>
                    </DialogHeader>
                    <form onSubmit={handleTopUp} className="space-y-4">
                      <div className="space-y-1.5">
                        <Label>Amount</Label>
                        <div className="relative">
                          <Input
                            type="number" step="0.01" min="0.01" placeholder="0.00"
                            value={topUpAmount} onChange={(e) => setTopUpAmount(e.target.value)}
                            className="pr-16 font-mono text-lg" required
                            data-testid="input-topup-amount"
                          />
                          <span className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground font-mono text-sm">
                            {wallet.currencyCode}
                          </span>
                        </div>
                      </div>
                      <Button type="submit" className="w-full" disabled={topUpWallet.isPending} data-testid="button-confirm-topup">
                        {topUpWallet.isPending ? 'Processing...' : 'Add Money'}
                      </Button>
                    </form>
                  </DialogContent>
                </Dialog>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
