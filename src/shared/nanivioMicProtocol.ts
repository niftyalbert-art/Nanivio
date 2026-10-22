export const NANIVIO_MIC_VERSION = 1;
export const NANIVIO_MIC_RATE = 16000;
export const NANIVIO_MIC_SAMPLES = 3200;
export const NANIVIO_MIC_BYTES = NANIVIO_MIC_SAMPLES * 2;
export const NANIVIO_MIC_EVENTS = {
  start: 'nanivio:mic_start', audio: 'nanivio:mic_audio',
  stop: 'nanivio:mic_stop', status: 'nanivio:mic_status',
} as const;

export interface NanivioMicStart {
  sessionId: string; streamId: string; version: 1;
  sampleRate: 16000; channels: 1; format: 'pcm_s16le'; frameSamples: 3200;
}
export interface NanivioMicAudio {
  sessionId: string; streamId: string; sequence: number; audio: string;
}
export interface NanivioMicStatus {
  sessionId: string; streamId: string; version: 1;
  state: 'ready' | 'receiving' | 'stopped' | 'error';
  lastSequence?: number; receivedFrames?: number;
  provider?: string; language?: string; code?: string; message?: string;
}
export const isMicId = (value: unknown): value is string =>
  typeof value === 'string' && /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(value);

export function isNanivioMicStart(value: any): value is NanivioMicStart {
  return Boolean(value && isMicId(value.sessionId) && isMicId(value.streamId)
    && value.version === 1 && value.sampleRate === NANIVIO_MIC_RATE && value.channels === 1
    && value.format === 'pcm_s16le' && value.frameSamples === NANIVIO_MIC_SAMPLES);
}

// Platform-neutral codec: no Window, btoa, Buffer, or browser speech APIs.
export function encodeNanivioMicFrame(pcm: ArrayBuffer): string {
  if (!(pcm instanceof ArrayBuffer) || pcm.byteLength !== NANIVIO_MIC_BYTES) {
    throw new Error('The microphone recorder returned an invalid audio frame.');
  }
  const bytes = new Uint8Array(pcm);
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  let result = '';
  for (let i = 0; i < bytes.length; i += 3) {
    const value = (bytes[i] << 16) | ((bytes[i + 1] || 0) << 8) | (bytes[i + 2] || 0);
    result += alphabet[value >>> 18] + alphabet[(value >>> 12) & 63]
      + (i + 1 < bytes.length ? alphabet[(value >>> 6) & 63] : '=')
      + (i + 2 < bytes.length ? alphabet[value & 63] : '=');
  }
  return result;
}

export function nanivioMicLevel(pcm: ArrayBuffer): number {
  const view = new DataView(pcm);
  let energy = 0;
  for (let i = 0; i < pcm.byteLength; i += 2) energy += (view.getInt16(i, true) / 32768) ** 2;
  return Math.min(1, Math.sqrt(energy / NANIVIO_MIC_SAMPLES) * 5);
}
