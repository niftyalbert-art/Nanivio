import { useState } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { Download, Smartphone, Share2, Copy, Check, ArrowLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Link } from 'wouter';
import { useInstallPrompt } from '@/hooks/use-install-prompt';

function isIOS() {
  return /iphone|ipad|ipod/i.test(navigator.userAgent);
}

export default function Install() {
  const appUrl = `${window.location.origin}${import.meta.env.BASE_URL}`;
  const { state, triggerInstall } = useInstallPrompt();
  const [copied, setCopied] = useState(false);
  const ios = isIOS();

  const handleInstall = async () => {
    await triggerInstall();
  };

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(appUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // fallback: select text
    }
  };

  const handleShare = async () => {
    if (navigator.share) {
      await navigator.share({
        title: 'Nivio — Money Without Borders',
        text: 'Send money globally with Nivio',
        url: appUrl,
      });
    }
  };

  const canShare = typeof navigator !== 'undefined' && !!navigator.share;

  return (
    <div className="min-h-[100dvh] bg-background flex flex-col items-center justify-center px-5 py-12 gap-8">

      {/* Logo + wordmark */}
      <div className="flex flex-col items-center gap-4 text-center">
        <img
          src={`${import.meta.env.BASE_URL}logo.png`}
          alt="Nivio"
          className="w-20 h-20 rounded-2xl shadow-2xl"
        />
        <div>
          <h1 className="text-3xl font-extrabold tracking-tight">Nivio</h1>
          <p className="text-sm text-muted-foreground mt-1">Money Without Borders</p>
        </div>
      </div>

      {/* QR code card */}
      <div className="flex flex-col items-center gap-4 bg-card border border-border rounded-2xl p-6 shadow-sm w-full max-w-xs">
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-widest">Scan to open on mobile</p>

        <div className="bg-white p-4 rounded-2xl shadow-inner">
          <QRCodeSVG
            value={appUrl}
            size={220}
            bgColor="#ffffff"
            fgColor="#0a1628"
            level="H"
            imageSettings={{
              src: `${import.meta.env.BASE_URL}logo.png`,
              x: undefined,
              y: undefined,
              height: 44,
              width: 44,
              excavate: true,
            }}
          />
        </div>

        {/* URL + copy */}
        <div className="flex items-center gap-2 w-full bg-muted/40 border border-border rounded-lg px-3 py-2">
          <p className="text-xs text-muted-foreground flex-1 truncate font-mono">{appUrl}</p>
          <button
            onClick={handleCopy}
            className="shrink-0 text-muted-foreground hover:text-foreground transition-colors"
            title="Copy link"
          >
            {copied ? <Check className="w-4 h-4 text-emerald-500" /> : <Copy className="w-4 h-4" />}
          </button>
        </div>

        {/* Share button (mobile) */}
        {canShare && (
          <Button variant="outline" className="w-full gap-2" onClick={handleShare}>
            <Share2 className="w-4 h-4" /> Share Link
          </Button>
        )}
      </div>

      {/* Install CTA */}
      <div className="flex flex-col items-center gap-3 w-full max-w-xs">
        {state === 'installed' ? (
          <div className="flex items-center gap-2 text-sm text-emerald-400 font-semibold">
            <Check className="w-4 h-4" /> Nivio is installed!
          </div>
        ) : state === 'promptable' ? (
          <Button size="lg" className="w-full font-bold gap-2" onClick={handleInstall}>
            <Download className="w-4 h-4" /> Install Nivio
          </Button>
        ) : null}

        {/* iOS Safari instructions */}
        {ios && state !== 'installed' && (
          <div className="bg-muted/30 border border-border rounded-xl p-4 text-sm text-muted-foreground space-y-2 w-full">
            <p className="font-semibold text-foreground flex items-center gap-2">
              <Smartphone className="w-4 h-4" /> Add to Home Screen (iOS)
            </p>
            <ol className="list-decimal list-inside space-y-1.5 text-xs leading-relaxed">
              <li>Open this page in <strong>Safari</strong></li>
              <li>Tap the <Share2 className="inline w-3.5 h-3.5 mb-0.5" /> Share button at the bottom</li>
              <li>Scroll down and tap <strong>Add to Home Screen</strong></li>
              <li>Tap <strong>Add</strong> to confirm</li>
            </ol>
          </div>
        )}

        {/* Android / desktop instructions */}
        {!ios && state !== 'promptable' && state !== 'installed' && (
          <div className="bg-muted/30 border border-border rounded-xl p-4 text-sm text-muted-foreground space-y-2 w-full">
            <p className="font-semibold text-foreground flex items-center gap-2">
              <Download className="w-4 h-4" /> Install on Android / Desktop
            </p>
            <ol className="list-decimal list-inside space-y-1.5 text-xs leading-relaxed">
              <li>Open this page in <strong>Chrome</strong></li>
              <li>Tap the menu <strong>⋮</strong> in the top-right corner</li>
              <li>Tap <strong>Add to Home screen</strong> or <strong>Install app</strong></li>
            </ol>
          </div>
        )}
      </div>

      <Link
        href="/"
        className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
      >
        <ArrowLeft className="w-3.5 h-3.5" /> Back to Nivio
      </Link>
    </div>
  );
}
