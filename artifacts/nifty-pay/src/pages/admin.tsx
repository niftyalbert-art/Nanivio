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
import { CheckCircle2, XCircle, Clock, ArrowDownLeft, ArrowUpRight, MessageSquare, Lock, Plus, Edit2, TrendingUp, Settings2, Link, Eye, EyeOff, Users, ArrowLeftRight, KeyRound, ShieldCheck, ArrowLeft } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { useToast } from '@/hooks/use-toast';

const API = import.meta.env.BASE_URL.replace(/\/$/, '') + '/api';
const ADMIN_JWT_KEY = 'nivio_admin_jwt';

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
                <p className="text-muted-foreground">{w.withdrawalType === 'mobile_money' ? 'Mobile Money' : 'Bank'}</p>
                {w.withdrawalType === 'mobile_money'
                  ? <p className="font-semibold">{w.mobileNetwork}: <span className="font-mono">{w.mobileNumber}</span></p>
                  : <p className="font-semibold">{w.bankName} / <span className="font-mono">{w.accountNumber}</span> / {w.accountName}</p>}
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
function UsersPanel() {
  const { data: users, isLoading } = useQuery({
    queryKey: ['admin-users'],
    queryFn: () => apiFetch('/admin/users'),
    refetchInterval: 30000,
  });
  const [revealed, setRevealed] = useState<Record<number, boolean>>({});
  const toggle = (id: number) => setRevealed(r => ({ ...r, [id]: !r[id] }));

  if (isLoading) return <div className="space-y-2">{[...Array(4)].map((_, i) => <Skeleton key={i} className="h-16" />)}</div>;

  const list = (users as any[] | undefined) ?? [];
  return (
    <div className="space-y-2">
      <p className="text-xs text-muted-foreground">{list.length} registered user{list.length !== 1 ? 's' : ''}</p>
      {list.length === 0 && <p className="text-sm text-muted-foreground text-center py-8">No users yet</p>}
      {list.map((u: any) => (
        <Card key={u.id}>
          <CardContent className="p-3">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-full bg-primary/20 text-primary font-bold flex items-center justify-center text-sm shrink-0">
                {u.name[0]?.toUpperCase()}
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-semibold text-sm truncate">{u.name}</p>
                <p className="text-xs text-muted-foreground truncate">{u.email}</p>
                <p className="text-xs text-muted-foreground">Joined {new Date(u.createdAt).toLocaleDateString()}</p>
              </div>
              <div className="text-right shrink-0 space-y-1">
                <p className="text-[10px] text-muted-foreground font-medium uppercase tracking-wide">4-Digit PIN</p>
                <div className="flex items-center gap-1.5 justify-end">
                  <span className="font-mono font-bold text-sm tracking-widest">
                    {revealed[u.id] ? (u.plainPin ?? '????') : '••••'}
                  </span>
                  <button
                    onClick={() => toggle(u.id)}
                    className="text-muted-foreground hover:text-foreground transition-colors"
                    aria-label={revealed[u.id] ? 'Hide PIN' : 'Reveal PIN'}
                  >
                    {revealed[u.id] ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                  </button>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      ))}
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
  const [form, setForm] = useState({ type: '', name: '', accountNumber: '', accountName: '', instructions: '', logoEmoji: '💳', isActive: true });
  const [editId, setEditId] = useState<number | null>(null);
  const [showForm, setShowForm] = useState(false);

  const save = useMutation({
    mutationFn: () => editId
      ? apiFetch(`/admin/payment-methods/${editId}`, { method: 'PUT', body: JSON.stringify(form) })
      : apiFetch('/admin/payment-methods', { method: 'POST', body: JSON.stringify(form) }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['admin-payment-methods'] }); toast({ title: editId ? 'Updated ✓' : 'Created ✓' }); setShowForm(false); setEditId(null); setForm({ type: '', name: '', accountNumber: '', accountName: '', instructions: '', logoEmoji: '💳', isActive: true }); },
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
            {[
              { label: 'Type (botim/emoney/bank_transfer)', key: 'type' },
              { label: 'Display Name', key: 'name' },
              { label: 'Account / Number', key: 'accountNumber' },
              { label: 'Account Name', key: 'accountName' },
              { label: 'Emoji', key: 'logoEmoji' },
            ].map(({ label, key }) => (
              <div key={key} className="space-y-1">
                <Label className="text-xs">{label}</Label>
                <Input value={(form as any)[key]} onChange={e => setForm(f => ({ ...f, [key]: e.target.value }))} className="text-sm" />
              </div>
            ))}
            <div className="space-y-1">
              <Label className="text-xs">Instructions</Label>
              <Textarea value={form.instructions} onChange={e => setForm(f => ({ ...f, instructions: e.target.value }))} rows={2} className="text-sm" />
            </div>
            <div className="flex gap-2">
              <Button size="sm" className="flex-1" onClick={() => save.mutate()} disabled={save.isPending}>Save</Button>
              <Button size="sm" variant="outline" className="flex-1" onClick={() => { setShowForm(false); setEditId(null); }}>Cancel</Button>
            </div>
          </CardContent>
        </Card>
      )}
      {isLoading ? <Skeleton className="h-24" /> : (methods as any[] | undefined)?.map((m: any) => (
        <Card key={m.id} className={m.isActive ? '' : 'opacity-50'}>
          <CardContent className="p-3 flex items-center gap-3">
            <span className="text-xl">{m.logoEmoji}</span>
            <div className="flex-1 min-w-0">
              <p className="font-bold text-sm">{m.name}</p>
              <p className="text-xs font-mono text-muted-foreground truncate">{m.accountNumber}</p>
            </div>
            <div className="flex items-center gap-1 shrink-0">
              <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={() => { setForm({ type: m.type, name: m.name, accountNumber: m.accountNumber, accountName: m.accountName, instructions: m.instructions, logoEmoji: m.logoEmoji, isActive: m.isActive }); setEditId(m.id); setShowForm(true); }}>
                <Edit2 className="w-3.5 h-3.5" />
              </Button>
              <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={() => toggle.mutate({ id: m.id, isActive: !m.isActive })}>
                {m.isActive ? <XCircle className="w-3.5 h-3.5 text-red-400" /> : <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />}
              </Button>
            </div>
          </CardContent>
        </Card>
      ))}
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

  const pendingDeposits    = (deposits     as any[] | undefined)?.filter(d => d.status === 'pending').length ?? 0;
  const pendingWithdrawals = (withdrawals  as any[] | undefined)?.filter(w => w.status === 'pending').length ?? 0;
  const openTickets        = (tickets      as any[] | undefined)?.filter(t => t.status === 'open').length    ?? 0;
  const pendingSends       = (transactions as any[] | undefined)?.filter(t => t.status === 'pending').length ?? 0;

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
        <img src={`${import.meta.env.BASE_URL}logo.png`} alt="Nivio" className="w-16 h-16 rounded-2xl shadow-xl" />
        <div className="text-center">
          <h1 className="text-2xl font-extrabold tracking-tight">Nivio</h1>
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
          <p className="text-xs text-muted-foreground">Nivio · Admin Portal · Restricted Access</p>
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
        <p className="text-xs text-muted-foreground">Nivio · Admin Portal · Restricted Access</p>
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
          <p className="text-xs text-muted-foreground">Nivio Operations</p>
        </div>
        <Button variant="outline" size="sm" onClick={() => { sessionStorage.removeItem(ADMIN_JWT_KEY); setAuthed(false); qc.clear(); }}>Sign Out</Button>
      </div>

      {/* 4 clickable stat cards */}
      <div className="grid grid-cols-4 gap-2">
        <StatCard label="Deposit"    count={pendingDeposits}    tab="deposits"      icon={ArrowDownLeft}  accentClass="text-primary" />
        <StatCard label="Send"       count={pendingSends}       tab="sends"         icon={ArrowLeftRight} accentClass="text-blue-500" />
        <StatCard label="Withdrawal" count={pendingWithdrawals} tab="withdrawals"   icon={ArrowUpRight}   accentClass="text-amber-500" />
        <StatCard label="Ticket"     count={openTickets}        tab="tickets"       icon={MessageSquare}  accentClass="text-purple-500" />
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="flex w-full overflow-x-auto gap-0.5 h-auto p-1 flex-nowrap">
          <TabsTrigger value="deposits" className="text-[11px] shrink-0 flex-1 min-w-[48px]">
            Dep{pendingDeposits > 0 && <span className="ml-1 bg-red-500 text-white text-[9px] rounded-full w-3.5 h-3.5 inline-flex items-center justify-center font-bold">{pendingDeposits}</span>}
          </TabsTrigger>
          <TabsTrigger value="sends" className="text-[11px] shrink-0 flex-1 min-w-[48px]">
            Send{pendingSends > 0 && <span className="ml-1 bg-red-500 text-white text-[9px] rounded-full w-3.5 h-3.5 inline-flex items-center justify-center font-bold">{pendingSends}</span>}
          </TabsTrigger>
          <TabsTrigger value="withdrawals" className="text-[11px] shrink-0 flex-1 min-w-[48px]">
            W/draw{pendingWithdrawals > 0 && <span className="ml-1 bg-red-500 text-white text-[9px] rounded-full w-3.5 h-3.5 inline-flex items-center justify-center font-bold">{pendingWithdrawals}</span>}
          </TabsTrigger>
          <TabsTrigger value="users" className="text-[11px] shrink-0 flex-1 min-w-[44px]">Users</TabsTrigger>
          <TabsTrigger value="tickets" className="text-[11px] shrink-0 flex-1 min-w-[48px]">
            Tickets{openTickets > 0 && <span className="ml-1 bg-red-500 text-white text-[9px] rounded-full w-3.5 h-3.5 inline-flex items-center justify-center font-bold">{openTickets}</span>}
          </TabsTrigger>
          <TabsTrigger value="methods" className="text-[11px] shrink-0 flex-1 min-w-[44px]">Methods</TabsTrigger>
          <TabsTrigger value="rates" className="text-[11px] shrink-0 flex-1 min-w-[44px]">Rates</TabsTrigger>
          <TabsTrigger value="settings" className="text-[11px] shrink-0 flex-1 min-w-[40px]"><Settings2 className="w-3 h-3" /></TabsTrigger>
        </TabsList>
        <TabsContent value="deposits"    className="mt-4"><DepositsPanel /></TabsContent>
        <TabsContent value="sends"       className="mt-4"><SendsPanel /></TabsContent>
        <TabsContent value="withdrawals" className="mt-4"><WithdrawalsPanel /></TabsContent>
        <TabsContent value="users"       className="mt-4"><UsersPanel /></TabsContent>
        <TabsContent value="tickets"     className="mt-4"><TicketsPanel /></TabsContent>
        <TabsContent value="methods"     className="mt-4"><PaymentMethodsPanel /></TabsContent>
        <TabsContent value="rates"       className="mt-4"><RatesPanel /></TabsContent>
        <TabsContent value="settings"    className="mt-4"><SettingsPanel /></TabsContent>
      </Tabs>
    </div>
  );
}
