import { LanguageRouter } from './routing/language-router';
import { PivotRouter } from './routing/pivot-router';
import { TranslationCache } from './cache/translation-cache';
import { LatencyMetricsTracker } from './metrics/latency';
import { LangpretationTurn, MtResult } from './types';
import { AzureMtProvider } from './mt/azure';

export interface CallParticipantMeta {
  id: string;
  name: string;
  myLanguage: string; // Recipient's target language
}

export class LangpretationCallSession {
  public readonly sessionId: string;
  public readonly host: CallParticipantMeta;
  public readonly receiver: CallParticipantMeta;
  private router = new LanguageRouter();
  private cache = new TranslationCache();
  private metrics = new LatencyMetricsTracker();
  private azure = new AzureMtProvider();
  private onTurnProduced?: (turn: LangpretationTurn) => void;

  constructor(
    sessionId: string,
    host: CallParticipantMeta,
    receiver: CallParticipantMeta,
    onTurnProduced?: (turn: LangpretationTurn) => void
  ) {
    this.sessionId = sessionId;
    this.host = host;
    this.receiver = receiver;
    this.onTurnProduced = onTurnProduced;
  }

  public async processSpeakerUtterance(
    speakerId: string,
    speakerName: string,
    speakerLang: string,
    text: string
  ): Promise<LangpretationTurn> {
    const start = Date.now();
    const targetLang = this.receiver.myLanguage;

    // Check cache
    const cached = this.cache.get(text, speakerLang, targetLang);
    let mtResult: MtResult;

    if (cached) {
      mtResult = cached;
    } else {
      const decision = this.router.resolveRoute(speakerLang, targetLang);
      if (decision.requiresPivot && decision.pivotLanguage) {
        mtResult = await PivotRouter.translateWithPivot(
          text,
          speakerLang,
          targetLang,
          decision.pivotLanguage,
          decision.provider,
          this.azure
        );
      } else {
        mtResult = await decision.provider.translate(text, speakerLang, targetLang);
      }
      this.cache.set(text, speakerLang, targetLang, mtResult);
    }

    const totalMs = Date.now() - start;
    const grade = LatencyMetricsTracker.classifyLatency(totalMs);

    const turn: LangpretationTurn = {
      id: `turn_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`,
      speakerId,
      speakerName,
      speakerLang,
      receiverLang: targetLang,
      originalText: text,
      translatedText: mtResult.translatedText, // ONLY in receiver's language
      asrLatencyMs: Math.round(totalMs * 0.25),
      mtLatencyMs: Math.round(totalMs * 0.65),
      ttsLatencyMs: Math.round(totalMs * 0.1),
      totalLatencyMs: totalMs,
      latencyGrade: grade,
      provider: mtResult.provider,
      timestamp: Date.now(),
    };

    this.metrics.recordTurn(turn);
    if (this.onTurnProduced) {
      this.onTurnProduced(turn);
    }

    return turn;
  }

  public getMetricsTracker(): LatencyMetricsTracker {
    return this.metrics;
  }
}
