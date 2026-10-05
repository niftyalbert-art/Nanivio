/**
 * Nanivio Incoming Call Notification & Ringtone Engine
 * Supports Web Notifications, Web Audio synthesized ringtone (no external mp3 dependency), and vibration.
 */

class NotificationService {
  private audioCtx: AudioContext | null = null;
  private ringOsc1: OscillatorNode | null = null;
  private ringOsc2: OscillatorNode | null = null;
  private ringGain: GainNode | null = null;
  private ringInterval: any = null;
  private isRinging = false;

  public async requestPermission(): Promise<NotificationPermission> {
    if (typeof window === 'undefined' || !('Notification' in window)) {
      return 'denied';
    }
    try {
      const perm = await Notification.requestPermission();
      return perm;
    } catch (e) {
      console.warn('Could not request notification permission:', e);
      return 'default';
    }
  }

  public getPermission(): NotificationPermission {
    if (typeof window === 'undefined' || !('Notification' in window)) {
      return 'denied';
    }
    return Notification.permission;
  }

  /**
   * Start realistic telephone ringtone cadence using Web Audio API
   * Standard cadence: 2 seconds on (440Hz + 480Hz dual tone), 4 seconds off
   */
  public startRingtone() {
    if (this.isRinging || typeof window === 'undefined') return;
    this.isRinging = true;

    try {
      const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
      if (!AudioContextClass) return;

      this.audioCtx = new AudioContextClass();

      const playRingBurst = () => {
        if (!this.audioCtx || !this.isRinging) return;

        // Dual Tone: 440 Hz (standard concert A) + 480 Hz (standard telephony ringback tone)
        const osc1 = this.audioCtx.createOscillator();
        const osc2 = this.audioCtx.createOscillator();
        const gain = this.audioCtx.createGain();

        osc1.type = 'sine';
        osc2.type = 'sine';
        osc1.frequency.setValueAtTime(440, this.audioCtx.currentTime);
        osc2.frequency.setValueAtTime(480, this.audioCtx.currentTime);

        gain.gain.setValueAtTime(0.18, this.audioCtx.currentTime);
        // Fade in/out to prevent audio clicking
        gain.gain.linearRampToValueAtTime(0.2, this.audioCtx.currentTime + 0.1);
        gain.gain.setValueAtTime(0.2, this.audioCtx.currentTime + 1.8);
        gain.gain.linearRampToValueAtTime(0.001, this.audioCtx.currentTime + 2.0);

        osc1.connect(gain);
        osc2.connect(gain);
        gain.connect(this.audioCtx.destination);

        osc1.start();
        osc2.start();

        osc1.stop(this.audioCtx.currentTime + 2.0);
        osc2.stop(this.audioCtx.currentTime + 2.0);
      };

      // Vibrate mobile device
      if (typeof navigator !== 'undefined' && navigator.vibrate) {
        navigator.vibrate([1000, 500, 1000, 500, 1000]);
      }

      playRingBurst();
      this.ringInterval = setInterval(() => {
        if (!this.isRinging) {
          clearInterval(this.ringInterval);
          return;
        }
        playRingBurst();
        if (typeof navigator !== 'undefined' && navigator.vibrate) {
          navigator.vibrate([1000, 500, 1000]);
        }
      }, 4000);
    } catch (e) {
      console.warn('Web Audio ringtone failed to start:', e);
    }
  }

  public stopRingtone() {
    this.isRinging = false;
    if (this.ringInterval) {
      clearInterval(this.ringInterval);
      this.ringInterval = null;
    }
    if (typeof navigator !== 'undefined' && navigator.vibrate) {
      navigator.vibrate(0);
    }
    if (this.audioCtx) {
      try {
        this.audioCtx.close();
      } catch (_) {}
      this.audioCtx = null;
    }
  }

  /**
   * Show incoming call push notification and trigger ringtone
   */
  public notifyIncomingCall(caller: {
    name: string;
    nvId: string;
    callType: 'audio' | 'video';
    onAnswer?: () => void;
  }) {
    this.startRingtone();

    if (typeof window !== 'undefined' && 'Notification' in window && Notification.permission === 'granted') {
      try {
        const notif = new Notification(`Incoming ${caller.callType === 'video' ? 'Video' : 'Audio'} Call`, {
          body: `${caller.name} (${caller.nvId}) is calling you on Nanivio with Langpretation...`,
          icon: '/pwa-192x192.png',
          badge: '/pwa-192x192.png',
          tag: 'nanivio-incoming-call',
          requireInteraction: true,
        });

        notif.onclick = () => {
          window.focus();
          caller.onAnswer?.();
          this.stopRingtone();
          notif.close();
        };
      } catch (e) {
        console.warn('Notification instantiation error:', e);
      }
    }
  }
}

export const notificationService = new NotificationService();
