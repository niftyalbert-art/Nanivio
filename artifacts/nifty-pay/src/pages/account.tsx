import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/contexts/auth';
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
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Copy, Check, ArrowDownLeft, ArrowUpLeft, MessageSquare, CheckCircle2, ExternalLink, Send, LogOut, ShieldCheck, ChevronDown, ChevronUp, Phone, Video } from 'lucide-react';
import { Switch } from '@/components/ui/switch';
import { formatDistanceToNow } from 'date-fns';
import { useToast } from '@/hooks/use-toast';
import { PinInput } from '@/components/pin-input';

const API_BASE = import.meta.env.BASE_URL.replace(/\/$/, '') + '/api';

export default function Account() {
  const { toast } = useToast();
  const { logout, token } = useAuth();
  const { data: profile, isLoading: profileLoading } = useGetUserProfile();
  const { data: siteSettings } = useQuery({
    queryKey: ['site-settings'],
    queryFn: () => fetch(`${API_BASE}/settings`).then(r => r.json()) as Promise<{ whatsappLink: string; telegramLink: string; supportHours: string }>,
  });
  const { data: methods, isLoading: methodsLoading } = useGetPaymentMethods();
  const { data: deposits, isLoading: depositsLoading } = useGetDeposits();
  const { data: withdrawals, isLoading: withdrawalsLoading } = useGetWithdrawals();
  const [copied, setCopied] = useState<string | null>(null);
  const queryClient = useQueryClient();

  // Calling settings
  const { data: callingSettings, isLoading: callingSettingsLoading } = useQuery<{ callsEnabled: boolean; videoCallsEnabled: boolean }>({
    queryKey: ['calling-settings'],
    queryFn: () => fetch(`${API_BASE}/user/calling-settings`, {
      headers: { Authorization: `Bearer ${token}` },
    }).then(r => r.json()),
    enabled: !!token,
  });

  const updateCallingSettings = useMutation({
    mutationFn: async (patch: { callsEnabled?: boolean; videoCallsEnabled?: boolean }) => {
      const r = await fetch(`${API_BASE}/user/calling-settings`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify(patch),
      });
      if (!r.ok) throw new Error('Failed to save');
      return r.json();
    },
    onMutate: async (patch) => {
      await queryClient.cancelQueries({ queryKey: ['calling-settings'] });
      const prev = queryClient.getQueryData<{ callsEnabled: boolean; videoCallsEnabled: boolean }>(['calling-settings']);
      queryClient.setQueryData(['calling-settings'], (old: any) => ({ ...old, ...patch }));
      return { prev };
    },
    onError: (_e, _v, ctx: any) => {
      queryClient.setQueryData(['calling-settings'], ctx?.prev);
      toast({ title: 'Could not save setting', variant: 'destructive' });
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: ['calling-settings'] }),
  });

  // Change PIN
  const [showChangePinForm, setShowChangePinForm] = useState(false);
  const [currentPin, setCurrentPin] = useState('');
  const [newPin, setNewPin] = useState('');
  const [confirmPin, setConfirmPin] = useState('');
  const [pinChanged, setPinChanged] = useState(false);

  const changePin = useMutation({
    mutationFn: async () => {
      const r = await fetch(`${API_BASE}/auth/change-pin`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { 'Authorization': `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ currentPin, newPin }),
      });
      if (!r.ok) {
        const body = await r.json().catch(() => ({ error: 'Unknown error' }));
        throw new Error(body.error ?? 'Failed to change PIN');
      }
      return r.json();
    },
    onSuccess: () => {
      setPinChanged(true);
      setCurrentPin(''); setNewPin(''); setConfirmPin('');
      setTimeout(() => { setPinChanged(false); setShowChangePinForm(false); }, 3000);
    },
    onError: (err: Error) => toast({ title: 'PIN change failed', description: err.message, variant: 'destructive' }),
  });

  // Support ticket
  const [ticketSubject, setTicketSubject] = useState('');
  const [ticketMessage, setTicketMessage] = useState('');
  const [ticketSent, setTicketSent] = useState(false);

  const submitTicket = useMutation({
    mutationFn: async () => {
      const r = await fetch(`${API_BASE}/tickets`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { 'Authorization': `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ subject: ticketSubject, message: ticketMessage }),
      });
      if (!r.ok) throw new Error(await r.text());
      return r.json();
    },
    onSuccess: () => { setTicketSent(true); setTicketSubject(''); setTicketMessage(''); },
    onError: () => toast({ title: 'Failed to send', description: 'Please try again.', variant: 'destructive' }),
  });

  const copy = (text: string, key: string) => {
    navigator.clipboard.writeText(text);
    setCopied(key);
    setTimeout(() => setCopied(null), 2000);
  };

  const statusColor = (s: string) => {
    switch (s) {
      case 'approved': case 'sent': return 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20';
      case 'pending': return 'bg-amber-500/10 text-amber-500 border-amber-500/20';
      case 'rejected': return 'bg-red-500/10 text-red-500 border-red-500/20';
      default: return 'bg-muted text-muted-foreground';
    }
  };

  return (
    <div className="p-4 md:p-8 space-y-5 md:space-y-6 max-w-2xl mx-auto">
      {/* Profile */}
      <div>
        <h1 className="text-2xl md:text-3xl font-bold tracking-tight">Account</h1>
        <p className="text-sm text-muted-foreground mt-0.5">Manage your profile and activity</p>
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

      {/* ── Security / Change PIN ─────────────────────────────────── */}
      <Card>
        <CardContent className="p-0">
          <button
            type="button"
            className="w-full flex items-center justify-between p-4 text-left"
            onClick={() => { setShowChangePinForm(v => !v); setPinChanged(false); }}
          >
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                <ShieldCheck className="w-4 h-4 text-primary" />
              </div>
              <div>
                <p className="font-semibold text-sm">Change PIN</p>
                <p className="text-xs text-muted-foreground">Update your 4-digit login PIN</p>
              </div>
            </div>
            {showChangePinForm
              ? <ChevronUp className="w-4 h-4 text-muted-foreground" />
              : <ChevronDown className="w-4 h-4 text-muted-foreground" />}
          </button>

          {showChangePinForm && (
            <div className="px-4 pb-4 space-y-4 border-t border-border pt-4">
              {pinChanged ? (
                <div className="text-center py-3 space-y-2">
                  <CheckCircle2 className="w-8 h-8 text-emerald-500 mx-auto" />
                  <p className="font-semibold text-sm text-emerald-500">PIN changed successfully!</p>
                  <p className="text-xs text-muted-foreground">Use your new PIN next time you sign in.</p>
                </div>
              ) : (
                <>
                  <div className="space-y-1.5">
                    <Label className="text-xs text-muted-foreground">Current PIN</Label>
                    <PinInput value={currentPin} onChange={setCurrentPin} autoFocus={false} />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs text-muted-foreground">New PIN</Label>
                    <PinInput value={newPin} onChange={setNewPin} autoFocus={false} />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs text-muted-foreground">Confirm New PIN</Label>
                    <PinInput value={confirmPin} onChange={setConfirmPin} autoFocus={false} />
                  </div>
                  {newPin.length === 4 && confirmPin.length === 4 && newPin !== confirmPin && (
                    <p className="text-xs text-destructive text-center">PINs don't match</p>
                  )}
                  <Button
                    className="w-full"
                    disabled={
                      currentPin.length !== 4 ||
                      newPin.length !== 4 ||
                      confirmPin.length !== 4 ||
                      newPin !== confirmPin ||
                      changePin.isPending
                    }
                    onClick={() => changePin.mutate()}
                  >
                    {changePin.isPending ? 'Saving…' : 'Save New PIN'}
                  </Button>
                </>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* ── Calls & Messaging ─────────────────────────────────────── */}
      <Card>
        <CardContent className="p-0">
          <div className="p-4 flex items-center gap-3">
            <div className="w-9 h-9 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
              <Phone className="w-4 h-4 text-primary" />
            </div>
            <div>
              <p className="font-semibold text-sm">Calls &amp; Messaging</p>
              <p className="text-xs text-muted-foreground">Control who can call you in Nanivio chat</p>
            </div>
          </div>

          <div className="border-t border-border">
            {callingSettingsLoading ? (
              <div className="px-4 py-3 space-y-3">
                <div className="h-9 bg-muted/50 rounded-lg animate-pulse" />
                <div className="h-9 bg-muted/50 rounded-lg animate-pulse" />
              </div>
            ) : (
              <div className="divide-y divide-border">
                {/* Allow audio calls */}
                <div className="flex items-center justify-between px-4 py-3 gap-4">
                  <div className="flex items-center gap-3 min-w-0">
                    <Phone className="w-4 h-4 text-muted-foreground shrink-0" />
                    <div className="min-w-0">
                      <p className="text-sm font-medium">Allow audio calls</p>
                      <p className="text-xs text-muted-foreground">Others can start a voice call with you</p>
                    </div>
                  </div>
                  <Switch
                    checked={callingSettings?.callsEnabled ?? true}
                    disabled={updateCallingSettings.isPending}
                    onCheckedChange={(v) => updateCallingSettings.mutate({ callsEnabled: v })}
                  />
                </div>

                {/* Allow video calls */}
                <div className="flex items-center justify-between px-4 py-3 gap-4">
                  <div className="flex items-center gap-3 min-w-0">
                    <Video className="w-4 h-4 text-muted-foreground shrink-0" />
                    <div className="min-w-0">
                      <p className="text-sm font-medium">Allow video calls</p>
                      <p className="text-xs text-muted-foreground">Others can start a video call with you</p>
                    </div>
                  </div>
                  <Switch
                    checked={callingSettings?.videoCallsEnabled ?? true}
                    disabled={updateCallingSettings.isPending || !(callingSettings?.callsEnabled ?? true)}
                    onCheckedChange={(v) => updateCallingSettings.mutate({ videoCallsEnabled: v })}
                  />
                </div>

                {!(callingSettings?.callsEnabled ?? true) && (
                  <p className="px-4 py-2 text-xs text-amber-500 bg-amber-500/5">
                    Calls are disabled — others will see a "calls not allowed" notice when they try to reach you.
                  </p>
                )}
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      <Tabs defaultValue="payment-details">
        <TabsList className="w-full">
          <TabsTrigger value="payment-details" className="flex-1 text-xs md:text-sm">Pay Details</TabsTrigger>
          <TabsTrigger value="deposits" className="flex-1 text-xs md:text-sm">Deposits</TabsTrigger>
          <TabsTrigger value="withdrawals" className="flex-1 text-xs md:text-sm">Sends</TabsTrigger>
          <TabsTrigger value="support" className="flex-1 text-xs md:text-sm">Support</TabsTrigger>
        </TabsList>

        {/* Payment Details Tab */}
        <TabsContent value="payment-details" className="space-y-3 mt-3">
          <p className="text-xs text-muted-foreground">
            Use these details to fund your wallet. Copy the number, transfer from your app, then confirm on the{' '}
            <span className="text-primary font-medium">Top Up</span> page.
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
                <div className="flex items-center justify-between gap-2 bg-muted/60 rounded-lg px-3 py-2.5">
                  <div className="min-w-0">
                    <p className="text-xs text-muted-foreground">Account / Number</p>
                    <p className="font-mono font-bold text-sm truncate">{method.accountNumber}</p>
                  </div>
                  <Button variant="ghost" size="sm" className="h-8 w-8 p-0 shrink-0" onClick={() => copy(method.accountNumber, `acct-${method.id}`)}>
                    {copied === `acct-${method.id}` ? <Check className="w-3.5 h-3.5 text-emerald-500" /> : <Copy className="w-3.5 h-3.5" />}
                  </Button>
                </div>
                <div className="flex items-center justify-between gap-2 bg-muted/60 rounded-lg px-3 py-2.5">
                  <div className="min-w-0">
                    <p className="text-xs text-muted-foreground">Account Name</p>
                    <p className="font-semibold text-sm truncate">{method.accountName}</p>
                  </div>
                  <Button variant="ghost" size="sm" className="h-8 w-8 p-0 shrink-0" onClick={() => copy(method.accountName, `name-${method.id}`)}>
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
          ) : !deposits || (deposits as any[]).length === 0 ? (
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
                  <CardContent className="p-3">
                    <div className="flex items-center gap-3">
                      <div className="w-9 h-9 rounded-full bg-muted flex items-center justify-center shrink-0">
                        <ArrowDownLeft className="w-4 h-4 text-primary" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between gap-2 mb-0.5">
                          <p className="font-semibold text-sm">Deposit — {d.currencyCode}</p>
                          <Badge className={`text-[10px] px-1.5 py-0 ${statusColor(d.status)}`}>{d.status}</Badge>
                        </div>
                        <p className="text-xs text-muted-foreground font-mono">{parseFloat(d.amount).toLocaleString('en-US', { minimumFractionDigits: 2 })} {d.currencyCode} · {formatDistanceToNow(new Date(d.createdAt))} ago</p>
                        <p className="text-xs text-muted-foreground truncate">Ref: {d.externalTransactionId}</p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>

        {/* Withdrawals / Sends Tab */}
        <TabsContent value="withdrawals" className="space-y-3 mt-3">
          {withdrawalsLoading ? (
            <div className="space-y-2">{[...Array(3)].map((_, i) => <Skeleton key={i} className="h-20" />)}</div>
          ) : !withdrawals || (withdrawals as any[]).length === 0 ? (
            <Card>
              <CardContent className="p-8 text-center">
                <ArrowUpLeft className="w-8 h-8 mx-auto mb-2 text-muted-foreground opacity-30" />
                <p className="text-sm font-medium mb-1">No sends yet</p>
                <p className="text-xs text-muted-foreground">Your send history will appear here.</p>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-2">
              {(withdrawals as any[]).map((w) => (
                <Card key={w.id}>
                  <CardContent className="p-3 space-y-2">
                    <div className="flex items-center gap-3">
                      <div className="w-9 h-9 rounded-full bg-muted flex items-center justify-center shrink-0">
                        <ArrowUpLeft className="w-4 h-4 text-amber-500" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between gap-2 mb-0.5">
                          <p className="font-semibold text-sm">Send — {w.currencyCode}</p>
                          <Badge className={`text-[10px] px-1.5 py-0 ${statusColor(w.status)}`}>{w.status}</Badge>
                        </div>
                        <p className="text-xs text-muted-foreground font-mono">{parseFloat(w.amount).toLocaleString('en-US', { minimumFractionDigits: 2 })} {w.currencyCode} · {formatDistanceToNow(new Date(w.createdAt))} ago</p>
                        <p className="text-xs text-muted-foreground">{w.recipientCountry} · {w.withdrawalType === 'mobile_money' ? `${w.mobileNetwork} ${w.mobileNumber}` : `${w.bankName}`}</p>
                      </div>
                    </div>
                    {/* Show admin receipt when sent */}
                    {w.status === 'sent' && w.adminReceiptImage && (
                      <div className="ml-12 space-y-1">
                        <p className="text-xs font-semibold text-emerald-500 flex items-center gap-1"><CheckCircle2 className="w-3 h-3" /> Transfer Confirmed</p>
                        <img src={w.adminReceiptImage} alt="Transfer receipt" className="rounded-lg w-full max-h-40 object-contain bg-muted" />
                      </div>
                    )}
                    {w.status === 'sent' && !w.adminReceiptImage && (
                      <div className="ml-12">
                        <p className="text-xs font-semibold text-emerald-500 flex items-center gap-1"><CheckCircle2 className="w-3 h-3" /> Transfer Confirmed by Admin</p>
                      </div>
                    )}
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>

        {/* Support Tab */}
        <TabsContent value="support" className="space-y-4 mt-3">
          {/* Instant contact */}
          <Card className="border-primary/20 bg-primary/5">
            <CardContent className="p-4 space-y-3">
              <div className="flex items-center gap-2">
                <MessageSquare className="w-4 h-4 text-primary" />
                <p className="font-bold text-sm">Contact Customer Support</p>
              </div>
              <p className="text-xs text-muted-foreground leading-relaxed">
                Reach us instantly on WhatsApp or Telegram — fastest way to get help with your transfers, deposits, or account.
              </p>

              {/* WhatsApp */}
              <a
                href={siteSettings?.whatsappLink ?? 'https://wa.me/971501234567'}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-3 rounded-xl border border-green-600/30 bg-green-500/10 p-3.5 hover:bg-green-500/20 transition-colors"
              >
                <span className="text-2xl leading-none">💬</span>
                <div className="flex-1 min-w-0">
                  <p className="font-bold text-sm text-green-600">WhatsApp</p>
                  <p className="text-xs text-muted-foreground">Chat with us on WhatsApp</p>
                </div>
                <ExternalLink className="w-4 h-4 text-green-600 shrink-0" />
              </a>

              {/* Telegram */}
              <a
                href={siteSettings?.telegramLink ?? 'https://t.me/nanivio_support'}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-3 rounded-xl border border-blue-500/30 bg-blue-500/10 p-3.5 hover:bg-blue-500/20 transition-colors"
              >
                <span className="text-2xl leading-none">✈️</span>
                <div className="flex-1 min-w-0">
                  <p className="font-bold text-sm text-blue-500">Telegram</p>
                  <p className="text-xs text-muted-foreground">Message us on Telegram</p>
                </div>
                <ExternalLink className="w-4 h-4 text-blue-500 shrink-0" />
              </a>

              <p className="text-xs text-muted-foreground text-center pt-1">
                🕐 {siteSettings?.supportHours ?? 'Available 8am–10pm UAE time · Replies within 30 minutes'}
              </p>
            </CardContent>
          </Card>

          {/* Ticket form */}
          <Card>
            <CardHeader className="p-4 pb-2">
              <CardTitle className="text-sm font-bold flex items-center gap-2">
                <Send className="w-4 h-4" /> Send a Support Ticket
              </CardTitle>
              <p className="text-xs text-muted-foreground">
                Prefer to write? Submit a ticket and we'll follow up via WhatsApp or email.
              </p>
            </CardHeader>
            <CardContent className="p-4 pt-0 space-y-3">
              {ticketSent ? (
                <div className="text-center py-4 space-y-2">
                  <CheckCircle2 className="w-8 h-8 text-emerald-500 mx-auto" />
                  <p className="font-semibold text-sm">Ticket submitted!</p>
                  <p className="text-xs text-muted-foreground">We'll get back to you via WhatsApp or email soon.</p>
                  <Button variant="outline" size="sm" onClick={() => setTicketSent(false)}>Send Another</Button>
                </div>
              ) : (
                <>
                  <div className="space-y-1.5">
                    <Label className="text-xs">Subject</Label>
                    <Input placeholder="e.g. Deposit not credited" value={ticketSubject} onChange={e => setTicketSubject(e.target.value)} className="text-sm" />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs">Message</Label>
                    <Textarea placeholder="Describe your issue in detail..." value={ticketMessage} onChange={e => setTicketMessage(e.target.value)} rows={4} className="text-sm" />
                  </div>
                  <Button
                    className="w-full gap-2"
                    onClick={() => submitTicket.mutate()}
                    disabled={!ticketSubject || !ticketMessage || submitTicket.isPending}
                  >
                    <Send className="w-3.5 h-3.5" />
                    {submitTicket.isPending ? 'Sending...' : 'Send Ticket'}
                  </Button>
                </>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Sign Out */}
      <Card className="border-destructive/30">
        <CardContent className="p-4">
          <Button
            variant="ghost"
            className="w-full gap-2 text-destructive hover:bg-destructive/10 hover:text-destructive"
            onClick={logout}
          >
            <LogOut className="w-4 h-4" />
            Sign Out
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
