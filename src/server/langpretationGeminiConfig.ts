/**
 * Translation and transcription are latency-sensitive, not agentic reasoning.
 * Model-specific settings follow Google's GenerateContent thinking contract:
 * https://ai.google.dev/gemini-api/docs/generate-content/thinking
 * Never apply these settings to the separate speech-generation request.
 */
export function fastLanguageGenerationConfig(model: string, config: Record<string, unknown>) {
  if (/^gemini-(?:3|4)(?:[.-]|$)/.test(model)) {
    const {temperature: _temperature, topP: _topP, topK: _topK, ...compatible} = config;
    // 3.8 supports low, not minimal. Do not cap reasoning with output truncation.
    return {...compatible, thinkingConfig:{thinkingLevel:'low'}};
  }
  if (/^gemini-2\.5-flash(?:[-.]|$)/.test(model)) {
    return {...config, thinkingConfig:{thinkingBudget:0}};
  }
  return config;
}
