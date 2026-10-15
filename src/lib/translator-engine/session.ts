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
    if (speakerId !== this.host.id && speakerId !== this.receiver.id) throw new Error('Speaker is not a call participant.');
    const targetLang = (speakerId === this.host.id ? this.receiver : this.host).myLanguage;

    // Check cache
    const cached = this.cache.get(text, speakerLang, targetLang);
    let mtResult: MtResult;

    if (cached) {
      mtResult = cached;
    } else {
      // The authenticated server executes the entire authoritative per-hop plan.
      // Do not perform a second, conflicting browser-side pivot.
      mtResult = await this.azure.translate(text, speakerLang, targetLang);
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
      asrLatencyMs: null,
      mtLatencyMs: totalMs,
      ttsLatencyMs: null,
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
