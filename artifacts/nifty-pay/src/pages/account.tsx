import { useState } from 'react';
import {
  useGetUserProfile,
  useGetPaymentMethods,
  useGetDeposits,
  useGetWithdrawals,
} from '@workspace/api-client-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Copy, Check, User, Clock, ArrowDownLeft, ArrowUpLeft } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';

export default function Account() {
  const { data: profile, isLoading: profileLoading } = useGetUserProfile();
  const { data: methods, isLoading: methodsLoading } = useGetPaymentMethods();
  const { data: deposits, isLoading: depositsLoading } = useGetDeposits();
  const { data: withdrawals, isLoading: withdrawalsLoading } = useGetWithdrawals();
  const [copied, setCopied] = useState<string | null>(null);

  const copy = (text: string, key: string) => {
    navigator.clipboard.writeText(text);
    setCopied(key);
    setTimeout(() => setCopied(null), 2000);
  };

  const statusColor = (s: string) => {
    switch (s) {
      case 'approved': return 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20';
      case 'pending':  return 'bg-amber-500/10 text-amber-500 border-amber-500/20';
      case 'rejected': return 'bg-red-500/10 text-red-500 border-red-500/20';
      default: return '';
    }
  };

  return (
    <div className="p-4 md:p-8 space-y-5 md:space-y-6 max-w-2xl mx-auto">
      {/* Profile */}
      <div>
        <h1 className="text-2xl md:text-3xl font-bold tracking-tight">Account</h1>
        <p className="text-sm text-muted-foreground mt-0.5">Manage your profile and payment details</p>
      </div>

      {profileLoading ? (
        <Skeleton className="h-20" />
      ) : profile && (
        <Card>
          <CardContent className="p-4 flex items-center gap-4">
            <div className="w-12 h-12 rounded-full bg-primary flex items-center justify-center shrink-0">
              <span className="text-primary-foreground font-bold text-lg">{profile.avatarInitials}</span>
            </div>
            <div>
              <p className="font-bold text-lg">{profile.name}</p>
              <p className="text-sm text-muted-foreground">{profile.email}</p>
              <p className="text-xs text-muted-foreground mt-0.5">Member since {profile.memberSince}</p>
            </div>
          </CardContent>
        </Card>
      )}

      <Tabs defaultValue="payment-details">
        <TabsList className="w-full">
          <TabsTrigger value="payment-details" className="flex-1 text-xs md:text-sm">Payment Details</TabsTrigger>
          <TabsTrigger value="deposits" className="flex-1 text-xs md:text-sm">Deposits</TabsTrigger>
          <TabsTrigger value="withdrawals" className="flex-1 text-xs md:text-sm">Withdrawals</TabsTrigger>
        </TabsList>

        {/* Payment Details Tab */}
        <TabsContent value="payment-details" className="space-y-3 mt-3">
          <p className="text-xs text-muted-foreground">
            Use these details to send money to Nifty Pay. After sending, go to{' '}
            <span className="text-primary font-medium">Deposit</span> to confirm your transfer.
          </p>
          {methodsLoading ? (
            <div className="space-y-3">{[...Array(3)].map((_, i) => <Skeleton key={i} className="h-32" />)}</div>
          ) : methods?.map((method) => (
            <Card key={method.id}>
              <CardHeader className="p-4 pb-2">
                <CardTitle className="text-sm font-bold flex items-center gap-2">
                  <span className="text-xl">{method.logoEmoji}</span>
                  {method.name}
                </CardTitle>
              </CardHeader>
              <CardContent className="p-4 pt-0 space-y-2">
                {/* Account Number */}
                <div className="flex items-center justify-between gap-2 bg-muted/60 rounded-lg px-3 py-2.5">
                  <div className="min-w-0">
                    <p className="text-xs text-muted-foreground">Account / Number</p>
                    <p className="font-mono font-bold text-sm truncate">{method.accountNumber}</p>
                  </div>
                  <Button
                    variant="ghost" size="sm" className="h-8 w-8 p-0 shrink-0"
                    onClick={() => copy(method.accountNumber, `acct-${method.id}`)}
                  >
                    {copied === `acct-${method.id}` ? <Check className="w-3.5 h-3.5 text-emerald-500" /> : <Copy className="w-3.5 h-3.5" />}
                  </Button>
                </div>
                {/* Account Name */}
                <div className="flex items-center justify-between gap-2 bg-muted/60 rounded-lg px-3 py-2.5">
                  <div className="min-w-0">
                    <p className="text-xs text-muted-foreground">Account Name</p>
                    <p className="font-semibold text-sm truncate">{method.accountName}</p>
                  </div>
                  <Button
                    variant="ghost" size="sm" className="h-8 w-8 p-0 shrink-0"
                    onClick={() => copy(method.accountName, `name-${method.id}`)}
                  >
                    {copied === `name-${method.id}` ? <Check className="w-3.5 h-3.5 text-emerald-500" /> : <Copy className="w-3.5 h-3.5" />}
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground leading-relaxed">{method.instructions}</p>
              </CardContent>
            </Card>
          ))}
        </TabsContent>

        {/* Deposits Tab */}
        <TabsContent value="deposits" className="space-y-3 mt-3">
          {depositsLoading ? (
            <div className="space-y-2">{[...Array(3)].map((_, i) => <Skeleton key={i} className="h-20" />)}</div>
          ) : !deposits || deposits.length === 0 ? (
            <Card>
              <CardContent className="p-8 text-center">
                <ArrowDownLeft className="w-8 h-8 mx-auto mb-2 text-muted-foreground opacity-30" />
                <p className="text-sm font-medium mb-1">No deposits yet</p>
                <p className="text-xs text-muted-foreground">Submit your first deposit request to get started.</p>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-2">
              {(deposits as any[]).map((d) => (
                <Card key={d.id}>
                  <CardContent className="p-3 flex items-center gap-3">
                    <div className="w-9 h-9 rounded-full bg-muted flex items-center justify-center shrink-0">
                      <ArrowDownLeft className="w-4 h-4 text-primary" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-2 mb-0.5">
                        <p className="font-semibold text-sm">Deposit — {d.currencyCode}</p>
                        <Badge className={`text-[10px] px-1.5 py-0 ${statusColor(d.status)}`}>{d.status}</Badge>
                      </div>
                      <p className="text-xs text-muted-foreground">
                        TX: <span className="font-mono">{d.externalTransactionId}</span>
                      </p>
                      <p className="text-xs text-muted-foreground">{formatDistanceToNow(new Date(d.createdAt), { addSuffix: true })}</p>
                    </div>
                    <p className="font-bold font-mono text-sm shrink-0 text-primary">
                      +{Number(d.amount).toLocaleString('en-US', { minimumFractionDigits: 2 })}
                    </p>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>

        {/* Withdrawals Tab */}
        <TabsContent value="withdrawals" className="space-y-3 mt-3">
          {withdrawalsLoading ? (
            <div className="space-y-2">{[...Array(3)].map((_, i) => <Skeleton key={i} className="h-20" />)}</div>
          ) : !withdrawals || withdrawals.length === 0 ? (
            <Card>
              <CardContent className="p-8 text-center">
                <ArrowUpLeft className="w-8 h-8 mx-auto mb-2 text-muted-foreground opacity-30" />
                <p className="text-sm font-medium mb-1">No withdrawals yet</p>
                <p className="text-xs text-muted-foreground">Submit a withdrawal to send money to your bank or mobile money.</p>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-2">
              {(withdrawals as any[]).map((w) => (
                <Card key={w.id}>
                  <CardContent className="p-3 flex items-center gap-3">
                    <div className="w-9 h-9 rounded-full bg-muted flex items-center justify-center shrink-0">
                      <ArrowUpLeft className="w-4 h-4 text-amber-500" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-2 mb-0.5">
                        <p className="font-semibold text-sm">
                          {w.withdrawalType === 'mobile_money' ? '📱 ' : '🏦 '}
                          {w.currencyCode} Withdrawal
                        </p>
                        <Badge className={`text-[10px] px-1.5 py-0 ${statusColor(w.status)}`}>{w.status}</Badge>
                      </div>
                      <p className="text-xs text-muted-foreground truncate">
                        {w.recipientCountry}{w.mobileNetwork ? ` · ${w.mobileNetwork}` : ''}{w.bankName ? ` · ${w.bankName}` : ''}
                      </p>
                      <p className="text-xs text-muted-foreground">{formatDistanceToNow(new Date(w.createdAt), { addSuffix: true })}</p>
                    </div>
                    <p className="font-bold font-mono text-sm shrink-0 text-red-500">
                      -{Number(w.amount).toLocaleString('en-US', { minimumFractionDigits: 2 })}
                    </p>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
