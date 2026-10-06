import {
  SpeechRecognitionResult,
  SpeechRecognitionRequest,
} from "../types";

import {
  NanivioASRInferenceProvider,
  NanivioASRInferenceRequest,
} from "./inference";

export interface NanivioHTTPASRInferenceConfig {
  baseUrl: string;
  apiKey?: string;
  modelIds: string[];
  timeoutMs?: number;
}

export class NanivioHTTPASRInferenceProvider
  implements NanivioASRInferenceProvider
{
  readonly name = "nanivio-http-asr";

  constructor(
    private readonly config: NanivioHTTPASRInferenceConfig,
  ) {}

  supportsModel(modelId: string): boolean {
    return this.config.modelIds.includes(modelId);
  }

  async transcribe(
    input: NanivioASRInferenceRequest,
  ): Promise<SpeechRecognitionResult> {
    if (!this.supportsModel(input.modelId)) {
      throw new Error(
        `Nanivio ASR inference provider is not configured for model ${input.modelId}`,
      );
    }

    const controller = new AbortController();

    const timeout = setTimeout(
      () => controller.abort(),
      this.config.timeoutMs ?? 30000,
    );

    try {
      const form = new FormData();

      const audioBlob = new Blob(
        [input.request.audio],
        {
          type: input.request.mimeType ?? "audio/wav",
        },
      );

      form.append("audio", audioBlob, "audio.wav");
      form.append("model", input.modelId);
      form.append("language", input.request.language);

      const headers: Record<string, string> = {};

      if (this.config.apiKey) {
        headers.Authorization = `Bearer ${this.config.apiKey}`;
      }

      const response = await fetch(
        `${this.config.baseUrl.replace(/\/$/, "")}/v1/asr/transcribe`,
        {
          method: "POST",
          headers,
          body: form,
          signal: controller.signal,
        },
      );

      if (!response.ok) {
        const body = await response.text();

        throw new Error(
          `Nanivio ASR inference server returned ${response.status}: ${body}`,
        );
      }

      const data = (await response.json()) as {
        text?: string;
        language?: string;
        confidence?: number;
        durationMs?: number;
      };

      if (!data.text) {
        throw new Error(
          "Nanivio ASR inference server returned an empty transcript",
        );
      }

      return {
        text: data.text,
        language:
          (data.language as SpeechRecognitionRequest["language"]) ??
          input.request.language,
        provider: "nanivio",
        confidence: data.confidence,
        durationMs: data.durationMs,
      };
    } finally {
      clearTimeout(timeout);
    }
  }
}
