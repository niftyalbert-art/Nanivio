import { useState, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/contexts/auth';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { ShieldCheck, Clock, CheckCircle2, XCircle, Upload, AlertTriangle, FileText, ChevronRight } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

const API = import.meta.env.BASE_URL.replace(/\/$/, '') + '/api';

type KycStatus = 'unverified' | 'pending' | 'verified' | 'rejected';

interface KycState {
  kycStatus: KycStatus;
  kycRejectionReason: string | null;
  kycSubmittedAt: string | null;
  kycReviewedAt: string | null;
  hasDocument: boolean;
}

const ID_TYPES = [
  { value: 'passport', label: 'Passport', emoji: '🛂' },
  { value: 'national_id', label: 'National ID', emoji: '🪪' },
  { value: 'drivers_licence', label: "Driver's Licence", emoji: '🚗' },
];

function StatusBadge({ status }: { status: KycStatus }) {
  switch (status) {
    case 'verified':
      return <Badge className="bg-emerald-500/10 text-emerald-500 border-emerald-500/20 gap-1"><CheckCircle2 className="w-3 h-3" /> Verified</Badge>;
    case 'pending':
      return <Badge className="bg-amber-500/10 text-amber-500 border-amber-500/20 gap-1"><Clock className="w-3 h-3" /> Under Review</Badge>;
    case 'rejected':
      return <Badge className="bg-red-500/10 text-red-500 border-red-500/20 gap-1"><XCircle className="w-3 h-3" /> Rejected</Badge>;
    default:
      return <Badge className="bg-muted text-muted-foreground gap-1"><AlertTriangle className="w-3 h-3" /> Unverified</Badge>;
  }
}

export default function KycPage() {
  const { token } = useAuth();
  const { toast } = useToast();
  const qc = useQueryClient();
  const fileRef = useRef<HTMLInputElement>(null);

  const [selectedIdType, setSelectedIdType] = useState<string>('');
  const [previewSrc, setPreviewSrc] = useState<string | null>(null);
  const [documentBase64, setDocumentBase64] = useState<string | null>(null);

  const { data: kycState, isLoading } = useQuery<KycState>({
    queryKey: ['kyc-status'],
    queryFn: () =>
      fetch(`${API}/kyc/status`, { headers: { Authorization: `Bearer ${token}` } }).then(r => {
        if (!r.ok) throw new Error('Failed to load KYC status');
        return r.json();
      }),
    enabled: !!token,
  });

  const submit = useMutation({
    mutationFn: async () => {
      const r = await fetch(`${API}/kyc/submit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ documentBase64, idType: selectedIdType }),
      });
      if (!r.ok) {
        const body = await r.json().catch(() => ({ error: 'Unknown error' }));
        throw new Error(body.error ?? 'Submission failed');
      }
      return r.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['kyc-status'] });
      setPreviewSrc(null);
      setDocumentBase64(null);
      setSelectedIdType('');
      toast({ title: 'Document submitted', description: 'Our team will review your ID within 24 hours.' });
    },
    onError: (err: Error) => toast({ title: 'Submission failed', description: err.message, variant: 'destructive' }),
  });

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 8 * 1024 * 1024) {
      toast({ title: 'File too large', description: 'Please upload an image under 8 MB.', variant: 'destructive' });
      return;
    }
    const reader = new FileReader();
    reader.onload = ev => {
      const result = ev.target?.result as string;
      setPreviewSrc(result);
      setDocumentBase64(result);
    };
    reader.readAsDataURL(file);
  };

  const canSubmit = !!selectedIdType && !!documentBase64 && !submit.isPending;

  if (isLoading) {
    return (
      <div className="p-4 md:p-8 max-w-2xl mx-auto space-y-4">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-32" />
        <Skeleton className="h-48" />
      </div>
    );
  }

  const status = kycState?.kycStatus ?? 'unverified';

  return (
    <div className="p-4 md:p-8 max-w-2xl mx-auto space-y-5">
      {/* Header */}
      <div>
        <h1 className="text-2xl md:text-3xl font-bold tracking-tight">Identity Verification</h1>
        <p className="text-sm text-muted-foreground mt-0.5">Verify your identity to unlock higher transfer limits</p>
      </div>

      {/* Status card */}
      <Card className={
        status === 'verified' ? 'border-emerald-500/30 bg-emerald-500/5' :
        status === 'pending' ? 'border-amber-500/30 bg-amber-500/5' :
        status === 'rejected' ? 'border-red-500/30 bg-red-500/5' :
        'border-border'
      }>
        <CardContent className="p-4 flex items-start gap-4">
          <div className={`w-12 h-12 rounded-full flex items-center justify-center shrink-0 ${
            status === 'verified' ? 'bg-emerald-500/15' :
            status === 'pending' ? 'bg-amber-500/15' :
            status === 'rejected' ? 'bg-red-500/15' :
            'bg-muted'
          }`}>
            {status === 'verified' ? <CheckCircle2 className="w-6 h-6 text-emerald-500" /> :
             status === 'pending' ? <Clock className="w-6 h-6 text-amber-500" /> :
             status === 'rejected' ? <XCircle className="w-6 h-6 text-red-500" /> :
             <ShieldCheck className="w-6 h-6 text-muted-foreground" />}
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <p className="font-bold">KYC Status</p>
              <StatusBadge status={status} />
            </div>
            {status === 'unverified' && (
              <p className="text-sm text-muted-foreground">Unverified accounts can send up to <strong>$200</strong> per transaction. Verify to remove this limit.</p>
            )}
            {status === 'pending' && (
              <p className="text-sm text-muted-foreground">Your document is being reviewed. This usually takes less than 24 hours.</p>
            )}
            {status === 'verified' && (
              <p className="text-sm text-muted-foreground">Your identity is verified. You have full access to all transfer features.</p>
            )}
            {status === 'rejected' && (
              <>
                <p className="text-sm text-muted-foreground">Your submission was rejected. Please re-submit with a clear, valid document.</p>
                {kycState?.kycRejectionReason && (
                  <p className="mt-1.5 text-sm font-medium text-red-500">Reason: {kycState.kycRejectionReason}</p>
                )}
              </>
            )}
          </div>
        </CardContent>
      </Card>

      {/* $200 limit notice for unverified/rejected */}
      {(status === 'unverified' || status === 'rejected') && (
        <div className="flex items-start gap-3 rounded-xl border border-amber-500/30 bg-amber-500/5 p-3.5">
          <AlertTriangle className="w-4 h-4 text-amber-500 mt-0.5 shrink-0" />
          <div>
            <p className="text-sm font-semibold text-amber-600 dark:text-amber-400">$200 per-transaction limit active</p>
            <p className="text-xs text-muted-foreground mt-0.5">Transfers above $200 USD equivalent are blocked until your identity is verified.</p>
          </div>
        </div>
      )}

      {/* Status timeline */}
      <div className="space-y-1">
        <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground px-1">Verification Steps</p>
        <Card>
          <CardContent className="p-0 divide-y divide-border">
            {[
              {
                label: 'Submit government ID',
                desc: 'Upload a clear photo of your ID, passport, or licence',
                done: status !== 'unverified',
                active: status === 'unverified',
                ts: kycState?.kycSubmittedAt,
              },
              {
                label: 'Admin review',
                desc: 'Our team manually verifies your document',
                done: status === 'verified' || status === 'rejected',
                active: status === 'pending',
                ts: kycState?.kycReviewedAt,
              },
              {
                label: 'Verified',
                desc: 'Full transfer limits unlocked',
                done: status === 'verified',
                active: false,
                ts: status === 'verified' ? kycState?.kycReviewedAt : null,
              },
            ].map((step, i) => (
              <div key={i} className="flex items-center gap-3 p-3.5">
                <div className={`w-7 h-7 rounded-full flex items-center justify-center shrink-0 text-xs font-bold ${
                  step.done ? 'bg-emerald-500 text-white' :
                  step.active ? 'bg-primary text-primary-foreground' :
                  'bg-muted text-muted-foreground'
                }`}>
                  {step.done ? <CheckCircle2 className="w-4 h-4" /> : i + 1}
                </div>
                <div className="flex-1 min-w-0">
                  <p className={`text-sm font-semibold ${step.active ? 'text-foreground' : step.done ? 'text-emerald-600 dark:text-emerald-400' : 'text-muted-foreground'}`}>
                    {step.label}
                  </p>
                  <p className="text-xs text-muted-foreground">{step.desc}</p>
                  {step.ts && (
                    <p className="text-[10px] text-muted-foreground mt-0.5">{new Date(step.ts).toLocaleString()}</p>
                  )}
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>

      {/* Upload form — shown only when user can/should submit */}
      {(status === 'unverified' || status === 'rejected') && (
        <div className="space-y-3">
          <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground px-1">Submit Your ID</p>

          {/* ID type selector */}
          <div className="grid grid-cols-3 gap-2">
            {ID_TYPES.map(t => (
              <button
                key={t.value}
                type="button"
                onClick={() => setSelectedIdType(t.value)}
                className={`flex flex-col items-center gap-1.5 rounded-xl border-2 p-3 text-center transition-colors ${
                  selectedIdType === t.value
                    ? 'border-primary bg-primary/5'
                    : 'border-border bg-card hover:border-primary/40'
                }`}
              >
                <span className="text-2xl">{t.emoji}</span>
                <span className="text-[11px] font-semibold leading-tight">{t.label}</span>
              </button>
            ))}
          </div>

          {/* File drop zone */}
          <div
            className={`relative border-2 border-dashed rounded-xl p-6 text-center cursor-pointer transition-colors ${
              previewSrc ? 'border-primary/50 bg-primary/5' : 'border-border hover:border-primary/40'
            }`}
            onClick={() => fileRef.current?.click()}
          >
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={handleFileChange}
            />
            {previewSrc ? (
              <div className="space-y-2">
                <img src={previewSrc} alt="ID preview" className="mx-auto max-h-48 rounded-lg object-contain" />
                <p className="text-xs text-emerald-500 font-medium">✓ Document ready — tap to change</p>
              </div>
            ) : (
              <div className="space-y-2">
                <div className="w-12 h-12 rounded-full bg-muted flex items-center justify-center mx-auto">
                  <Upload className="w-5 h-5 text-muted-foreground" />
                </div>
                <div>
                  <p className="text-sm font-semibold">Upload your document</p>
                  <p className="text-xs text-muted-foreground mt-0.5">JPG, PNG, WEBP · Max 8 MB</p>
                </div>
              </div>
            )}
          </div>

          {/* Tips */}
          <div className="rounded-xl bg-muted/50 p-3.5 space-y-1.5">
            <p className="text-xs font-semibold flex items-center gap-1.5"><FileText className="w-3.5 h-3.5" /> Tips for a successful submission</p>
            <ul className="text-xs text-muted-foreground space-y-0.5 ml-1 list-disc list-inside">
              <li>All four corners of the document must be visible</li>
              <li>Ensure text is legible and not blurry</li>
              <li>Make sure there's no glare or shadow over the photo</li>
              <li>Do not crop or edit the document image</li>
            </ul>
          </div>

          <Button
            className="w-full font-semibold"
            disabled={!canSubmit}
            onClick={() => submit.mutate()}
          >
            {submit.isPending ? 'Submitting…' : 'Submit for Verification'}
          </Button>
        </div>
      )}
    </div>
  );
}
