import { useGetDashboardSummary, useGetWallets } from '@workspace/api-client-react';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ArrowUpRight, ArrowDownLeft, TrendingUp } from 'lucide-react';
import { Link } from 'wouter';
import { formatDistanceToNow } from 'date-fns';

export default function Dashboard() {
  const { data: summary, isLoading: summaryLoading } = useGetDashboardSummary();
  const { data: wallets, isLoading: walletsLoading } = useGetWallets();

  if (summaryLoading || walletsLoading) {
    return (
      <div className="p-4 md:p-8 space-y-6">
        <div className="space-y-2">
          <Skeleton className="h-7 w-40" />
          <Skeleton className="h-4 w-56" />
        </div>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 md:gap-6">
          {[...Array(4)].map((_, i) => <Skeleton key={i} className="h-28 md:h-32" />)}
        </div>
        <Skeleton className="h-64 md:h-96" />
      </div>
    );
  }

  if (!summary || !wallets) return null;

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'completed': return 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20';
      case 'pending':   return 'bg-amber-500/10 text-amber-500 border-amber-500/20';
      case 'failed':    return 'bg-red-500/10 text-red-500 border-red-500/20';
      default:          return '';
    }
  };

  return (
    <div className="p-4 md:p-8 space-y-6 md:space-y-8">
      {/* Header */}
      <div className="space-y-1">
        <h1 className="text-2xl md:text-4xl font-bold tracking-tight">Good evening</h1>
        <p className="text-sm text-muted-foreground">Manage your global finances in one place</p>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 md:gap-6">
        <Card className="wallet-card-glow">
          <CardHeader className="pb-2 md:pb-3 p-3 md:p-6">
            <CardTitle className="text-xs md:text-sm font-medium text-muted-foreground">Total Balance</CardTitle>
          </CardHeader>
          <CardContent className="p-3 md:p-6 pt-0">
            <p className="text-xl md:text-3xl font-bold tracking-tight font-mono" data-testid="text-total-balance">
              ${summary.totalBalanceUsd.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </p>
            <p className="text-xs text-muted-foreground mt-1 md:mt-2">USD Equivalent</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2 md:pb-3 p-3 md:p-6">
            <CardTitle className="text-xs md:text-sm font-medium text-muted-foreground">Active Wallets</CardTitle>
          </CardHeader>
          <CardContent className="p-3 md:p-6 pt-0">
            <p className="text-xl md:text-3xl font-bold tracking-tight">{summary.totalWallets}</p>
            <p className="text-xs text-muted-foreground mt-1 md:mt-2">Across {summary.totalWallets} currencies</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2 md:pb-3 p-3 md:p-6">
            <CardTitle className="text-xs md:text-sm font-medium text-muted-foreground">Completed</CardTitle>
          </CardHeader>
          <CardContent className="p-3 md:p-6 pt-0">
            <p className="text-xl md:text-3xl font-bold tracking-tight">{summary.completedTransfers}</p>
            <p className="text-xs text-muted-foreground mt-1 md:mt-2">All time</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2 md:pb-3 p-3 md:p-6">
            <CardTitle className="text-xs md:text-sm font-medium text-muted-foreground">Total Volume</CardTitle>
          </CardHeader>
          <CardContent className="p-3 md:p-6 pt-0">
            <p className="text-xl md:text-3xl font-bold tracking-tight font-mono">
              ${summary.totalVolume.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </p>
            <p className="text-xs text-muted-foreground mt-1 md:mt-2">Transferred</p>
          </CardContent>
        </Card>
      </div>

      {/* Wallets */}
      <div className="space-y-3 md:space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg md:text-2xl font-bold tracking-tight">Your Wallets</h2>
          <Link href="/wallets">
            <Button variant="ghost" size="sm" data-testid="button-view-all-wallets" className="text-xs md:text-sm">View all</Button>
          </Link>
        </div>

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 md:gap-6">
          {wallets.slice(0, 4).map((wallet) => (
            <Card key={wallet.id} className="relative overflow-hidden">
              <div className="absolute top-0 right-0 w-24 h-24 bg-gradient-to-br from-primary/10 to-transparent rounded-full blur-2xl -mr-12 -mt-12" />
              <CardHeader className="pb-2 p-3 md:p-6">
                <div className="flex items-center justify-between">
                  <span className="text-2xl md:text-3xl">{wallet.flag}</span>
                  {wallet.isCrypto && (
                    <Badge variant="outline" className="text-[10px] md:text-xs px-1 py-0">Crypto</Badge>
                  )}
                </div>
              </CardHeader>
              <CardContent className="p-3 md:p-6 pt-0 space-y-0.5">
                <p className="text-[10px] md:text-xs text-muted-foreground">{wallet.currencyName}</p>
                <p className="text-sm md:text-xl font-bold tracking-tight font-mono leading-tight">
                  {wallet.isCrypto ? wallet.cryptoSymbol : wallet.currencyCode}
                </p>
                <p className="text-base md:text-xl font-bold font-mono">
                  {wallet.balance.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </p>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>

      {/* Quick Actions */}
      <div className="grid grid-cols-2 gap-3 md:gap-4">
        <Link href="/send">
          <Button size="lg" className="w-full h-14 md:h-20 text-sm md:text-base" data-testid="button-send-money">
            <ArrowUpRight className="w-4 h-4 mr-2" />
            Send Money
          </Button>
        </Link>
        <Link href="/wallets">
          <Button size="lg" variant="secondary" className="w-full h-14 md:h-20 text-sm md:text-base" data-testid="button-add-money">
            <ArrowDownLeft className="w-4 h-4 mr-2" />
            Add Money
          </Button>
        </Link>
      </div>

      {/* Recent Transactions */}
      <div className="space-y-3 md:space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg md:text-2xl font-bold tracking-tight">Recent Transactions</h2>
          <Link href="/transactions">
            <Button variant="ghost" size="sm" data-testid="button-view-all-transactions" className="text-xs md:text-sm">View all</Button>
          </Link>
        </div>

        <Card>
          <CardContent className="p-0">
            {summary.recentTransactions.length === 0 ? (
              <div className="p-8 md:p-12 text-center">
                <TrendingUp className="w-10 h-10 mx-auto mb-3 text-muted-foreground opacity-20" />
                <h3 className="text-base font-semibold mb-2">No transactions yet</h3>
                <p className="text-sm text-muted-foreground mb-4">Start sending money globally</p>
                <Link href="/send"><Button size="sm">Send Money Now</Button></Link>
              </div>
            ) : (
              <div className="divide-y divide-border">
                {summary.recentTransactions.map((tx) => (
                  <Link
                    key={tx.id}
                    href={`/transactions/${tx.id}`}
                    className="block hover:bg-accent/5 transition-colors"
                    data-testid={`transaction-${tx.id}`}
                  >
                    <div className="p-3 md:p-4 flex items-center gap-3">
                      <div className="w-9 h-9 md:w-10 md:h-10 rounded-full bg-muted flex items-center justify-center text-lg md:text-xl shrink-0">
                        {tx.recipientFlag}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-semibold text-sm truncate">{tx.recipientName}</p>
                        <p className="text-xs text-muted-foreground truncate">
                          {tx.fromCurrency} → {tx.toCurrency} · {formatDistanceToNow(new Date(tx.createdAt), { addSuffix: true })}
                        </p>
                      </div>
                      <div className="text-right shrink-0">
                        <p className="font-semibold font-mono text-sm">
                          -{tx.fromAmount.toLocaleString('en-US', { minimumFractionDigits: 2 })} {tx.fromCurrency}
                        </p>
                        <Badge className={`text-[10px] px-1.5 py-0 ${getStatusColor(tx.status)}`}>
                          {tx.status}
                        </Badge>
                      </div>
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
