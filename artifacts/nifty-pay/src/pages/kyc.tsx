import { useState, useRef, useEffect, useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/contexts/auth';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { ShieldCheck, Clock, CheckCircle2, XCircle, Upload, AlertTriangle, FileText, Camera, RefreshCw, SwitchCamera, ImagePlus } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

const API = import.meta.env.BASE_URL.replace(/\/$/, '') + '/api';

type KycStatus = 'unverified' | 'pending' | 'verified' | 'rejected';

interface KycState {
  kycStatus: KycStatus;
  kycRejectionReason: string | null;
  kycSubmittedAt: string | null;
  kycReviewedAt: string | null;
  hasDocument: boolean;
  hasSelfie: boolean;
}

const ID_TYPES = [
  { value: 'passport',        label: 'Passport',          emoji: '🛂' },
  { value: 'national_id',     label: 'National ID',        emoji: '🪪' },
  { value: 'drivers_licence', label: "Driver's Licence",   emoji: '🚗' },
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

// ── Selfie capture component ──────────────────────────────────────────────────
function SelfieCaptureStep({
  selfiePreview,
  onCapture,
  onClear,
}: {
  selfiePreview: string | null;
  onCapture: (dataUrl: string) => void;
  onClear: () => void;
}) {
  const videoRef    = useRef<HTMLVideoElement>(null);
  const canvasRef   = useRef<HTMLCanvasElement>(null);
  const fileRef     = useRef<HTMLInputElement>(null);
  const [stream, setStream]           = useState<MediaStream | null>(null);
  const [cameraError, setCameraError] = useState('');
  const [cameraActive, setCameraActive] = useState(false);
  const [facingMode, setFacingMode]   = useState<'user' | 'environment'>('user');

  const stopCamera = useCallback(() => {
    if (stream) { stream.getTracks().forEach(t => t.stop()); setStream(null); }
    setCameraActive(false);
  }, [stream]);

  const startCamera = useCallback(async (facing: 'user' | 'environment' = 'user') => {
    stopCamera();
    setCameraError('');
    try {
      const s = await navigator.mediaDevices.getUserMedia({ video: { facingMode: facing, width: { ideal: 1280 }, height: { ideal: 720 } } });
      setStream(s);
      setCameraActive(true);
      if (videoRef.current) { videoRef.current.srcObject = s; videoRef.current.play(); }
    } catch (err: any) {
      setCameraError(err?.name === 'NotAllowedError' ? 'Camera access denied. Please allow camera access in your browser settings, or upload a photo instead.' : 'Could not access camera. Please upload a photo instead.');
    }
  }, [stopCamera]);

  // Attach stream to video when both are ready
  useEffect(() => {
    if (stream && videoRef.current) { videoRef.current.srcObject = stream; videoRef.current.play(); }
  }, [stream]);

  // Clean up on unmount
  useEffect(() => () => { stream?.getTracks().forEach(t => t.stop()); }, [stream]);

  const capturePhoto = () => {
    const video  = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas) return;
    canvas.width  = video.videoWidth  || 640;
    canvas.height = video.videoHeight || 480;
    canvas.getContext('2d')?.drawImage(video, 0, 0);
    const dataUrl = canvas.toDataURL('image/jpeg', 0.92);
    onCapture(dataUrl);
    stopCamera();
  };

  const flipCamera = async () => {
    const next = facingMode === 'user' ? 'environment' : 'user';
    setFacingMode(next);
    await startCamera(next);
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 8 * 1024 * 1024) { setCameraError('File too large — max 8 MB.'); return; }
    const reader = new FileReader();
    reader.onload = ev => { onCapture(ev.target?.result as string); };
    reader.readAsDataURL(file);
  };

  // ── Already captured ──
  if (selfiePreview) {
    return (
      <div className="space-y-3">
        <div className="relative rounded-xl overflow-hidden border border-emerald-500/30 bg-emerald-500/5">
          <img src={selfiePreview} alt="Selfie preview" className="w-full max-h-56 object-cover" />
          <div className="absolute inset-0 flex items-end justify-center pb-3">
            <span className="text-xs bg-emerald-600 text-white font-semibold px-3 py-1 rounded-full">✓ Selfie captured</span>
          </div>
        </div>
        <Button variant="outline" size="sm" className="w-full gap-2" onClick={onClear}>
          <RefreshCw className="w-3.5 h-3.5" /> Retake selfie
        </Button>
      </div>
    );
  }

  // ── Camera active ──
  if (cameraActive) {
    return (
      <div className="space-y-3">
        <div className="relative rounded-xl overflow-hidden border border-primary/30 bg-black">
          <video ref={videoRef} className="w-full max-h-64 object-cover" autoPlay muted playsInline />
          {/* Oval face guide overlay */}
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <div className="w-36 h-44 border-4 border-primary/60 rounded-full opacity-60" />
          </div>
          <canvas ref={canvasRef} className="hidden" />
        </div>
        <div className="flex gap-2">
          <Button className="flex-1 gap-2 font-semibold" onClick={capturePhoto}>
            <Camera className="w-4 h-4" /> Take Photo
          </Button>
          <Button variant="outline" size="sm" className="h-10 w-10 p-0" onClick={flipCamera} title="Flip camera">
            <SwitchCamera className="w-4 h-4" />
          </Button>
          <Button variant="ghost" size="sm" className="h-10 px-3 text-xs" onClick={stopCamera}>Cancel</Button>
        </div>
      </div>
    );
  }

  // ── Default: prompt to open camera or upload ──
  return (
    <div className="space-y-3">
      {cameraError && (
        <div className="text-xs text-amber-600 bg-amber-500/10 border border-amber-500/20 rounded-lg px-3 py-2">{cameraError}</div>
      )}

      <div
        className="border-2 border-dashed rounded-xl p-6 text-center cursor-pointer hover:border-primary/40 transition-colors"
        onClick={() => startCamera(facingMode)}
      >
        <div className="w-14 h-14 rounded-full bg-primary/10 flex items-center justify-center mx-auto mb-3">
          <Camera className="w-6 h-6 text-primary" />
        </div>
        <p className="text-sm font-semibold">Open Camera</p>
        <p className="text-xs text-muted-foreground mt-0.5">Position your face inside the oval guide and tap Take Photo</p>
      </div>

      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <div className="flex-1 h-px bg-border" />
        <span>or upload a photo</span>
        <div className="flex-1 h-px bg-border" />
      </div>

      <button
        type="button"
        className="w-full flex items-center justify-center gap-2 border border-border rounded-xl py-2.5 text-sm text-muted-foreground hover:text-foreground hover:border-primary/40 transition-colors"
        onClick={() => fileRef.current?.click()}
      >
        <ImagePlus className="w-4 h-4" /> Upload selfie photo
      </button>
      <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handleFileUpload} />

      <canvas ref={canvasRef} className="hidden" />
    </div>
  );
}

