import { authClient } from './authClient';
import type { MalviInputResult, MalviMediaItem, MalviSharedLocation } from '../shared/malviInputTypes';

export type InputKind = 'images' | 'videos';
export type InputResponse = MalviInputResult | { success: false; error: string; code?: string };
export type MediaResearchResponse = {
  success: true;
  items: MalviMediaItem[];
  limitation?: string;
};

const withTimeout = (signal: AbortSignal | undefined, timeoutMs: number) => {
  const controller = new AbortController();
  const abort = () => controller.abort();
  if (signal?.aborted) controller.abort();
  else signal?.addEventListener('abort', abort, { once: true });
  const timeout = window.setTimeout(abort, timeoutMs);
  return {
    signal: controller.signal,
    cleanup: () => {
      window.clearTimeout(timeout);
      signal?.removeEventListener('abort', abort);
    },
  };
};

async function postJson<T>(path: string, body: unknown, signal?: AbortSignal): Promise<T> {
  const timed = withTimeout(signal, 50_000);
  try {
    const token = authClient.getToken();
    const response = await fetch(path, {
      method: 'POST',
      credentials: 'include',
      cache: 'no-store',
      signal: timed.signal,
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify(body),
    });
    const result = await response.json().catch(() => null);
    if (!response.ok || !result?.success) {
      throw new Error(result?.error || `Request unavailable (${response.status}).`);
    }
    return result as T;
  } catch (error) {
    if (timed.signal.aborted && !signal?.aborted) throw new Error('This request took too long. Please try again.');
    throw error;
  } finally {
    timed.cleanup();
  }
}

export function fileToRawBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('This file could not be read.'));
    reader.onload = () => {
      const data = reader.result;
      if (typeof data !== 'string') return reject(new Error('This file could not be read.'));
      const comma = data.indexOf(',');
      if (comma < 0) return reject(new Error('This file could not be encoded.'));
      resolve(data.slice(comma + 1));
    };
    reader.readAsDataURL(file);
  });
}

export async function sendMalviInput(args: {
  prompt: string;
  language: string;
  attachment?: File;
  location?: MalviSharedLocation;
  signal?: AbortSignal;
}): Promise<MalviInputResult> {
  const attachment = args.attachment
    ? { name: args.attachment.name, mimeType: args.attachment.type, data: await fileToRawBase64(args.attachment) }
    : undefined;
  return postJson<MalviInputResult>('/api/assistant/input', {
    prompt: args.prompt.slice(0, 6000),
    language: args.language,
    consent: true,
    ...(attachment ? { attachment } : {}),
    ...(args.location ? { location: args.location } : {}),
  }, args.signal);
}

export function researchMalviMedia(query: string, kind: InputKind, signal?: AbortSignal) {
  return postJson<MediaResearchResponse>('/api/assistant/media/research', { query, kind }, signal);
}

export async function lookupApproximateIpLocation(signal?: AbortSignal): Promise<MalviSharedLocation> {
  const controller = new AbortController();
  const abort = () => controller.abort();
  if (signal?.aborted) controller.abort();
  else signal?.addEventListener('abort', abort, { once: true });
  const timeout = window.setTimeout(abort, 8_000);
  try {
    const response = await fetch('https://ipwho.is/?fields=success,latitude,longitude,city,region,country', {
      method: 'GET',
      credentials: 'omit',
      cache: 'no-store',
      referrerPolicy: 'no-referrer',
      signal: controller.signal,
    });
    const data = await response.json().catch(() => null);
    if (!response.ok || data?.success !== true || !Number.isFinite(data.latitude) || !Number.isFinite(data.longitude)
      || Math.abs(data.latitude) > 90 || Math.abs(data.longitude) > 180) {
      throw new Error('Approximate location could not be found. You can still continue without it.');
    }
    const label = [data.city, data.region, data.country].filter((part: unknown) => typeof part === 'string' && part.trim()).join(', ');
    return { kind: 'ip', latitude: data.latitude, longitude: data.longitude, ...(label ? { label } : {}) };
  } catch (error) {
    if (controller.signal.aborted && !signal?.aborted) throw new Error('Approximate location lookup timed out.');
    throw error;
  } finally {
    window.clearTimeout(timeout);
    signal?.removeEventListener('abort', abort);
  }
}
