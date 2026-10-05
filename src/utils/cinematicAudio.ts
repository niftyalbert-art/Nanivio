// Web Audio API Synthesizer for Nanivio Cinematic Reveal & Celebrations

class CinematicSoundEngine {
  private ctx: AudioContext | null = null;

  private init() {
    if (!this.ctx) {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      if (AudioCtx) {
        this.ctx = new AudioCtx();
      }
    }
    if (this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume().catch(() => {});
    }
  }

  // Plays the futuristic Nanivio 3D logo reveal sound effect
  // (Deep cosmic bass swell + rising crystal energy shimmer + radiant resonant chord)
  public playLogoReveal() {
    try {
      this.init();
      if (!this.ctx) return;
      const ctx = this.ctx;
      const now = ctx.currentTime;

      // 1. Deep Sub Bass Swell
      const subOsc = ctx.createOscillator();
      const subGain = ctx.createGain();
      subOsc.type = 'sine';
      subOsc.frequency.setValueAtTime(55, now); // A1
      subOsc.frequency.exponentialRampToValueAtTime(110, now + 1.8);
      subOsc.frequency.exponentialRampToValueAtTime(73.42, now + 3.0); // D2

      subGain.gain.setValueAtTime(0.001, now);
      subGain.gain.exponentialRampToValueAtTime(0.35, now + 1.2);
      subGain.gain.exponentialRampToValueAtTime(0.001, now + 3.2);

      subOsc.connect(subGain);
      subGain.connect(ctx.destination);
      subOsc.start(now);
      subOsc.stop(now + 3.3);

      // 2. Rising Energy Particle Whoosh (Filtered Noise)
      const bufferSize = ctx.sampleRate * 2.5;
      const noiseBuffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
      const output = noiseBuffer.getChannelData(0);
      for (let i = 0; i < bufferSize; i++) {
        output[i] = Math.random() * 2 - 1;
      }

      const whiteNoise = ctx.createBufferSource();
      whiteNoise.buffer = noiseBuffer;

      const filter = ctx.createBiquadFilter();
      filter.type = 'bandpass';
      filter.frequency.setValueAtTime(200, now);
      filter.frequency.exponentialRampToValueAtTime(4200, now + 1.6);
      filter.frequency.exponentialRampToValueAtTime(1200, now + 2.8);
      filter.Q.setValueAtTime(3.5, now);

      const noiseGain = ctx.createGain();
      noiseGain.gain.setValueAtTime(0.001, now);
      noiseGain.gain.exponentialRampToValueAtTime(0.18, now + 1.5);
      noiseGain.gain.exponentialRampToValueAtTime(0.001, now + 2.8);

      whiteNoise.connect(filter);
      filter.connect(noiseGain);
      noiseGain.connect(ctx.destination);
      whiteNoise.start(now + 0.2);
      whiteNoise.stop(now + 2.9);

      // 3. Radiant Crystal Chime (Major 9th Harmonic Cluster: D - F# - A - C# - E)
      const chordFrequencies = [293.66, 369.99, 440.0, 554.37, 659.25, 880.0];
      chordFrequencies.forEach((freq, idx) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = idx % 2 === 0 ? 'sine' : 'triangle';
        osc.frequency.setValueAtTime(freq, now + 1.2 + idx * 0.08);

        const startTime = now + 1.2 + idx * 0.08;
        gain.gain.setValueAtTime(0.001, startTime);
        gain.gain.exponentialRampToValueAtTime(0.08 / (idx + 1), startTime + 0.1);
        gain.gain.exponentialRampToValueAtTime(0.0001, startTime + 2.2);

        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(startTime);
        osc.stop(startTime + 2.3);
      });
    } catch (e) {
      console.warn('Web Audio synthesis not allowed or supported:', e);
    }
  }

  // Celebratory Chime for Successful Registration
  public playSuccessChime() {
    try {
      this.init();
      if (!this.ctx) return;
      const ctx = this.ctx;
      const now = ctx.currentTime;

      // Ascending triumphant arpeggio
      const notes = [523.25, 659.25, 783.99, 1046.5]; // C5, E5, G5, C6
      notes.forEach((freq, idx) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(freq, now + idx * 0.12);

        const startTime = now + idx * 0.12;
        gain.gain.setValueAtTime(0.001, startTime);
        gain.gain.exponentialRampToValueAtTime(0.12, startTime + 0.05);
        gain.gain.exponentialRampToValueAtTime(0.0001, startTime + 1.2);

        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(startTime);
        osc.stop(startTime + 1.3);
      });
    } catch (e) {
      // Ignore
    }
  }
}

export const cinematicAudio = new CinematicSoundEngine();