// ── Main KYC page ─────────────────────────────────────────────────────────────
export default function KycPage() {
  const { token } = useAuth();
  const { toast } = useToast();
  const qc = useQueryClient();
  const fileRef = useRef<HTMLInputElement>(null);

  // Step 1: ID document
  const [selectedIdType, setSelectedIdType] = useState<string>('');
  const [previewSrc, setPreviewSrc]         = useState<string | null>(null);
  const [documentBase64, setDocumentBase64] = useState<string | null>(null);

  // Step 2: Selfie
  const [selfieBase64, setSelfieBase64]     = useState<string | null>(null);
  const [selfiePreview, setSelfiePreview]   = useState<string | null>(null);

  // Which step the user is on (1 = ID, 2 = Selfie)
  const [activeStep, setActiveStep]         = useState<1 | 2>(1);

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
        body: JSON.stringify({ documentBase64, selfieBase64, idType: selectedIdType }),
      });
      if (!r.ok) {
        const body = await r.json().catch(() => ({ error: 'Unknown error' }));
        throw new Error(body.error ?? 'Submission failed');
      }
      return r.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['kyc-status'] });
      setPreviewSrc(null); setDocumentBase64(null); setSelectedIdType('');
      setSelfieBase64(null); setSelfiePreview(null); setActiveStep(1);
      toast({ title: 'Verification submitted', description: 'Our team will review your documents within 24 hours.' });
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

  const handleSelfieCapture = (dataUrl: string) => {
    setSelfieBase64(dataUrl);
    setSelfiePreview(dataUrl);
  };

  const step1Complete = !!selectedIdType && !!documentBase64;
  const step2Complete = !!selfieBase64;
  const canSubmit = step1Complete && step2Complete && !submit.isPending;

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
        status === 'verified'  ? 'border-emerald-500/30 bg-emerald-500/5' :
        status === 'pending'   ? 'border-amber-500/30 bg-amber-500/5' :
        status === 'rejected'  ? 'border-red-500/30 bg-red-500/5' : 'border-border'
      }>
        <CardContent className="p-4 flex items-start gap-4">
          <div className={`w-12 h-12 rounded-full flex items-center justify-center shrink-0 ${
            status === 'verified'  ? 'bg-emerald-500/15' :
            status === 'pending'  ? 'bg-amber-500/15' :
            status === 'rejected' ? 'bg-red-500/15' : 'bg-muted'
          }`}>
            {status === 'verified'  ? <CheckCircle2 className="w-6 h-6 text-emerald-500" /> :
             status === 'pending'   ? <Clock className="w-6 h-6 text-amber-500" /> :
             status === 'rejected'  ? <XCircle className="w-6 h-6 text-red-500" /> :
             <ShieldCheck className="w-6 h-6 text-muted-foreground" />}
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <p className="font-bold">KYC Status</p>
              <StatusBadge status={status} />
            </div>
            {status === 'unverified' && (
              <p className="text-sm text-muted-foreground">Unverified accounts can send up to <strong>$2,000</strong> per transaction. Verify to remove this limit.</p>
            )}
            {status === 'pending' && (
              <p className="text-sm text-muted-foreground">Your documents are being reviewed. This usually takes less than 24 hours.</p>
            )}
            {status === 'verified' && (
              <p className="text-sm text-muted-foreground">Your identity is verified. You have full access to all transfer features.</p>
            )}
            {status === 'rejected' && (
              <>
                <p className="text-sm text-muted-foreground">Your submission was rejected. Please re-submit with a clear, valid document and selfie.</p>
                {kycState?.kycRejectionReason && (
                  <p className="mt-1.5 text-sm font-medium text-red-500">Reason: {kycState.kycRejectionReason}</p>
                )}
              </>
            )}
          </div>
        </CardContent>
      </Card>

      {/* $2000 limit notice for unverified/rejected */}
      {(status === 'unverified' || status === 'rejected') && (
        <div className="flex items-start gap-3 rounded-xl border border-amber-500/30 bg-amber-500/5 p-3.5">
          <AlertTriangle className="w-4 h-4 text-amber-500 mt-0.5 shrink-0" />
          <div>
            <p className="text-sm font-semibold text-amber-600 dark:text-amber-400">$2,000 per-transaction limit active</p>
            <p className="text-xs text-muted-foreground mt-0.5">Transfers above $2,000 USD equivalent are blocked until your identity is verified.</p>
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
                desc: 'Upload a clear photo of your passport, ID card, or driving licence',
                done: status !== 'unverified',
                active: status === 'unverified',
                ts: null,
              },
              {
                label: 'Facial verification',
                desc: 'Take a selfie so we can match your face to your ID',
                done: status !== 'unverified',
                active: status === 'unverified',
                ts: null,
              },
              {
                label: 'Admin review',
                desc: 'Our team manually verifies your documents',
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
                  step.done   ? 'bg-emerald-500 text-white' :
                  step.active ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'
                }`}>
                  {step.done ? <CheckCircle2 className="w-4 h-4" /> : i + 1}
                </div>
                <div className="flex-1 min-w-0">
                  <p className={`text-sm font-semibold ${step.active ? 'text-foreground' : step.done ? 'text-emerald-600 dark:text-emerald-400' : 'text-muted-foreground'}`}>
                    {step.label}
                  </p>
                  <p className="text-xs text-muted-foreground">{step.desc}</p>
                  {step.ts && <p className="text-[10px] text-muted-foreground mt-0.5">{new Date(step.ts).toLocaleString()}</p>}
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>

      {/* ── Submission form — shown only when user can/should submit ── */}
      {(status === 'unverified' || status === 'rejected') && (
        <div className="space-y-4">
          {/* Step tabs */}
          <div className="flex rounded-xl border border-border overflow-hidden">
            {[
              { step: 1 as const, label: 'Step 1', sub: 'Government ID', done: step1Complete },
              { step: 2 as const, label: 'Step 2', sub: 'Face Photo',    done: step2Complete },
            ].map(({ step, label, sub, done }) => (
              <button
                key={step}
                type="button"
                onClick={() => setActiveStep(step)}
                className={`flex-1 py-3 text-center transition-colors border-r last:border-r-0 border-border ${
                  activeStep === step ? 'bg-primary/10 border-b-2 border-b-primary' : 'bg-card hover:bg-muted/40'
                }`}
              >
                <div className="flex items-center justify-center gap-2">
                  <div className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold shrink-0 ${done ? 'bg-emerald-500 text-white' : activeStep === step ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'}`}>
                    {done ? <CheckCircle2 className="w-3 h-3" /> : step}
                  </div>
                  <div className="text-left">
                    <p className="text-[10px] text-muted-foreground leading-none">{label}</p>
                    <p className="text-xs font-semibold leading-tight">{sub}</p>
                  </div>
                </div>
              </button>
            ))}
          </div>

          {/* ── Step 1: ID Document ── */}
          {activeStep === 1 && (
            <div className="space-y-3">
              <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground px-1">Select ID Type</p>
              <div className="grid grid-cols-3 gap-2">
                {ID_TYPES.map(t => (
                  <button
                    key={t.value}
                    type="button"
                    onClick={() => setSelectedIdType(t.value)}
                    className={`flex flex-col items-center gap-1.5 rounded-xl border-2 p-3 text-center transition-colors ${
                      selectedIdType === t.value ? 'border-primary bg-primary/5' : 'border-border bg-card hover:border-primary/40'
                    }`}
                  >
                    <span className="text-2xl">{t.emoji}</span>
                    <span className="text-[11px] font-semibold leading-tight">{t.label}</span>
                  </button>
                ))}
              </div>

              <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground px-1 pt-1">Upload Document Photo</p>
              <div
                className={`relative border-2 border-dashed rounded-xl p-6 text-center cursor-pointer transition-colors ${
                  previewSrc ? 'border-primary/50 bg-primary/5' : 'border-border hover:border-primary/40'
                }`}
                onClick={() => fileRef.current?.click()}
              >
                <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handleFileChange} />
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
                    <p className="text-sm font-semibold">Upload your document</p>
                    <p className="text-xs text-muted-foreground">JPG, PNG, WEBP · Max 8 MB</p>
                  </div>
                )}
              </div>

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
                disabled={!step1Complete}
                onClick={() => setActiveStep(2)}
              >
                Continue to Face Photo →
              </Button>
            </div>
          )}

          {/* ── Step 2: Selfie / Facial Verification ── */}
          {activeStep === 2 && (
            <div className="space-y-3">
              <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground px-1">Take Your Selfie</p>

              <div className="rounded-xl bg-muted/50 p-3.5 space-y-1.5 mb-1">
                <p className="text-xs font-semibold flex items-center gap-1.5"><Camera className="w-3.5 h-3.5" /> Guidelines for a clear selfie</p>
                <ul className="text-xs text-muted-foreground space-y-0.5 ml-1 list-disc list-inside">
                  <li>Face the camera directly in good lighting</li>
                  <li>Remove glasses, hats, or anything covering your face</li>
                  <li>Keep a neutral expression — no filters</li>
                  <li>Make sure your full face is visible and in focus</li>
                </ul>
              </div>

              <SelfieCaptureStep
                selfiePreview={selfiePreview}
                onCapture={handleSelfieCapture}
                onClear={() => { setSelfieBase64(null); setSelfiePreview(null); }}
              />

              <div className="flex gap-2 pt-1">
                <Button variant="outline" className="flex-1" onClick={() => setActiveStep(1)}>← Back</Button>
                <Button
                  className="flex-1 font-semibold"
                  disabled={!canSubmit}
                  onClick={() => submit.mutate()}
                >
                  {submit.isPending ? (
                    <span className="flex items-center gap-2"><RefreshCw className="w-3.5 h-3.5 animate-spin" /> Submitting…</span>
                  ) : 'Submit for Verification'}
                </Button>
              </div>

              {(!step1Complete) && (
                <p className="text-xs text-center text-amber-500">⚠ Please complete Step 1 (ID document) before submitting.</p>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
