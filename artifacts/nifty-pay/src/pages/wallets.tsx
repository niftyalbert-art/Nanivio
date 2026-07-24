import { useGetWallets } from '@workspace/api-client-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { ArrowUpRight, ArrowDownLeft, Plus } from 'lucide-react';
import { Link } from 'wouter';

export default function Wallets() {
  const { data: wallets, isLoading } = useGetWallets();

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
            Top Up
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
                <Link href="/deposit">
                  <Button variant="outline" size="sm" className="w-full gap-1.5 text-xs md:text-sm" data-testid={`button-add-money-${wallet.id}`}>
                    <Plus className="w-3.5 h-3.5" />
                    Top Up
                  </Button>
                </Link>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
