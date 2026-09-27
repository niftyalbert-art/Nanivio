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
      isRealtime: true,
      isAfricanLanguageSpecialist: true,
      averageLatencyMs: 850,
      status: 'online',
      supportedPairs: [
        { from: 'ak', to: 'en' }, { from: 'en', to: 'ak' },
        { from: 'tw-ak', to: 'en' }, { from: 'en', to: 'tw-ak' },
        { from: 'fat', to: 'en' }, { from: 'en', to: 'fat' },
        { from: 'ee', to: 'en' }, { from: 'en', to: 'ee' },
        { from: 'gaa', to: 'en' }, { from: 'en', to: 'gaa' },
      ],
    });

    this.register({
      id: 'sunbird',
      name: 'Sunbird AI',
      type: 'full-duplex',
      isRealtime: true,
      isAfricanLanguageSpecialist: true,
      averageLatencyMs: 920,
      status: 'online',
      supportedPairs: [
        { from: 'sw', to: 'en' }, { from: 'en', to: 'sw' },
        { from: 'lg', to: 'en' }, { from: 'en', to: 'lg' },
      ],
    });

    this.register({
      id: 'palabra',
      name: 'Palabra Realtime Audio Matrix',
      type: 'full-duplex',
      isRealtime: true,
      averageLatencyMs: 640,
      status: 'online',
      supportedPairs: [
        { from: 'en', to: 'fr' }, { from: 'fr', to: 'en' },
        { from: 'en', to: 'es' }, { from: 'es', to: 'en' },
        { from: 'en', to: 'ar' }, { from: 'ar', to: 'en' },
        { from: 'en', to: 'de' }, { from: 'de', to: 'en' },
        { from: 'en', to: 'zh' }, { from: 'zh', to: 'en' },
      ],
    });

    this.register({
      id: 'nllb',
      name: 'NLLB-200 Neural Universal Bridge',
      type: 'mt',
      isRealtime: true,
      averageLatencyMs: 980,
      status: 'online',
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
