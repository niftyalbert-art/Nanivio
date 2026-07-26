import { useEffect, useState } from 'react';

export type InstallState =
  | 'unknown'     // page just loaded, awaiting beforeinstallprompt (show manual guide)
  | 'promptable'  // native browser prompt ready
  | 'dismissed'   // user closed the banner this session
  | 'installed';  // already installed / standalone

const DISMISS_KEY = 'nivio_install_dismissed_until';
const DISMISS_DAYS = 3;

function isStandalone() {
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    // @ts-expect-error — iOS Safari
    window.navigator.standalone === true
  );
}

function wasDismissedRecently() {
  const until = localStorage.getItem(DISMISS_KEY);
  if (!until) return false;
  return Date.now() < Number(until);
}

export function useInstallPrompt() {
  const [state, setState] = useState<InstallState>(() => {
    if (isStandalone()) return 'installed';
    if (wasDismissedRecently()) return 'dismissed';
    return 'unknown';
  });

  const [promptEvent, setPromptEvent] = useState<any>(null);

  useEffect(() => {
    if (state === 'installed') return;

    const onPrompt = (e: Event) => {
      e.preventDefault();
      setPromptEvent(e);
      if (!wasDismissedRecently()) setState('promptable');
    };

    const onInstalled = () => setState('installed');

    window.addEventListener('beforeinstallprompt', onPrompt);
    window.addEventListener('appinstalled', onInstalled);

    return () => {
      window.removeEventListener('beforeinstallprompt', onPrompt);
      window.removeEventListener('appinstalled', onInstalled);
    };
  }, [state]);

  const triggerInstall = async (): Promise<'accepted' | 'dismissed' | 'unavailable'> => {
    if (!promptEvent) return 'unavailable';
    promptEvent.prompt();
    const { outcome } = await promptEvent.userChoice;
    setPromptEvent(null);
    if (outcome === 'accepted') {
      setState('installed');
      return 'accepted';
    }
    dismiss();
    return 'dismissed';
  };

  const dismiss = () => {
    const until = Date.now() + DISMISS_DAYS * 24 * 60 * 60 * 1000;
    localStorage.setItem(DISMISS_KEY, String(until));
    setState('dismissed');
  };

  return { state, triggerInstall, dismiss };
}
