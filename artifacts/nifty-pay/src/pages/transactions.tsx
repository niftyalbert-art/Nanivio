import { useState } from 'react';
import { useGetTransactions } from '@workspace/api-client-react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Link } from 'wouter';
import { formatDistanceToNow } from 'date-fns';
import { Receipt } from 'lucide-react';

type StatusFilter = 'all' | 'pending' | 'completed' | 'failed';

export default function Transactions() {
  const [filter, setFilter] = useState<StatusFilter>('all');

  const { data: transactions, isLoading } = useGetTransactions(
    filter === 'all' ? {} : { status: filter }
  );

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'completed': return 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20';
      case 'pending':   return 'bg-amber-500/10 text-amber-500 border-amber-500/20';
      case 'failed':    return 'bg-red-500/10 text-red-500 border-red-500/20';
      default:          return '';
    }
  };

  if (isLoading) {
    return (
      <div className="p-4 md:p-8 space-y-6">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-10 w-72" />
        <Skeleton className="h-64 md:h-96" />
      </div>
    );
  }

  return (
    <div className="p-4 md:p-8 space-y-5 md:space-y-8">
      <div>
        <h1 className="text-2xl md:text-4xl font-bold tracking-tight mb-1">Transactions</h1>
        <p className="text-sm text-muted-foreground">View and manage your transfer history</p>
      </div>

      {/* Filter Tabs */}
      <Tabs value={filter} onValueChange={(v) => setFilter(v as StatusFilter)}>
        <TabsList className="w-full md:w-auto">
          <TabsTrigger value="all" className="flex-1 md:flex-none text-xs md:text-sm" data-testid="filter-all">All</TabsTrigger>
          <TabsTrigger value="completed" className="flex-1 md:flex-none text-xs md:text-sm" data-testid="filter-completed">Completed</TabsTrigger>
          <TabsTrigger value="pending" className="flex-1 md:flex-none text-xs md:text-sm" data-testid="filter-pending">Pending</TabsTrigger>
          <TabsTrigger value="failed" className="flex-1 md:flex-none text-xs md:text-sm" data-testid="filter-failed">Failed</TabsTrigger>
        </TabsList>
      </Tabs>

      {/* Transactions List */}
      <Card>
        <CardContent className="p-0">
          {!transactions || transactions.length === 0 ? (
            <div className="p-8 md:p-12 text-center">
              <Receipt className="w-10 h-10 mx-auto mb-3 text-muted-foreground opacity-20" />
              <h3 className="text-base font-semibold mb-2">No transactions found</h3>
              <p className="text-sm text-muted-foreground">
                {filter === 'all' ? 'Start sending money to see your transfers here' : `No ${filter} transactions`}
              </p>
            </div>
          ) : (
            <div className="divide-y divide-border">
              {transactions.map((tx) => (
                <Link
                  key={tx.id}
                  href={`/transactions/${tx.id}`}
                  className="block hover:bg-accent/5 transition-colors"
                  data-testid={`transaction-${tx.id}`}
                >
                  {/* Mobile layout */}
                  <div className="p-3 md:hidden flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-muted flex items-center justify-center text-xl shrink-0">
                      {tx.recipientFlag}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-2 mb-0.5">
                        <p className="font-semibold text-sm truncate">{tx.recipientName}</p>
                        <Badge className={`text-[10px] px-1.5 py-0 shrink-0 ${getStatusColor(tx.status)}`}>
                          {tx.status}
                        </Badge>
                      </div>
                      <p className="text-xs text-muted-foreground truncate">{tx.recipientCountry}</p>
                      <div className="flex items-center justify-between mt-1">
                        <p className="text-xs text-muted-foreground">{formatDistanceToNow(new Date(tx.createdAt), { addSuffix: true })}</p>
                        <p className="font-bold font-mono text-sm">
                          -{tx.fromAmount.toLocaleString('en-US', { minimumFractionDigits: 2 })} {tx.fromCurrency}
                        </p>
                      </div>
                    </div>
                  </div>

                  {/* Desktop layout */}
                  <div className="hidden md:flex p-5 items-center justify-between">
                    <div className="flex items-center gap-4">
                      <div className="w-12 h-12 rounded-full bg-muted flex items-center justify-center text-2xl shrink-0">
                        {tx.recipientFlag}
                      </div>
                      <div>
                        <p className="font-semibold text-base">{tx.recipientName}</p>
                        <p className="text-sm text-muted-foreground">
                          {tx.recipientCountry} · {formatDistanceToNow(new Date(tx.createdAt), { addSuffix: true })}
                        </p>
                        {tx.note && (
                          <p className="text-xs text-muted-foreground mt-0.5 italic">"{tx.note}"</p>
                        )}
                      </div>
                    </div>
                    <div className="text-right flex items-center gap-5">
                      <div>
                        <p className="font-bold font-mono">
                          -{tx.fromAmount.toLocaleString('en-US', { minimumFractionDigits: 2 })} {tx.fromCurrency}
                        </p>
                        <p className="text-sm text-muted-foreground">
                          +{tx.toAmount.toLocaleString('en-US', { minimumFractionDigits: 2 })} {tx.toCurrency}
                        </p>
                      </div>
                      <Badge className={getStatusColor(tx.status)}>{tx.status}</Badge>
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
