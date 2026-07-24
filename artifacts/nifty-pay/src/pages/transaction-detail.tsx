import { useParams, Link } from 'wouter';
import { useGetTransaction } from '@workspace/api-client-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { ArrowLeft, Download } from 'lucide-react';
import { format } from 'date-fns';

export default function TransactionDetail() {
  const params = useParams();
  const transactionId = Number(params.id);
  const { data: transaction, isLoading } = useGetTransaction(transactionId);

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
      <div className="p-4 md:p-8 max-w-2xl mx-auto space-y-6">
        <Skeleton className="h-8 w-40" />
        <Skeleton className="h-64 md:h-96" />
      </div>
    );
  }

  if (!transaction) {
    return (
      <div className="p-4 md:p-8 max-w-2xl mx-auto">
        <Card>
          <CardContent className="p-8 md:p-12 text-center">
            <h3 className="text-base font-semibold mb-2">Transaction not found</h3>
            <p className="text-sm text-muted-foreground mb-4">The transaction you're looking for doesn't exist</p>
            <Link href="/transactions"><Button size="sm">Back to Transactions</Button></Link>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="p-4 md:p-8 max-w-2xl mx-auto space-y-5 md:space-y-8">
      <div className="flex items-center justify-between">
        <Link href="/transactions">
          <Button variant="ghost" size="sm" data-testid="button-back" className="text-xs md:text-sm px-2 md:px-3">
            <ArrowLeft className="w-4 h-4 mr-1.5" />
            Back
          </Button>
        </Link>
        <Button variant="outline" size="sm" data-testid="button-download" className="text-xs md:text-sm px-2 md:px-3">
          <Download className="w-3.5 h-3.5 mr-1.5" />
          Receipt
        </Button>
      </div>

      <Card>
        <CardHeader className="p-4 md:p-6 border-b border-border">
          <div className="flex items-start justify-between gap-3">
            <div>
              <CardTitle className="text-lg md:text-2xl">Transaction Details</CardTitle>
              <p className="text-xs md:text-sm text-muted-foreground mt-0.5">ID: #{transaction.id}</p>
            </div>
            <Badge className={getStatusColor(transaction.status)} data-testid="text-status">
              {transaction.status}
            </Badge>
          </div>
        </CardHeader>

        <CardContent className="p-4 md:p-8 space-y-5 md:space-y-8">
          {/* Amount Section */}
          <div className="space-y-2 md:space-y-4">
            <div className="text-center py-4 md:py-6 bg-muted/50 rounded-lg">
              <p className="text-xs md:text-sm text-muted-foreground mb-1">You sent</p>
              <p className="text-2xl md:text-4xl font-bold font-mono" data-testid="text-amount-sent">
                {transaction.fromAmount.toLocaleString('en-US', { minimumFractionDigits: 2 })} {transaction.fromCurrency}
              </p>
            </div>
            <div className="text-center py-4 md:py-6 bg-primary/5 rounded-lg">
              <p className="text-xs md:text-sm text-muted-foreground mb-1">Recipient received</p>
              <p className="text-2xl md:text-4xl font-bold font-mono text-primary" data-testid="text-amount-received">
                {transaction.toAmount.toLocaleString('en-US', { minimumFractionDigits: 2 })} {transaction.toCurrency}
              </p>
            </div>
          </div>

          {/* Details */}
          <div className="space-y-0 pt-2 border-t border-border">
            {[
              { label: 'Recipient', value: transaction.recipientName },
              { label: 'Country', value: `${transaction.recipientFlag} ${transaction.recipientCountry}` },
              { label: 'Exchange Rate', value: `1 ${transaction.fromCurrency} = ${transaction.exchangeRate.toFixed(4)} ${transaction.toCurrency}`, mono: true },
              { label: 'Transfer Fee', value: `${transaction.fee.toFixed(2)} ${transaction.fromCurrency}`, mono: true },
              { label: 'Date & Time', value: format(new Date(transaction.createdAt), 'PPp') },
              ...(transaction.note ? [{ label: 'Note', value: transaction.note }] : []),
            ].map(({ label, value, mono }) => (
              <div key={label} className="flex justify-between items-start gap-4 py-2.5 md:py-3 border-b border-border last:border-0">
                <span className="text-xs md:text-sm text-muted-foreground shrink-0">{label}</span>
                <span className={`text-xs md:text-sm font-semibold text-right break-words max-w-[60%] ${mono ? 'font-mono' : ''}`}>
                  {value}
                </span>
              </div>
            ))}
          </div>

          {/* Status Message */}
          {transaction.status === 'pending' && (
            <div className="p-3 md:p-4 bg-amber-500/10 border border-amber-500/20 rounded-lg">
              <p className="text-xs md:text-sm text-amber-600 dark:text-amber-400">
                Your transfer is being processed. This usually takes a few minutes.
              </p>
            </div>
          )}
          {transaction.status === 'completed' && (
            <div className="p-3 md:p-4 bg-emerald-500/10 border border-emerald-500/20 rounded-lg">
              <p className="text-xs md:text-sm text-emerald-600 dark:text-emerald-400">
                Transfer completed successfully. The recipient has received the funds.
              </p>
            </div>
          )}
          {transaction.status === 'failed' && (
            <div className="p-3 md:p-4 bg-red-500/10 border border-red-500/20 rounded-lg">
              <p className="text-xs md:text-sm text-red-600 dark:text-red-400">
                This transfer failed. Please contact support for assistance.
              </p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
