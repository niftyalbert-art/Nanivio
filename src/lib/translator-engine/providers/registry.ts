import { ProviderCapability } from '../types';

export class ProviderRegistry {
  private providers: Map<string, ProviderCapability> = new Map();

  constructor() {
    this.registerDefaults();
  }

  private registerDefaults(): void {
    this.register({
      id: 'khaya',
      name: 'Khaya AI (Ghana NLP)',
      type: 'full-duplex',
      isRealtime: false,
      isAfricanLanguageSpecialist: true,
      averageLatencyMs: null,
      status: 'not-verified',
      supportedPairs: [
        { from: 'ak', to: 'en' }, { from: 'en', to: 'ak' },
        { from: 'fat', to: 'en' }, { from: 'en', to: 'fat' },
        { from: 'ee', to: 'en' }, { from: 'en', to: 'ee' },
        { from: 'gaa', to: 'en' }, { from: 'en', to: 'gaa' },
      ],
    });

    this.register({
      id: 'sunbird',
      name: 'Sunbird AI',
      type: 'full-duplex',
      isRealtime: false,
      isAfricanLanguageSpecialist: true,
      averageLatencyMs: null,
      status: 'not-verified',
      supportedPairs: [
        { from: 'sw', to: 'en' }, { from: 'en', to: 'sw' },
        { from: 'lg', to: 'en' }, { from: 'en', to: 'lg' },
      ],
    });

    this.register({
      id: 'gemini',
      name: 'Gemini Translation + Speech',
      type: 'full-duplex',
      isRealtime: false,
      averageLatencyMs: null,
      status: 'not-verified',
      supportedPairs: [],
    });

    this.register({
      id: 'nllb',
      name: 'NLLB-200 Neural Universal Bridge',
      type: 'mt',
      isRealtime: false,
      averageLatencyMs: null,
      status: 'offline',
      supportedPairs: [],
    });
  }

  public register(cap: ProviderCapability): void {
    this.providers.set(cap.id, cap);
  }

  public get(id: string): ProviderCapability | undefined {
    return this.providers.get(id);
  }

  public getAll(): ProviderCapability[] {
    return Array.from(this.providers.values());
  }
}
