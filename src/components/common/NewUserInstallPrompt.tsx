import React, { useState, useEffect } from 'react';
import {
  Download,
  Share2,
  PlusSquare,
  X,
  CheckCircle2,
  Sparkles,
  PhoneCall,
  Zap,
  ShieldCheck,
  Smartphone,
  Layers,
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { usePWAInstall } from '../../hooks/usePWAInstall';
import { NanivioLogo } from './NanivioLogo';

const DISMISS_STORAGE_KEY = 'nanivio_install_prompt_dismissed_at';
const DISMISS_DURATION_MS = 2 * 24 * 60 * 60 * 1000; // 48 hours

export const NewUserInstallPrompt: React.FC = () => {
  const { isInstallable, isInstalled, isIOS, install } = usePWAInstall();
  const [isVisible, setIsVisible] = useState(false);
  const [showIOSSteps, setShowIOSSteps] = useState(false);
  const [installSuccess, setInstallSuccess] = useState(false);
  const [isInstalling, setIsInstalling] = useState(false);

  useEffect(() => {
    // If already installed or running as standalone PWA, never show prompt
    if (isInstalled) {
      setIsVisible(false);
      return;
    }

    // Check if dismissed recently
    try {
      const dismissedAt = localStorage.getItem(DISMISS_STORAGE_KEY);
      if (dismissedAt) {
        const timePassed = Date.now() - parseInt(dismissedAt, 10);
        if (timePassed < DISMISS_DURATION_MS) {
          return;
        }
      }
    } catch {
      // ignore localStorage errors
    }

    // Delay prompt appearance slightly (1800ms) so user can see app first
    const timer = setTimeout(() => {
      // Show if installable via beforeinstallprompt OR if on iOS Safari
      if (isInstallable || isIOS) {
        setIsVisible(true);
      }
    }, 1800);

    return () => clearTimeout(timer);
  }, [isInstallable, isInstalled, isIOS]);

  const handleDismiss = () => {
    try {
      localStorage.setItem(DISMISS_STORAGE_KEY, Date.now().toString());
    } catch {}
    setIsVisible(false);
  };

  const handleTriggerInstall = async () => {
    if (isIOS) {
      setShowIOSSteps(true);
      return;
    }

    if (!isInstallable) {
      return;
    }

    setIsInstalling(true);
    try {
      const result = await install();
      if (result) {
        setInstallSuccess(true);
        try {
          localStorage.setItem('nanivio_pwa_installed', 'true');
        } catch {}
        setTimeout(() => {
          setIsVisible(false);
        }, 2500);
      }
    } catch {
      // prompt cancelled or dismissed
    } finally {
      setIsInstalling(false);
    }
  };

  if (!isVisible || isInstalled) {
    return null;
  }

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-3 sm:p-4 bg-slate-950/75 backdrop-blur-md pointer-events-auto">
        <motion.div
          initial={{ opacity: 0, y: 30, scale: 0.96 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 20, scale: 0.96 }}
          transition={{ duration: 0.25, ease: 'easeOut' }}
          className="relative w-full max-w-md bg-gradient-to-b from-slate-900 to-[#070d18] border border-emerald-500/30 rounded-2xl sm:rounded-3xl shadow-2xl shadow-emerald-500/10 overflow-hidden text-slate-100 p-5 sm:p-6"
        >
          {/* Ambient Glow */}
          <div className="absolute top-0 right-0 -mr-16 -mt-16 w-48 h-48 bg-emerald-500/10 rounded-full blur-3xl pointer-events-none" />
          <div className="absolute bottom-0 left-0 -ml-16 -mb-16 w-48 h-48 bg-cyan-500/10 rounded-full blur-3xl pointer-events-none" />

          {/* Close button */}
          <button
            onClick={handleDismiss}
            className="absolute top-4 right-4 p-1.5 rounded-xl bg-slate-800/80 text-slate-400 hover:text-white hover:bg-slate-700 transition cursor-pointer"
            aria-label="Dismiss install prompt"
          >
            <X className="w-4 h-4" />
          </button>

          {/* Header */}
          <div className="flex items-center gap-3 mb-4">
            <div className="relative">
              <div className="w-12 h-12 rounded-2xl bg-slate-950 border border-emerald-500/40 p-2 flex items-center justify-center shadow-lg shadow-emerald-500/20">
                <NanivioLogo size="sm" showTagline={false} />
              </div>
              <div className="absolute -bottom-1 -right-1 w-5 h-5 rounded-full bg-emerald-500 text-slate-950 flex items-center justify-center font-bold text-[10px] shadow">
                <Sparkles className="w-3 h-3" />
              </div>
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-base font-bold text-white">Install Nanivio App</h3>
                <span className="text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/40">
                  Fast &amp; Free
                </span>
              </div>
              <p className="text-xs text-slate-400 mt-0.5">
                Add to your home screen for the full native experience
              </p>
            </div>
          </div>

          {/* Success State */}
          {installSuccess ? (
            <div className="py-6 flex flex-col items-center text-center space-y-3">
              <div className="w-14 h-14 rounded-full bg-emerald-500/20 border border-emerald-500 text-emerald-400 flex items-center justify-center">
                <CheckCircle2 className="w-8 h-8" />
              </div>
              <div>
                <h4 className="text-base font-bold text-white">Nanivio Installed!</h4>
                <p className="text-xs text-slate-300 mt-1">
                  You can now launch Nanivio directly from your home screen anytime.
                </p>
              </div>
            </div>
          ) : showIOSSteps ? (
            /* iOS Safari Step-by-Step Guide */
            <div className="space-y-4 my-2">
              <div className="p-3.5 rounded-xl bg-slate-950/70 border border-slate-800 space-y-3 text-xs text-slate-200">
                <div className="flex items-center gap-2 text-emerald-400 font-bold">
                  <Smartphone className="w-4 h-4" />
                  <span>How to install on iPhone &amp; iPad</span>
                </div>

                <div className="flex items-start gap-2.5 pt-1">
                  <span className="w-5 h-5 rounded-full bg-emerald-500/20 text-emerald-300 font-bold flex items-center justify-center shrink-0 text-[11px]">
                    1
                  </span>
                  <div className="flex-1">
                    Tap the <strong className="text-white">Share</strong> icon{' '}
                    <Share2 className="w-3.5 h-3.5 inline text-emerald-400 mx-1" /> in your Safari toolbar (at the bottom or top).
                  </div>
                </div>

                <div className="flex items-start gap-2.5">
                  <span className="w-5 h-5 rounded-full bg-emerald-500/20 text-emerald-300 font-bold flex items-center justify-center shrink-0 text-[11px]">
                    2
                  </span>
                  <div className="flex-1">
                    Scroll down and tap <strong className="text-white">Add to Home Screen</strong>{' '}
                    <PlusSquare className="w-3.5 h-3.5 inline text-emerald-400 mx-1" />.
                  </div>
                </div>

                <div className="flex items-start gap-2.5">
                  <span className="w-5 h-5 rounded-full bg-emerald-500/20 text-emerald-300 font-bold flex items-center justify-center shrink-0 text-[11px]">
                    3
                  </span>
                  <div className="flex-1">
                    Tap <strong className="text-white">Add</strong> in the top-right corner to complete installation.
                  </div>
                </div>
              </div>

              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={handleDismiss}
                  className="flex-1 py-2.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-xs transition cursor-pointer shadow-lg shadow-emerald-500/20"
                >
                  I've Added It to Home Screen
                </button>
                <button
                  type="button"
                  onClick={() => setShowIOSSteps(false)}
                  className="px-4 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 font-semibold text-xs transition cursor-pointer"
                >
                  Back
                </button>
              </div>
            </div>
          ) : (
            /* Standard Feature List & CTA */
            <>
              <div className="grid grid-cols-2 gap-2.5 my-3.5">
                <div className="p-3 rounded-xl bg-slate-950/60 border border-slate-800/90 flex flex-col gap-1">
                  <div className="flex items-center gap-1.5 text-emerald-400 font-bold text-xs">
                    <PhoneCall className="w-3.5 h-3.5" />
                    <span>Live Calls</span>
                  </div>
                  <p className="text-[11px] text-slate-400 leading-tight">
                    Instant incoming call alerts &amp; real-time Langpretation
                  </p>
                </div>

                <div className="p-3 rounded-xl bg-slate-950/60 border border-slate-800/90 flex flex-col gap-1">
                  <div className="flex items-center gap-1.5 text-cyan-400 font-bold text-xs">
                    <Zap className="w-3.5 h-3.5" />
                    <span>Instant Launch</span>
                  </div>
                  <p className="text-[11px] text-slate-400 leading-tight">
                    Full-screen native view with 60fps animations
                  </p>
                </div>

                <div className="p-3 rounded-xl bg-slate-950/60 border border-slate-800/90 flex flex-col gap-1">
                  <div className="flex items-center gap-1.5 text-amber-400 font-bold text-xs">
                    <ShieldCheck className="w-3.5 h-3.5" />
                    <span>Zero Downloads</span>
                  </div>
                  <p className="text-[11px] text-slate-400 leading-tight">
                    No 100MB App Store bloat. Uses &lt;3MB device cache
                  </p>
                </div>

                <div className="p-3 rounded-xl bg-slate-950/60 border border-slate-800/90 flex flex-col gap-1">
                  <div className="flex items-center gap-1.5 text-purple-400 font-bold text-xs">
                    <Layers className="w-3.5 h-3.5" />
                    <span>Offline Ready</span>
                  </div>
                  <p className="text-[11px] text-slate-400 leading-tight">
                    Fast access to contacts, history, &amp; account values
                  </p>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="space-y-2 mt-4">
                <button
                  type="button"
                  onClick={handleTriggerInstall}
                  disabled={isInstalling}
                  className="w-full py-3 rounded-xl bg-gradient-to-r from-emerald-500 via-teal-400 to-cyan-500 hover:from-emerald-400 hover:to-cyan-400 text-slate-950 font-black text-xs sm:text-sm transition-all flex items-center justify-center gap-2 shadow-lg shadow-emerald-500/25 cursor-pointer disabled:opacity-60"
                >
                  <Download className="w-4 h-4" />
                  <span>
                    {isIOS
                      ? 'Add to Home Screen (iOS)'
                      : isInstalling
                      ? 'Opening Install Prompt...'
                      : 'Install App (1-Tap)'}
                  </span>
                </button>

                <button
                  type="button"
                  onClick={handleDismiss}
                  className="w-full py-2 rounded-xl text-slate-400 hover:text-slate-200 text-xs font-medium transition cursor-pointer text-center"
                >
                  Maybe Later
                </button>
              </div>
            </>
          )}
        </motion.div>
      </div>
    </AnimatePresence>
  );
};
