import { IMtProvider } from '../mt/interface';
import { MtResult } from '../types';

export class PivotRouter {
  public static async translateWithPivot(
    text: string,
    sourceLang: string,
    targetLang: string,
    pivotLang: string,
    firstHopProvider: IMtProvider,
    secondHopProvider: IMtProvider
  ): Promise<MtResult> {
    const start = Date.now();

    // First hop: source -> pivot (e.g. Twi -> English via Khaya)
    const step1 = await firstHopProvider.translate(text, sourceLang, pivotLang);
    const pivotText = step1.translatedText || text;

    // Second hop: pivot -> target (e.g. English -> Arabic via Palabra)
    const step2 = await secondHopProvider.translate(pivotText, pivotLang, targetLang);

    return {
      translatedText: step2.translatedText || pivotText,
      sourceLang,
      targetLang,
      provider: step1.provider,
      latencyMs: Date.now() - start,
      pivotUsed: true,
      confidence: 0.91,
    };
  }
}
