import type { Express, Request, Response, NextFunction } from 'express';
import { AssistantError } from './redisStore.ts';
import { AI_DISCLOSURE, liveAvatarService, liveAvatarSetup } from './liveAvatarService.ts';
import { speechConfigured, synthesizeProviderAudio } from '../speechProviders.ts';
import { wavToPcm24k } from './pcm.ts';

type Auth = (req: Request, res: Response, next: NextFunction) => unknown;
export function registerAssistantRoutes(app: Express, auth: Auth, enabled: () => boolean, startSweeper = true) {
  const userId = (req: Request) => (req as any).authUser.id as string;
  const validId = (req: Request) => {
    const id = String(req.params.id);
    if (!/^[a-f0-9-]{36}$/i.test(id)) throw new AssistantError(400, 'INVALID_SESSION', 'Invalid live session ID.');
    return id;
  };
  const run = (fn: (req: Request, res: Response) => Promise<unknown>) => async (req: Request, res: Response) => {
    res.setHeader('Cache-Control', 'no-store');
    try { await fn(req, res); } catch (error) {
      const known = error instanceof AssistantError;
      if (known && error.retryAfter) res.setHeader('Retry-After', error.retryAfter);
      res.status(known ? error.status : 503).json({
        success: false, code: known ? error.code : 'LIVE_SESSION_UNAVAILABLE',
        error: known ? error.message : 'Live avatar service is temporarily unavailable. No simulated avatar was started.',
      });
    }
  };
  app.get('/api/assistant/status', auth, run(async (_req, res) => {
    res.json({ success: true, ...liveAvatarSetup(), enabled: enabled(), welcomeVoiceConfigured: speechConfigured('en', 'tts') });
  }));
  app.post('/api/assistant/session', auth, run(async (req, res) => {
    if (!enabled()) throw new AssistantError(403, 'MALVI_DISABLED', 'Malvi is currently disabled by the administrator.');
    const setup = liveAvatarSetup();
    if (!setup.configured) throw new AssistantError(503, 'LIVEAVATAR_SETUP_REQUIRED', `LiveAvatar setup is required: ${setup.missing.join(', ')}. Use your provisioned Malvi custom avatar, not a sample avatar.`);
    if (!['wake-word', 'manual'].includes(req.body?.activation)) throw new AssistantError(400, 'ACTIVATION_REQUIRED', 'Activate Malvi with the local wake word or the start button.');
    res.status(201).json({ success: true, ...await liveAvatarService.create(userId(req)) });
  }));
  app.post('/api/assistant/session/:id/activity', auth, run(async (req, res) => {
    if (!['input', 'interrupt'].includes(req.body?.kind)) throw new AssistantError(400, 'INPUT_REQUIRED', 'Only explicit user input may extend the idle deadline.');
    res.json({ success: true, ...await liveAvatarService.activity(userId(req), validId(req)) });
  }));
  app.post('/api/assistant/session/:id/welcome', auth, run(async (req, res) => {
    await liveAvatarService.owned(userId(req), validId(req));
    if (!speechConfigured('en', 'tts')) throw new AssistantError(503, 'WELCOME_VOICE_REQUIRED', 'The live visual connection is available, but the backend welcome voice is not configured. The conversational brain will be connected next.');
    await liveAvatarService.claimWelcome(validId(req));
    // The first spoken utterance always identifies Malvi as an AI. No LLM or provider persona controls this text.
    const speech = await synthesizeProviderAudio(AI_DISCLOSURE, 'en');
    const pcm24k = wavToPcm24k(Buffer.from(speech.audioBase64, 'base64'));
    res.json({ success: true, text: AI_DISCLOSURE, pcm24k, sampleRate: 24000, format: 'pcm_s16le', channels: 1 });
  }));
  app.post('/api/assistant/session/:id/end', auth, run(async (req, res) => {
    await liveAvatarService.stop(userId(req), validId(req));
    res.json({ success: true });
  }));
  // Redis deadlines survive process restarts and are checked by every server.
  // The distributed stop claim prevents duplicate provider calls.
  if (startSweeper) {
    const timer = setInterval(() => {
      if (liveAvatarSetup().configured) void liveAvatarService.sweep().catch(() => {});
    }, 1000);
    timer.unref();
  }
}
