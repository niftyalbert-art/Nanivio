import { useState, useRef, useEffect, useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Skeleton } from '@/components/ui/skeleton';
import { CheckCircle2, XCircle, Clock, ArrowDownLeft, ArrowUpRight, MessageSquare, Lock, Plus, Edit2, TrendingUp, Settings2, Link, Eye, EyeOff, Users, ArrowLeftRight, KeyRound, ShieldCheck, ArrowLeft, BadgeCheck, Shield, AlertTriangle, Unlock, Search, ChevronDown, ChevronUp, LogIn, Wallet, Phone, Mail, CalendarDays, RefreshCw, Bitcoin, Copy } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { useToast } from '@/hooks/use-toast';

const API = import.meta.env.BASE_URL.replace(/\/$/, '') + '/api';
const ADMIN_JWT_KEY = 'nanivio_admin_jwt';

function apiFetch(path: string, opts?: RequestInit) {
  const token = sessionStorage.getItem(ADMIN_JWT_KEY);
  return fetch(`${API}${path}`, {
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { 'Authorization': `Bearer ${token}` } : {}),
    },
    ...opts,
  }).then(async r => {
    if (!r.ok) throw new Error(await r.text());
    return r.json();
  });
}

const statusColor = (s: string) => {
  switch (s) {
    case 'approved': case 'sent': return 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20';
    case 'pending': case 'open': return 'bg-amber-500/10 text-amber-500 border-amber-500/20';
    case 'rejected': return 'bg-red-500/10 text-red-500 border-red-500/20';
    default: return 'bg-muted text-muted-foreground';
  }
};

// ── Receipt lightbox ────────────────────────────────────────────────────────
function ReceiptLightbox({ src, onClose }: { src: string; onClose: () => void }) {
  return (
    <div
      className="fixed inset-0 z-50 bg-black/90 flex items-center justify-center p-4"
      onClick={onClose}
    >
      <button
        className="absolute top-4 right-4 text-white/70 hover:text-white bg-black/40 rounded-full w-9 h-9 flex items-center justify-center text-xl"
        onClick={onClose}
      >✕</button>
      <img
        src={src}
        alt="Receipt full view"
        className="max-w-full max-h-full rounded-xl object-contain"
        onClick={e => e.stopPropagation()}
      />
    </div>
  );
}

