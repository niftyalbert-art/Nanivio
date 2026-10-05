export function productionStatus(){
  const checks={
    supabaseAuth: Boolean(process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY && (process.env.SUPABASE_ANON_KEY||process.env.VITE_SUPABASE_ANON_KEY)),
    persistentBilling: Boolean(process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY),
    paystack: Boolean(process.env.PAYSTACK_SECRET_KEY),
    agora: Boolean(process.env.AGORA_APP_ID && process.env.AGORA_APP_CERTIFICATE),
    getstream: Boolean(process.env.STREAM_API_KEY && process.env.STREAM_API_SECRET),
    azureTranslator: Boolean(process.env.AZURE_TRANSLATOR_KEY),
    azureSpeech: Boolean(process.env.AZURE_SPEECH_KEY && process.env.AZURE_SPEECH_REGION),
    khaya: Boolean(process.env.KHAYA_API_KEY && process.env.KHAYA_ASR_URL && process.env.KHAYA_TRANSLATION_URL && process.env.KHAYA_TTS_URL),
    sunbird: Boolean(process.env.SUNBIRD_API_KEY),
    malvi: Boolean(process.env.GEMINI_API_KEY),
    twilio: Boolean(process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN && process.env.TWILIO_PHONE_NUMBER),
  };
  const enabled=Object.values(checks).filter(Boolean).length;
  return {production:true,checks,enabledCount:enabled,totalChecks:Object.keys(checks).length,criticalReady:checks.supabaseAuth&&checks.persistentBilling&&checks.paystack&&checks.agora&&checks.getstream};
}
