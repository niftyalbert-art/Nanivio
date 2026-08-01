import { useEffect, useState } from 'react';
import { X, Download } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useInstallPrompt } from '@/hooks/use-install-prompt';

export function InstallBanner() {
  const { state, triggerInstall, dismiss } = useInstallPrompt();
  const [visible, setVisible] = useState(false);

  const canShow = state !== 'installed' && state !== 'dismissed';

  useEffect(() => {
    if (!canShow) { setVisible(false); return; }
    const t = setTimeout(() => setVisible(true), 1200);
    return () => clearTimeout(t);
  }, [canShow]);

  if (!visible) return null;

  const handleInstall = async () => {
    if (state === 'promptable') {
      await triggerInstall();
    }
    setVisible(false);
  };

  const handleDismiss = () => {
    setVisible(false);
    dismiss();
  };

  return (
    <div className="fixed bottom-20 left-0 right-0 z-50 px-4 pointer-events-none" aria-live="polite">
      <div className={[
        'pointer-events-auto mx-auto max-w-sm',
        'bg-card border border-border rounded-2xl shadow-2xl',
        'flex items-center gap-3 p-3 pr-4',
        'animate-in slide-in-from-bottom-4 fade-in duration-300',
      ].join(' ')}>
        <img
          src={`${import.meta.env.BASE_URL}logo.png`}
          alt="Nanivio"
          className="w-12 h-12 rounded-xl shrink-0"
        />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold leading-tight">Install Nanivio</p>
          <p className="text-xs text-muted-foreground mt-0.5">Add to your home screen</p>
        </div>
        <Button size="sm" className="shrink-0 gap-1.5 text-xs px-3 font-semibold" onClick={handleInstall}>
          <Download className="w-3.5 h-3.5" /> Install app
        </Button>
        <button onClick={handleDismiss} className="shrink-0 text-muted-foreground hover:text-foreground transition-colors" aria-label="Dismiss">
          <X className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}
