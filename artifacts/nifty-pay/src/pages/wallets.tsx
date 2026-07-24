import { useState } from 'react';
import { useGetWallets, useTopUpWallet, getGetWalletsQueryKey, getGetDashboardSummaryQueryKey } from '@workspace/api-client-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Plus } from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import { useToast } from '@/hooks/use-toast';

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
          toast({
            title: 'Money added successfully',
            description: `${topUpAmount} ${selectedWallet?.currencyCode} added to your wallet`,
          });
          setDialogOpen(false);
          setTopUpAmount('');
          setSelectedWalletId(null);
        },
        onError: () => {
          toast({
            title: 'Failed to add money',
            description: 'Something went wrong. Please try again.',
            variant: 'destructive',
          });
        },
      }
    );
  };

  if (isLoading) {
    return (
      <div className="p-4 md:p-8 space-y-6">
        <Skeleton className="h-8 w-40" />
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 md:gap-6">
          {[...Array(4)].map((_, i) => <Skeleton key={i} className="h-44 md:h-48" />)}
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 md:p-8 space-y-5 md:space-y-8">
      <div>
        <h1 className="text-2xl md:text-4xl font-bold tracking-tight mb-1">Wallets</h1>
        <p className="text-sm text-muted-foreground">Manage your multi-currency wallets</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 md:gap-6">
        {wallets?.map((wallet) => (
          <Card key={wallet.id} className="relative overflow-hidden wallet-card-glow" data-testid={`wallet-${wallet.id}`}>
            <div className="absolute top-0 right-0 w-32 h-32 bg-gradient-to-br from-primary/10 to-transparent rounded-full blur-3xl -mr-16 -mt-16" />
            <CardHeader className="relative p-4 md:p-6">
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-2 md:gap-3">
                  <span className="text-4xl md:text-5xl">{wallet.flag}</span>
                  <div>
                    <CardTitle className="text-base md:text-xl">{wallet.currencyName}</CardTitle>
                    <p className="text-xs md:text-sm text-muted-foreground">{wallet.currencyCode}</p>
                  </div>
                </div>
                {wallet.isCrypto && (
                  <Badge variant="outline" className="bg-primary/10 text-primary border-primary/20 text-xs">
                    Crypto
                  </Badge>
                )}
              </div>
            </CardHeader>
            <CardContent className="relative p-4 md:p-6 pt-0 space-y-3 md:space-y-4">
              <div>
                <p className="text-xs md:text-sm text-muted-foreground mb-0.5">Balance</p>
                <p className="text-2xl md:text-3xl font-bold tracking-tight font-mono" data-testid={`text-balance-${wallet.id}`}>
                  {wallet.isCrypto ? wallet.cryptoSymbol : wallet.currencyCode}{' '}
                  {wallet.balance.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </p>
              </div>
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
                    className="w-full"
                    onClick={() => setSelectedWalletId(wallet.id)}
                    data-testid={`button-add-money-${wallet.id}`}
                  >
                    <Plus className="w-4 h-4 mr-2" />
                    Add Money
                  </Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Add Money to {wallet.currencyName}</DialogTitle>
                    <DialogDescription>Add funds to your {wallet.currencyCode} wallet</DialogDescription>
                  </DialogHeader>
                  <form onSubmit={handleTopUp} className="space-y-4">
                    <div className="space-y-2">
                      <Label htmlFor="amount">Amount</Label>
                      <div className="relative">
                        <Input
                          id="amount"
                          type="number"
                          step="0.01"
                          min="0.01"
                          placeholder="0.00"
                          value={topUpAmount}
                          onChange={(e) => setTopUpAmount(e.target.value)}
                          className="pr-16 font-mono text-lg"
                          required
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
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
