import { useGetWallets, useGetDashboardSummary } from '@workspace/api-client-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { ArrowUpRight, ArrowDownLeft, Plus } from 'lucide-react';
import { Link } from 'wouter';

export default function Wallets() {
  const { data: wallets, isLoading } = useGetWallets();
  const { data: summary } = useGetDashboardSummary();

  if (isLoading) {
    return (
      <div className="p-4 md:p-8 space-y-4">
        <Skeleton className="h-8 w-40" />
        <Skeleton className="h-52" />
        <Skeleton className="h-40" />
      </div>
    );
  }

  const totalUsd = summary?.totalBalanceUsd ?? 0;

  return (
    <div className="p-4 md:p-8 space-y-4 md:space-y-6 max-w-2xl mx-auto">
      <div>
        <h1 className="text-2xl md:text-3xl font-bold tracking-tight">My Wallet</h1>
        <p className="text-sm text-muted-foreground mt-0.5">Your total available balance</p>
      </div>

      {/* Single unified balance card */}
      <Card className="relative overflow-hidden bg-gradient-to-br from-primary/20 via-primary/10 to-transparent border-primary/20">
        <div className="absolute top-0 right-0 w-40 h-40 bg-primary/10 rounded-full blur-3xl -mr-16 -mt-16 pointer-events-none" />
        <CardContent className="p-5 md:p-6">
          <p className="text-xs md:text-sm text-muted-foreground mb-1">Available Balance</p>
          <p className="text-4xl md:text-5xl font-bold tracking-tight font-mono mb-1">
            ${totalUsd.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </p>
          <p className="text-xs text-muted-foreground mb-5">USD equivalent · {wallets?.length ?? 0} currencies</p>

          {/* Action buttons */}
          <div className="grid grid-cols-3 gap-2">
            <Link href="/send">
              <Button className="w-full h-11 flex-col gap-1 text-xs" data-testid="button-send">
                <ArrowUpRight className="w-4 h-4" />
                Send
              </Button>
            </Link>
            <Link href="/deposit">
              <Button variant="secondary" className="w-full h-11 flex-col gap-1 text-xs">
                <ArrowDownLeft className="w-4 h-4" />
                Receive
              </Button>
            </Link>
            <Link href="/deposit">
              <Button variant="outline" className="w-full h-11 flex-col gap-1 text-xs border-primary/30 hover:bg-primary/10">
                <Plus className="w-4 h-4" />
                Top Up
              </Button>
            </Link>
          </div>
        </CardContent>
      </Card>

      {/* Currency breakdown — compact list inside one card */}
      <Card>
        <CardContent className="p-0">
          <div className="px-4 py-3 border-b border-border">
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Currency Breakdown</p>
          </div>
          <div className="divide-y divide-border">
            {wallets?.map((wallet) => (
              <div key={wallet.id} className="flex items-center gap-3 px-4 py-3">
                <span className="text-2xl shrink-0">{wallet.flag}</span>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold">{wallet.currencyName}</p>
                  <p className="text-xs text-muted-foreground">{wallet.currencyCode}</p>
                </div>
                {wallet.isCrypto && (
                  <Badge variant="outline" className="bg-primary/10 text-primary border-primary/20 text-[10px] px-1.5 py-0 mr-1">
                    Crypto
                  </Badge>
                )}
                <p className="font-bold font-mono text-sm shrink-0">
                  {wallet.isCrypto ? wallet.cryptoSymbol : wallet.currencyCode}{' '}
                  {wallet.balance.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </p>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
