import { useEffect, useState } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { Download, Smartphone, Monitor, Share2 } from 'lucide-react';
import { Button } from '@/components/ui/button';

export default function Install() {
  const appUrl = `${window.location.origin}${import.meta.env.BASE_URL}`;
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null);
  const [installed, setInstalled] = useState(false);
  const [isIOS, setIsIOS] = useState(false);

  useEffect(() => {
    setIsIOS(/iphone|ipad|ipod/i.test(navigator.userAgent));

    const handler = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e);
    };
    window.addEventListener('beforeinstallprompt', handler);

    window.addEventListener('appinstalled', () => setInstalled(true));

    return () => window.removeEventListener('beforeinstallprompt', handler);
  }, []);

  const handleInstall = async () => {
    if (!deferredPrompt) return;
    deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    if (outcome === 'accepted') setInstalled(true);
    setDeferredPrompt(null);
  };

  return (
    <div className="min-h-[100dvh] bg-background flex flex-col items-center justify-center px-6 py-12 gap-10">
      {/* Logo + wordmark */}
      <div className="flex flex-col items-center gap-4 text-center">
        <img
          src={`${import.meta.env.BASE_URL}logo.png`}
          alt="Nivio"
          className="w-24 h-24 rounded-2xl shadow-2xl"
        />
        <div>
          <h1 className="text-3xl font-extrabold tracking-tight">Nivio</h1>
          <p className="text-sm text-muted-foreground mt-1">Money Without Borders</p>
        </div>
      </div>

      {/* QR code */}
      <div className="flex flex-col items-center gap-3">
        <p className="text-sm font-medium text-muted-foreground uppercase tracking-widest">Scan to open</p>
        <div className="bg-white p-4 rounded-2xl shadow-lg">
          <QRCodeSVG
            value={appUrl}
            size={200}
            bgColor="#ffffff"
            fgColor="#0a1628"
            level="H"
            imageSettings={{
              src: `${import.meta.env.BASE_URL}logo.png`,
              x: undefined,
              y: undefined,
              height: 40,
              width: 40,
              excavate: true,
            }}
          />
        </div>
        <p className="text-xs text-muted-foreground max-w-[220px] text-center break-all">{appUrl}</p>
      </div>

      {/* Install CTA */}
      <div className="flex flex-col items-center gap-4 w-full max-w-xs">
        {installed ? (
          <p className="text-sm text-green-400 font-semibold">✓ Nivio is installed!</p>
        ) : deferredPrompt ? (
          <Button size="lg" className="w-full font-bold gap-2" onClick={handleInstall}>
            <Download className="w-4 h-4" /> Install Nivio
          </Button>
        ) : null}

        {/* iOS instructions */}
        {isIOS && !installed && (
          <div className="bg-card border border-border rounded-xl p-4 text-sm text-muted-foreground space-y-2 w-full">
            <p className="font-semibold text-foreground flex items-center gap-2"><Smartphone className="w-4 h-4" /> Add to Home Screen (iOS)</p>
            <ol className="list-decimal list-inside space-y-1">
              <li>Tap the <Share2 className="inline w-3.5 h-3.5 mb-0.5" /> Share button in Safari</li>
              <li>Scroll down and tap <strong>Add to Home Screen</strong></li>
              <li>Tap <strong>Add</strong> to confirm</li>
            </ol>
          </div>
        )}

        {/* Android / desktop instructions */}
        {!isIOS && !deferredPrompt && !installed && (
          <div className="bg-card border border-border rounded-xl p-4 text-sm text-muted-foreground space-y-2 w-full">
            <p className="font-semibold text-foreground flex items-center gap-2"><Monitor className="w-4 h-4" /> Install on Android / Desktop</p>
            <ol className="list-decimal list-inside space-y-1">
              <li>Open this page in Chrome</li>
              <li>Tap the menu (⋮) in the top-right</li>
              <li>Tap <strong>Add to Home screen</strong> or <strong>Install app</strong></li>
            </ol>
          </div>
        )}

        <a href={`${import.meta.env.BASE_URL}`} className="text-xs text-primary underline-offset-4 hover:underline">
          ← Back to Nivio
        </a>
      </div>
    </div>
  );
}
