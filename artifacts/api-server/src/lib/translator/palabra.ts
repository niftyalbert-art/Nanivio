import WebSocket from "ws";
import crypto from "node:crypto";

export interface PalabraConfig {
  sourceLanguage: string;
  targetLanguage: string;
  voice?: string;
  voiceCloning?: boolean;
}

export interface PalabraEvents {
  onTranscript?: (text: string, language?: string) => void;
  onTranslation?: (text: string, language?: string) => void;
  onAudio?: (audio: Buffer, language?: string) => void;
  onError?: (error: Error) => void;
  onStatus?: (status: string) => void;
}

interface PalabraMessage {
  message_type?: string;
  data?: any;
}

export class PalabraTranslator {
  private socket: WebSocket | null = null;
  private config: PalabraConfig;
  private events: PalabraEvents;

  constructor(
    config: PalabraConfig,
    events: PalabraEvents = {},
  ) {
    this.config = {
      voiceCloning: true,
      ...config,
    };

    this.events = events;
  }

  async connect(): Promise<void> {
    const apiKey = process.env.PALABRA_API_KEY;

    if (!apiKey) {
      throw new Error("PALABRA_API_KEY is not configured");
    }

    const randomHash = crypto.randomUUID();

    const url =
      `wss://streaming.palabra.ai/streaming-api/` +
      `${randomHash}/v1/speech-to-speech/stream` +
      `?token=${encodeURIComponent(apiKey)}`;

    await new Promise<void>((resolve, reject) => {
      let settled = false;

      const socket = new WebSocket(url, {
        handshakeTimeout: 15_000,
      });

      this.socket = socket;

      const fail = (error: Error) => {
        if (!settled) {
          settled = true;
          reject(error);
        }

        this.events.onError?.(error);
      };

      socket.on("open", () => {
        this.events.onStatus?.("connected");

        try {
          this.sendTask();
          this.events.onStatus?.("translating");

          if (!settled) {
            settled = true;
            resolve();
          }
        } catch (error) {
          fail(
            error instanceof Error
              ? error
              : new Error("Unable to configure Palabra"),
          );
        }
      });

      socket.on("message", (data, isBinary) => {
        try {
          if (isBinary) {
            // Palabra's current WS API sends API messages as JSON.
            // Keep binary handling for forward compatibility.
            const audio = this.rawDataToBuffer(data);
            this.events.onAudio?.(
              audio,
              this.config.targetLanguage,
            );
            return;
          }

          const message = JSON.parse(
            data.toString(),
          ) as PalabraMessage;

          this.handleMessage(message);
        } catch (error) {
          this.events.onError?.(
            error instanceof Error
              ? error
              : new Error("Invalid Palabra message"),
          );
        }
      });

      socket.on("error", (error) => {
        this.events.onStatus?.("error");
        fail(error);
      });

      socket.on("close", () => {
        this.events.onStatus?.("closed");

        if (this.socket === socket) {
          this.socket = null;
        }
      });
    });
  }

  private sendTask() {
    const sourceLanguage =
      this.config.sourceLanguage || "auto";

    const targetLanguage =
      this.config.targetLanguage;

    const speechGeneration: Record<string, unknown> = {
      voice_cloning:
        this.config.voiceCloning !== false,
      voice_timbre_detection: {
        enabled: false,
        high_timbre_voices: ["default_high"],
        low_timbre_voices: ["default_low"],
      },
    };

    // Voice cloning and voice_id are mutually exclusive.
    if (
      this.config.voice &&
      this.config.voiceCloning === false
    ) {
      speechGeneration.voice_id = this.config.voice;
    }

    this.send({
      message_type: "set_task",
      data: {
        input_stream: {
          content_type: "audio",
          source: {
            type: "ws",
            format: "pcm_s16le",
            sample_rate: 24000,
            channels: 1,
          },
        },

        output_stream: {
          content_type: "audio",
          target: {
            type: "ws",
            format: "pcm_s16le",
          },
        },

        pipeline: {
          transcription: {
            source_language: sourceLanguage,
            detectable_languages: [],
            segment_confirmation_silence_threshold: 0.7,
            sentence_splitter: {
              enabled: true,
            },
            verification: {
              auto_transcription_correction: false,
              transcription_correction_style: null,
            },
          },

          translations: [
            {
              target_language: targetLanguage,
              translate_partial_transcriptions: true,
              speech_generation: speechGeneration,
            },
          ],

          translation_queue_configs: {
            global: {
              desired_queue_level_ms: 5000,
              max_queue_level_ms: 20000,
              auto_tempo: true,
              min_tempo: 1.15,
              max_tempo: 1.45,
            },
          },

          allowed_message_types: [
            "partial_transcription",
            "partial_translated_transcription",
            "validated_transcription",
            "translated_transcription",
          ],
        },
      },
    });
  }

