import { useState, useEffect, useRef } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/contexts/auth';
import {
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
import { Copy, Check, ArrowDownLeft, ArrowUpLeft, MessageSquare, CheckCircle2, ExternalLink, Send, LogOut, ShieldCheck, ChevronDown, ChevronUp, Phone, Video, BadgeCheck, ChevronRight, TrendingUp, ArrowLeftRight, Camera, Banknote, Languages } from 'lucide-react';
import { useLocation } from 'wouter';
import { Switch } from '@/components/ui/switch';
import { formatDistanceToNow } from 'date-fns';
import { useToast } from '@/hooks/use-toast';
import { PinInput } from '@/components/pin-input';

import { API_BASE } from '@/lib/api';

export default function Account() {
  const { toast } = useToast();
  const { logout, token } = useAuth();
  const { data: profile, isLoading: profileLoading, error: profileError } = useQuery({
    queryKey: ['render-user-profile', token],
    enabled: !!token,
    retry: false,
    queryFn: async () => {
      const response = await fetch(`${API_BASE}/user/profile?_=${Date.now()}`, {
        headers: { Authorization: `Bearer ${token}` },
        cache: 'no-store',
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body?.error ?? `Profile request failed (${response.status})`);
      return body as {
        id: number; name: string; email: string; avatarInitials: string;
        memberSince: string; nanivioNumber: string | null;
      };
    },
  });
  const { data: siteSettings } = useQuery({
    queryKey: ['site-settings'],
    queryFn: () => fetch(`${API_BASE}/settings`).then(r => r.json()) as Promise<{ whatsappLink: string; telegramLink: string; supportHours: string }>,
  });
  const { data: methods, isLoading: methodsLoading } = useGetPaymentMethods();
  const { data: deposits, isLoading: depositsLoading } = useGetDeposits();
  const { data: withdrawals, isLoading: withdrawalsLoading } = useGetWithdrawals();
  const { data: allRates, isLoading: ratesLoading } = useQuery<{ code: string; rateToUsd: number }[]>({
    queryKey: ['rates-all'],
    queryFn: () => fetch(`${API_BASE}/rates/all`).then(r => r.json()),
    staleTime: 5 * 60 * 1000,
  });
  const [copied, setCopied] = useState<string | null>(null);
  // Profile photo
  const [avatarVersion, setAvatarVersion] = useState(() => Date.now());
  const [avatarFailed, setAvatarFailed] = useState(false);
  const [avatarUploading, setAvatarUploading] = useState(false);

  const uploadAvatar = async (file: File) => {
    if (file.size > 8 * 1024 * 1024) {
      toast({ title: 'Image too large', description: 'Maximum 8 MB.', variant: 'destructive' });
      return;
    }
    setAvatarUploading(true);
    try {
      const dataUrl: string = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result));
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });
      const r = await fetch(`${API_BASE}/profile/avatar`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ imageBase64: dataUrl }),
      });
      if (!r.ok) {
        const e = await r.json().catch(() => ({}));
        throw new Error((e as { error?: string }).error ?? 'Upload failed');
      }
      setAvatarFailed(false);
      setAvatarVersion(Date.now());
      toast({ title: 'Profile photo updated', description: 'Your new photo will also appear in chats.' });
    } catch (e: any) {
      toast({ title: 'Upload failed', description: e.message, variant: 'destructive' });
    } finally {
      setAvatarUploading(false);
    }
  };
  const [calcFrom, setCalcFrom] = useState('USD');
  const [calcTo, setCalcTo] = useState('AED');
  const [calcAmount, setCalcAmount] = useState('100');
  const queryClient = useQueryClient();

  // Calling settings
  const { data: callingSettings, isLoading: callingSettingsLoading } = useQuery<{ callsEnabled: boolean; videoCallsEnabled: boolean }>({
    queryKey: ['calling-settings'],
    queryFn: () => fetch(`${API_BASE}/user/calling-settings`, {
      headers: { Authorization: `Bearer ${token}` },
    }).then(r => r.json()),
    enabled: !!token,
  });

  // Paid per-minute calls (expert mode)
  const { data: paidCallSettings } = useQuery<{ enabled: boolean; ratePerMinute: number | null; currency: string }>({
    queryKey: ['paid-call-settings'],
    queryFn: () => fetch(`${API_BASE}/paid-calls/settings`, {
      headers: { Authorization: `Bearer ${token}` },
    }).then(r => r.json()),
    enabled: !!token,
  });
  const [paidRateInput, setPaidRateInput] = useState('');
  const [paidCurrencyInput, setPaidCurrencyInput] = useState('USD');
  const paidFormInitialized = useRef(false);
  useEffect(() => {
    if (paidCallSettings && !paidFormInitialized.current) {
      paidFormInitialized.current = true;
      if (paidCallSettings.ratePerMinute) setPaidRateInput(String(paidCallSettings.ratePerMinute));
      if (paidCallSettings.currency) setPaidCurrencyInput(paidCallSettings.currency);
    }
  }, [paidCallSettings]);

  const updatePaidCallSettings = useMutation({
    mutationFn: async (body: { enabled: boolean; ratePerMinute?: number; currency?: string }) => {
      const r = await fetch(`${API_BASE}/paid-calls/settings`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify(body),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(d?.error ?? 'Failed to save');
      return d;
    },
    onSuccess: (_d, vars) => {
      queryClient.invalidateQueries({ queryKey: ['paid-call-settings'] });
      toast({
        title: vars.enabled ? 'Paid calls enabled' : 'Paid calls disabled',
        description: vars.enabled
          ? `Callers will be charged ${vars.ratePerMinute} ${vars.currency}/min when you answer.`
          : 'Your calls are free again.',
      });
    },
    onError: (e: any) => toast({ title: 'Could not save', description: e.message, variant: 'destructive' }),
  });

  // Live translation preferences
  const { data: translationSettings, isLoading: translationSettingsLoading } = useQuery<{
    preferredLanguage: string;
    translationEnabled: boolean;
  }>({
    queryKey: ['translation-settings'],
    queryFn: () => fetch(`${API_BASE}/user/translation-settings`, {
      headers: { Authorization: `Bearer ${token}` },
    }).then(r => r.json()),
    enabled: !!token,
  });

  const updateTranslationSettings = useMutation({
    mutationFn: async (patch: {
      preferredLanguage?: string;
      translationEnabled?: boolean;
    }) => {
      const r = await fetch(`${API_BASE}/user/translation-settings`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(patch),
      });

      const data = await r.json().catch(() => ({}));

      if (!r.ok) {
        throw new Error(data?.error ?? 'Failed to save translation setting');
      }

      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['translation-settings'] });
    },
    onError: (error: Error) => {
      toast({
        title: 'Could not save translation setting',
        description: error.message,
        variant: 'destructive',
      });
    },
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
  const [, navigate] = useLocation();

  // KYC status
  const { data: kycState } = useQuery<{ kycStatus: string; kycRejectionReason: string | null }>({
    queryKey: ['kyc-status'],
    queryFn: () => fetch(`${API_BASE}/kyc/status`, {
      headers: { Authorization: `Bearer ${token}` },
    }).then(r => r.json()),
    enabled: !!token,
  });

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
      ) : profileError ? (
        <Card className="border-destructive/40"><CardContent className="p-4 text-sm text-destructive">
          Could not load your Account profile from Render: {(profileError as Error).message}
        </CardContent></Card>
      ) : profile && (
        <Card>
          <CardContent className="p-4 flex items-center gap-4">
            <div className="relative shrink-0">
              <label className="block cursor-pointer group" title="Change profile photo">
                <div className="w-14 h-14 rounded-full p-[2px] bg-gradient-to-tr from-primary via-sky-400 to-violet-500">
                  <div className="w-full h-full rounded-full bg-primary flex items-center justify-center overflow-hidden border-2 border-background">
                    {!avatarFailed ? (
                      <img
                        src={`${API_BASE}/avatars/${profile.id}?v=${avatarVersion}`}
                        alt="Profile"
                        className="w-full h-full object-cover"
                        onError={() => setAvatarFailed(true)}
                      />
                    ) : (
                      <span className="text-primary-foreground font-bold text-lg">{profile.avatarInitials}</span>
                    )}
                  </div>
                </div>
                <span className="absolute -bottom-0.5 -right-0.5 w-6 h-6 rounded-full bg-primary border-2 border-background flex items-center justify-center shadow-md group-hover:scale-110 transition-transform">
                  {avatarUploading
                    ? <span className="w-3 h-3 border-2 border-primary-foreground/40 border-t-primary-foreground rounded-full animate-spin" />
                    : <Camera className="w-3 h-3 text-primary-foreground" />}
                </span>
                <input
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  className="hidden"
                  disabled={avatarUploading}
                  onChange={e => { const f = e.target.files?.[0]; if (f) uploadAvatar(f); e.target.value = ''; }}
                />
              </label>
            </div>
            <div className="min-w-0">
              <p className="text-xs font-medium uppercase tracking-[0.14em] text-muted-foreground">Username</p>
              <div className="mt-1 flex flex-wrap items-center gap-2">
                <p className="max-w-full truncate text-lg font-extrabold tracking-tight">{profile.name}</p>
                <span className="rounded-full border border-primary/25 bg-primary/10 px-2.5 py-1 font-mono text-xs font-bold text-primary">
                  NV. {profile.nanivioNumber ?? 'Not assigned'}
                </span>
              </div>
              <p className="mt-2 text-xs text-muted-foreground">Date joined. {profile.memberSince}</p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* ── KYC Verification Status ──────────────────────────────── */}
      {kycState && (
        <Card
          className={
            kycState.kycStatus === 'verified' ? 'border-emerald-500/30 bg-emerald-500/5 cursor-pointer' :
            kycState.kycStatus === 'pending'  ? 'border-amber-500/30 bg-amber-500/5 cursor-pointer' :
            kycState.kycStatus === 'rejected' ? 'border-red-500/30 bg-red-500/5 cursor-pointer' :
            'cursor-pointer'
          }
          onClick={() => navigate('/kyc')}
        >
          <CardContent className="p-4 flex items-center gap-3">
            <div className={`w-9 h-9 rounded-full flex items-center justify-center shrink-0 ${
              kycState.kycStatus === 'verified' ? 'bg-emerald-500/15' :
              kycState.kycStatus === 'pending'  ? 'bg-amber-500/15' :
              kycState.kycStatus === 'rejected' ? 'bg-red-500/15' :
              'bg-muted'
            }`}>
              <BadgeCheck className={`w-4 h-4 ${
                kycState.kycStatus === 'verified' ? 'text-emerald-500' :
                kycState.kycStatus === 'pending'  ? 'text-amber-500' :
                kycState.kycStatus === 'rejected' ? 'text-red-500' :
                'text-muted-foreground'
              }`} />
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-semibold text-sm">Identity Verification</p>
              <p className="text-xs text-muted-foreground">
                {kycState.kycStatus === 'verified'   ? 'Verified — full transfer limits active'        :
                 kycState.kycStatus === 'pending'    ? 'Under review — we\'ll notify you soon'          :
                 kycState.kycStatus === 'rejected'   ? `Rejected — tap to resubmit`                    :
                 'Unverified — $2,000 limit per transfer'}
              </p>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${
                kycState.kycStatus === 'verified' ? 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20' :
                kycState.kycStatus === 'pending'  ? 'bg-amber-500/10 text-amber-500 border-amber-500/20' :
                kycState.kycStatus === 'rejected' ? 'bg-red-500/10 text-red-500 border-red-500/20' :
                'bg-muted text-muted-foreground border-border'
              }`}>
                {kycState.kycStatus === 'verified' ? 'VERIFIED' :
                 kycState.kycStatus === 'pending'  ? 'PENDING'  :
                 kycState.kycStatus === 'rejected' ? 'REJECTED' :
                 'UNVERIFIED'}
              </span>
              <ChevronRight className="w-4 h-4 text-muted-foreground" />
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

      {/* ── Live Translation ───────────────────────────────────────── */}
      <Card>
        <CardContent className="p-0">
          <div className="p-4 flex items-center gap-3">
            <div className="w-9 h-9 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
              <Languages className="w-4 h-4 text-primary" />
            </div>
            <div>
              <p className="font-semibold text-sm">Live Translation</p>
              <p className="text-xs text-muted-foreground">
                Choose your preferred language for real-time voice translation
              </p>
            </div>
          </div>

          <div className="border-t border-border divide-y divide-border">
            {translationSettingsLoading ? (
              <div className="px-4 py-3">
                <div className="h-9 bg-muted/50 rounded-lg animate-pulse" />
              </div>
            ) : (
              <>
                {/* Preferred language */}
                <div className="flex items-center justify-between px-4 py-3 gap-4">
                  <div className="min-w-0">
                    <p className="text-sm font-medium">Preferred language</p>
                    <p className="text-xs text-muted-foreground">
                      The language you want to receive translations in
                    </p>
                  </div>

                  <select
                    value={translationSettings?.preferredLanguage ?? 'en'}
                    disabled={updateTranslationSettings.isPending}
                    onChange={(event) => updateTranslationSettings.mutate({ preferredLanguage: event.target.value })}
                    className="h-9 rounded-md border border-input bg-background px-3 text-sm shrink-0"
                  >
                    <optgroup label="East Africa">
                      <option value="sw">Swahili (Kenya, Uganda, Tanzania)</option>
                      <option value="lg">Luganda (Uganda)</option>
                    </optgroup>
                    <optgroup label="Ghana">
                      <option value="ak">Twi / Akan (Ghana)</option>
                      <option value="tw-Akuapem">Akuapem Twi (Ghana)</option>
                      <option value="fat">Fante (Ghana)</option>
                      <option value="ee">Ewe (Ghana)</option>
                      <option value="gaa">Ga (Ghana)</option>
                    </optgroup>
                    <optgroup label="Other African languages">
                      <option value="ha">Hausa</option>
                    </optgroup>
                    <optgroup label="Other languages">
                      <option value="en">English (US)</option>
                      <option value="fr">French (Français)</option>
                      <option value="es">Spanish (Español)</option>
                      <option value="ar">Arabic (العربية)</option>
                      <option value="de">German (Deutsch)</option>
                      <option value="it">Italian (Italiano)</option>
                      <option value="pt">Portuguese (Português)</option>
                      <option value="zh">Chinese (Mandarin)</option>
                      <option value="ja">Japanese (日本語)</option>
                      <option value="ko">Korean (한국어)</option>
                    </optgroup>
                  </select>
                </div>

                {/* Translation ON/OFF */}
                <div className="flex items-center justify-between px-4 py-3 gap-4">
                  <div className="min-w-0">
                    <p className="text-sm font-medium">Live translation</p>
                    <p className="text-xs text-muted-foreground">
                      Automatically translate voices during supported calls
                    </p>
                  </div>

                  <Switch
                    checked={translationSettings?.translationEnabled ?? false}
                    disabled={updateTranslationSettings.isPending}
                    onCheckedChange={(enabled) =>
                      updateTranslationSettings.mutate({
                        translationEnabled: enabled,
                      })
                    }
                  />
                </div>
              </>
            )}
          </div>
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

                {/* ── Paid per-minute calls (expert mode) ── */}
                <div className="px-4 py-3 space-y-3">
                  <div className="flex items-center justify-between gap-4">
                    <div className="flex items-center gap-3 min-w-0">
                      <Banknote className="w-4 h-4 text-muted-foreground shrink-0" />
                      <div className="min-w-0">
                        <p className="text-sm font-medium">Paid calls</p>
                        <p className="text-xs text-muted-foreground">Charge a per-minute rate when people call you</p>
                      </div>
                    </div>
                    <Switch
                      data-testid="paid-calls-toggle"
                      checked={paidCallSettings?.enabled ?? false}
                      disabled={updatePaidCallSettings.isPending}
                      onCheckedChange={(v) => {
                        if (!v) { updatePaidCallSettings.mutate({ enabled: false }); return; }
                        const rate = parseFloat(paidRateInput);
                        if (!(rate > 0)) {
                          toast({ title: 'Set your rate first', description: 'Enter a per-minute rate below, then enable paid calls.', variant: 'destructive' });
                          return;
                        }
                        updatePaidCallSettings.mutate({ enabled: true, ratePerMinute: rate, currency: paidCurrencyInput });
                      }}
                    />
                  </div>
                  <div className="flex items-center gap-2">
                    <Input
                      data-testid="paid-call-rate-input"
                      type="number" min="0.01" step="0.01" placeholder="Rate per minute"
                      value={paidRateInput}
                      onChange={e => setPaidRateInput(e.target.value)}
                      className="h-9 text-sm"
                    />
                    <select
                      data-testid="paid-call-currency-select"
                      value={paidCurrencyInput}
                      onChange={e => setPaidCurrencyInput(e.target.value)}
                      className="h-9 rounded-md border border-input bg-background px-2 text-sm"
                    >
                      {['USD', 'AED', 'EUR', 'GBP', 'INR', 'PHP', 'NGN', 'KES', 'GHS', 'PKR', 'BDT'].map(c => (
                        <option key={c} value={c}>{c}</option>
                      ))}
                    </select>
                    {(paidCallSettings?.enabled ?? false) && (
                      <Button
                        size="sm" variant="outline" className="h-9 shrink-0"
                        data-testid="paid-call-save-rate"
                        disabled={updatePaidCallSettings.isPending}
                        onClick={() => {
                          const rate = parseFloat(paidRateInput);
                          if (!(rate > 0)) { toast({ title: 'Enter a valid rate', variant: 'destructive' }); return; }
                          updatePaidCallSettings.mutate({ enabled: true, ratePerMinute: rate, currency: paidCurrencyInput });
                        }}
                      >
                        Save
                      </Button>
                    )}
                  </div>
                  {(paidCallSettings?.enabled ?? false) && paidCallSettings?.ratePerMinute && (
                    <p className="text-xs text-emerald-500 bg-emerald-500/5 rounded-md px-2 py-1.5">
                      Active — callers see {paidCallSettings.ratePerMinute} {paidCallSettings.currency}/min and must confirm before ringing you. You're paid automatically when each call ends.
                    </p>
                  )}
                </div>
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
          <TabsTrigger value="rates" className="flex-1 text-xs md:text-sm">Rates</TabsTrigger>
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
                  <span className="ml-auto text-[10px] font-normal text-muted-foreground bg-muted px-2 py-0.5 rounded-full">
                    {method.type === 'crypto' ? 'Crypto' : method.type === 'botim' ? 'Botim' : method.type === 'emoney' ? 'eMoney' : 'Bank'}
                  </span>
                </CardTitle>
              </CardHeader>
              <CardContent className="p-4 pt-0 space-y-2">
                {method.type === 'crypto' ? (
                  <>
                    <div className="flex items-center justify-between gap-2 bg-muted/60 rounded-lg px-3 py-2.5">
                      <div className="min-w-0">
                        <p className="text-xs text-muted-foreground">Network / Coin</p>
                        <p className="font-semibold text-sm truncate">{method.name}</p>
                      </div>
                    </div>
                    <div className="flex items-center justify-between gap-2 bg-muted/60 rounded-lg px-3 py-2.5">
                      <div className="min-w-0 flex-1">
                        <p className="text-xs text-muted-foreground">Wallet Address</p>
                        <p className="font-mono font-bold text-xs break-all mt-0.5">{method.accountNumber}</p>
                      </div>
                      <Button variant="ghost" size="sm" className="h-8 w-8 p-0 shrink-0 ml-2" onClick={() => copy(method.accountNumber, `acct-${method.id}`)}>
                        {copied === `acct-${method.id}` ? <Check className="w-3.5 h-3.5 text-emerald-500" /> : <Copy className="w-3.5 h-3.5" />}
                      </Button>
                    </div>
                  </>
                ) : method.type === 'botim' || method.type === 'emoney' ? (
                  <>
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
                  </>
                ) : (
                  /* Bank Transfer — full labeled details */
                  <>
                    <div className="flex items-center justify-between gap-2 bg-muted/60 rounded-lg px-3 py-2.5">
                      <div className="min-w-0">
                        <p className="text-xs text-muted-foreground">Bank Name</p>
                        <p className="font-semibold text-sm truncate">{method.name}</p>
                      </div>
                      <Button variant="ghost" size="sm" className="h-8 w-8 p-0 shrink-0" onClick={() => copy(method.name, `bname-${method.id}`)}>
                        {copied === `bname-${method.id}` ? <Check className="w-3.5 h-3.5 text-emerald-500" /> : <Copy className="w-3.5 h-3.5" />}
                      </Button>
                    </div>
                    <div className="flex items-center justify-between gap-2 bg-muted/60 rounded-lg px-3 py-2.5">
                      <div className="min-w-0">
                        <p className="text-xs text-muted-foreground">Account Holder Name</p>
                        <p className="font-semibold text-sm truncate">{method.accountName}</p>
                      </div>
                      <Button variant="ghost" size="sm" className="h-8 w-8 p-0 shrink-0" onClick={() => copy(method.accountName, `name-${method.id}`)}>
                        {copied === `name-${method.id}` ? <Check className="w-3.5 h-3.5 text-emerald-500" /> : <Copy className="w-3.5 h-3.5" />}
                      </Button>
                    </div>
                    {(method as any).iban && (
                      <div className="flex items-center justify-between gap-2 bg-muted/60 rounded-lg px-3 py-2.5">
                        <div className="min-w-0">
                          <p className="text-xs text-muted-foreground">IBAN</p>
                          <p className="font-mono font-bold text-sm tracking-wide truncate">{(method as any).iban}</p>
                        </div>
                        <Button variant="ghost" size="sm" className="h-8 w-8 p-0 shrink-0" onClick={() => copy((method as any).iban, `iban-${method.id}`)}>
                          {copied === `iban-${method.id}` ? <Check className="w-3.5 h-3.5 text-emerald-500" /> : <Copy className="w-3.5 h-3.5" />}
                        </Button>
                      </div>
                    )}
                    {method.accountNumber && (
                      <div className="flex items-center justify-between gap-2 bg-muted/60 rounded-lg px-3 py-2.5">
                        <div className="min-w-0">
                          <p className="text-xs text-muted-foreground">Account Number</p>
                          <p className="font-mono font-bold text-sm tracking-wide truncate">{method.accountNumber}</p>
                        </div>
                        <Button variant="ghost" size="sm" className="h-8 w-8 p-0 shrink-0" onClick={() => copy(method.accountNumber, `acct-${method.id}`)}>
                          {copied === `acct-${method.id}` ? <Check className="w-3.5 h-3.5 text-emerald-500" /> : <Copy className="w-3.5 h-3.5" />}
                        </Button>
                      </div>
                    )}
                  </>
                )}
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

        {/* Rates Tab */}
        <TabsContent value="rates" className="space-y-4 mt-3">
          <p className="text-xs text-muted-foreground">Live exchange rates — updated every 5 minutes. All rates shown vs USD.</p>

          {/* Calculator */}
          <Card className="border-primary/20 bg-primary/5">
            <CardHeader className="p-4 pb-2">
              <CardTitle className="text-sm font-bold flex items-center gap-2">
                <ArrowLeftRight className="w-4 h-4 text-primary" /> Currency Calculator
              </CardTitle>
            </CardHeader>
            <CardContent className="p-4 pt-0 space-y-3">
              {ratesLoading ? (
                <Skeleton className="h-24" />
              ) : (() => {
                const rateMap: Record<string, number> = {};
                allRates?.forEach(r => { rateMap[r.code] = r.rateToUsd; });
                const currencies = ['USD', ...(allRates?.map(r => r.code).filter(c => c !== 'USD') ?? [])];
                const numAmount = parseFloat(calcAmount) || 0;
                const fromRate = rateMap[calcFrom] ?? 1;
                const toRate = rateMap[calcTo] ?? 1;
                // Convert: amount in FROM → USD → TO
                const fromUsd = calcFrom === 'USD' ? numAmount : numAmount * fromRate;
                const result = calcTo === 'USD' ? fromUsd : fromUsd / toRate;
                return (
                  <div className="space-y-3">
                    <div className="grid grid-cols-2 gap-2">
                      <div className="space-y-1">
                        <label className="text-xs text-muted-foreground">From</label>
                        <select
                          className="w-full text-sm border border-border rounded-lg px-2 py-1.5 bg-background"
                          value={calcFrom}
                          onChange={e => setCalcFrom(e.target.value)}
                        >
                          {currencies.map(c => <option key={c} value={c}>{c}</option>)}
                        </select>
                      </div>
                      <div className="space-y-1">
                        <label className="text-xs text-muted-foreground">To</label>
                        <select
                          className="w-full text-sm border border-border rounded-lg px-2 py-1.5 bg-background"
                          value={calcTo}
                          onChange={e => setCalcTo(e.target.value)}
                        >
                          {currencies.map(c => <option key={c} value={c}>{c}</option>)}
                        </select>
                      </div>
                    </div>
                    <div className="space-y-1">
                      <label className="text-xs text-muted-foreground">Amount in {calcFrom}</label>
                      <Input
                        type="number"
                        min="0"
                        step="any"
                        value={calcAmount}
                        onChange={e => setCalcAmount(e.target.value)}
                        className="font-mono text-base"
                        placeholder="100"
                      />
                    </div>
                    <div className="bg-background border border-border rounded-lg px-4 py-3 text-center">
                      <p className="text-xs text-muted-foreground mb-0.5">{numAmount.toLocaleString('en-US')} {calcFrom} =</p>
                      <p className="text-2xl font-bold font-mono text-primary">
                        {result.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: result >= 1000 ? 0 : 2 })} {calcTo}
                      </p>
                    </div>
                  </div>
                );
              })()}
            </CardContent>
          </Card>

          {/* Rates table */}
          <Card>
            <CardHeader className="p-4 pb-2">
              <CardTitle className="text-sm font-bold flex items-center gap-2">
                <TrendingUp className="w-4 h-4" /> All Exchange Rates
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              {ratesLoading ? (
                <div className="p-4 space-y-2">{[...Array(6)].map((_, i) => <Skeleton key={i} className="h-8" />)}</div>
              ) : (
                <div className="divide-y divide-border">
                  {allRates?.map((r) => {
                    const usdRate = r.rateToUsd > 0 ? (1 / r.rateToUsd) : 0;
                    return (
                      <div key={r.code} className="flex items-center justify-between px-4 py-2.5">
                        <p className="text-sm font-semibold font-mono">{r.code}</p>
                        <div className="text-right">
                          <p className="text-sm font-mono font-semibold">
                            {usdRate >= 1000
                              ? usdRate.toLocaleString('en-US', { maximumFractionDigits: 0 })
                              : usdRate.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 4 })}
                          </p>
                          <p className="text-[10px] text-muted-foreground">per 1 USD</p>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>
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
