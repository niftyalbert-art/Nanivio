import type { Request, Response } from 'express';
import { PalabraError, parsePalabraWav, palabraConfigured, translatePalabraAudio } from './palabraSpeech.ts';
import { supportsPalabraPair } from '../shared/palabraLanguages.ts';

/** Scoped to an authenticated, authorized live call. Existing call metering owns
 * the user's debit; this endpoint must not charge the same call a second time.
 */
export function createPalabraCallHandler(deps: {
  userId: (req: Request) => string;
  authorize: (userId: string, sessionId: string, source: string, target: string) => Promise<void>;
  translate?: typeof translatePalabraAudio;
  configured?: () => boolean;
}) {
  const activeUsers = new Set<string>();
  return async (req: Request, res: Response) => {
    const userId = deps.userId(req), abort = new AbortController();
    let reserved = false;
    const cancel = () => abort.abort();
    req.once('aborted',cancel); res.once('close',cancel);
    try {
      const { sourceLang, targetLang, audioBase64, sessionId } = req.body || {};
      if (typeof sessionId !== 'string' || !sessionId || sessionId.length > 160
        || !supportsPalabraPair(sourceLang,targetLang) || typeof audioBase64 !== 'string'
        || audioBase64.length > 1_200_000 || !/^[A-Za-z0-9+/]+={0,2}$/.test(audioBase64))
        throw new PalabraError(400,'A supported language pair, active call and short WAV recording are required.');
      const audio = Buffer.from(audioBase64,'base64'); parsePalabraWav(audio);
      if (!(deps.configured || palabraConfigured)()) throw new PalabraError(503,'Nanivio live translation is not configured.');
      if (activeUsers.has(userId) || activeUsers.size >= 8)
        throw new PalabraError(429,'Translation is busy. Please pause before speaking again.');
      activeUsers.add(userId); reserved = true;
      await deps.authorize(userId,sessionId,sourceLang,targetLang);
      if (abort.signal.aborted) return;
      const result = await (deps.translate || translatePalabraAudio)(audio,sourceLang,targetLang,abort.signal);
      if (!abort.signal.aborted) res.json({success:true,sourceLang,targetLang,...result});
    } catch (error) {
      if (!abort.signal.aborted) res.status(error instanceof PalabraError ? error.status : 503).json({
        success:false,error:error instanceof PalabraError ? error.message : 'Live translation is unavailable.'
      });
    } finally {
      if (reserved) activeUsers.delete(userId);
      req.off('aborted',cancel); res.off('close',cancel);
    }
  };
}
