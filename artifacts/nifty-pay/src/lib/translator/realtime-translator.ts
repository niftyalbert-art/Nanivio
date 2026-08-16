export type TranslatorStatus =
  | 'idle'
  | 'connecting'
  | 'connected'
  | 'speaking'
  | 'translating'
  | 'error';

export interface TranslatorConfig {
  sourceLanguage: string;
  targetLanguage: string;
  enabled: boolean;
  voice?: string;
}

export interface TranslatorEvent {
  type:
    | 'status'
    | 'transcript'
    | 'translation'
    | 'audio'
    | 'error';

  text?: string;
  language?: string;
  audio?: ArrayBuffer;
  message?: string;
}

type Listener = (event: TranslatorEvent) => void;

export class RealtimeTranslator {
  private socket: WebSocket | null = null;
  private listeners = new Set<Listener>();

  private config: TranslatorConfig = {
    sourceLanguage: 'en',
    targetLanguage: 'ak-twi',
    enabled: true,
  };

  private status: TranslatorStatus = 'idle';

  constructor(config?: Partial<TranslatorConfig>) {
    if (config) {
      this.config = {
        ...this.config,
        ...config,
      };
    }
  }

  getStatus(): TranslatorStatus {
    return this.status;
  }

  configure(config: Partial<TranslatorConfig>) {
    this.config = {
      ...this.config,
      ...config,
    };
  }

  on(listener: Listener): () => void {
    this.listeners.add(listener);

    return () => {
      this.listeners.delete(listener);
    };
  }

  private emit(event: TranslatorEvent) {
    for (const listener of this.listeners) {
      try {
        listener(event);
      } catch {
        // Listener errors must never break the translator.
      }
    }
  }

  private setStatus(status: TranslatorStatus) {
    this.status = status;
    this.emit({
      type: 'status',
      message: status,
    });
  }

  async connect(url: string): Promise<void> {
    if (this.socket?.readyState === WebSocket.OPEN) {
      return;
    }

    this.disconnect();

    this.setStatus('connecting');

    await new Promise<void>((resolve, reject) => {
      const socket = new WebSocket(url);

      socket.binaryType = 'arraybuffer';

      socket.onopen = () => {
        this.socket = socket;

        this.send({
          type: 'start',
          sourceLanguage: this.config.sourceLanguage,
          targetLanguage: this.config.targetLanguage,
          enabled: this.config.enabled,
          voice: this.config.voice,
        });

        this.setStatus('connected');
        resolve();
      };

      socket.onmessage = async (event) => {
        await this.handleMessage(event.data);
      };

      socket.onerror = () => {
        this.setStatus('error');
        reject(new Error('Translator connection failed'));
      };

      socket.onclose = () => {
        if (this.socket === socket) {
          this.socket = null;
        }

        if (this.status !== 'idle') {
          this.setStatus('idle');
        }
      };
    });
  }

  private async handleMessage(data: unknown) {
    if (data instanceof ArrayBuffer) {
      this.emit({
        type: 'audio',
        audio: data,
      });

      return;
    }

    if (data instanceof Blob) {
      const audio = await data.arrayBuffer();

      this.emit({
        type: 'audio',
        audio,
      });

      return;
    }

    if (typeof data !== 'string') {
      return;
    }

    let message: any;

    try {
      message = JSON.parse(data);
    } catch {
      return;
    }

    switch (message?.type) {
      case 'status':
        this.setStatus(message.status ?? 'connected');
        break;

      case 'transcript':
        this.emit({
          type: 'transcript',
          text: message.text,
          language: message.language,
        });
        break;

      case 'translation':
        this.emit({
          type: 'translation',
          text: message.text,
          language: message.language,
        });
        break;

      case 'audio':
        if (message.data) {
          try {
            const binary = Uint8Array.from(
              atob(message.data),
              char => char.charCodeAt(0),
            );

            this.emit({
              type: 'audio',
              audio: binary.buffer,
            });
          } catch {
            this.emit({
              type: 'error',
              message: 'Invalid translated audio received',
            });
          }
        }
        break;

      case 'error':
        this.emit({
          type: 'error',
          message: message.message ?? 'Translator error',
        });

        this.setStatus('error');
        break;
    }
  }

  sendAudio(audio: ArrayBuffer | ArrayBufferView) {
    if (!this.socket || this.socket.readyState !== WebSocket.OPEN) {
      return false;
    }

    this.socket.send(audio);
    return true;
  }

  sendControl(message: Record<string, unknown>) {
    return this.send(message);
  }

  private send(message: Record<string, unknown>) {
    if (!this.socket || this.socket.readyState !== WebSocket.OPEN) {
      return false;
    }

    this.socket.send(JSON.stringify(message));
    return true;
  }

  setLanguages(sourceLanguage: string, targetLanguage: string) {
    this.config.sourceLanguage = sourceLanguage;
    this.config.targetLanguage = targetLanguage;

    this.send({
      type: 'languages',
      sourceLanguage,
      targetLanguage,
    });
  }

  setEnabled(enabled: boolean) {
    this.config.enabled = enabled;

    this.send({
      type: 'enabled',
      enabled,
    });
  }

  disconnect() {
    const socket = this.socket;
    this.socket = null;

    if (socket) {
      try {
        socket.close();
      } catch {
        // Ignore close errors during teardown.
      }
    }

    this.setStatus('idle');
  }
}
