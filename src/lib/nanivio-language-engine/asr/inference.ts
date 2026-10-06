import {
  SpeechRecognitionRequest,
  SpeechRecognitionResult,
} from "../types";

export interface NanivioASRInferenceRequest {
  modelId: string;
  request: SpeechRecognitionRequest;
}

export interface NanivioASRInferenceProvider {
  readonly name: string;

  supportsModel(modelId: string): boolean;

  transcribe(
    request: NanivioASRInferenceRequest,
  ): Promise<SpeechRecognitionResult>;
}
