import type { Express, Request, Response, NextFunction } from 'express';
import { AssistantError, getAssistantStore } from './redisStore.ts';
import { AI_DISCLOSURE, liveAvatarService, liveAvatarSetup, malviVideoQuality } from './liveAvatarService.ts';
import { getLiveBrainProviderConfig } from './brainProviderConfig.ts';
import { malviLiveBrainController } from './liveBrain.ts';
import { getMalviLanguage } from '../../lib/malviLanguages.ts';
import { malviSpeechSetup, synthesizeMalviSpeech } from './malviSpeech.ts';
import { assertMalviVoiceLanguage, malviVoiceSetup, parseMalviVoiceProvider } from './malviVoiceConfig.ts';

type Auth = (req: Request, res: Response, next: NextFunction) => unknown;
export function registerAssistantRoutes(app: Express, auth: Auth, enabled: () => boolean, startSweeper = true) {
  const userId = (req: Request) => (req as any).authUser.id as string;
  const selectedVoice = (req: Request) => {
    try { return parseMalviVoiceProvider(req.body?.speechProvider ?? process.env.MALVI_VOICE_PROVIDER ?? 'elevenlabs'); }
    catch { throw new AssistantError(400, 'INVALID_VOICE_PROVIDER', 'Choose ElevenLabs or Gemini for Malvi’s voice.'); }
  };
  const admin = (req: Request) => {
    if ((req as any).authUser?.role !== 'ADMIN') throw new AssistantError(403, 'ADMIN_REQUIRED', 'Only administrators can run Malvi setup tests.');
  };
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
    res.json({
      success: true,
      ...liveAvatarSetup(),
      enabled: enabled(),
      welcomeVoiceConfigured: malviVoiceSetup().configured,
      voiceOptions: ['elevenlabs', 'gemini'].map(provider => malviVoiceSetup(process.env, provider)),
      brainProviders: getLiveBrainProviderConfig(),
      voiceTestAvailable: (_req as any).authUser?.role === 'ADMIN' && enabled()
        && getLiveBrainProviderConfig().configured && Boolean(process.env.REDIS_URL),
      canRunSetupTests: (_req as any).authUser?.role === 'ADMIN',
    });
  }));
  // Explicit administrator action only: no session creation, Redis writes or
  // external inference/avatar calls. Never return connection URLs or raw errors.
  app.post('/api/assistant/diagnostics', auth, run(async (req, res) => {
    admin(req);
    let redis: 'missing' | 'connected' | 'unavailable' = 'missing';
    if (process.env.REDIS_URL) {
      try { redis = await (await getAssistantStore()).ping() ? 'connected' : 'unavailable'; }
      catch { redis = 'unavailable'; }
    }
    res.json({ success: true, redis, brain: getLiveBrainProviderConfig(), speech: malviVoiceSetup(),
      avatar: { configured: Boolean(process.env.HEYGEN_API_KEY && process.env.AVATAR_ID), readinessVerified: false },
      providerSessionStarted: false });
  }));
  app.post('/api/assistant/voice-session', auth, run(async (req, res) => {
    admin(req);
    if (!enabled()) throw new AssistantError(403, 'MALVI_DISABLED', 'Malvi is currently disabled by the administrator.');
    const brain = getLiveBrainProviderConfig();
    if (!brain.configured) throw new AssistantError(503, 'BRAIN_SETUP_REQUIRED', 'Configure the selected live brain provider before testing voice.');
    const provider = selectedVoice(req);
    const speech = malviVoiceSetup(process.env, provider);
    if (!speech.configured) throw new AssistantError(503, 'VOICE_SETUP_REQUIRED', `Malvi’s voice setup requires ${speech.missing.join(', ')}.`);
    if (req.body?.activation !== 'manual') throw new AssistantError(400, 'ACTIVATION_REQUIRED', 'Start the voice-only test manually.');
    let language;
    try { language = getMalviLanguage(req.body?.language ?? 'en'); }
    catch { throw new AssistantError(400, 'INVALID_LANGUAGE', 'Choose a valid Nanivio language for Malvi.'); }
    try { assertMalviVoiceLanguage(language.code, provider); }
    catch (error) { throw new AssistantError(400, 'VOICE_LANGUAGE_UNSUPPORTED', (error as Error).message); }
    res.status(201).json({ success: true, ...await liveAvatarService.create(userId(req), language.code, 'VOICE_TEST', 'high', provider) });
  }));
  app.post('/api/assistant/session', auth, run(async (req, res) => {
    if (!enabled()) throw new AssistantError(403, 'MALVI_DISABLED', 'Malvi is currently disabled by the administrator.');
    const provider = selectedVoice(req);
    const setup = liveAvatarSetup(provider);
    if (!setup.configured) throw new AssistantError(503, 'LIVEAVATAR_SETUP_REQUIRED', `LiveAvatar setup is required: ${setup.missing.join(', ')}. Use your provisioned Malvi custom avatar, not a sample avatar.`);
    if (!['wake-word', 'manual'].includes(req.body?.activation)) throw new AssistantError(400, 'ACTIVATION_REQUIRED', 'Activate Malvi with the local wake word or the start button.');
    let language;
    try { language = getMalviLanguage(req.body?.language ?? 'en'); }
    catch { throw new AssistantError(400, 'INVALID_LANGUAGE', 'Choose a valid Nanivio language for Malvi.'); }
    try { assertMalviVoiceLanguage(language.code, provider); }
    catch (error) { throw new AssistantError(400, 'VOICE_LANGUAGE_UNSUPPORTED', (error as Error).message); }
    res.status(201).json({ success: true, ...await liveAvatarService.create(userId(req), language.code, 'LITE', malviVideoQuality(req.get('user-agent') || ''), provider) });
  }));
  app.post('/api/assistant/session/:id/activity', auth, run(async (req, res) => {
    if (!['input', 'interrupt'].includes(req.body?.kind)) throw new AssistantError(400, 'INPUT_REQUIRED', 'Only explicit user input may extend the idle deadline.');
    res.json({ success: true, ...await liveAvatarService.activity(userId(req), validId(req)) });
  }));
  app.post('/api/assistant/session/:id/welcome', auth, run(async (req, res) => {
    const session = await liveAvatarService.owned(userId(req), validId(req));
    if (session.speechProvider === 'gemini' || (!session.speechProvider && malviVoiceSetup().provider === 'gemini')) {
      throw new AssistantError(409, 'LIVE_BRAIN_GREETING_REQUIRED', 'Gemini supplies Malvi’s greeting through the selected live conversation. No ElevenLabs request was made.');
    }
    if (session.language && session.language !== 'en') throw new AssistantError(409, 'LIVE_BRAIN_GREETING_REQUIRED', 'The live brain supplies Malvi’s greeting in your selected language. An English welcome was not played.');
    if (!malviSpeechSetup().configured) throw new AssistantError(503, 'WELCOME_VOICE_REQUIRED', 'Malvi’s ElevenLabs voice is not configured.');
    await liveAvatarService.claimWelcome(validId(req));
    // The first spoken utterance always identifies Malvi as an AI. No LLM or provider persona controls this text.
    const pcm24k = (await synthesizeMalviSpeech(AI_DISCLOSURE, 'en', AbortSignal.timeout(15_000))).toString('base64');
    res.json({ success: true, text: AI_DISCLOSURE, pcm24k, sampleRate: 24000, format: 'pcm_s16le', channels: 1 });
  }));
  app.post('/api/assistant/session/:id/end', auth, run(async (req, res) => {
    await malviLiveBrainController.stopSession(userId(req), validId(req));
    await liveAvatarService.stop(userId(req), validId(req));
    res.json({ success: true });
  }));
  // Redis deadlines survive process restarts and are checked by every server.
  // The distributed stop claim prevents duplicate provider calls.
  if (startSweeper) {
    const timer = setInterval(() => {
      if (process.env.REDIS_URL) void liveAvatarService.sweep().catch(() => {});
    }, 1000);
    timer.unref();
  }
}
