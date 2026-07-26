import { useEffect, useState } from 'react';
import { Link, useLocation } from 'wouter';
import { X, Download, Share2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useInstallPrompt } from '@/hooks/use-install-prompt';

function isIOS() {
  return /iphone|ipad|ipod/i.test(navigator.userAgent);
}
function isSafari() {
  return /^((?!chrome|android).)*safari/i.test(navigator.userAgent);
}

export function InstallBanner() {
  const { state, triggerInstall, dismiss } = useInstallPrompt();
  const [visible, setVisible] = useState(false);
  const [location] = useLocation();
  const ios = isIOS();
  // On iOS we show the banner only when in Safari (where Add to Home Screen works)
  const iosReady = ios && isSafari();
  const canShow = (state === 'promptable' || iosReady) && state !== 'installed';

  // Re-show the banner on every page navigation (session-only dismiss)
  useEffect(() => {
    if (!canShow) { setVisible(false); return; }
    setVisible(false);
    const t = setTimeout(() => setVisible(true), 900);
    return () => clearTimeout(t);
  }, [location, canShow]);

  if (!visible || state === 'installed' || state === 'dismissed') return null;
  if (ios && !iosReady) return null; // iOS but not Safari — can't install, skip

  const handleInstall = async () => {
    const outcome = await triggerInstall();
    setVisible(false);
    if (outcome !== 'accepted') dismiss();
  };

  const handleDismiss = () => {
    setVisible(false);
    dismiss();
  };

  return (
    <div
      className="fixed bottom-20 left-0 right-0 z-50 px-4 pointer-events-none"
      aria-live="polite"
    >
      <div
        className={[
          'pointer-events-auto mx-auto max-w-sm',
          'bg-card border border-border rounded-2xl shadow-2xl',
          'flex items-center gap-3 p-3 pr-4',
          'animate-in slide-in-from-bottom-4 fade-in duration-300',
        ].join(' ')}
      >
        {/* App icon */}
        <img
          src={`${import.meta.env.BASE_URL}logo.png`}
          alt="Nivio"
          className="w-12 h-12 rounded-xl shrink-0"
        />

        {/* Text */}
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold leading-tight">Add Nivio to Home Screen</p>
          {iosReady ? (
            <p className="text-xs text-muted-foreground mt-0.5 leading-snug">
              Tap <Share2 className="inline w-3 h-3 mb-0.5" /> then <strong>Add to Home Screen</strong>
            </p>
          ) : (
            <p className="text-xs text-muted-foreground mt-0.5 leading-snug">
              Install for the full app experience
            </p>
          )}
        </div>

        {/* Actions */}
        {iosReady ? (
          <Link href="/install">
            <Button
              size="sm"
              variant="outline"
              className="shrink-0 text-xs px-3"
              onClick={handleDismiss}
            >
              How?
            </Button>
          </Link>
        ) : (
          <Button
            size="sm"
            className="shrink-0 gap-1 text-xs px-3"
            onClick={handleInstall}
          >
            <Download className="w-3.5 h-3.5" />
            Install
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
    </div>
  );
}
