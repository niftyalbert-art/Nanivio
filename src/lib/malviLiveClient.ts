import { authClient } from './authClient';

export interface LiveAvatarReadiness {
  configured: boolean;
  enabled: boolean;
  missing: string[];
  brainConnected: boolean;
  welcomeVoiceConfigured: boolean;
}

export async function assistantRequest(path: string, body?: unknown, keepalive = false) {
  const token = authClient.getToken();
  const response = await fetch(`/api/assistant${path}`, {
    method: body === undefined ? 'GET' : 'POST',
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    keepalive,
    cache: 'no-store',
    signal: AbortSignal.timeout(15_000),
  });
  const data = await response.json().catch(() => null);
  if (!response.ok || !data?.success) throw new Error(data?.error || 'The live avatar connection is unavailable.');
  return data;
}

// Only backend-produced, PCM16 / 24kHz / mono speech enters the LITE renderer.
// Never call SDK message()/repeat(): they invoke provider-owned conversation/TTS.
export function deliverMalviAudio(session: { repeatAudio: (audio: string) => unknown }, audio: {
  pcm24k: string; sampleRate: number; format: string; channels: number;
}) {
  if (!audio.pcm24k || audio.sampleRate !== 24000 || audio.format !== 'pcm_s16le' || audio.channels !== 1) {
    throw new Error('Live avatar speech must be backend-generated PCM16 mono at 24 kHz.');
  }
  session.repeatAudio(audio.pcm24k);
}
