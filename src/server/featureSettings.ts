import type { RequestHandler } from 'express';

/** Calling is available by default when configured, but an explicit off switch wins. */
export function videoCallingEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  return Boolean(env.AGORA_APP_ID?.trim() && env.AGORA_APP_CERTIFICATE?.trim())
    && env.NANIVIO_VIDEO_CALLS_ENABLED !== 'false';
}

export function audioCallingEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  return Boolean(env.AGORA_APP_ID?.trim() && env.AGORA_APP_CERTIFICATE?.trim())
    && env.NANIVIO_AUDIO_CALLS_ENABLED !== 'false';
}

/** Non-sensitive, read-only capabilities for ordinary clients; no admin access needed. */
export function featureSettingsHandler(features: Record<string, boolean>): RequestHandler {
  return (_req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    res.json(Object.fromEntries(
      Object.entries(features).filter(([, value]) => typeof value === 'boolean'),
    ));
  };
}
