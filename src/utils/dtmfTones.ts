// Web Audio API DTMF Generator & Telecom Sound Synthesizer

const DTMF_FREQS: Record<string, [number, number]> = {
  '1': [697, 1209],
  '2': [697, 1336],
  '3': [697, 1477],
  '4': [770, 1209],
  '5': [770, 1336],
  '6': [770, 1477],
  '7': [852, 1209],
  '8': [852, 1336],
  '9': [852, 1477],
  '*': [941, 1209],
  '0': [941, 1336],
  '#': [941, 1477],
};

let audioCtx: AudioContext | null = null;

function getAudioContext(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  if (!audioCtx) {
    const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
    if (AudioContextClass) {
      audioCtx = new AudioContextClass();
    }
  }
  if (audioCtx && audioCtx.state === 'suspended') {
    audioCtx.resume().catch(() => {});
  }
  return audioCtx;
}

export function playDtmfTone(key: string, durationMs = 120) {
  try {
    const ctx = getAudioContext();
    if (!ctx) return;

    const freqs = DTMF_FREQS[key] || [440, 480];
    const now = ctx.currentTime;

    const osc1 = ctx.createOscillator();
    const osc2 = ctx.createOscillator();
    const gainNode = ctx.createGain();

    osc1.type = 'sine';
    osc2.type = 'sine';
    osc1.frequency.setValueAtTime(freqs[0], now);
    osc2.frequency.setValueAtTime(freqs[1], now);

    // Smooth envelope to prevent audio pops
    gainNode.gain.setValueAtTime(0.001, now);
    gainNode.gain.exponentialRampToValueAtTime(0.08, now + 0.01);
    gainNode.gain.exponentialRampToValueAtTime(0.001, now + durationMs / 1000);

    osc1.connect(gainNode);
    osc2.connect(gainNode);
    gainNode.connect(ctx.destination);

    osc1.start(now);
    osc2.start(now);
    osc1.stop(now + durationMs / 1000);
    osc2.stop(now + durationMs / 1000);
  } catch (err) {
    // Gracefully ignore audio autoplay policies
  }
}

export function playErrorBuzzer() {
  try {
    const ctx = getAudioContext();
    if (!ctx) return;
    const now = ctx.currentTime;

    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(220, now);
    osc.frequency.setValueAtTime(180, now + 0.15);

    gain.gain.setValueAtTime(0.08, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.35);

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.start(now);
    osc.stop(now + 0.35);
  } catch (err) {
    // Ignore audio autoplay policies
  }
}

export interface RingtoneHandle {
  stop: () => void;
}

/**
 * Standard Dual-Tone Outgoing Telephone Ringtone (440Hz + 480Hz PBX audio)
 * Uses real recorded audio stream with seamless looping.
 */
export function startRingtone(): RingtoneHandle {
  let isRunning = true;
  let audio: HTMLAudioElement | null = null;
  let intervalId: any = null;

  try {
    audio = new Audio('/sounds/ringback-outgoing.wav');
    audio.loop = true;
    audio.volume = 0.85;
    const playPromise = audio.play();
    if (playPromise !== undefined) {
      playPromise.catch(() => {
        // Fallback to Web Audio if audio element is blocked by browser policy
        startWebAudioRingback();
      });
    }
  } catch (err) {
    startWebAudioRingback();
  }

  function startWebAudioRingback() {
    const playRingBurst = () => {
      if (!isRunning) return;
      try {
        const ctx = getAudioContext();
        if (!ctx) return;
        const now = ctx.currentTime;

        const osc1 = ctx.createOscillator();
        const osc2 = ctx.createOscillator();
        const gainNode = ctx.createGain();

        osc1.type = 'sine';
        osc2.type = 'sine';
        osc1.frequency.setValueAtTime(440, now);
        osc2.frequency.setValueAtTime(480, now);

        const burstDuration = 1.6;
        gainNode.gain.setValueAtTime(0.001, now);
        gainNode.gain.exponentialRampToValueAtTime(0.09, now + 0.05);
        gainNode.gain.setValueAtTime(0.09, now + burstDuration - 0.08);
        gainNode.gain.exponentialRampToValueAtTime(0.001, now + burstDuration);

        osc1.connect(gainNode);
        osc2.connect(gainNode);
        gainNode.connect(ctx.destination);

        osc1.start(now);
        osc2.start(now);
        osc1.stop(now + burstDuration);
        osc2.stop(now + burstDuration);
      } catch (e) {}
    };

    playRingBurst();
    intervalId = setInterval(() => {
      if (isRunning) playRingBurst();
    }, 3600);
  }

  return {
    stop: () => {
      isRunning = false;
      if (audio) {
        audio.pause();
        audio.currentTime = 0;
        audio = null;
      }
      if (intervalId) {
        clearInterval(intervalId);
        intervalId = null;
      }
    },
  };
}

/**
 * Harmonic Connection Chime when call is picked up (523Hz -> 659Hz / C5 -> E5)
 */
export function playCallConnectedTone() {
  try {
    const ctx = getAudioContext();
    if (!ctx) return;
    const now = ctx.currentTime;

    const notes = [
      { freq: 523.25, time: 0, duration: 0.14 },
      { freq: 659.25, time: 0.12, duration: 0.28 },
    ];

    notes.forEach(({ freq, time, duration }) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, now + time);

      gain.gain.setValueAtTime(0.001, now + time);
      gain.gain.exponentialRampToValueAtTime(0.12, now + time + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.001, now + time + duration);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start(now + time);
      osc.stop(now + time + duration);
    });
  } catch (err) {
    // Ignore autoplay policies
  }
}

