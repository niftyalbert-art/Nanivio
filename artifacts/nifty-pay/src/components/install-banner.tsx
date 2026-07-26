import { useEffect, useState } from 'react';
import { Link, useLocation } from 'wouter';
import { X, Download, Share2, Smartphone } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useInstallPrompt } from '@/hooks/use-install-prompt';

function isIOS() {
  return /iphone|ipad|ipod/i.test(navigator.userAgent);
}
function isSafari() {
  return /^((?!chrome|android).)*safari/i.test(navigator.userAgent);
}
function isAndroid() {
  return /android/i.test(navigator.userAgent);
}

export function InstallBanner() {
  const { state, triggerInstall, dismiss } = useInstallPrompt();
  const [visible, setVisible] = useState(false);
  const [showSteps, setShowSteps] = useState(false);
  const [location] = useLocation();

  const ios = isIOS();
  const iosInSafari = ios && isSafari();
  const android = isAndroid();

  // Show for everyone who hasn't installed or dismissed
  const canShow = state !== 'installed' && state !== 'dismissed';

  useEffect(() => {
    if (!canShow) { setVisible(false); return; }
    setVisible(false);
    setShowSteps(false);
    const t = setTimeout(() => setVisible(true), 1200);
    return () => clearTimeout(t);
  }, [location, canShow]);

  if (!visible) return null;

  const handleInstall = async () => {
    if (state === 'promptable') {
      const outcome = await triggerInstall();
      setVisible(false);
      if (outcome !== 'accepted') dismiss();
    } else {
      // Show manual steps inline
      setShowSteps(true);
    }
  };

  const handleDismiss = () => {
    setVisible(false);
    dismiss();
  };

  // What label / icon to show on the action button
  const actionLabel = state === 'promptable' ? 'Install' : 'How?';

  return (
    <div
      className="fixed bottom-20 left-0 right-0 z-50 px-4 pointer-events-none"
      aria-live="polite"
    >
      <div
        className={[
          'pointer-events-auto mx-auto max-w-sm',
          'bg-card border border-border rounded-2xl shadow-2xl',
          'flex flex-col gap-0',
          'animate-in slide-in-from-bottom-4 fade-in duration-300',
        ].join(' ')}
      >
        {/* Main row */}
        <div className="flex items-center gap-3 p-3 pr-4">
          <img
            src={`${import.meta.env.BASE_URL}logo.png`}
            alt="Nivio"
            className="w-12 h-12 rounded-xl shrink-0"
          />

          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold leading-tight">Add Nivio to Home Screen</p>
            <p className="text-xs text-muted-foreground mt-0.5 leading-snug">
              {iosInSafari
                ? <>Tap <Share2 className="inline w-3 h-3 mb-0.5" /> then <strong>Add to Home Screen</strong></>
                : 'Install for the full app experience'}
            </p>
          </div>

          {/* Action button */}
          {iosInSafari ? (
            <Button
              size="sm"
              variant="outline"
              className="shrink-0 text-xs px-3"
              onClick={() => setShowSteps(s => !s)}
            >
              {showSteps ? 'Hide' : 'How?'}
            </Button>
          ) : (
            <Button
              size="sm"
              className="shrink-0 gap-1 text-xs px-3"
              onClick={handleInstall}
            >
              {state === 'promptable'
                ? <><Download className="w-3.5 h-3.5" /> Install</>
                : <><Smartphone className="w-3.5 h-3.5" /> {actionLabel}</>
              }
            </Button>
          )}

          {/* Dismiss */}
          <button
            onClick={handleDismiss}
            className="shrink-0 text-muted-foreground hover:text-foreground transition-colors"
            aria-label="Dismiss"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Expandable manual steps */}
        {showSteps && (
          <div className="px-4 pb-4 pt-1 border-t border-border/50">
            {iosInSafari ? (
              <ol className="list-decimal list-inside space-y-1 text-xs text-muted-foreground leading-relaxed">
                <li>Tap the <Share2 className="inline w-3 h-3 mb-0.5" /> <strong>Share</strong> button at the bottom of Safari</li>
                <li>Scroll down and tap <strong>Add to Home Screen</strong></li>
                <li>Tap <strong>Add</strong> to confirm</li>
              </ol>
            ) : android ? (
              <ol className="list-decimal list-inside space-y-1 text-xs text-muted-foreground leading-relaxed">
                <li>Open this page in <strong>Chrome</strong></li>
                <li>Tap the <strong>⋮</strong> menu in the top-right</li>
                <li>Tap <strong>Add to Home screen</strong> or <strong>Install app</strong></li>
              </ol>
            ) : (
              <div className="space-y-2">
                <p className="text-xs font-semibold text-foreground">Install on your phone:</p>
                <ol className="list-decimal list-inside space-y-1 text-xs text-muted-foreground leading-relaxed">
                  <li>Open Nivio in <strong>Chrome</strong> (Android) or <strong>Safari</strong> (iPhone)</li>
                  <li>Android: tap <strong>⋮ → Add to Home screen</strong></li>
                  <li>iPhone: tap <Share2 className="inline w-3 h-3 mb-0.5" /> <strong>→ Add to Home Screen</strong></li>
                </ol>
                <Link href="/install" className="text-xs text-primary hover:underline mt-1 inline-block">
                  View QR code & full guide →
                </Link>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
