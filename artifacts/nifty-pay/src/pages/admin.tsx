import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Skeleton } from '@/components/ui/skeleton';
import { CheckCircle2, XCircle, Clock, ArrowDownLeft, ArrowUpRight, MessageSquare, Lock, Plus, Edit2, TrendingUp } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { useToast } from '@/hooks/use-toast';

const API = import.meta.env.BASE_URL.replace(/\/$/, '') + '/api';
const ADMIN_PIN = 'niviopay2024';

function apiFetch(path: string, opts?: RequestInit) {
  return fetch(`${API}${path}`, {
    headers: { 'Content-Type': 'application/json', 'X-Admin-Key': ADMIN_PIN },
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

// ── Deposits Panel ──────────────────────────────────────────────────────────
function DepositsPanel() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const { data: deposits, isLoading } = useQuery({ queryKey: ['admin-deposits'], queryFn: () => apiFetch('/deposits') });
  const [note, setNote] = useState<Record<number, string>>({});

  const approve = useMutation({
    mutationFn: ({ id, adminNote }: { id: number; adminNote?: string }) =>
      apiFetch(`/admin/deposits/${id}/approve`, { method: 'PUT', body: JSON.stringify({ adminNote }) }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['admin-deposits'] }); toast({ title: 'Deposit approved ✓' }); },
    onError: (e: any) => toast({ title: 'Error', description: e.message, variant: 'destructive' }),
  });
  const reject = useMutation({
    mutationFn: ({ id, adminNote }: { id: number; adminNote?: string }) =>
      apiFetch(`/admin/deposits/${id}/reject`, { method: 'PUT', body: JSON.stringify({ adminNote }) }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['admin-deposits'] }); toast({ title: 'Deposit rejected' }); },
    onError: (e: any) => toast({ title: 'Error', description: e.message, variant: 'destructive' }),
  });

  if (isLoading) return <div className="space-y-3">{[...Array(3)].map((_, i) => <Skeleton key={i} className="h-36" />)}</div>;
  const pending = (deposits as any[] | undefined)?.filter(d => d.status === 'pending') ?? [];
  const done = (deposits as any[] | undefined)?.filter(d => d.status !== 'pending') ?? [];

  return (
    <div className="space-y-4">
      {pending.length === 0 && <p className="text-sm text-muted-foreground text-center py-6">No pending deposits 🎉</p>}
      {pending.map((d: any) => (
        <Card key={d.id} className="border-amber-500/30">
          <CardContent className="p-4 space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <p className="font-bold text-sm">Deposit #{d.id}</p>
                <p className="text-xs text-muted-foreground">{formatDistanceToNow(new Date(d.createdAt))} ago · {d.currencyCode}</p>
              </div>
              <Badge className={statusColor(d.status)}>{d.status}</Badge>
            </div>
            <div className="grid grid-cols-2 gap-2 text-xs">
              <div className="bg-muted/50 rounded-lg p-2"><p className="text-muted-foreground">Amount</p><p className="font-bold font-mono">{parseFloat(d.amount).toLocaleString()} {d.currencyCode}</p></div>
              <div className="bg-muted/50 rounded-lg p-2"><p className="text-muted-foreground">Tx ID</p><p className="font-mono truncate">{d.externalTransactionId}</p></div>
            </div>
            {d.receiptImage && (
              <img src={d.receiptImage} alt="Receipt" className="rounded-lg w-full max-h-48 object-contain bg-muted" />
            )}
            <Input placeholder="Admin note (optional)" value={note[d.id] || ''} onChange={e => setNote(n => ({ ...n, [d.id]: e.target.value }))} className="text-xs" />
            <div className="flex gap-2">
              <Button size="sm" className="flex-1 bg-emerald-600 hover:bg-emerald-700" onClick={() => approve.mutate({ id: d.id, adminNote: note[d.id] })} disabled={approve.isPending}>
                <CheckCircle2 className="w-3.5 h-3.5 mr-1" /> Approve & Credit
              </Button>
              <Button size="sm" variant="destructive" className="flex-1" onClick={() => reject.mutate({ id: d.id, adminNote: note[d.id] })} disabled={reject.isPending}>
                <XCircle className="w-3.5 h-3.5 mr-1" /> Reject
              </Button>
            </div>
          </CardContent>
        </Card>
      ))}
      {done.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Processed</p>
          {done.map((d: any) => (
            <Card key={d.id} className="opacity-70">
              <CardContent className="p-3 flex items-center justify-between gap-3">
                <div><p className="text-sm font-semibold">#{d.id} — {parseFloat(d.amount).toLocaleString()} {d.currencyCode}</p>
                  <p className="text-xs text-muted-foreground">{d.externalTransactionId}</p></div>
                <Badge className={statusColor(d.status)}>{d.status}</Badge>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Withdrawals Panel ───────────────────────────────────────────────────────
function WithdrawalsPanel() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const fileRef = useState<HTMLInputElement | null>(null);
  const { data: withdrawals, isLoading } = useQuery({ queryKey: ['admin-withdrawals'], queryFn: () => apiFetch('/withdrawals') });
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

// ── Main Admin Page ─────────────────────────────────────────────────────────
export default function Admin() {
  const [pin, setPin] = useState('');
  const [authed, setAuthed] = useState(false);
  const { toast } = useToast();
  const qc = useQueryClient();

  const { data: deposits } = useQuery({ queryKey: ['admin-deposits'], queryFn: () => apiFetch('/deposits'), enabled: authed });
  const { data: withdrawals } = useQuery({ queryKey: ['admin-withdrawals'], queryFn: () => apiFetch('/withdrawals'), enabled: authed });
  const { data: tickets } = useQuery({ queryKey: ['admin-tickets'], queryFn: () => apiFetch('/tickets'), enabled: authed });

  const pendingDeposits = (deposits as any[] | undefined)?.filter(d => d.status === 'pending').length ?? 0;
  const pendingWithdrawals = (withdrawals as any[] | undefined)?.filter(w => w.status === 'pending').length ?? 0;
  const openTickets = (tickets as any[] | undefined)?.filter(t => t.status === 'open').length ?? 0;

  if (!authed) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4 bg-background">
        <Card className="w-full max-w-sm">
          <CardContent className="pt-8 pb-8 space-y-5 text-center">
            <div className="w-14 h-14 rounded-full bg-primary/10 flex items-center justify-center mx-auto">
              <Lock className="w-7 h-7 text-primary" />
            </div>
            <div><h1 className="text-xl font-bold">Admin Panel</h1><p className="text-sm text-muted-foreground">Nivio Operations</p></div>
            <div className="space-y-3 text-left">
              <Label>Access PIN</Label>
              <Input type="password" placeholder="Enter admin PIN" value={pin} onChange={e => setPin(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') { if (pin === ADMIN_PIN) setAuthed(true); else toast({ title: 'Wrong PIN', variant: 'destructive' }); } }} />
              <Button className="w-full" onClick={() => { if (pin === ADMIN_PIN) setAuthed(true); else toast({ title: 'Wrong PIN', variant: 'destructive' }); }}>
                Sign In
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background p-4 md:p-6 max-w-2xl mx-auto space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold">Admin Panel</h1>
          <p className="text-xs text-muted-foreground">Nivio Operations</p>
        </div>
        <Button variant="outline" size="sm" onClick={() => setAuthed(false)}>Sign Out</Button>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-3 gap-3">
        {[
          { label: 'Deposits', count: pendingDeposits, icon: ArrowDownLeft, color: 'text-primary' },
          { label: 'Withdrawals', count: pendingWithdrawals, icon: ArrowUpRight, color: 'text-amber-500' },
          { label: 'Tickets', count: openTickets, icon: MessageSquare, color: 'text-blue-500' },
        ].map(({ label, count, icon: Icon, color }) => (
          <Card key={label}>
            <CardContent className="p-3 text-center">
              <Icon className={`w-4 h-4 mx-auto mb-1 ${color}`} />
              <p className="text-xl font-bold">{count}</p>
              <p className="text-xs text-muted-foreground">{label}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <Tabs defaultValue="deposits">
        <TabsList className="w-full grid grid-cols-5">
          <TabsTrigger value="deposits" className="text-xs relative">
            Dep {pendingDeposits > 0 && <span className="ml-1 bg-amber-500 text-white text-[9px] rounded-full w-4 h-4 inline-flex items-center justify-center">{pendingDeposits}</span>}
          </TabsTrigger>
          <TabsTrigger value="withdrawals" className="text-xs">
            Send {pendingWithdrawals > 0 && <span className="ml-1 bg-amber-500 text-white text-[9px] rounded-full w-4 h-4 inline-flex items-center justify-center">{pendingWithdrawals}</span>}
          </TabsTrigger>
          <TabsTrigger value="tickets" className="text-xs">
            Tickets {openTickets > 0 && <span className="ml-1 bg-blue-500 text-white text-[9px] rounded-full w-4 h-4 inline-flex items-center justify-center">{openTickets}</span>}
          </TabsTrigger>
          <TabsTrigger value="methods" className="text-xs">Methods</TabsTrigger>
          <TabsTrigger value="rates" className="text-xs">Rates</TabsTrigger>
        </TabsList>
        <TabsContent value="deposits" className="mt-4"><DepositsPanel /></TabsContent>
        <TabsContent value="withdrawals" className="mt-4"><WithdrawalsPanel /></TabsContent>
        <TabsContent value="tickets" className="mt-4"><TicketsPanel /></TabsContent>
        <TabsContent value="methods" className="mt-4"><PaymentMethodsPanel /></TabsContent>
        <TabsContent value="rates" className="mt-4"><RatesPanel /></TabsContent>
      </Tabs>
    </div>
  );
}