// ── Deposits Panel ──────────────────────────────────────────────────────────
function DepositsPanel() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const { data: deposits, isLoading } = useQuery({ queryKey: ['admin-deposits'], queryFn: () => apiFetch('/admin/deposits'), refetchInterval: 20000 });
  const [note, setNote] = useState<Record<number, string>>({});
  const [lightbox, setLightbox] = useState<string | null>(null);

  const approve = useMutation({
    mutationFn: ({ id, adminNote }: { id: number; adminNote?: string }) =>
      apiFetch(`/admin/deposits/${id}/approve`, { method: 'PUT', body: JSON.stringify({ adminNote }) }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['admin-deposits'] }); toast({ title: 'Deposit approved ✓', description: 'Wallet has been credited.' }); },
    onError: (e: any) => toast({ title: 'Error', description: e.message, variant: 'destructive' }),
  });
  const reject = useMutation({
    mutationFn: ({ id, adminNote }: { id: number; adminNote?: string }) =>
      apiFetch(`/admin/deposits/${id}/reject`, { method: 'PUT', body: JSON.stringify({ adminNote }) }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['admin-deposits'] }); toast({ title: 'Deposit rejected' }); },
    onError: (e: any) => toast({ title: 'Error', description: e.message, variant: 'destructive' }),
  });

  if (isLoading) return <div className="space-y-3">{[...Array(3)].map((_, i) => <Skeleton key={i} className="h-48" />)}</div>;
  const pending = (deposits as any[] | undefined)?.filter(d => d.status === 'pending') ?? [];
  const done = (deposits as any[] | undefined)?.filter(d => d.status !== 'pending') ?? [];

  return (
    <>
      {lightbox && <ReceiptLightbox src={lightbox} onClose={() => setLightbox(null)} />}

      <div className="space-y-4">
        {pending.length === 0 && (
          <Card><CardContent className="py-10 text-center">
            <CheckCircle2 className="w-8 h-8 mx-auto mb-2 text-emerald-500 opacity-50" />
            <p className="text-sm text-muted-foreground">No pending deposits 🎉</p>
          </CardContent></Card>
        )}

        {pending.map((d: any) => (
          <Card key={d.id} className="border-amber-500/40 shadow-sm">
            <CardContent className="p-4 space-y-3">

              {/* Header — user + status */}
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-center gap-2.5 min-w-0">
                  <div className="w-9 h-9 rounded-full bg-amber-500/15 text-amber-600 font-bold flex items-center justify-center text-sm shrink-0">
                    {(d.userName ?? '?')[0]?.toUpperCase()}
                  </div>
                  <div className="min-w-0">
                    <p className="font-bold text-sm leading-tight truncate">{d.userName ?? 'Unknown User'}</p>
                    <p className="text-[11px] text-muted-foreground truncate">{d.userEmail ?? '—'}</p>
                  </div>
                </div>
                <div className="flex flex-col items-end gap-1 shrink-0">
                  <Badge className={statusColor(d.status)}>{d.status}</Badge>
                  <span className="text-[10px] text-muted-foreground">{formatDistanceToNow(new Date(d.createdAt))} ago</span>
                </div>
              </div>

              {/* Payment method pill */}
              {d.paymentMethodName && (
                <div className="flex items-center gap-1.5 text-xs bg-muted/60 rounded-lg px-2.5 py-1.5 w-fit">
                  <span>{d.paymentMethodEmoji}</span>
                  <span className="font-medium">{d.paymentMethodName}</span>
                </div>
              )}

              {/* Amount + Tx ID */}
              <div className="grid grid-cols-2 gap-2 text-xs">
                <div className="bg-emerald-500/8 border border-emerald-500/20 rounded-lg p-2.5">
                  <p className="text-muted-foreground mb-0.5">Amount</p>
                  <p className="font-bold font-mono text-emerald-600 dark:text-emerald-400 text-sm">{parseFloat(d.amount).toLocaleString()} {d.currencyCode}</p>
                </div>
                <div className="bg-muted/50 rounded-lg p-2.5">
                  <p className="text-muted-foreground mb-0.5">Reference ID</p>
                  <p className="font-mono font-semibold truncate">{d.externalTransactionId}</p>
                </div>
              </div>

              {/* Receipt image — tap to expand */}
              {d.receiptImage ? (
                <div className="space-y-1">
                  <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Payment Receipt</p>
                  <button
                    type="button"
                    onClick={() => setLightbox(d.receiptImage)}
                    className="w-full relative group rounded-xl overflow-hidden border-2 border-primary/20 hover:border-primary/60 transition-colors"
                  >
                    <img
                      src={d.receiptImage}
                      alt="Receipt"
                      className="w-full max-h-52 object-contain bg-muted/40"
                    />
                    <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-colors flex items-center justify-center">
                      <span className="opacity-0 group-hover:opacity-100 transition-opacity bg-black/60 text-white text-xs px-3 py-1.5 rounded-full font-medium">
                        Tap to expand
                      </span>
                    </div>
                  </button>
                </div>
              ) : (
                <div className="border-2 border-dashed border-border rounded-xl p-4 text-center">
                  <p className="text-xs text-muted-foreground">⚠️ No receipt uploaded</p>
                </div>
              )}

              {/* Admin note */}
              <Input
                placeholder="Add a note for your records (optional)"
                value={note[d.id] || ''}
                onChange={e => setNote(n => ({ ...n, [d.id]: e.target.value }))}
                className="text-xs"
              />

              {/* Actions */}
              <div className="flex gap-2 pt-0.5">
                <Button
                  size="sm"
                  className="flex-1 bg-emerald-600 hover:bg-emerald-700 font-semibold"
                  onClick={() => approve.mutate({ id: d.id, adminNote: note[d.id] })}
                  disabled={approve.isPending || reject.isPending}
                >
                  <CheckCircle2 className="w-3.5 h-3.5 mr-1.5" /> Approve & Credit
                </Button>
                <Button
                  size="sm"
                  variant="destructive"
                  className="flex-1 font-semibold"
                  onClick={() => reject.mutate({ id: d.id, adminNote: note[d.id] })}
                  disabled={approve.isPending || reject.isPending}
                >
                  <XCircle className="w-3.5 h-3.5 mr-1.5" /> Reject
                </Button>
              </div>
            </CardContent>
          </Card>
        ))}

        {done.length > 0 && (
          <div className="space-y-2">
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground pt-2">Processed ({done.length})</p>
            {done.map((d: any) => (
              <Card key={d.id} className="opacity-75">
                <CardContent className="p-3">
                  <div className="flex items-center justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5">
                        <p className="text-sm font-semibold">#{d.id} — {parseFloat(d.amount).toLocaleString()} {d.currencyCode}</p>
                        <Badge className={`${statusColor(d.status)} text-[10px] px-1.5 py-0`}>{d.status}</Badge>
                      </div>
                      <p className="text-xs text-muted-foreground truncate">{d.userName ?? '—'} · {d.externalTransactionId}</p>
                      {d.adminNoteInternal && <p className="text-xs text-muted-foreground italic mt-0.5">Note: {d.adminNoteInternal}</p>}
                    </div>
                    {d.receiptImage && (
                      <button onClick={() => setLightbox(d.receiptImage)} className="shrink-0">
                        <img src={d.receiptImage} alt="Receipt" className="w-12 h-12 rounded-lg object-cover border border-border hover:opacity-80 transition-opacity" />
                      </button>
                    )}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    </>
  );
}

// ── Withdrawals Panel ───────────────────────────────────────────────────────
function WithdrawalsPanel() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const fileRef = useState<HTMLInputElement | null>(null);
  const { data: withdrawals, isLoading } = useQuery({ queryKey: ['admin-withdrawals'], queryFn: () => apiFetch('/admin/withdrawals') });
  const [receiptB64, setReceiptB64] = useState<Record<number, string>>({});
  const [adminNote, setAdminNote] = useState<Record<number, string>>({});

  const markSent = useMutation({
    mutationFn: ({ id, receipt, note }: { id: number; receipt?: string; note?: string }) =>
      apiFetch(`/admin/withdrawals/${id}/sent`, { method: 'PUT', body: JSON.stringify({ adminReceiptImage: receipt, adminNote: note }) }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['admin-withdrawals'] }); toast({ title: 'Withdrawal marked as sent ✓' }); },
    onError: (e: any) => toast({ title: 'Error', description: e.message, variant: 'destructive' }),
  });
  const rejectW = useMutation({
    mutationFn: ({ id, note }: { id: number; note?: string }) =>
      apiFetch(`/admin/withdrawals/${id}/reject`, { method: 'PUT', body: JSON.stringify({ adminNote: note }) }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['admin-withdrawals'] }); toast({ title: 'Withdrawal rejected & refunded' }); },
    onError: (e: any) => toast({ title: 'Error', description: e.message, variant: 'destructive' }),
  });

  const handleFile = (id: number, e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = ev => setReceiptB64(r => ({ ...r, [id]: ev.target?.result as string }));
    reader.readAsDataURL(file);
  };

  if (isLoading) return <div className="space-y-3">{[...Array(3)].map((_, i) => <Skeleton key={i} className="h-36" />)}</div>;
  const pending = (withdrawals as any[] | undefined)?.filter(w => w.status === 'pending') ?? [];
  const done = (withdrawals as any[] | undefined)?.filter(w => w.status !== 'pending') ?? [];

  return (
    <div className="space-y-4">
      {pending.length === 0 && <p className="text-sm text-muted-foreground text-center py-6">No pending withdrawals 🎉</p>}
      {pending.map((w: any) => (
        <Card key={w.id} className="border-amber-500/30">
          <CardContent className="p-4 space-y-3">
            <div className="flex items-center justify-between">
              <div><p className="font-bold text-sm">Withdrawal #{w.id}</p>
                <p className="text-xs text-muted-foreground">{formatDistanceToNow(new Date(w.createdAt))} ago</p></div>
              <Badge className={statusColor(w.status)}>{w.status}</Badge>
            </div>
            <div className="grid grid-cols-2 gap-2 text-xs">
              <div className="bg-muted/50 rounded-lg p-2"><p className="text-muted-foreground">Amount</p><p className="font-bold font-mono">{parseFloat(w.amount).toLocaleString()} {w.currencyCode}</p></div>
              <div className="bg-muted/50 rounded-lg p-2"><p className="text-muted-foreground">Country</p><p className="font-semibold">{w.recipientCountry}</p></div>
              <div className="bg-muted/50 rounded-lg p-2 col-span-2">
                <p className="text-muted-foreground mb-1">{w.withdrawalType === 'mobile_money' ? '📱 Mobile Money' : '🏦 Bank Transfer'}</p>
                {w.withdrawalType === 'mobile_money' ? (
                  <p className="font-semibold">{w.mobileNetwork}: <span className="font-mono">{w.mobileNumber}</span></p>
                ) : (
                  <div className="space-y-1 mt-1">
                    <div className="flex justify-between gap-2 text-xs">
                      <span className="text-muted-foreground">Bank Name</span>
                      <span className="font-semibold">{w.bankName || '—'}</span>
                    </div>
                    <div className="flex justify-between gap-2 text-xs">
                      <span className="text-muted-foreground">Account Holder</span>
                      <span className="font-semibold">{w.accountName || '—'}</span>
                    </div>
                    {w.iban && (
                      <div className="flex justify-between gap-2 text-xs">
                        <span className="text-muted-foreground">IBAN</span>
                        <span className="font-mono font-bold">{w.iban}</span>
                      </div>
                    )}
                    {w.accountNumber && (
                      <div className="flex justify-between gap-2 text-xs">
                        <span className="text-muted-foreground">Account Number</span>
                        <span className="font-mono font-bold">{w.accountNumber}</span>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Upload Proof of Payment (optional)</Label>
              <div className="border-2 border-dashed border-border rounded-lg p-3 text-center cursor-pointer hover:border-primary/50 transition-colors relative">
                <input type="file" accept="image/*" className="absolute inset-0 opacity-0 cursor-pointer" onChange={e => handleFile(w.id, e)} />
                {receiptB64[w.id] ? <p className="text-xs text-emerald-500 font-medium">✓ Receipt attached</p> : <p className="text-xs text-muted-foreground">Click to upload receipt</p>}
              </div>
            </div>
            <Input placeholder="Admin note (optional)" value={adminNote[w.id] || ''} onChange={e => setAdminNote(n => ({ ...n, [w.id]: e.target.value }))} className="text-xs" />
            <div className="flex gap-2">
              <Button size="sm" className="flex-1 bg-emerald-600 hover:bg-emerald-700" onClick={() => markSent.mutate({ id: w.id, receipt: receiptB64[w.id], note: adminNote[w.id] })} disabled={markSent.isPending}>
                <CheckCircle2 className="w-3.5 h-3.5 mr-1" /> Mark as Sent
              </Button>
              <Button size="sm" variant="destructive" className="flex-1" onClick={() => rejectW.mutate({ id: w.id, note: adminNote[w.id] })} disabled={rejectW.isPending}>
                <XCircle className="w-3.5 h-3.5 mr-1" /> Reject & Refund
              </Button>
            </div>
          </CardContent>
        </Card>
      ))}
      {done.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Processed</p>
          {done.map((w: any) => (
            <Card key={w.id} className="opacity-70">
              <CardContent className="p-3 flex items-center justify-between gap-3">
                <div><p className="text-sm font-semibold">#{w.id} — {parseFloat(w.amount).toLocaleString()} {w.currencyCode}</p>
                  <p className="text-xs text-muted-foreground">{w.recipientCountry} · {w.withdrawalType}</p></div>
                <Badge className={statusColor(w.status)}>{w.status}</Badge>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Tickets Panel ───────────────────────────────────────────────────────────
function TicketsPanel() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const { data: tickets, isLoading } = useQuery({ queryKey: ['admin-tickets'], queryFn: () => apiFetch('/tickets') });
  const [reply, setReply] = useState<Record<number, string>>({});

  const respond = useMutation({
    mutationFn: ({ id, adminReply }: { id: number; adminReply: string }) =>
      apiFetch(`/admin/tickets/${id}/reply`, { method: 'PUT', body: JSON.stringify({ adminReply }) }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['admin-tickets'] }); toast({ title: 'Reply sent ✓' }); },
    onError: (e: any) => toast({ title: 'Error', description: e.message, variant: 'destructive' }),
  });

  if (isLoading) return <div className="space-y-3">{[...Array(2)].map((_, i) => <Skeleton key={i} className="h-24" />)}</div>;

  return (
    <div className="space-y-4">
      {(!tickets || (tickets as any[]).length === 0) && <p className="text-sm text-muted-foreground text-center py-6">No tickets yet</p>}
      {(tickets as any[] | undefined)?.map((t: any) => (
        <Card key={t.id}>
          <CardContent className="p-4 space-y-3">
            <div className="flex items-center justify-between">
              <div><p className="font-bold text-sm">#{t.id} — {t.subject}</p>
                <p className="text-xs text-muted-foreground">{t.userName} · {formatDistanceToNow(new Date(t.createdAt))} ago</p></div>
              <Badge className={statusColor(t.status)}>{t.status}</Badge>
            </div>
            <p className="text-sm bg-muted/50 rounded-lg p-3">{t.message}</p>
            {t.adminReply && (
              <div className="bg-primary/5 border border-primary/20 rounded-lg p-3">
                <p className="text-xs font-semibold text-primary mb-1">Admin Reply</p>
                <p className="text-sm">{t.adminReply}</p>
              </div>
            )}
            {t.status === 'open' && (
              <div className="space-y-2">
                <Textarea placeholder="Type your reply..." value={reply[t.id] || ''} onChange={e => setReply(r => ({ ...r, [t.id]: e.target.value }))} rows={2} className="text-sm" />
                <Button size="sm" className="w-full" onClick={() => respond.mutate({ id: t.id, adminReply: reply[t.id] || '' })} disabled={!reply[t.id] || respond.isPending}>
                  Send Reply
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

// ── Exchange Rates Panel ────────────────────────────────────────────────────
function RatesPanel() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const { data: rates, isLoading } = useQuery({ queryKey: ['admin-rates'], queryFn: () => apiFetch('/admin/rates') });
  const [editing, setEditing] = useState<Record<string, { rate: string; fee: string }>>({});
  const [saving, setSaving] = useState<string | null>(null);
  const [showAdd, setShowAdd] = useState(false);
  const [newForm, setNewForm] = useState({ currencyCode: '', rateToUsd: '', feePercent: '3' });

  const startEdit = (r: any) => {
    setEditing(e => ({ ...e, [r.currencyCode]: { rate: String(r.rateToUsd), fee: String(r.feePercent) } }));
  };
  const cancelEdit = (code: string) => {
    setEditing(e => { const n = { ...e }; delete n[code]; return n; });
  };

  const saveRate = async (code: string) => {
    const vals = editing[code];
    if (!vals) return;
    setSaving(code);
    try {
      await apiFetch(`/admin/rates/${code}`, { method: 'PUT', body: JSON.stringify({ rateToUsd: vals.rate, feePercent: vals.fee }) });
      qc.invalidateQueries({ queryKey: ['admin-rates'] });
      toast({ title: `${code} updated ✓` });
      cancelEdit(code);
    } catch (e: any) {
      toast({ title: 'Error', description: e.message, variant: 'destructive' });
    }
    setSaving(null);
  };

  const addRate = useMutation({
    mutationFn: () => apiFetch('/admin/rates', { method: 'POST', body: JSON.stringify({ currencyCode: newForm.currencyCode, rateToUsd: newForm.rateToUsd, feePercent: newForm.feePercent }) }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['admin-rates'] }); toast({ title: 'Currency added ✓' }); setShowAdd(false); setNewForm({ currencyCode: '', rateToUsd: '', feePercent: '3' }); },
    onError: (e: any) => toast({ title: 'Error', description: e.message, variant: 'destructive' }),
  });

  return (
    <div className="space-y-4">
      <div className="p-3 bg-blue-500/10 border border-blue-500/20 rounded-lg">
        <p className="text-xs text-blue-600 dark:text-blue-400">
          💡 All rates are relative to USD (1 USD = rate units of that currency). Fee is a percentage charged on the destination amount.
        </p>
      </div>

      <Button size="sm" onClick={() => setShowAdd(true)} className="w-full">
        <Plus className="w-3.5 h-3.5 mr-1" /> Add Currency
      </Button>

      {showAdd && (
        <Card className="border-primary/30">
          <CardContent className="p-4 space-y-3">
            <p className="font-bold text-sm">New Currency Rate</p>
            <div className="grid grid-cols-3 gap-2">
              <div className="space-y-1">
                <Label className="text-xs">Code</Label>
                <Input placeholder="e.g. XAF" value={newForm.currencyCode} onChange={e => setNewForm(f => ({ ...f, currencyCode: e.target.value.toUpperCase() }))} className="text-sm font-mono" />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Rate to USD</Label>
                <Input type="number" placeholder="e.g. 655" value={newForm.rateToUsd} onChange={e => setNewForm(f => ({ ...f, rateToUsd: e.target.value }))} className="text-sm font-mono" />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Fee %</Label>
                <Input type="number" step="0.1" placeholder="3" value={newForm.feePercent} onChange={e => setNewForm(f => ({ ...f, feePercent: e.target.value }))} className="text-sm font-mono" />
              </div>
            </div>
            <div className="flex gap-2">
              <Button size="sm" className="flex-1" onClick={() => addRate.mutate()} disabled={addRate.isPending || !newForm.currencyCode || !newForm.rateToUsd}>Add</Button>
              <Button size="sm" variant="outline" className="flex-1" onClick={() => setShowAdd(false)}>Cancel</Button>
            </div>
          </CardContent>
        </Card>
      )}

      {isLoading ? (
        <div className="space-y-2">{[...Array(5)].map((_, i) => <Skeleton key={i} className="h-14" />)}</div>
      ) : (
        <div className="space-y-2">
          {(rates as any[] | undefined)?.map((r: any) => {
            const isEditing = !!editing[r.currencyCode];
            return (
              <Card key={r.currencyCode}>
                <CardContent className="p-3">
                  {isEditing ? (
                    <div className="space-y-2">
                      <p className="font-bold text-sm font-mono">{r.currencyCode}</p>
                      <div className="grid grid-cols-2 gap-2">
                        <div className="space-y-1">
                          <Label className="text-xs">Rate (1 USD = ? {r.currencyCode})</Label>
                          <Input type="number" step="any" value={editing[r.currencyCode].rate} onChange={e => setEditing(ed => ({ ...ed, [r.currencyCode]: { ...ed[r.currencyCode], rate: e.target.value } }))} className="text-sm font-mono" />
                        </div>
                        <div className="space-y-1">
                          <Label className="text-xs">Fee %</Label>
                          <Input type="number" step="0.1" value={editing[r.currencyCode].fee} onChange={e => setEditing(ed => ({ ...ed, [r.currencyCode]: { ...ed[r.currencyCode], fee: e.target.value } }))} className="text-sm font-mono" />
                        </div>
                      </div>
                      <div className="flex gap-2">
                        <Button size="sm" className="flex-1 bg-emerald-600 hover:bg-emerald-700" onClick={() => saveRate(r.currencyCode)} disabled={saving === r.currencyCode}>
                          {saving === r.currencyCode ? 'Saving…' : 'Save'}
                        </Button>
                        <Button size="sm" variant="outline" className="flex-1" onClick={() => cancelEdit(r.currencyCode)}>Cancel</Button>
                      </div>
                    </div>
                  ) : (
                    <div className="flex items-center gap-3">
                      <p className="font-bold text-sm font-mono w-12 shrink-0">{r.currencyCode}</p>
                      <div className="flex-1 text-xs text-muted-foreground">
                        <span className="font-mono text-foreground">{r.rateToUsd.toLocaleString()}</span> per USD · <span className="font-mono text-foreground">{r.feePercent}%</span> fee
                      </div>
                      <Button size="sm" variant="ghost" className="h-7 w-7 p-0 shrink-0" onClick={() => startEdit(r)}>
                        <Edit2 className="w-3.5 h-3.5" />
                      </Button>
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ── Users Panel ─────────────────────────────────────────────────────────────
// ── UserDetailPanel: full user detail loaded on demand ───────────────────────
function UserDetailPanel({ userId, adminToken }: { userId: number; adminToken: string }) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [detailTab, setDetailTab] = useState('wallets');
  const [pinInput, setPinInput] = useState('');
  const [showPinForm, setShowPinForm] = useState(false);
  const [pinRevealed, setPinRevealed] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ['admin-user-detail', userId],
    queryFn: () => apiFetch(`/admin/users/${userId}`),
    staleTime: 30000,
  });

  const impersonate = useMutation({
    mutationFn: () => apiFetch(`/admin/users/${userId}/impersonate`, { method: 'POST' }),
    onSuccess: (res: any) => {
      // Store the user token and open app in a new tab — admin session stays intact
      const tab = window.open('about:blank', '_blank');
      if (tab) {
        tab.localStorage?.setItem('nanivio_token', res.token);
        // Write a script that sets localStorage before navigating
        tab.document.write(`<script>
          localStorage.setItem('nanivio_token', ${JSON.stringify(res.token)});
          window.location.href = '/';
        </script>`);
        tab.document.close();
      } else {
        // Fallback: copy token and instruct admin
        navigator.clipboard?.writeText(res.token).catch(() => {});
        toast({ title: `Login token for ${res.user?.name} copied to clipboard — paste it as the auth token in a new tab.` });
      }
    },
    onError: (e: any) => toast({ title: 'Error', description: e.message, variant: 'destructive' }),
  });

  const resetPin = useMutation({
    mutationFn: () => apiFetch(`/admin/users/${userId}/reset-pin`, { method: 'PUT', body: JSON.stringify({ pin: pinInput }) }),
    onSuccess: () => {
      toast({ title: '✅ PIN reset successfully' });
      setPinInput('');
      setShowPinForm(false);
      qc.invalidateQueries({ queryKey: ['admin-users'] });
      qc.invalidateQueries({ queryKey: ['admin-user-detail', userId] });
    },
    onError: (e: any) => toast({ title: 'Error', description: e.message, variant: 'destructive' }),
  });

  if (isLoading) return (
    <div className="p-4 space-y-3">
      <Skeleton className="h-4 w-32" />
      <Skeleton className="h-4 w-48" />
      <Skeleton className="h-20 w-full" />
    </div>
  );

  const { profile, wallets, deposits, sends, withdrawals } = (data as any) ?? {};
  if (!profile) return null;

  const kycColor = profile.kycStatus === 'verified' ? 'text-green-600' : profile.kycStatus === 'pending' ? 'text-amber-500' : profile.kycStatus === 'rejected' ? 'text-red-500' : 'text-muted-foreground';
  const kycIcon = profile.kycStatus === 'verified' ? <BadgeCheck className="w-3.5 h-3.5" /> : profile.kycStatus === 'pending' ? <Clock className="w-3.5 h-3.5" /> : profile.kycStatus === 'rejected' ? <XCircle className="w-3.5 h-3.5" /> : <Shield className="w-3.5 h-3.5" />;

  const totalUsd = (wallets as any[] ?? []).reduce((sum: number, w: any) => sum + (w.balance ?? 0), 0);

  return (
    <div className="border-t border-border bg-muted/20">
      {/* ── Profile info row ── */}
      <div className="p-4 space-y-3">
        <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-xs">
          <div className="flex items-center gap-1.5 text-muted-foreground"><Mail className="w-3 h-3 shrink-0" /><span className="truncate">{profile.email}</span></div>
          <div className="flex items-center gap-1.5 text-muted-foreground"><Phone className="w-3 h-3 shrink-0" /><span>{profile.phone ?? 'No phone'}</span></div>
          <div className={`flex items-center gap-1.5 ${kycColor}`}>{kycIcon}<span className="capitalize">KYC: {profile.kycStatus}</span></div>
          <div className="flex items-center gap-1.5 text-muted-foreground">
            {profile.emailVerified ? <CheckCircle2 className="w-3 h-3 text-green-600 shrink-0" /> : <XCircle className="w-3 h-3 text-red-500 shrink-0" />}
            <span>{profile.emailVerified ? 'Email verified' : 'Email not verified'}</span>
          </div>
          <div className="flex items-center gap-1.5 text-muted-foreground"><CalendarDays className="w-3 h-3 shrink-0" /><span>Joined {new Date(profile.createdAt).toLocaleDateString()}</span></div>
          {profile.sendLockedUntil && new Date(profile.sendLockedUntil) > new Date() && (
            <div className="flex items-center gap-1.5 text-red-500"><Lock className="w-3 h-3 shrink-0" /><span>Locked until {new Date(profile.sendLockedUntil).toLocaleString()}</span></div>
          )}
        </div>

        {/* PIN + actions row */}
        <div className="flex flex-wrap items-center gap-2 pt-1 border-t border-border">
          {/* PIN reveal */}
          <div className="flex items-center gap-1.5 bg-background border border-border rounded-lg px-2.5 py-1.5">
            <KeyRound className="w-3.5 h-3.5 text-muted-foreground" />
            <span className="text-xs text-muted-foreground mr-1">PIN:</span>
            <span className="font-mono font-bold text-sm tracking-widest">
              {pinRevealed ? (profile.plainPin ?? '????') : '••••'}
            </span>
            <button onClick={() => setPinRevealed(v => !v)} className="text-muted-foreground hover:text-foreground ml-1">
              {pinRevealed ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
            </button>
          </div>

          {/* Reset PIN */}
          {showPinForm ? (
            <div className="flex items-center gap-1.5">
              <input
                type="text"
                inputMode="numeric"
                pattern="\d{4}"
                maxLength={4}
                placeholder="New PIN"
                value={pinInput}
                onChange={e => setPinInput(e.target.value.replace(/\D/g, '').slice(0, 4))}
                className="w-20 h-8 text-center font-mono border border-border rounded-lg text-sm bg-background"
              />
              <Button size="sm" className="h-8 text-xs" disabled={pinInput.length !== 4 || resetPin.isPending} onClick={() => resetPin.mutate()}>
                {resetPin.isPending ? <RefreshCw className="w-3 h-3 animate-spin" /> : 'Save'}
              </Button>
              <Button size="sm" variant="ghost" className="h-8 text-xs" onClick={() => { setShowPinForm(false); setPinInput(''); }}>Cancel</Button>
            </div>
          ) : (
            <Button size="sm" variant="outline" className="h-8 text-xs gap-1.5" onClick={() => setShowPinForm(true)}>
              <KeyRound className="w-3 h-3" /> Reset PIN
            </Button>
          )}

          {/* Login as user */}
          <Button
            size="sm"
            variant="outline"
            className="h-8 text-xs gap-1.5 border-amber-400/50 text-amber-600 hover:bg-amber-50"
            onClick={() => impersonate.mutate()}
            disabled={impersonate.isPending}
          >
            {impersonate.isPending ? <RefreshCw className="w-3 h-3 animate-spin" /> : <LogIn className="w-3 h-3" />}
            Login as User
          </Button>
        </div>
      </div>

      {/* ── Wallets + Transactions tabs ── */}
      <div className="px-4 pb-4">
        <Tabs value={detailTab} onValueChange={setDetailTab}>
          <TabsList className="h-8 text-xs">
            <TabsTrigger value="wallets" className="text-xs h-7 gap-1">
              <Wallet className="w-3 h-3" /> Wallets
            </TabsTrigger>
            <TabsTrigger value="deposits" className="text-xs h-7 gap-1">
              <ArrowDownLeft className="w-3 h-3" /> Deposits ({(deposits as any[])?.length ?? 0})
            </TabsTrigger>
            <TabsTrigger value="sends" className="text-xs h-7 gap-1">
              <ArrowLeftRight className="w-3 h-3" /> Sends ({(sends as any[])?.length ?? 0})
            </TabsTrigger>
            <TabsTrigger value="withdrawals" className="text-xs h-7 gap-1">
              <ArrowUpRight className="w-3 h-3" /> Withdrawals ({(withdrawals as any[])?.length ?? 0})
            </TabsTrigger>
          </TabsList>

          {/* Wallets */}
          <TabsContent value="wallets" className="mt-3">
            {(wallets as any[] ?? []).length === 0 ? (
              <p className="text-xs text-muted-foreground text-center py-4">No wallets</p>
            ) : (
              <div className="space-y-1.5">
                {(wallets as any[]).map((w: any) => (
                  <div key={w.id} className="flex items-center justify-between bg-background border border-border rounded-lg px-3 py-2">
                    <div className="flex items-center gap-2">
                      <span className="text-lg">{w.flag}</span>
                      <div>
                        <p className="text-xs font-semibold">{w.currencyCode}</p>
                        <p className="text-[10px] text-muted-foreground">{w.currencyName}</p>
                      </div>
                    </div>
                    <span className="font-mono font-bold text-sm">{w.balance.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                  </div>
                ))}
                <div className="flex justify-between items-center px-3 py-2 rounded-lg bg-primary/5 border border-primary/20 mt-2">
                  <span className="text-xs font-semibold text-primary">Total balance (USD equivalent)</span>
                  <span className="font-mono font-bold text-sm text-primary">${totalUsd.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                </div>
              </div>
            )}
          </TabsContent>

          {/* Deposits */}
          <TabsContent value="deposits" className="mt-3">
            {(deposits as any[] ?? []).length === 0 ? (
              <p className="text-xs text-muted-foreground text-center py-4">No deposits</p>
            ) : (
              <div className="space-y-1.5 max-h-64 overflow-y-auto">
                {(deposits as any[]).map((d: any) => (
                  <div key={d.id} className="flex items-center justify-between bg-background border border-border rounded-lg px-3 py-2 gap-2">
                    <div className="min-w-0">
                      <p className="text-xs font-semibold truncate">{d.paymentMethodName ?? 'Unknown method'}</p>
                      <p className="text-[10px] text-muted-foreground">{new Date(d.createdAt).toLocaleString()}</p>
                      {d.externalTransactionId && <p className="text-[10px] text-muted-foreground font-mono truncate">Ref: {d.externalTransactionId}</p>}
                    </div>
                    <div className="text-right shrink-0">
                      <p className="font-mono font-bold text-sm text-green-600">+{d.amount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} {d.currencyCode}</p>
                      <Badge variant="outline" className={`text-[10px] px-1 py-0 ${d.status === 'completed' ? 'text-green-600 border-green-600/30' : d.status === 'pending' ? 'text-amber-500 border-amber-500/30' : 'text-red-500 border-red-500/30'}`}>{d.status}</Badge>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </TabsContent>

          {/* Sends */}
          <TabsContent value="sends" className="mt-3">
            {(sends as any[] ?? []).length === 0 ? (
              <p className="text-xs text-muted-foreground text-center py-4">No sends</p>
            ) : (
              <div className="space-y-1.5 max-h-64 overflow-y-auto">
                {(sends as any[]).map((s: any) => (
                  <div key={s.id} className="flex items-center justify-between bg-background border border-border rounded-lg px-3 py-2 gap-2">
                    <div className="min-w-0">
                      <p className="text-xs font-semibold truncate">{s.recipientName ?? 'Recipient'}</p>
                      <p className="text-[10px] text-muted-foreground">{new Date(s.createdAt).toLocaleString()}</p>
                      <p className="text-[10px] text-muted-foreground">{s.fromCurrency} → {s.toCurrency} · Fee: {s.fee?.toLocaleString('en-US', { minimumFractionDigits: 2 })} {s.fromCurrency}</p>
                    </div>
                    <div className="text-right shrink-0">
                      <p className="font-mono font-bold text-sm text-red-500">-{s.fromAmount?.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} {s.fromCurrency}</p>
                      <p className="font-mono text-xs text-muted-foreground">→ {s.toAmount?.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} {s.toCurrency}</p>
                      <Badge variant="outline" className={`text-[10px] px-1 py-0 ${s.status === 'completed' ? 'text-green-600 border-green-600/30' : s.status === 'pending' ? 'text-amber-500 border-amber-500/30' : 'text-red-500 border-red-500/30'}`}>{s.status}</Badge>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </TabsContent>

          {/* Withdrawals */}
          <TabsContent value="withdrawals" className="mt-3">
            {(withdrawals as any[] ?? []).length === 0 ? (
              <p className="text-xs text-muted-foreground text-center py-4">No withdrawals</p>
            ) : (
              <div className="space-y-1.5 max-h-64 overflow-y-auto">
                {(withdrawals as any[]).map((w: any) => (
                  <div key={w.id} className="flex items-start justify-between bg-background border border-border rounded-lg px-3 py-2 gap-2">
                    <div className="min-w-0">
                      <p className="text-xs font-semibold truncate capitalize">{w.method?.replace('_', ' ') ?? 'Withdrawal'} · {w.recipientName ?? ''}</p>
                      <p className="text-[10px] text-muted-foreground">{new Date(w.createdAt).toLocaleString()}</p>
                      {w.iban && <p className="text-[10px] text-muted-foreground font-mono">IBAN: {w.iban}</p>}
                      {w.accountNumber && <p className="text-[10px] text-muted-foreground font-mono">Acct: {w.accountNumber}</p>}
                      {w.mobileNumber && <p className="text-[10px] text-muted-foreground font-mono">Mobile: {w.mobileNumber}</p>}
                    </div>
                    <div className="text-right shrink-0">
                      <p className="font-mono font-bold text-sm text-red-500">-{(typeof w.amount === 'number' ? w.amount : parseFloat(w.amount)).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} {w.currencyCode}</p>
                      <Badge variant="outline" className={`text-[10px] px-1 py-0 ${w.status === 'completed' ? 'text-green-600 border-green-600/30' : w.status === 'pending' ? 'text-amber-500 border-amber-500/30' : 'text-red-500 border-red-500/30'}`}>{w.status}</Badge>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}

function UsersPanel() {
  const { data: users, isLoading } = useQuery({
    queryKey: ['admin-users'],
    queryFn: () => apiFetch('/admin/users'),
    refetchInterval: 30000,
  });
  const [expanded, setExpanded] = useState<number | null>(null);
  const [search, setSearch] = useState('');

  const toggle = (id: number) => setExpanded(prev => prev === id ? null : id);

  if (isLoading) return <div className="space-y-2">{[...Array(4)].map((_, i) => <Skeleton key={i} className="h-16" />)}</div>;

  const list = (users as any[] | undefined) ?? [];
  const filtered = list.filter((u: any) =>
    u.name.toLowerCase().includes(search.toLowerCase()) ||
    u.email.toLowerCase().includes(search.toLowerCase()) ||
    (u.phone ?? '').includes(search)
  );

  const kycBadgeClass = (status: string) => status === 'verified' ? 'bg-green-100 text-green-700 border-green-300' : status === 'pending' ? 'bg-amber-100 text-amber-700 border-amber-300' : status === 'rejected' ? 'bg-red-100 text-red-700 border-red-300' : 'bg-muted text-muted-foreground';

  return (
    <div className="space-y-3">
      {/* Header stats + search */}
      <div className="flex items-center gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
          <Input placeholder="Search name, email or phone…" value={search} onChange={e => setSearch(e.target.value)} className="pl-8 h-8 text-xs" />
        </div>
        <p className="text-xs text-muted-foreground shrink-0">{filtered.length} / {list.length} user{list.length !== 1 ? 's' : ''}</p>
      </div>

      {filtered.length === 0 && <p className="text-sm text-muted-foreground text-center py-8">No users found</p>}

      {filtered.map((u: any) => {
        const isOpen = expanded === u.id;
        const locked = u.sendLockedUntil && new Date(u.sendLockedUntil) > new Date();
        return (
          <div key={u.id} className="rounded-xl border border-border overflow-hidden">
            {/* Row: click to expand */}
            <button
              type="button"
              className={`w-full text-left transition-colors ${isOpen ? 'bg-primary/5' : 'bg-card hover:bg-muted/30'}`}
              onClick={() => toggle(u.id)}
            >
              <div className="flex items-center gap-3 p-3">
                <div className="w-9 h-9 rounded-full bg-primary/20 text-primary font-bold flex items-center justify-center text-sm shrink-0">
                  {u.name[0]?.toUpperCase()}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="font-semibold text-sm truncate">{u.name}</p>
                    <Badge variant="outline" className={`text-[10px] px-1.5 py-0 border capitalize ${kycBadgeClass(u.kycStatus)}`}>{u.kycStatus}</Badge>
                    {locked && <Badge variant="outline" className="text-[10px] px-1.5 py-0 bg-red-100 text-red-700 border-red-300"><Lock className="w-2.5 h-2.5 mr-0.5" />Locked</Badge>}
                  </div>
                  <p className="text-xs text-muted-foreground truncate">{u.email}</p>
                  {u.phone && <p className="text-xs text-muted-foreground">{u.phone}</p>}
                </div>
                <div className="shrink-0">
                  {isOpen ? <ChevronUp className="w-4 h-4 text-primary" /> : <ChevronDown className="w-4 h-4 text-muted-foreground" />}
                </div>
              </div>
            </button>

            {/* Expanded detail */}
            {isOpen && <UserDetailPanel userId={u.id} adminToken={sessionStorage.getItem(ADMIN_JWT_KEY) ?? ''} />}
          </div>
        );
      })}
    </div>
  );
}

// ── Sends Panel (international money transfers) ──────────────────────────────
function SendsPanel() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [adminNote, setAdminNote] = useState<Record<number, string>>({});

  const { data: txns, isLoading } = useQuery({
    queryKey: ['admin-transactions'],
    queryFn: () => apiFetch('/admin/transactions'),
    refetchInterval: 15000,
  });

  const approve = useMutation({
    mutationFn: ({ id }: { id: number }) =>
      apiFetch(`/admin/transactions/${id}/approve`, { method: 'PUT', body: JSON.stringify({}) }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin-transactions'] });
      toast({ title: '✅ Send approved — funds released to recipient' });
    },
    onError: (e: any) => toast({ title: 'Error', description: e.message, variant: 'destructive' }),
  });

  const reject = useMutation({
    mutationFn: ({ id }: { id: number }) =>
      apiFetch(`/admin/transactions/${id}/reject`, { method: 'PUT', body: JSON.stringify({}) }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin-transactions'] });
      toast({ title: '↩️ Send rejected — wallet refunded' });
    },
    onError: (e: any) => toast({ title: 'Error', description: e.message, variant: 'destructive' }),
  });

  if (isLoading) return <div className="space-y-3">{[...Array(3)].map((_, i) => <Skeleton key={i} className="h-44" />)}</div>;

  const list = (txns as any[] | undefined) ?? [];
  const pending = list.filter((t: any) => t.status === 'pending');
  const done = list.filter((t: any) => t.status !== 'pending');

  return (
    <div className="space-y-4">
      {pending.length === 0 && (
        <Card><CardContent className="py-10 text-center">
          <CheckCircle2 className="w-8 h-8 mx-auto mb-2 text-emerald-500 opacity-50" />
          <p className="text-sm text-muted-foreground">No pending sends 🎉</p>
        </CardContent></Card>
      )}

      {pending.map((tx: any) => (
        <Card key={tx.id} className="border-amber-500/40 shadow-sm">
          <CardContent className="p-4 space-y-3">
            {/* Header — user + status */}
            <div className="flex items-start justify-between gap-2">
              <div className="flex items-center gap-2.5 min-w-0">
                <div className="w-9 h-9 rounded-full bg-primary/20 text-primary font-bold flex items-center justify-center text-sm shrink-0">
                  {(tx.userName ?? '?')[0]?.toUpperCase()}
                </div>
                <div className="min-w-0">
                  <p className="font-bold text-sm leading-tight truncate">{tx.userName ?? 'Unknown User'}</p>
                  <p className="text-[11px] text-muted-foreground truncate">{tx.userEmail ?? '—'}</p>
                </div>
              </div>
              <div className="flex flex-col items-end gap-1 shrink-0">
                <Badge className={statusColor(tx.status)}>{tx.status}</Badge>
                <span className="text-[10px] text-muted-foreground">{formatDistanceToNow(new Date(tx.createdAt))} ago</span>
              </div>
            </div>

            {/* Send details */}
            <div className="grid grid-cols-2 gap-2 text-xs">
              <div className="bg-primary/8 border border-primary/20 rounded-lg p-2.5">
                <p className="text-muted-foreground mb-0.5">Sending</p>
                <p className="font-bold font-mono text-base">{tx.fromAmount.toLocaleString('en-US', { minimumFractionDigits: 2 })} {tx.fromCurrency}</p>
              </div>
              <div className="bg-emerald-500/8 border border-emerald-500/20 rounded-lg p-2.5">
                <p className="text-muted-foreground mb-0.5">Recipient Gets ≈</p>
                <p className="font-bold font-mono text-base text-emerald-600 dark:text-emerald-400">{tx.toAmount.toLocaleString('en-US', { minimumFractionDigits: 2 })} {tx.toCurrency}</p>
              </div>
              <div className="bg-muted/50 rounded-lg p-2.5">
                <p className="text-muted-foreground mb-0.5">Recipient</p>
                <p className="font-semibold">{tx.recipientFlag} {tx.recipientName}</p>
                <p className="text-muted-foreground">{tx.recipientCountry}</p>
              </div>
              <div className="bg-muted/50 rounded-lg p-2.5">
                <p className="text-muted-foreground mb-0.5">Fee / Rate</p>
                <p className="font-mono">{tx.fee > 0 ? `${tx.fee} ${tx.fromCurrency}` : 'No fee'}</p>
                <p className="text-muted-foreground text-[10px] mt-0.5">1 {tx.fromCurrency} ≈ {(tx.toAmount / tx.fromAmount).toFixed(4)} {tx.toCurrency}</p>
              </div>
            </div>

            {tx.note && (
              <div className="bg-muted/40 rounded-lg px-3 py-2 text-xs">
                <span className="text-muted-foreground font-medium">Note: </span>{tx.note}
              </div>
            )}

            <Input
              placeholder="Admin note (optional — for records)"
              value={adminNote[tx.id] || ''}
              onChange={e => setAdminNote(n => ({ ...n, [tx.id]: e.target.value }))}
              className="text-xs"
            />

            <div className="flex gap-2 pt-0.5">
              <Button
                size="sm"
                className="flex-1 bg-emerald-600 hover:bg-emerald-700 font-semibold"
                onClick={() => approve.mutate({ id: tx.id })}
                disabled={approve.isPending || reject.isPending}
              >
                <CheckCircle2 className="w-3.5 h-3.5 mr-1.5" /> Approve Send
              </Button>
              <Button
                size="sm"
                variant="destructive"
                className="flex-1 font-semibold"
                onClick={() => reject.mutate({ id: tx.id })}
                disabled={approve.isPending || reject.isPending}
              >
                <XCircle className="w-3.5 h-3.5 mr-1.5" /> Reject & Refund
              </Button>
            </div>
          </CardContent>
        </Card>
      ))}

      {done.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground pt-2">Processed ({done.length})</p>
          {done.map((tx: any) => (
            <Card key={tx.id} className="opacity-75">
              <CardContent className="p-3">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-full bg-muted flex items-center justify-center text-base shrink-0">{tx.recipientFlag}</div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5">
                      <p className="text-sm font-semibold truncate">{tx.recipientName} ({tx.recipientCountry})</p>
                      <Badge className={`${statusColor(tx.status)} text-[10px] px-1.5 py-0 shrink-0`}>{tx.status}</Badge>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {tx.fromAmount.toLocaleString()} {tx.fromCurrency} → {tx.toAmount.toLocaleString()} {tx.toCurrency}
                      {tx.userName ? ` · by ${tx.userName}` : ''}
                    </p>
                  </div>
                  <p className="text-[10px] text-muted-foreground shrink-0">{formatDistanceToNow(new Date(tx.createdAt))} ago</p>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Settings Panel ──────────────────────────────────────────────────────────
function SettingsPanel() {
  const { toast } = useToast();

  // ── ALL hooks must come before any early return ──────────────────────────
  const { data: settings, isLoading, refetch } = useQuery({
    queryKey: ['admin-settings'],
    queryFn: () => apiFetch('/admin/settings'),
  });

  const { data: pendingResets, isLoading: resetsLoading } = useQuery({
    queryKey: ['admin-pending-resets'],
    queryFn: () => apiFetch('/admin/pending-resets'),
    refetchInterval: 30000,
  });

  const [form, setForm] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState<string | null>(null);

  const s = settings as Record<string, string> | undefined;
  const val = (key: string) => form[key] !== undefined ? form[key] : (s?.[key] ?? '');
  const set = (key: string, v: string) => setForm(f => ({ ...f, [key]: v }));

  const save = async (key: string) => {
    setSaving(key);
    try {
      await apiFetch(`/admin/settings/${key}`, { method: 'PUT', body: JSON.stringify({ value: form[key] ?? s?.[key] ?? '' }) });
      await refetch();
      toast({ title: 'Saved ✓' });
    } catch (e: any) {
      toast({ title: 'Error', description: e.message, variant: 'destructive' });
    }
    setSaving(null);
  };

  // Save fee mode + value together
  const saveFee = async () => {
    setSaving('fee');
    try {
      const mode = val('fee_mode') || 'percent';
      await apiFetch('/admin/settings/fee_mode', { method: 'PUT', body: JSON.stringify({ value: mode }) });
      if (mode === 'percent') {
        await apiFetch('/admin/settings/send_fee_percent', { method: 'PUT', body: JSON.stringify({ value: val('send_fee_percent') }) });
      } else {
        await apiFetch('/admin/settings/send_fee_fixed', { method: 'PUT', body: JSON.stringify({ value: val('send_fee_fixed') }) });
      }
      await refetch();
      toast({ title: 'Fee settings saved ✓' });
    } catch (e: any) {
      toast({ title: 'Error', description: e.message, variant: 'destructive' });
    }
    setSaving(null);
  };

  // ── Now safe to early-return ─────────────────────────────────────────────
  if (isLoading) return <div className="space-y-3">{[...Array(4)].map((_, i) => <Skeleton key={i} className="h-20" />)}</div>;

  const feeMode = val('fee_mode') || 'percent';

  return (
    <div className="space-y-5">

      {/* Pending PIN Resets */}
      <Card>
        <CardHeader className="p-4 pb-2">
          <CardTitle className="text-sm font-bold flex items-center gap-2">
            🔑 Pending PIN Resets
            {(pendingResets as any[] | undefined)?.length ? (
              <span className="ml-auto bg-amber-500 text-white text-[9px] rounded-full px-1.5 py-0.5">
                {(pendingResets as any[]).length}
              </span>
            ) : null}
          </CardTitle>
          <CardDescription className="text-xs">Users who requested a reset code. Relay the OTP to them manually until email is configured.</CardDescription>
        </CardHeader>
        <CardContent className="p-4 pt-0">
          {resetsLoading ? <Skeleton className="h-12" /> : !(pendingResets as any[])?.length ? (
            <p className="text-xs text-muted-foreground py-2">No pending resets 🎉</p>
          ) : (
            <div className="space-y-2">
              {(pendingResets as any[]).map((r: any) => (
                <div key={r.id} className="flex items-center gap-2 p-2 bg-amber-500/5 border border-amber-500/20 rounded-lg">
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-medium truncate">{r.name} <span className="text-muted-foreground font-normal">— {r.email}</span></p>
                    <p className="text-xs text-muted-foreground">Expires: {new Date(r.expiresAt).toLocaleTimeString()}</p>
                  </div>
                  <div className="font-mono font-bold text-lg text-amber-500 shrink-0">{r.otp}</div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Transfer Fee */}
      <Card>
        <CardHeader className="p-4 pb-2">
          <CardTitle className="text-sm font-bold flex items-center gap-2">
            <TrendingUp className="w-4 h-4 text-primary" /> Transfer Fee
          </CardTitle>
          <CardDescription className="text-xs">
            Choose one fee type. Only the active mode is charged to users.
          </CardDescription>
        </CardHeader>
        <CardContent className="p-4 pt-0 space-y-4">

          {/* Mode toggle */}
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => set('fee_mode', 'percent')}
              className={[
                'rounded-xl border-2 p-3 text-left transition-all',
                feeMode === 'percent'
                  ? 'border-primary bg-primary/10'
                  : 'border-border bg-card hover:border-primary/40',
              ].join(' ')}
            >
              <p className={`text-xs font-bold ${feeMode === 'percent' ? 'text-primary' : 'text-foreground'}`}>
                % Percentage Fee
              </p>
              <p className="text-[11px] text-muted-foreground mt-0.5">Charged as % of send amount</p>
              {feeMode === 'percent' && (
                <span className="mt-1.5 inline-block text-[10px] bg-primary text-primary-foreground px-1.5 py-0.5 rounded-full font-semibold">ACTIVE</span>
              )}
            </button>
            <button
              type="button"
              onClick={() => set('fee_mode', 'fixed')}
              className={[
                'rounded-xl border-2 p-3 text-left transition-all',
                feeMode === 'fixed'
                  ? 'border-primary bg-primary/10'
                  : 'border-border bg-card hover:border-primary/40',
              ].join(' ')}
            >
              <p className={`text-xs font-bold ${feeMode === 'fixed' ? 'text-primary' : 'text-foreground'}`}>
                Fixed Fee
              </p>
              <p className="text-[11px] text-muted-foreground mt-0.5">Flat amount per transfer</p>
              {feeMode === 'fixed' && (
                <span className="mt-1.5 inline-block text-[10px] bg-primary text-primary-foreground px-1.5 py-0.5 rounded-full font-semibold">ACTIVE</span>
              )}
            </button>
          </div>

          {/* Percent input */}
          {feeMode === 'percent' && (
            <div className="space-y-1.5">
              <Label className="text-xs">Fee Percentage (%)</Label>
              <Input
                type="number"
                step="0.1"
                min="0"
                max="100"
                placeholder="e.g. 3  (blank = use per-currency fee from Rates tab)"
                value={val('send_fee_percent')}
                onChange={e => set('send_fee_percent', e.target.value)}
                className="font-mono text-sm"
              />
              <p className="text-[11px] text-muted-foreground">
                Leave blank to fall back to each currency's own fee set in the Rates tab.
              </p>
            </div>
          )}

          {/* Fixed input */}
          {feeMode === 'fixed' && (
            <div className="space-y-1.5">
              <Label className="text-xs">Fixed Fee Amount (source currency units)</Label>
              <div className="relative">
                <Input
                  type="number"
                  step="0.01"
                  min="0"
                  placeholder="e.g. 5"
                  value={val('send_fee_fixed')}
                  onChange={e => set('send_fee_fixed', e.target.value)}
                  className="font-mono text-sm pr-16"
                />
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground font-mono">
                  src currency
                </span>
              </div>
              <p className="text-[11px] text-muted-foreground">
                Deducted from the user's wallet in the currency they are sending from.
              </p>
            </div>
          )}

          <Button
            size="sm"
            className="w-full"
            onClick={saveFee}
            disabled={saving === 'fee'}
          >
            {saving === 'fee' ? 'Saving…' : 'Save Fee Settings'}
          </Button>

          {/* Active fee summary */}
          {feeMode === 'percent' && val('send_fee_percent') !== '' && (
            <p className="text-xs text-amber-500 flex items-center gap-1">
              ⚠️ Percentage fee active: <span className="font-mono font-bold">{val('send_fee_percent')}%</span> of send amount
            </p>
          )}
          {feeMode === 'percent' && val('send_fee_percent') === '' && (
            <p className="text-xs text-muted-foreground">Using per-currency fee from Rates tab.</p>
          )}
          {feeMode === 'fixed' && val('send_fee_fixed') !== '' && (
            <p className="text-xs text-amber-500 flex items-center gap-1">
              ⚠️ Fixed fee active: <span className="font-mono font-bold">{val('send_fee_fixed')}</span> per transfer
            </p>
          )}
        </CardContent>
      </Card>

      {/* Support Links */}
      <Card>
        <CardHeader className="p-4 pb-2">
          <CardTitle className="text-sm font-bold flex items-center gap-2">
            <Link className="w-4 h-4 text-primary" /> Customer Support Links
          </CardTitle>
          <CardDescription className="text-xs">These links appear on the user's Account → Support page.</CardDescription>
        </CardHeader>
        <CardContent className="p-4 pt-0 space-y-3">
          {/* WhatsApp */}
          <div className="space-y-1">
            <Label className="text-xs flex items-center gap-1">💬 WhatsApp Link</Label>
            <div className="flex gap-2">
              <Input
                placeholder="https://wa.me/971XXXXXXXXX"
                value={val('whatsapp_link')}
                onChange={e => set('whatsapp_link', e.target.value)}
                className="text-sm flex-1"
              />
              <Button size="sm" className="shrink-0" onClick={() => save('whatsapp_link')} disabled={saving === 'whatsapp_link'}>
                {saving === 'whatsapp_link' ? '…' : 'Save'}
              </Button>
            </div>
          </div>
          {/* Telegram */}
          <div className="space-y-1">
            <Label className="text-xs flex items-center gap-1">✈️ Telegram Link</Label>
            <div className="flex gap-2">
              <Input
                placeholder="https://t.me/yourusername"
                value={val('telegram_link')}
                onChange={e => set('telegram_link', e.target.value)}
                className="text-sm flex-1"
              />
              <Button size="sm" className="shrink-0" onClick={() => save('telegram_link')} disabled={saving === 'telegram_link'}>
                {saving === 'telegram_link' ? '…' : 'Save'}
              </Button>
            </div>
          </div>
          {/* Support Hours */}
          <div className="space-y-1">
            <Label className="text-xs">🕐 Support Hours Text</Label>
            <div className="flex gap-2">
              <Input
                placeholder="Available 8am–10pm UAE time..."
                value={val('support_hours')}
                onChange={e => set('support_hours', e.target.value)}
                className="text-sm flex-1"
              />
              <Button size="sm" className="shrink-0" onClick={() => save('support_hours')} disabled={saving === 'support_hours'}>
                {saving === 'support_hours' ? '…' : 'Save'}
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

    </div>
  );
}

// ── Payment Methods Panel ───────────────────────────────────────────────────
function PaymentMethodsPanel() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const { data: methods, isLoading } = useQuery({ queryKey: ['admin-payment-methods'], queryFn: () => apiFetch('/payment-methods/all') });
  const [form, setForm] = useState({ type: '', name: '', iban: '', accountNumber: '', accountName: '', instructions: '', logoEmoji: '💳', isActive: true });
  const [editId, setEditId] = useState<number | null>(null);
  const [showForm, setShowForm] = useState(false);

  const save = useMutation({
    mutationFn: () => editId
      ? apiFetch(`/admin/payment-methods/${editId}`, { method: 'PUT', body: JSON.stringify(form) })
      : apiFetch('/admin/payment-methods', { method: 'POST', body: JSON.stringify(form) }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['admin-payment-methods'] }); toast({ title: editId ? 'Updated ✓' : 'Created ✓' }); setShowForm(false); setEditId(null); setForm({ type: '', name: '', iban: '', accountNumber: '', accountName: '', instructions: '', logoEmoji: '💳', isActive: true }); },
    onError: (e: any) => toast({ title: 'Error', description: e.message, variant: 'destructive' }),
  });
  const toggle = useMutation({
    mutationFn: ({ id, isActive }: { id: number; isActive: boolean }) =>
      apiFetch(`/admin/payment-methods/${id}`, { method: 'PUT', body: JSON.stringify({ isActive }) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin-payment-methods'] }),
  });

  return (
    <div className="space-y-4">
      <Button size="sm" onClick={() => { setShowForm(true); setEditId(null); }} className="w-full">
        <Plus className="w-3.5 h-3.5 mr-1" /> Add Payment Method
      </Button>
      {showForm && (
        <Card className="border-primary/30">
          <CardContent className="p-4 space-y-3">
            <p className="font-bold text-sm">{editId ? 'Edit Method' : 'New Method'}</p>

            {/* Type dropdown */}
            <div className="space-y-1">
              <Label className="text-xs">Type</Label>
              <select
                className="w-full text-sm border border-border rounded-lg px-2.5 py-2 bg-background"
                value={form.type}
                onChange={e => setForm(f => ({ ...f, type: e.target.value }))}
              >
                <option value="">— Select type —</option>
                <option value="bank_transfer">Bank Transfer (IBAN / Account Number)</option>
                <option value="botim">Botim (mobile pay)</option>
                <option value="emoney">eMoney (mobile pay)</option>
                <option value="crypto">Crypto (wallet address)</option>
              </select>
            </div>

            {[
              { label: form.type === 'crypto' ? 'Network / Coin Name (e.g. Bitcoin, USDT-TRC20)' : 'Display Name (e.g. bank name)', key: 'name' },
              ...(form.type === 'bank_transfer' ? [
                { label: 'IBAN (international — optional)', key: 'iban' },
                { label: 'Account Number (local — optional)', key: 'accountNumber' },
              ] : form.type === 'crypto' ? [
                { label: 'Wallet Address', key: 'accountNumber' },
              ] : [
                { label: 'Account / Number', key: 'accountNumber' },
              ]),
              ...(form.type !== 'crypto' ? [{ label: form.type === 'bank_transfer' ? 'Account Holder Name' : 'Account Name', key: 'accountName' }] : []),
              { label: 'Emoji', key: 'logoEmoji' },
            ].map(({ label, key }) => (
              <div key={key} className="space-y-1">
                <Label className="text-xs">{label}</Label>
                <Input value={(form as any)[key]} onChange={e => setForm(f => ({ ...f, [key]: e.target.value }))} className="text-sm" />
              </div>
            ))}
            <div className="space-y-1">
              <Label className="text-xs">Instructions (shown to user)</Label>
              <Textarea value={form.instructions} onChange={e => setForm(f => ({ ...f, instructions: e.target.value }))} rows={2} className="text-sm" />
            </div>
            <div className="flex gap-2">
              <Button size="sm" className="flex-1" onClick={() => save.mutate()} disabled={save.isPending || !form.type || !form.name}>Save</Button>
              <Button size="sm" variant="outline" className="flex-1" onClick={() => { setShowForm(false); setEditId(null); }}>Cancel</Button>
            </div>
          </CardContent>
        </Card>
      )}
      {isLoading ? <Skeleton className="h-24" /> : (methods as any[] | undefined)?.map((m: any) => {
        const typeLabel: Record<string, string> = { bank_transfer: 'Bank', botim: 'Botim', emoney: 'eMoney', crypto: '₿ Crypto' };
        const typeBg: Record<string, string> = { bank_transfer: 'bg-blue-500/10 text-blue-400', botim: 'bg-purple-500/10 text-purple-400', emoney: 'bg-green-500/10 text-green-400', crypto: 'bg-amber-500/10 text-amber-400' };
        return (
        <Card key={m.id} className={m.isActive ? '' : 'opacity-50'}>
          <CardContent className="p-3 flex items-center gap-3">
            <span className="text-xl">{m.logoEmoji}</span>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-1.5">
                <p className="font-bold text-sm truncate">{m.name}</p>
                <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium shrink-0 ${typeBg[m.type] ?? 'bg-muted text-muted-foreground'}`}>
                  {typeLabel[m.type] ?? m.type}
                </span>
              </div>
              <p className="text-xs font-mono text-muted-foreground truncate">
                {m.type === 'crypto' ? '📍 ' : ''}{m.accountNumber}
              </p>
            </div>
            <div className="flex items-center gap-1 shrink-0">
              <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={() => { setForm({ type: m.type, name: m.name, iban: m.iban || '', accountNumber: m.accountNumber, accountName: m.accountName, instructions: m.instructions, logoEmoji: m.logoEmoji, isActive: m.isActive }); setEditId(m.id); setShowForm(true); }}>
                <Edit2 className="w-3.5 h-3.5" />
              </Button>
              <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={() => toggle.mutate({ id: m.id, isActive: !m.isActive })}>
                {m.isActive ? <XCircle className="w-3.5 h-3.5 text-red-400" /> : <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />}
              </Button>
            </div>
          </CardContent>
        </Card>
        );
      })}
    </div>
  );
}

// ── Chat Panel — admin view of all Stream Chat conversations ────────────────
function ChatPanel() {
  const [selectedChannel, setSelectedChannel] = useState<string | null>(null);
  const [selectedMembers, setSelectedMembers] = useState<{ userId: string; name: string }[]>([]);
  const messagesEndRef = useRef<HTMLDivElement | null>(null);

  const { data: channels, isLoading: channelsLoading } = useQuery<any[]>({
    queryKey: ['admin-chat-channels'],
    queryFn: () => apiFetch('/admin/chat/channels'),
    staleTime: 30_000,
    refetchInterval: 30_000,
  });

  const { data: messages, isLoading: msgsLoading } = useQuery<any[]>({
    queryKey: ['admin-chat-messages', selectedChannel],
    queryFn: () => apiFetch(`/admin/chat/channels/${selectedChannel}/messages`),
    enabled: !!selectedChannel,
    staleTime: 15_000,
    refetchInterval: 15_000,
  });

  useEffect(() => {
    if (messages) messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  if (selectedChannel) {
    const title = selectedMembers.map(m => m.name || m.userId).join(' & ');
    return (
      <div className="space-y-3">
        <div className="flex items-center gap-2">
          <Button size="sm" variant="ghost" className="h-8 px-2" onClick={() => { setSelectedChannel(null); setSelectedMembers([]); }}>
            <ArrowLeft className="w-3.5 h-3.5 mr-1" /> Back
          </Button>
          <div>
            <p className="font-bold text-sm">{title}</p>
            <p className="text-[10px] text-muted-foreground font-mono">{selectedChannel}</p>
          </div>
        </div>
        <Card>
          <CardContent className="p-3 space-y-2 max-h-[65vh] overflow-y-auto">
            {msgsLoading ? (
              <div className="space-y-2">{[...Array(5)].map((_, i) => <Skeleton key={i} className="h-10" />)}</div>
            ) : !messages || messages.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-6">No messages yet</p>
            ) : (
              messages.map((m: any) => (
                <div key={m.id} className="space-y-0.5">
                  <div className="flex items-center gap-1.5">
                    <p className="text-[10px] font-bold text-primary">{m.userName}</p>
                    <p className="text-[10px] text-muted-foreground">{formatDistanceToNow(new Date(m.createdAt))} ago</p>
                  </div>
                  {m.text && (
                    <div className="bg-muted/50 rounded-lg px-3 py-2 text-sm max-w-full break-words">
                      {m.text}
                    </div>
                  )}
                  {m.attachments?.map((a: any, i: number) => (
                    a.imageUrl ? (
                      <img key={i} src={a.imageUrl} alt={a.title ?? 'attachment'} className="rounded-lg max-h-40 object-contain bg-muted/30 mt-1" />
                    ) : (
                      <div key={i} className="bg-muted/30 rounded-lg px-3 py-2 text-xs text-muted-foreground">
                        📎 {a.title ?? a.type ?? 'Attachment'}
                      </div>
                    )
                  ))}
                </div>
              ))
            )}
            <div ref={messagesEndRef} />
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <p className="text-xs text-muted-foreground">All active chat conversations — read-only view, auto-refreshes every 30 s</p>
      {channelsLoading ? (
        <div className="space-y-2">{[...Array(4)].map((_, i) => <Skeleton key={i} className="h-16" />)}</div>
      ) : !channels || channels.length === 0 ? (
        <Card><CardContent className="py-10 text-center">
          <MessageSquare className="w-8 h-8 mx-auto mb-2 text-muted-foreground opacity-30" />
          <p className="text-sm text-muted-foreground">No conversations yet</p>
        </CardContent></Card>
      ) : (
        <div className="space-y-2">
          {channels.map((ch: any) => {
            const names = (ch.members ?? []).map((m: any) => m.name || m.userId).join(' & ');
            return (
              <button
                key={ch.id}
                type="button"
                className="w-full text-left"
                onClick={() => { setSelectedChannel(ch.id); setSelectedMembers(ch.members ?? []); }}
              >
                <Card className="hover:border-primary/50 transition-colors">
                  <CardContent className="p-3 flex items-center gap-3">
                    <div className="w-9 h-9 rounded-full bg-primary/10 flex items-center justify-center text-base shrink-0">
                      💬
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-sm truncate">{names || ch.id}</p>
                      {ch.lastMessage ? (
                        <p className="text-xs text-muted-foreground truncate">
                          <span className="font-medium text-foreground/70">{ch.lastMessage.userName}: </span>
                          {ch.lastMessage.text || '📎 Attachment'}
                        </p>
                      ) : (
                        <p className="text-xs text-muted-foreground">No messages</p>
                      )}
                    </div>
                    <div className="text-right shrink-0">
                      {ch.lastMessageAt && (
                        <p className="text-[10px] text-muted-foreground">{formatDistanceToNow(new Date(ch.lastMessageAt))} ago</p>
                      )}
                      <p className="text-[10px] text-muted-foreground">{ch.messageCount ?? 0} msg{ch.messageCount !== 1 ? 's' : ''}</p>
                    </div>
                  </CardContent>
                </Card>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ── KYC Document Viewer — fetches image with admin auth header ───────────────
function KycDocumentViewer({ userId, onExpand }: { userId: number; onExpand: (src: string) => void }) {
  const [blobSrc, setBlobSrc] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(false);

  const load = async () => {
    if (blobSrc || loading) { if (blobSrc) onExpand(blobSrc); return; }
    setLoading(true);
    try {
      const token = sessionStorage.getItem(ADMIN_JWT_KEY);
      const r = await fetch(`${API}/admin/kyc/${userId}/document`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!r.ok) throw new Error('fetch failed');
      const blob = await r.blob();
      const url = URL.createObjectURL(blob);
      setBlobSrc(url);
      onExpand(url);
    } catch {
      setFailed(true);
    } finally {
      setLoading(false);
    }
  };

  // Auto-load on mount
  useEffect(() => {
    const token = sessionStorage.getItem(ADMIN_JWT_KEY);
    if (!token) return;
    (async () => {
      setLoading(true);
      try {
        const r = await fetch(`${API}/admin/kyc/${userId}/document`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!r.ok) throw new Error('fetch failed');
        const blob = await r.blob();
        setBlobSrc(URL.createObjectURL(blob));
      } catch {
        setFailed(true);
      } finally {
        setLoading(false);
      }
    })();
  }, [userId]);

  return (
    <div className="space-y-1">
      <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Government ID</p>
      <button
        type="button"
        onClick={() => blobSrc && onExpand(blobSrc)}
        className="w-full relative group rounded-xl overflow-hidden border-2 border-primary/20 hover:border-primary/60 transition-colors bg-muted/40 min-h-[80px] flex items-center justify-center"
        disabled={!blobSrc}
      >
        {loading && <p className="text-xs text-muted-foreground py-6">Loading document…</p>}
        {failed && <p className="text-xs text-destructive py-6">⚠️ Could not load document</p>}
        {blobSrc && (
          <>
            <img src={blobSrc} alt="Government ID" className="w-full max-h-52 object-contain" />
            <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-colors flex items-center justify-center">
              <span className="opacity-0 group-hover:opacity-100 transition-opacity bg-black/60 text-white text-xs px-3 py-1.5 rounded-full font-medium">
                Tap to enlarge
              </span>
            </div>
          </>
        )}
      </button>
    </div>
  );
}

// ── KYC Panel ───────────────────────────────────────────────────────────────
function KycPanel() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [rejectionReason, setRejectionReason] = useState<Record<number, string>>({});
  const [lightbox, setLightbox] = useState<string | null>(null);

  const { data: submissions, isLoading } = useQuery({
    queryKey: ['admin-kyc'],
    queryFn: () => apiFetch('/admin/kyc'),
    refetchInterval: 20000,
  });

  const docUrl = (userId: number) => `${API}/admin/kyc/${userId}/document`;

  const review = useMutation({
    mutationFn: ({ userId, action, reason }: { userId: number; action: 'approve' | 'reject'; reason?: string }) =>
      apiFetch(`/admin/kyc/${userId}/review`, { method: 'POST', body: JSON.stringify({ action, rejectionReason: reason }) }),
    onSuccess: (_d, { action }) => {
      qc.invalidateQueries({ queryKey: ['admin-kyc'] });
      toast({ title: action === 'approve' ? '✅ KYC approved — user is now verified' : '❌ KYC rejected' });
    },
    onError: (e: any) => toast({ title: 'Error', description: e.message, variant: 'destructive' }),
  });

  if (isLoading) return <div className="space-y-3">{[...Array(2)].map((_, i) => <Skeleton key={i} className="h-48" />)}</div>;

  const list = (submissions as any[] | undefined) ?? [];
  const pending = list.filter(s => s.kycStatus === 'pending');
  const done = list.filter(s => s.kycStatus !== 'pending');

  const kycBadge = (status: string) => {
    switch (status) {
      case 'verified': return <Badge className="bg-emerald-500/10 text-emerald-500 border-emerald-500/20 text-[10px]">Verified</Badge>;
      case 'pending':  return <Badge className="bg-amber-500/10 text-amber-500 border-amber-500/20 text-[10px]">Pending</Badge>;
      case 'rejected': return <Badge className="bg-red-500/10 text-red-500 border-red-500/20 text-[10px]">Rejected</Badge>;
      default:         return <Badge className="bg-muted text-muted-foreground text-[10px]">Unverified</Badge>;
    }
  };

  return (
    <>
      {lightbox && <ReceiptLightbox src={lightbox} onClose={() => setLightbox(null)} />}

      <div className="space-y-4">
        {pending.length === 0 && (
          <Card><CardContent className="py-10 text-center">
            <BadgeCheck className="w-8 h-8 mx-auto mb-2 text-emerald-500 opacity-50" />
            <p className="text-sm text-muted-foreground">No pending KYC submissions 🎉</p>
          </CardContent></Card>
        )}

        {pending.map((s: any) => (
          <Card key={s.id} className="border-amber-500/40 shadow-sm">
            <CardContent className="p-4 space-y-3">
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-center gap-2.5 min-w-0">
                  <div className="w-9 h-9 rounded-full bg-amber-500/15 text-amber-600 font-bold flex items-center justify-center text-sm shrink-0">
                    {(s.name ?? '?')[0]?.toUpperCase()}
                  </div>
                  <div className="min-w-0">
                    <p className="font-bold text-sm leading-tight truncate">{s.name}</p>
                    <p className="text-[11px] text-muted-foreground truncate">{s.email}</p>
                  </div>
                </div>
                <div className="flex flex-col items-end gap-1 shrink-0">
                  {kycBadge(s.kycStatus)}
                  {s.kycSubmittedAt && (
                    <span className="text-[10px] text-muted-foreground">{formatDistanceToNow(new Date(s.kycSubmittedAt))} ago</span>
                  )}
                </div>
              </div>

              {/* Document preview */}
              {s.hasDocument ? (
                <KycDocumentViewer userId={s.id} onExpand={src => setLightbox(src)} />
              ) : (
                <div className="border-2 border-dashed border-border rounded-xl p-4 text-center">
                  <p className="text-xs text-muted-foreground">⚠️ No document uploaded</p>
                </div>
              )}

              {/* Rejection reason input */}
              <Input
                placeholder="Rejection reason (required to reject)"
                value={rejectionReason[s.id] ?? ''}
                onChange={e => setRejectionReason(r => ({ ...r, [s.id]: e.target.value }))}
                className="text-xs"
              />

              <div className="flex gap-2">
                <Button
                  size="sm"
                  className="flex-1 bg-emerald-600 hover:bg-emerald-700 font-semibold"
                  onClick={() => review.mutate({ userId: s.id, action: 'approve' })}
                  disabled={review.isPending}
                >
                  <CheckCircle2 className="w-3.5 h-3.5 mr-1.5" /> Approve
                </Button>
                <Button
                  size="sm"
                  variant="destructive"
                  className="flex-1 font-semibold"
                  onClick={() => review.mutate({ userId: s.id, action: 'reject', reason: rejectionReason[s.id] })}
                  disabled={review.isPending || !rejectionReason[s.id]}
                >
                  <XCircle className="w-3.5 h-3.5 mr-1.5" /> Reject
                </Button>
              </div>
            </CardContent>
          </Card>
        ))}

        {done.length > 0 && (
          <div className="space-y-2">
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground pt-2">Reviewed ({done.length})</p>
            {done.map((s: any) => (
              <Card key={s.id} className="opacity-75">
                <CardContent className="p-3">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-full bg-muted flex items-center justify-center text-sm font-bold shrink-0">
                      {(s.name ?? '?')[0]?.toUpperCase()}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5">
                        <p className="text-sm font-semibold truncate">{s.name}</p>
                        {kycBadge(s.kycStatus)}
                      </div>
                      <p className="text-xs text-muted-foreground truncate">{s.email}</p>
                      {s.kycRejectionReason && (
                        <p className="text-xs text-red-400 italic mt-0.5">Reason: {s.kycRejectionReason}</p>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    </>
  );
}

// ── Crypto Panel ─────────────────────────────────────────────────────────────
function CryptoPanel() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [note, setNote] = useState<Record<number, string>>({});
  const [statusFilter, setStatusFilter] = useState('all');

  const { data: payments, isLoading } = useQuery({
    queryKey: ['admin-crypto', statusFilter],
    queryFn: () => apiFetch(`/admin/crypto${statusFilter !== 'all' ? `?status=${statusFilter}` : ''}`),
    refetchInterval: 20000,
  });

  const complete = useMutation({
    mutationFn: ({ id, txHash, adminNote }: { id: number; txHash?: string; adminNote?: string }) =>
      apiFetch(`/admin/crypto/${id}/complete`, { method: 'POST', body: JSON.stringify({ transactionHash: txHash || undefined, adminNote }) }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['admin-crypto'] }); toast({ title: '✅ Payment marked completed' }); },
    onError: (e: any) => toast({ title: 'Error', description: e.message, variant: 'destructive' }),
  });

  const fail = useMutation({
    mutationFn: ({ id, adminNote }: { id: number; adminNote?: string }) =>
      apiFetch(`/admin/crypto/${id}/fail`, { method: 'POST', body: JSON.stringify({ adminNote }) }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['admin-crypto'] }); toast({ title: 'Payment marked failed' }); },
    onError: (e: any) => toast({ title: 'Error', description: e.message, variant: 'destructive' }),
  });

  const statusColors: Record<string, string> = {
    waiting_for_payment: 'bg-amber-500/10 text-amber-600 border-amber-500/30',
    confirming: 'bg-blue-500/10 text-blue-600 border-blue-500/30',
    completed: 'bg-emerald-500/10 text-emerald-600 border-emerald-500/30',
    failed: 'bg-red-500/10 text-red-600 border-red-500/30',
    expired: 'bg-muted text-muted-foreground border-border',
  };

  if (isLoading) return <div className="space-y-3">{[...Array(3)].map((_, i) => <Skeleton key={i} className="h-32" />)}</div>;

  const list = (payments as any[] ?? []);
  const pending = list.filter((p: any) => ['waiting_for_payment', 'confirming'].includes(p.status));
  const done    = list.filter((p: any) => !['waiting_for_payment', 'confirming'].includes(p.status));

  return (
    <div className="space-y-4">
      {/* Filters */}
      <div className="flex flex-wrap gap-2">
        {['all', 'waiting_for_payment', 'confirming', 'completed', 'failed', 'expired'].map(s => (
          <button
            key={s}
            type="button"
            onClick={() => setStatusFilter(s)}
            className={`px-3 py-1 rounded-full text-xs font-semibold border transition-colors ${
              statusFilter === s ? 'bg-primary text-primary-foreground border-primary' : 'bg-background border-border text-muted-foreground hover:border-primary/40'
            }`}
          >
            {s === 'all' ? 'All' : s === 'waiting_for_payment' ? 'Waiting' : s.charAt(0).toUpperCase() + s.slice(1)}
          </button>
        ))}
      </div>

      {list.length === 0 && (
        <Card><CardContent className="py-10 text-center text-sm text-muted-foreground">No crypto payments yet</CardContent></Card>
      )}

      {/* Pending / Confirming */}
      {pending.length > 0 && (
        <div className="space-y-3">
          <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Needs Action ({pending.length})</p>
          {pending.map((p: any) => (
            <Card key={p.id} className="border-amber-500/20">
              <CardContent className="p-4 space-y-3">
                <div className="flex items-start justify-between gap-2 flex-wrap">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <Bitcoin className="w-4 h-4 text-orange-500 shrink-0" />
                      <span className="font-bold font-mono text-sm">{Number(p.amount).toLocaleString('en-US', { minimumFractionDigits: 2 })} {p.currency}</span>
                      <span className="text-xs text-muted-foreground">{p.network}</span>
                      <span className={`text-[10px] px-2 py-0.5 rounded-full border font-semibold ${statusColors[p.status] ?? ''}`}>
                        {p.status === 'waiting_for_payment' ? 'Waiting' : p.status}
                      </span>
                    </div>
                    <p className="text-xs text-muted-foreground mt-0.5">#{p.id} · {p.senderName} · {new Date(p.createdAt).toLocaleString()}</p>
                    <p className="text-xs text-muted-foreground">{p.senderEmail}</p>
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {p.paymentMethod === 'connect_wallet' ? '🔗 Connect' : '📋 Address'}
                  </div>
                </div>

                {/* Receiver address */}
                <div className="bg-muted/40 rounded-lg p-2.5 space-y-1">
                  <p className="text-[10px] text-muted-foreground font-semibold">RECEIVING ADDRESS</p>
                  <div className="flex items-center gap-2">
                    <code className="text-[11px] font-mono break-all flex-1">{p.receiverAddress}</code>
                    <button type="button" onClick={() => navigator.clipboard?.writeText(p.receiverAddress)} className="shrink-0 text-muted-foreground hover:text-foreground">
                      <Copy className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>

                {/* Tx hash (if provided) */}
                {p.transactionHash && (
                  <div className="bg-muted/40 rounded-lg p-2.5 space-y-1">
                    <p className="text-[10px] text-muted-foreground font-semibold">TRANSACTION HASH</p>
                    <div className="flex items-center gap-2">
                      <code className="text-[11px] font-mono break-all flex-1">{p.transactionHash}</code>
                      <button type="button" onClick={() => navigator.clipboard?.writeText(p.transactionHash)} className="shrink-0 text-muted-foreground hover:text-foreground">
                        <Copy className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                )}

                {p.senderWalletAddress && (
                  <div className="text-xs text-muted-foreground">
                    <span className="font-semibold">Sender wallet: </span>
                    <code className="font-mono">{p.senderWalletAddress}</code>
                  </div>
                )}

                {/* Admin note */}
                <div className="space-y-2">
                  <input
                    type="text"
                    placeholder="Admin note (optional)"
                    value={note[p.id] ?? ''}
                    onChange={e => setNote(prev => ({ ...prev, [p.id]: e.target.value }))}
                    className="w-full h-8 rounded-lg border border-border bg-background px-3 text-xs"
                  />
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      className="flex-1 h-8 text-xs bg-emerald-600 hover:bg-emerald-700 text-white gap-1"
                      disabled={complete.isPending}
                      onClick={() => complete.mutate({ id: p.id, txHash: p.transactionHash || undefined, adminNote: note[p.id] })}
                    >
                      <CheckCircle2 className="w-3.5 h-3.5" /> Mark Completed
                    </Button>
                    <Button
                      size="sm"
                      variant="destructive"
                      className="flex-1 h-8 text-xs gap-1"
                      disabled={fail.isPending}
                      onClick={() => fail.mutate({ id: p.id, adminNote: note[p.id] })}
                    >
                      <XCircle className="w-3.5 h-3.5" /> Mark Failed
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Completed / Failed / Expired */}
      {done.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">History ({done.length})</p>
          {done.map((p: any) => (
            <div key={p.id} className="rounded-xl border border-border bg-card p-3 flex items-center gap-3">
              <div className="w-9 h-9 rounded-full bg-orange-500/10 flex items-center justify-center shrink-0">
                <Bitcoin className="w-4 h-4 text-orange-500" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-semibold text-sm font-mono">{Number(p.amount).toLocaleString('en-US', { minimumFractionDigits: 2 })} {p.currency}</span>
                  <span className="text-xs text-muted-foreground">{p.network}</span>
                  <span className={`text-[10px] px-2 py-0.5 rounded-full border font-semibold ${statusColors[p.status] ?? ''}`}>
                    {p.status}
                  </span>
                </div>
                <p className="text-xs text-muted-foreground truncate">#{p.id} · {p.senderName} · {new Date(p.createdAt).toLocaleDateString()}</p>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Security / Fraud Panel ───────────────────────────────────────────────────
function SecurityPanel() {
  const { toast } = useToast();
  const qc = useQueryClient();

  const { data: fraudEvents, isLoading: eventsLoading } = useQuery({
    queryKey: ['admin-fraud-events'],
    queryFn: () => apiFetch('/admin/fraud-events?limit=100'),
    refetchInterval: 15000,
  });
  const { data: lockedUsers, isLoading: lockedLoading } = useQuery({
    queryKey: ['admin-locked-users'],
    queryFn: () => apiFetch('/admin/locked-users'),
    refetchInterval: 15000,
  });
  const { data: settings, isLoading: settingsLoading, refetch: refetchSettings } = useQuery({
    queryKey: ['admin-settings'],
    queryFn: () => apiFetch('/admin/settings'),
  });
  const [limits, setLimits] = useState<Record<string, string>>({});
  const [savingLimit, setSavingLimit] = useState<string | null>(null);

  const s = settings as Record<string, string> | undefined;
  const limitVal = (key: string) => limits[key] !== undefined ? limits[key] : (s?.[key] ?? '');
  const setLimit = (key: string, v: string) => setLimits(f => ({ ...f, [key]: v }));

  const saveLimit = async (key: string) => {
    setSavingLimit(key);
    try {
      await apiFetch(`/admin/settings/${key}`, { method: 'PUT', body: JSON.stringify({ value: limits[key] ?? s?.[key] ?? '' }) });
      await refetchSettings();
      toast({ title: 'Limit saved ✓' });
    } catch (e: any) {
      toast({ title: 'Error', description: e.message, variant: 'destructive' });
    }
    setSavingLimit(null);
  };

  const clearLock = useMutation({
    mutationFn: (userId: number) => apiFetch(`/admin/users/${userId}/clear-lock`, { method: 'POST' }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin-locked-users'] });
      qc.invalidateQueries({ queryKey: ['admin-fraud-events'] });
      toast({ title: '🔓 Lock cleared — user can send again' });
    },
    onError: (e: any) => toast({ title: 'Error', description: e.message, variant: 'destructive' }),
  });

  const eventTypeLabel: Record<string, { label: string; color: string }> = {
    tx_cap_exceeded:    { label: 'Tx cap exceeded',   color: 'text-amber-500' },
    daily_cap_exceeded: { label: 'Daily cap exceeded', color: 'text-orange-500' },
    account_locked:     { label: 'Account locked',     color: 'text-red-500' },
    lock_cleared:       { label: 'Lock cleared',       color: 'text-emerald-500' },
    pin_failure:        { label: 'PIN failure',         color: 'text-red-400' },
  };

  return (
    <div className="space-y-5">

      {/* Velocity Limits */}
      <Card>
        <CardHeader className="p-4 pb-2">
          <CardTitle className="text-sm font-bold flex items-center gap-2">
            <Shield className="w-4 h-4 text-red-500" /> Transfer Velocity Limits
          </CardTitle>
          <CardDescription className="text-xs">
            Configurable fraud controls. Changes take effect immediately on the next transfer attempt.
          </CardDescription>
        </CardHeader>
        <CardContent className="p-4 pt-0 space-y-3">
          {settingsLoading ? <div className="space-y-2">{[...Array(3)].map((_, i) => <div key={i} className="h-8 bg-muted rounded animate-pulse" />)}</div> : (
            <>
              {[
                { key: 'fraud_tx_cap_usd',       label: 'Per-transaction cap (USD)',        hint: 'Max single transfer. Default: 10,000' },
                { key: 'fraud_daily_cap_usd',     label: 'Daily rolling cap (USD)',          hint: 'Max sent in a rolling 24 h window. Default: 50,000' },
                { key: 'fraud_lockout_threshold', label: 'Failed-attempt lockout threshold', hint: 'Attempts in 10 min before 1-hour lockout. Default: 3' },
              ].map(({ key, label, hint }) => (
                <div key={key} className="space-y-1">
                  <Label className="text-xs">{label}</Label>
                  <div className="flex gap-2">
                    <Input
                      type="number"
                      step="1"
                      min="0"
                      placeholder={hint}
                      value={limitVal(key)}
                      onChange={e => setLimit(key, e.target.value)}
                      className="font-mono text-sm flex-1"
                    />
                    <Button size="sm" className="shrink-0" onClick={() => saveLimit(key)} disabled={savingLimit === key}>
                      {savingLimit === key ? '…' : 'Save'}
                    </Button>
                  </div>
                  <p className="text-[11px] text-muted-foreground">{hint}</p>
                </div>
              ))}
            </>
          )}
        </CardContent>
      </Card>

      {/* Locked Users */}
      <Card>
        <CardHeader className="p-4 pb-2">
          <CardTitle className="text-sm font-bold flex items-center gap-2">
            <Lock className="w-4 h-4 text-red-500" /> Currently Locked Accounts
            {(lockedUsers as any[] | undefined)?.length ? (
              <span className="ml-auto bg-red-500 text-white text-[9px] rounded-full px-1.5 py-0.5">
                {(lockedUsers as any[]).length}
              </span>
            ) : null}
          </CardTitle>
          <CardDescription className="text-xs">Users temporarily blocked from sending due to failed attempts.</CardDescription>
        </CardHeader>
        <CardContent className="p-4 pt-0">
          {lockedLoading ? <div className="h-12 bg-muted rounded animate-pulse" /> :
            !(lockedUsers as any[])?.length ? (
              <p className="text-xs text-muted-foreground py-2 flex items-center gap-1.5">
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" /> No accounts currently locked
              </p>
            ) : (
              <div className="space-y-2">
                {(lockedUsers as any[]).map((u: any) => (
                  <div key={u.id} className="flex items-center gap-3 p-3 bg-red-500/5 border border-red-500/20 rounded-lg">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold truncate">{u.name}</p>
                      <p className="text-xs text-muted-foreground truncate">{u.email}</p>
                      <p className="text-xs text-red-400 mt-0.5">
                        Locked until {new Date(u.sendLockedUntil).toLocaleTimeString()}
                      </p>
                    </div>
                    <Button
                      size="sm"
                      variant="outline"
                      className="shrink-0 border-emerald-500/40 text-emerald-600 hover:bg-emerald-500/10"
                      onClick={() => clearLock.mutate(u.id)}
                      disabled={clearLock.isPending}
                    >
                      <Unlock className="w-3.5 h-3.5 mr-1" /> Clear
                    </Button>
                  </div>
                ))}
              </div>
            )}
        </CardContent>
      </Card>

      {/* Fraud Event Log */}
      <Card>
        <CardHeader className="p-4 pb-2">
          <CardTitle className="text-sm font-bold flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-amber-500" /> Fraud Event Log
          </CardTitle>
          <CardDescription className="text-xs">Last 100 events — velocity violations, lockouts, and admin actions.</CardDescription>
        </CardHeader>
        <CardContent className="p-4 pt-0">
          {eventsLoading ? (
            <div className="space-y-2">{[...Array(4)].map((_, i) => <div key={i} className="h-10 bg-muted rounded animate-pulse" />)}</div>
          ) : !(fraudEvents as any[])?.length ? (
            <p className="text-xs text-muted-foreground py-2">No fraud events logged yet 🎉</p>
          ) : (
            <div className="space-y-1.5 max-h-96 overflow-y-auto">
              {(fraudEvents as any[]).map((e: any) => {
                const info = eventTypeLabel[e.eventType] ?? { label: e.eventType, color: 'text-muted-foreground' };
                return (
                  <div key={e.id} className="flex items-start gap-2.5 py-2 border-b border-border/50 last:border-0">
                    <div className="shrink-0 mt-0.5">
                      {e.eventType === 'lock_cleared' ? (
                        <Unlock className="w-3.5 h-3.5 text-emerald-500" />
                      ) : e.eventType === 'account_locked' ? (
                        <Lock className="w-3.5 h-3.5 text-red-500" />
                      ) : (
                        <AlertTriangle className={`w-3.5 h-3.5 ${info.color}`} />
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className={`text-xs font-semibold ${info.color}`}>{info.label}</span>
                        {e.userName && <span className="text-xs text-muted-foreground truncate">— {e.userName}</span>}
                      </div>
                      {e.metadata && (
                        <p className="text-[11px] text-muted-foreground font-mono mt-0.5 truncate">
                          {Object.entries(e.metadata).map(([k, v]) => `${k}: ${v}`).join(' · ')}
                        </p>
                      )}
                    </div>
                    <span className="text-[10px] text-muted-foreground shrink-0 mt-0.5">
                      {formatDistanceToNow(new Date(e.createdAt))} ago
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

// ── Notification sound (Web Audio API — no external file) ────────────────────
function playNotificationSound(type: 'deposit' | 'send' | 'ticket' | 'withdrawal') {
  try {
    const ctx = new AudioContext();
    // Different chime patterns per event type
    const patterns: Record<string, { freqs: number[]; color: string }> = {
      deposit:    { freqs: [523.25, 659.25, 783.99], color: 'major'   }, // C-E-G ascending
      send:       { freqs: [392, 493.88, 587.33],   color: 'minor'    }, // G-B-D ascending
      ticket:     { freqs: [440, 550, 660],          color: 'alert'    }, // double-tap feel
      withdrawal: { freqs: [349.23, 440, 523.25],   color: 'neutral'  },
    };
    const { freqs } = patterns[type] ?? patterns.deposit;
    freqs.forEach((freq, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.frequency.value = freq;
      osc.type = 'sine';
      const t0 = ctx.currentTime + i * 0.16;
      gain.gain.setValueAtTime(0, t0);
      gain.gain.linearRampToValueAtTime(0.28, t0 + 0.04);
      gain.gain.exponentialRampToValueAtTime(0.001, t0 + 0.45);
      osc.start(t0);
      osc.stop(t0 + 0.5);
    });
  } catch { /* AudioContext may be unavailable in some browsers */ }
}

// ── Main Admin Page ─────────────────────────────────────────────────────────
export default function Admin() {
  const [username, setUsername] = useState('');
  const [pin, setPin] = useState('');
  const [loginLoading, setLoginLoading] = useState(false);
  const [authed, setAuthed] = useState(() => !!sessionStorage.getItem(ADMIN_JWT_KEY));
  const [activeTab, setActiveTab] = useState('deposits');
  // reset-password flow
  const [view, setView] = useState<'login' | 'reset'>('login');
  const [resetCurrent, setResetCurrent] = useState('');
  const [resetNew, setResetNew] = useState('');
  const [resetConfirm, setResetConfirm] = useState('');
  const [resetLoading, setResetLoading] = useState(false);
  const [showResetCurrent, setShowResetCurrent] = useState(false);
  const [showResetNew, setShowResetNew] = useState(false);
  const { toast } = useToast();
  const qc = useQueryClient();

  // ── Polling queries for live counts ──────────────────────────────────────
  const { data: deposits }     = useQuery({ queryKey: ['admin-deposits'],     queryFn: () => apiFetch('/admin/deposits'),     enabled: authed, refetchInterval: 12000 });
  const { data: withdrawals }  = useQuery({ queryKey: ['admin-withdrawals'],  queryFn: () => apiFetch('/admin/withdrawals'),  enabled: authed, refetchInterval: 12000 });
  const { data: tickets }      = useQuery({ queryKey: ['admin-tickets'],      queryFn: () => apiFetch('/tickets'),            enabled: authed, refetchInterval: 12000 });
  const { data: transactions } = useQuery({ queryKey: ['admin-transactions'], queryFn: () => apiFetch('/admin/transactions'), enabled: authed, refetchInterval: 12000 });

  const { data: kycSubmissions } = useQuery({ queryKey: ['admin-kyc'], queryFn: () => apiFetch('/admin/kyc'), enabled: authed, refetchInterval: 15000 });
  const pendingDeposits    = (deposits       as any[] | undefined)?.filter(d => d.status === 'pending').length ?? 0;
  const pendingWithdrawals = (withdrawals    as any[] | undefined)?.filter(w => w.status === 'pending').length ?? 0;
  const openTickets        = (tickets        as any[] | undefined)?.filter(t => t.status === 'open').length    ?? 0;
  const pendingSends       = (transactions   as any[] | undefined)?.filter(t => t.status === 'pending').length ?? 0;
  const pendingKyc         = (kycSubmissions as any[] | undefined)?.filter(k => k.kycStatus === 'pending').length ?? 0;

  // ── Notification engine — fire sound+toast when counts rise ─────────────
  const prevCounts = useRef({ deposits: -1, withdrawals: -1, tickets: -1, sends: -1 });
  const isFirstLoad = useRef(true);

  useEffect(() => {
    if (!authed) return;
    // Skip the very first data load — only alert on NEW arrivals
    if (isFirstLoad.current) {
      if (pendingDeposits >= 0 && pendingWithdrawals >= 0 && openTickets >= 0 && pendingSends >= 0) {
        prevCounts.current = { deposits: pendingDeposits, withdrawals: pendingWithdrawals, tickets: openTickets, sends: pendingSends };
        isFirstLoad.current = false;
      }
      return;
    }
    if (pendingDeposits > prevCounts.current.deposits) {
      playNotificationSound('deposit');
      toast({ title: '🟡 New Deposit Request', description: 'A user submitted a deposit with receipt.' });
    }
    if (pendingSends > prevCounts.current.sends) {
      playNotificationSound('send');
      toast({ title: '🔵 New Send Request', description: 'A user initiated an international transfer.' });
    }
    if (pendingWithdrawals > prevCounts.current.withdrawals) {
      playNotificationSound('withdrawal');
      toast({ title: '🟠 New Withdrawal', description: 'A new withdrawal request is waiting.' });
    }
    if (openTickets > prevCounts.current.tickets) {
      playNotificationSound('ticket');
      toast({ title: '📩 New Support Ticket', description: 'A user opened a support ticket.' });
    }
    prevCounts.current = { deposits: pendingDeposits, withdrawals: pendingWithdrawals, tickets: openTickets, sends: pendingSends };
  }, [pendingDeposits, pendingWithdrawals, openTickets, pendingSends, authed]);

  const goTab = useCallback((tab: string) => setActiveTab(tab), []);

  const attempt = async () => {
    setLoginLoading(true);
    try {
      const r = await fetch(`${API}/admin/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: username.trim().toLowerCase(), password: pin }),
      });
      if (!r.ok) { toast({ title: 'Invalid credentials', variant: 'destructive' }); return; }
      const { token } = await r.json();
      sessionStorage.setItem(ADMIN_JWT_KEY, token);
      setAuthed(true);
      qc.invalidateQueries();
    } catch {
      toast({ title: 'Network error', description: 'Please try again.', variant: 'destructive' });
    } finally { setLoginLoading(false); }
  };

  const handleReset = async () => {
    if (!resetCurrent) { toast({ title: 'Enter your current password', variant: 'destructive' }); return; }
    if (!resetNew || resetNew.length < 8) { toast({ title: 'New password must be at least 8 characters', variant: 'destructive' }); return; }
    if (resetNew !== resetConfirm) { toast({ title: 'Passwords do not match', variant: 'destructive' }); return; }
    setResetLoading(true);
    try {
      const r = await fetch(`${API}/admin/change-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ currentPassword: resetCurrent, newPassword: resetNew }),
      });
      if (!r.ok) {
        const { error } = await r.json().catch(() => ({ error: 'Failed' }));
        toast({ title: error ?? 'Reset failed', variant: 'destructive' });
        return;
      }
      toast({ title: '✅ Password updated', description: 'You can now sign in with your new password.' });
      setView('login');
      setResetCurrent(''); setResetNew(''); setResetConfirm('');
    } catch {
      toast({ title: 'Network error', description: 'Please try again.', variant: 'destructive' });
    } finally { setResetLoading(false); }
  };

  if (!authed) {
    const Branding = () => (
      <div className="flex flex-col items-center gap-3">
        <img src={`${import.meta.env.BASE_URL}logo.png`} alt="Nanivio" className="w-16 h-16 rounded-2xl shadow-xl" />
        <div className="text-center">
          <h1 className="text-2xl font-extrabold tracking-tight">Nanivio</h1>
          <p className="text-xs text-muted-foreground mt-0.5 uppercase tracking-widest">Admin Portal</p>
        </div>
      </div>
    );

    // ── Reset-password view ────────────────────────────────────────────────
    if (view === 'reset') {
      return (
        <div className="min-h-screen flex flex-col items-center justify-center gap-8 p-4 bg-background">
          <Branding />
          <Card className="w-full max-w-sm shadow-2xl border-border/60">
            <CardHeader className="pb-2 pt-6 px-6">
              <div className="flex items-center gap-2 mb-1">
                <button
                  onClick={() => { setView('login'); setResetCurrent(''); setResetNew(''); setResetConfirm(''); }}
                  className="text-muted-foreground hover:text-foreground transition-colors"
                  aria-label="Back to login"
                >
                  <ArrowLeft className="w-4 h-4" />
                </button>
                <CardTitle className="text-base font-bold">Reset Admin Password</CardTitle>
              </div>
              <CardDescription className="text-xs pl-6">
                Enter your current password to verify identity, then set a new one.
              </CardDescription>
            </CardHeader>
            <CardContent className="px-6 pb-6 space-y-4">
              {/* Current password */}
              <div className="space-y-1.5">
                <Label className="text-xs font-medium">Current Password</Label>
                <div className="relative">
                  <Input
                    type={showResetCurrent ? 'text' : 'password'}
                    placeholder="Your existing admin password"
                    value={resetCurrent}
                    onChange={e => setResetCurrent(e.target.value)}
                    className="pr-10"
                    autoComplete="current-password"
                  />
                  <button
                    type="button"
                    onClick={() => setShowResetCurrent(s => !s)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                  >
                    {showResetCurrent ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              {/* New password */}
              <div className="space-y-1.5">
                <Label className="text-xs font-medium">New Password</Label>
                <div className="relative">
                  <Input
                    type={showResetNew ? 'text' : 'password'}
                    placeholder="At least 8 characters"
                    value={resetNew}
                    onChange={e => setResetNew(e.target.value)}
                    className="pr-10"
                    autoComplete="new-password"
                  />
                  <button
                    type="button"
                    onClick={() => setShowResetNew(s => !s)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                  >
                    {showResetNew ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
                {/* Strength bar */}
                {resetNew.length > 0 && (
                  <div className="flex gap-1 mt-1">
                    {[1,2,3,4].map(n => (
                      <div key={n} className={`h-1 flex-1 rounded-full transition-colors ${
                        resetNew.length >= n * 3
                          ? n <= 1 ? 'bg-red-500' : n <= 2 ? 'bg-amber-500' : n <= 3 ? 'bg-yellow-400' : 'bg-emerald-500'
                          : 'bg-muted'
                      }`} />
                    ))}
                  </div>
                )}
              </div>

              {/* Confirm */}
              <div className="space-y-1.5">
                <Label className="text-xs font-medium">Confirm New Password</Label>
                <Input
                  type="password"
                  placeholder="Re-enter new password"
                  value={resetConfirm}
                  onChange={e => setResetConfirm(e.target.value)}
                  autoComplete="new-password"
                  onKeyDown={e => { if (e.key === 'Enter') handleReset(); }}
                  className={resetConfirm && resetConfirm !== resetNew ? 'border-red-500 focus-visible:ring-red-500' : ''}
                />
                {resetConfirm && resetConfirm !== resetNew && (
                  <p className="text-xs text-red-500">Passwords do not match</p>
                )}
              </div>

              <Button
                className="w-full font-semibold mt-1 gap-2"
                onClick={handleReset}
                disabled={resetLoading || !resetCurrent || resetNew.length < 8 || resetNew !== resetConfirm}
              >
                <ShieldCheck className="w-4 h-4" />
                {resetLoading ? 'Updating…' : 'Update Password'}
              </Button>

              <p className="text-[11px] text-center text-muted-foreground leading-relaxed">
                Your new password replaces the previous one permanently.<br />
                You'll be returned to the sign-in page after this.
              </p>
            </CardContent>
          </Card>
          <p className="text-xs text-muted-foreground">Nanivio · Admin Portal · Restricted Access</p>
        </div>
      );
    }

    // ── Login view ─────────────────────────────────────────────────────────
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-8 p-4 bg-background">
        <Branding />
        <Card className="w-full max-w-sm shadow-2xl border-border/60">
          <CardHeader className="pb-2 pt-6 px-6">
            <CardTitle className="text-base font-bold">Sign in to continue</CardTitle>
            <CardDescription className="text-xs">Access is restricted to authorised personnel</CardDescription>
          </CardHeader>
          <CardContent className="px-6 pb-6 space-y-4">
            <div className="space-y-1.5">
              <Label className="text-xs font-medium">Username</Label>
              <Input placeholder="admin" value={username} onChange={e => setUsername(e.target.value)} autoComplete="username" onKeyDown={e => { if (e.key === 'Enter') attempt(); }} />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-medium">Password</Label>
              <Input type="password" placeholder="••••••••••••" value={pin} onChange={e => setPin(e.target.value)} autoComplete="current-password" onKeyDown={e => { if (e.key === 'Enter') attempt(); }} />
            </div>
            <Button className="w-full font-semibold mt-1" onClick={attempt} disabled={loginLoading}>
              {loginLoading ? 'Signing in…' : 'Sign In'}
            </Button>
            <button
              type="button"
              onClick={() => setView('reset')}
              className="w-full text-center text-xs text-muted-foreground hover:text-primary transition-colors flex items-center justify-center gap-1.5 pt-1"
            >
              <KeyRound className="w-3.5 h-3.5" /> Forgot password? Reset it here
            </button>
          </CardContent>
        </Card>
        <p className="text-xs text-muted-foreground">Nanivio · Admin Portal · Restricted Access</p>
      </div>
    );
  }

  // ── Stat card helper ─────────────────────────────────────────────────────
  const StatCard = ({ label, count, tab, icon: Icon, accentClass }: { label: string; count: number; tab: string; icon: any; accentClass: string }) => (
    <button
      onClick={() => goTab(tab)}
      className={`relative flex flex-col items-center gap-1.5 p-3 rounded-xl border-2 transition-all text-center w-full
        ${activeTab === tab ? 'border-primary bg-primary/5 shadow-sm' : 'border-border bg-card hover:border-primary/40 hover:bg-muted/30'}`}
    >
      {/* Red / green pulse dot */}
      <span className={`absolute top-2 right-2 w-2.5 h-2.5 rounded-full shadow-sm
        ${count > 0 ? 'bg-red-500 animate-pulse' : 'bg-emerald-500'}`}
      />
      <Icon className={`w-4 h-4 ${accentClass}`} />
      <span className="text-2xl font-extrabold leading-none">{count}</span>
      <span className="text-[11px] text-muted-foreground font-medium leading-tight">{label}</span>
    </button>
  );

  return (
    <div className="min-h-screen bg-background p-4 md:p-6 max-w-2xl mx-auto space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold">Admin Panel</h1>
          <p className="text-xs text-muted-foreground">Nanivio Operations</p>
        </div>
        <Button variant="outline" size="sm" onClick={() => { sessionStorage.removeItem(ADMIN_JWT_KEY); setAuthed(false); qc.clear(); }}>Sign Out</Button>
      </div>

      {/* 5 clickable stat cards */}
      <div className="grid grid-cols-5 gap-2">
        <StatCard label="Deposit"    count={pendingDeposits}    tab="deposits"      icon={ArrowDownLeft}  accentClass="text-primary" />
        <StatCard label="Send"       count={pendingSends}       tab="sends"         icon={ArrowLeftRight} accentClass="text-blue-500" />
        <StatCard label="Withdrawal" count={pendingWithdrawals} tab="withdrawals"   icon={ArrowUpRight}   accentClass="text-amber-500" />
        <StatCard label="KYC"        count={pendingKyc}         tab="kyc"           icon={BadgeCheck}     accentClass="text-emerald-500" />
        <StatCard label="Ticket"     count={openTickets}        tab="tickets"       icon={MessageSquare}  accentClass="text-purple-500" />
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="flex w-full overflow-x-auto gap-0.5 h-auto p-1 flex-nowrap">
          <TabsTrigger value="deposits" className="text-[11px] shrink-0 flex-1 min-w-[44px]">
            Dep{pendingDeposits > 0 && <span className="ml-1 bg-red-500 text-white text-[9px] rounded-full w-3.5 h-3.5 inline-flex items-center justify-center font-bold">{pendingDeposits}</span>}
          </TabsTrigger>
          <TabsTrigger value="sends" className="text-[11px] shrink-0 flex-1 min-w-[44px]">
            Send{pendingSends > 0 && <span className="ml-1 bg-red-500 text-white text-[9px] rounded-full w-3.5 h-3.5 inline-flex items-center justify-center font-bold">{pendingSends}</span>}
          </TabsTrigger>
          <TabsTrigger value="withdrawals" className="text-[11px] shrink-0 flex-1 min-w-[44px]">
            W/D{pendingWithdrawals > 0 && <span className="ml-1 bg-red-500 text-white text-[9px] rounded-full w-3.5 h-3.5 inline-flex items-center justify-center font-bold">{pendingWithdrawals}</span>}
          </TabsTrigger>
          <TabsTrigger value="kyc" className="text-[11px] shrink-0 flex-1 min-w-[40px]">
            KYC{pendingKyc > 0 && <span className="ml-1 bg-red-500 text-white text-[9px] rounded-full w-3.5 h-3.5 inline-flex items-center justify-center font-bold">{pendingKyc}</span>}
          </TabsTrigger>
          <TabsTrigger value="users" className="text-[11px] shrink-0 flex-1 min-w-[40px]">Users</TabsTrigger>
          <TabsTrigger value="tickets" className="text-[11px] shrink-0 flex-1 min-w-[44px]">
            Tix{openTickets > 0 && <span className="ml-1 bg-red-500 text-white text-[9px] rounded-full w-3.5 h-3.5 inline-flex items-center justify-center font-bold">{openTickets}</span>}
          </TabsTrigger>
          <TabsTrigger value="chat"    className="text-[11px] shrink-0 flex-1 min-w-[40px]">Chat</TabsTrigger>
          <TabsTrigger value="methods" className="text-[11px] shrink-0 flex-1 min-w-[40px]">Pay</TabsTrigger>
          <TabsTrigger value="rates" className="text-[11px] shrink-0 flex-1 min-w-[40px]">Rates</TabsTrigger>
          <TabsTrigger value="crypto" className="text-[11px] shrink-0 flex-1 min-w-[40px]"><Bitcoin className="w-3 h-3" /></TabsTrigger>
          <TabsTrigger value="security" className="text-[11px] shrink-0 flex-1 min-w-[40px]"><Shield className="w-3 h-3" /></TabsTrigger>
          <TabsTrigger value="settings" className="text-[11px] shrink-0 flex-1 min-w-[36px]"><Settings2 className="w-3 h-3" /></TabsTrigger>
        </TabsList>
        <TabsContent value="deposits"    className="mt-4"><DepositsPanel /></TabsContent>
        <TabsContent value="sends"       className="mt-4"><SendsPanel /></TabsContent>
        <TabsContent value="withdrawals" className="mt-4"><WithdrawalsPanel /></TabsContent>
        <TabsContent value="kyc"         className="mt-4"><KycPanel /></TabsContent>
        <TabsContent value="users"       className="mt-4"><UsersPanel /></TabsContent>
        <TabsContent value="tickets"     className="mt-4"><TicketsPanel /></TabsContent>
        <TabsContent value="chat"        className="mt-4"><ChatPanel /></TabsContent>
        <TabsContent value="methods"     className="mt-4"><PaymentMethodsPanel /></TabsContent>
        <TabsContent value="rates"       className="mt-4"><RatesPanel /></TabsContent>
        <TabsContent value="crypto"       className="mt-4"><CryptoPanel /></TabsContent>
        <TabsContent value="security"    className="mt-4"><SecurityPanel /></TabsContent>
        <TabsContent value="settings"    className="mt-4"><SettingsPanel /></TabsContent>
      </Tabs>
    </div>
  );
}