/**
 * Call Ended Three-Tone Beep (480Hz)
 */
export function playCallEndedTone() {
  try {
    const ctx = getAudioContext();
    if (!ctx) return;
    const now = ctx.currentTime;

    [0, 0.18, 0.36].forEach((timeOffset) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = 'sine';
      osc.frequency.setValueAtTime(480, now + timeOffset);

      gain.gain.setValueAtTime(0.08, now + timeOffset);
      gain.gain.exponentialRampToValueAtTime(0.001, now + timeOffset + 0.12);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start(now + timeOffset);
      osc.stop(now + timeOffset + 0.12);
    });
  } catch (err) {
    // Ignore autoplay policies
  }
}

/**
 * Melodic Incoming Call Ringtone
 * Uses real audio file playback with looping.
 */
export function startIncomingRingtone(): RingtoneHandle {
  let isRunning = true;
  let audio: HTMLAudioElement | null = null;
  let intervalId: any = null;

  try {
    audio = new Audio('/sounds/ringtone-incoming.mp3');
    audio.loop = true;
    audio.volume = 0.9;
    const playPromise = audio.play();
    if (playPromise !== undefined) {
      playPromise.catch(() => {
        // The official Nanivio ringtone is the uploaded MP3. If browser autoplay is blocked, do not substitute a different tone.
      });
    }
  } catch (err) {
    // Browser/runtime could not create the audio element; do not substitute another ringtone.
  }

  function startWebAudioIncoming() {
    const notes = [
      { freq: 659.25, time: 0, dur: 0.15 },
      { freq: 783.99, time: 0.18, dur: 0.15 },
      { freq: 987.77, time: 0.36, dur: 0.22 },
      { freq: 880.00, time: 0.62, dur: 0.18 },
      { freq: 659.25, time: 0.85, dur: 0.30 },
    ];

    const playMelody = () => {
      if (!isRunning) return;
      try {
        const ctx = getAudioContext();
        if (!ctx) return;
        const now = ctx.currentTime;

        notes.forEach(({ freq, time, dur }) => {
          const osc = ctx.createOscillator();
          const gain = ctx.createGain();

          osc.type = 'triangle';
          osc.frequency.setValueAtTime(freq, now + time);

          gain.gain.setValueAtTime(0.001, now + time);
          gain.gain.exponentialRampToValueAtTime(0.14, now + time + 0.02);
          gain.gain.exponentialRampToValueAtTime(0.001, now + time + dur);

          osc.connect(gain);
          gain.connect(ctx.destination);

          osc.start(now + time);
          osc.stop(now + time + dur);
        });
      } catch (e) {}
    };

    playMelody();
    intervalId = setInterval(() => {
      if (isRunning) playMelody();
    }, 2600);
  }

  return {
    stop: () => {
      isRunning = false;
      if (audio) {
        audio.pause();
        audio.currentTime = 0;
        audio = null;
      }
      if (intervalId) {
        clearInterval(intervalId);
        intervalId = null;
      }
    },
  };
}

/**
 * Incoming Chat Message Chime
 * Plays a pleasant, crystalline two-note chime (A5: 880Hz -> D6: 1174Hz)
 */
export function playChatMessageTone() {
  try {
    const ctx = getAudioContext();
    if (!ctx) return;
    const now = ctx.currentTime;

    const notes = [
      { freq: 880.0, time: 0, dur: 0.18 },   // A5
      { freq: 1174.66, time: 0.12, dur: 0.28 }, // D6
    ];

    notes.forEach(({ freq, time, dur }) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, now + time);

      gain.gain.setValueAtTime(0.001, now + time);
      gain.gain.exponentialRampToValueAtTime(0.12, now + time + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.001, now + time + dur);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start(now + time);
      osc.stop(now + time + dur);
    });
  } catch (err) {
    // Autoplay policy or no audio context
  }
}

/**
 * Outgoing Message Sent Sound
 * Subtle high-frequency blip confirming transmission
 */
export function playMessageSentTone() {
  try {
    const ctx = getAudioContext();
    if (!ctx) return;
    const now = ctx.currentTime;

    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = 'sine';
    osc.frequency.setValueAtTime(1046.5, now); // C6

    gain.gain.setValueAtTime(0.06, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.08);

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.start(now);
    osc.stop(now + 0.08);
  } catch (err) {
    // Ignore
  }
}

/**
 * Show Web Desktop Browser Notification
 * Safe wrapper for browser Notification API
 */
export function showBrowserNotification(title: string, options?: NotificationOptions) {
  try {
    if (typeof window === 'undefined' || !('Notification' in window)) return;

    if (Notification.permission === 'granted') {
      new Notification(title, {
        icon: '/favicon.ico',
        badge: '/favicon.ico',
        ...options,
      });
    } else if (Notification.permission !== 'denied') {
      Notification.requestPermission().then((permission) => {
        if (permission === 'granted') {
          new Notification(title, {
            icon: '/favicon.ico',
            badge: '/favicon.ico',
            ...options,
          });
        }
      });
    }
  } catch (err) {
    // Suppress in sandboxed iframe if restricted
  }
}

