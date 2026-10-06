import { NanivioASRProvider } from "../providers";

export interface NanivioASRProviderConfig {
  provider: NanivioASRProvider;
  priority?: number;
  enabled?: boolean;
}

export interface NanivioASRRoute {
  language: string;
  providers: NanivioASRProviderConfig[];
}
