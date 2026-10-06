import { NanivioASRModel } from "./models";

export const NANIVIO_ASR_MODELS: NanivioASRModel[] = [
  {
    id: "sunflowerasr-51",
    name: "SunflowerASR-51",
    version: "51-language",
    deployment: "self_hosted",
    status: "untested",

   languages: [
  "ak",
  "ee",
  "ha",
  "lg",
  "sw",
],

    supportsLongForm: true,
    supportsStreaming: false,

    modelSource: "Sunbird AI",
    notes:
      "African-language ASR candidate. Requires Nanivio-hosted inference and validation before production use.",
  },

  {
    id: "dondo-southern-ghana",
    name: "DONDO Southern Ghana ASR",
    deployment: "self_hosted",
    status: "untested",

    languages: [
  "en",
  "fr",
  "ak",
  "fat",
  "ee",
  "gaa",
],

    supportsLongForm: true,
    supportsStreaming: false,

    modelSource: "Open speech-model checkpoint",
    license: "Apache-2.0",
    notes:
      "Candidate Ghanaian-language ASR model. Nanivio must validate each language independently.",
  },

  {
    id: "nanivio-multilingual-asr",
    name: "Nanivio Multilingual ASR",
    deployment: "self_hosted",
    status: "untested",

    languages: [
      "en",
      "fr",
      "es",
      "ar",
      "de",
      "it",
      "pt",
      "zh",
      "ja",
      "ko",
      "sw",
      "ha",
      "ak",
      "tw-ak",
      "fat",
      "ee",
      "gaa",
      "lg",
    ],

    supportsLongForm: true,
    supportsStreaming: false,

    notes:
      "Reserved Nanivio fallback layer. Must be backed by an actually deployed multilingual model before activation.",
  },
];
