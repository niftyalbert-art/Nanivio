import { useGetDashboardSummary, useGetWallets, useGetUserProfile } from '@workspace/api-client-react';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ArrowUpRight, ArrowDownLeft, Plus, ChevronRight } from 'lucide-react';
import { Link } from 'wouter';
import { formatDistanceToNow } from 'date-fns';

export default function Dashboard() {
  const { data: summary, isLoading: summaryLoading } = useGetDashboardSummary();
  const { data: wallets, isLoading: walletsLoading } = useGetWallets();
  const { data: profile } = useGetUserProfile();

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'completed': return 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20';
      case 'pending':   return 'bg-amber-500/10 text-amber-500 border-amber-500/20';
      case 'failed':    return 'bg-red-500/10 text-red-500 border-red-500/20';
      default:          return '';
    }
  };

  if (summaryLoading || walletsLoading) {
    return (
      <div className="p-4 md:p-8 space-y-5">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-40" />
        <div className="grid grid-cols-2 gap-3"><Skeleton className="h-14" /><Skeleton className="h-14" /></div>
        <Skeleton className="h-52" />
      </div>
    );
  }

  if (!summary) return null;

  const firstName = profile?.name?.split(' ')[0] ?? 'there';

  return (
    <div className="p-4 md:p-8 space-y-5 md:space-y-6">
      {/* Welcome */}
      <div>
        <p className="text-sm text-muted-foreground">Welcome back,</p>
        <h1 className="text-2xl md:text-3xl font-bold tracking-tight">{firstName} 👋</h1>
      </div>

      {/* Balance Hero */}
      <Card className="wallet-card-glow bg-gradient-to-br from-primary/20 via-primary/10 to-transparent border-primary/20">
        <CardContent className="p-5 md:p-6">
          <p className="text-xs md:text-sm text-muted-foreground mb-1">Total Balance (USD equiv.)</p>
          <p className="text-3xl md:text-4xl font-bold tracking-tight font-mono mb-3">
            ${summary.totalBalanceUsd.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </p>
          <div className="flex items-center gap-3 text-xs text-muted-foreground">
            <span>🏦 {summary.totalWallets} wallets</span>
            <span>·</span>
            <span>✅ {summary.completedTransfers} transfers</span>
          </div>
        </CardContent>
      </Card>

      {/* Quick Actions */}
      <div className="grid grid-cols-3 gap-2 md:gap-3">
        <Link href="/send">
          <Button className="w-full h-14 flex-col gap-1 text-xs" data-testid="button-send-money">
            <ArrowUpRight className="w-4 h-4" />
            Send
          </Button>
        </Link>
        <Link href="/deposit">
          <Button variant="secondary" className="w-full h-14 flex-col gap-1 text-xs" data-testid="button-deposit">
            <Plus className="w-4 h-4" />
            Deposit
          </Button>
        </Link>
        <Link href="/withdraw">
          <Button variant="outline" className="w-full h-14 flex-col gap-1 text-xs" data-testid="button-withdraw">
            <ArrowDownLeft className="w-4 h-4" />
            Withdraw
          </Button>
        </Link>
      </div>

      {/* My Wallets (compact) */}
      {wallets && wallets.length > 0 && (
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-semibold">My Wallets</h2>
            <Link href="/wallets">
              <Button variant="ghost" size="sm" className="text-xs h-7 px-2 gap-1">
                View all <ChevronRight className="w-3 h-3" />
              </Button>
            </Link>
          </div>
          <div className="space-y-2">
            {wallets.slice(0, 3).map((wallet) => (
              <Link href="/wallets" key={wallet.id}>
                <Card className="cursor-pointer hover:border-primary/40 transition-colors">
                  <CardContent className="p-3 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="text-xl">{wallet.flag}</span>
                      <div>
                        <p className="text-sm font-medium">{wallet.currencyName}</p>
                        <p className="text-xs text-muted-foreground">{wallet.currencyCode}</p>
                      </div>
                    </div>
                    <p className="font-bold font-mono text-sm">
                      {wallet.balance.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </p>
                  </CardContent>
                </Card>
              </Link>
            ))}
          </div>
        </div>
      )}

      {/* Recent Activity */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-semibold">Recent Activity</h2>
          <Link href="/transactions">
            <Button variant="ghost" size="sm" className="text-xs h-7 px-2 gap-1">
              View all <ChevronRight className="w-3 h-3" />
            </Button>
          </Link>
        </div>
        <Card>
          <CardContent className="p-0">
            {summary.recentTransactions.length === 0 ? (
              <div className="p-6 text-center">
                <p className="text-sm text-muted-foreground">No activity yet. Start sending money!</p>
                <Link href="/send"><Button size="sm" className="mt-3">Send Money</Button></Link>
              </div>
            ) : (
              <div className="divide-y divide-border">
                {summary.recentTransactions.slice(0, 4).map((tx) => (
                  <Link
                    key={tx.id}
                    href={`/transactions/${tx.id}`}
                    className="block hover:bg-accent/5 transition-colors"
                  >
                    <div className="p-3 flex items-center gap-3">
                      <div className="w-9 h-9 rounded-full bg-muted flex items-center justify-center text-lg shrink-0">
                        {tx.recipientFlag}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-sm truncate">{tx.recipientName}</p>
                        <p className="text-xs text-muted-foreground">{formatDistanceToNow(new Date(tx.createdAt), { addSuffix: true })}</p>
                      </div>
                      <div className="text-right shrink-0">
                        <p className="font-mono text-sm font-semibold">
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