  private handleMessage(message: PalabraMessage) {
    const type = message?.message_type;
    const data = message?.data ?? {};

    switch (type) {
      case "partial_transcription":
      case "validated_transcription": {
        const transcription =
          data?.transcription;

        const text =
          transcription?.text ??
          data?.text ??
          "";

        if (text) {
          this.events.onTranscript?.(
            text,
            transcription?.language,
          );
        }

        break;
      }

      case "partial_translated_transcription":
      case "translated_transcription": {
        const transcription =
          data?.transcription;

        const text =
          transcription?.text ??
          data?.text ??
          "";

        if (text) {
          this.events.onTranslation?.(
            text,
            transcription?.language,
          );
        }

        break;
      }

      case "output_audio_data": {
        const encoded =
          data?.data;

        if (!encoded) {
          break;
        }

        try {
          const audio =
            Buffer.from(encoded, "base64");

          this.events.onAudio?.(
            audio,
            data?.language ??
              this.config.targetLanguage,
          );
        } catch {
          this.events.onError?.(
            new Error(
              "Invalid Palabra audio received",
            ),
          );
        }

        break;
      }

      case "current_task":
        this.events.onStatus?.(
          data?.status ?? "translating",
        );
        break;

      case "warning":
        this.events.onStatus?.("warning");
        break;

      case "eos":
        this.events.onStatus?.("finished");
        break;

      case "error": {
        const messageText =
          data?.message ??
          data?.detail ??
          data?.error ??
          "Palabra translator error";

        this.events.onError?.(
          new Error(messageText),
        );

        break;
      }

      default:
        // Ignore unknown future Palabra message types.
        break;
    }
  }

  sendAudio(audio: Buffer | Uint8Array): boolean {
    if (
      !this.socket ||
      this.socket.readyState !== WebSocket.OPEN
    ) {
      return false;
    }

    const buffer = Buffer.from(audio);

    this.send({
      message_type: "input_audio_data",
      data: {
        data: buffer.toString("base64"),
      },
    });

    return true;
  }

  setLanguages(
    sourceLanguage: string,
    targetLanguage: string,
  ) {
    this.config.sourceLanguage =
      sourceLanguage;

    this.config.targetLanguage =
      targetLanguage;

    if (
      !this.socket ||
      this.socket.readyState !== WebSocket.OPEN
    ) {
      return false;
    }

    this.sendTask();

    return true;
  }

  setVoiceCloning(enabled: boolean) {
    this.config.voiceCloning = enabled;

    if (
      this.socket &&
      this.socket.readyState === WebSocket.OPEN
    ) {
      this.sendTask();
    }
  }

  setEnabled(enabled: boolean) {
    if (
      !this.socket ||
      this.socket.readyState !== WebSocket.OPEN
    ) {
      return false;
    }

    this.send({
      message_type: enabled
        ? "set_task"
        : "pause_task",
      data: enabled
        ? {}
        : {},
    });

    return true;
  }

  flush() {
    if (
      !this.socket ||
      this.socket.readyState !== WebSocket.OPEN
    ) {
      return false;
    }

    this.send({
      message_type: "flush_task",
      data: {
        languages: ["global"],
        pause_task: false,
      },
    });

    return true;
  }

  async disconnect() {
    const socket = this.socket;

    this.socket = null;

    if (!socket) {
      return;
    }

    if (
      socket.readyState === WebSocket.OPEN
    ) {
      try {
        socket.send(
          JSON.stringify({
            message_type: "end_task",
            data: {
              eos_timeout: 2,
              force: false,
            },
          }),
        );
      } catch {
        // Ignore shutdown errors.
      }
    }

    try {
      socket.close();
    } catch {
      // Ignore teardown errors.
    }
  }

  private send(message: PalabraMessage) {
    if (
      !this.socket ||
      this.socket.readyState !== WebSocket.OPEN
    ) {
      return false;
    }

    this.socket.send(
      JSON.stringify(message),
    );

    return true;
  }

  private rawDataToBuffer(
    data: WebSocket.RawData,
  ): Buffer {
    if (Buffer.isBuffer(data)) {
      return data;
    }

    if (data instanceof ArrayBuffer) {
      return Buffer.from(
        new Uint8Array(data),
      );
    }

    return Buffer.concat(data);
  }
}
