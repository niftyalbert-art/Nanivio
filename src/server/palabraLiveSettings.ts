/** Explicit conversational settings; not a promise of end-to-end latency.
 * Keep the existing 20s provider backlog cap: reducing it silently drops audio.
 * Reference: docs.palabra.ai/docs/streaming_api/translation_settings_breakdown
 */
export function palabraLiveTask(source:string,target:string,voiceConsent:boolean) {
  return {
    input_stream:{content_type:'audio',source:{type:'ws',format:'pcm_s16le',sample_rate:16000,channels:1}},
    output_stream:{content_type:'audio',target:{type:'ws',format:'pcm_s16le'}},
    pipeline:{
      transcription:{
        source_language:source,segment_confirmation_silence_threshold:0.5,
        only_confirm_by_silence:false,sentence_splitter:{enabled:true},
      },
      translations:[{
        target_language:target==='zh'?'zh-hans':target,
        translate_partial_transcriptions:false,
        speech_generation:{voice_cloning:voiceConsent},
      }],
      translation_queue_configs:{global:{
        desired_queue_level_ms:2000,max_queue_level_ms:20000,
        auto_tempo:true,auto_tempo_max_delay_ms:60,min_tempo:1.15,max_tempo:1.45,
      }},
      allowed_message_types:['partial_transcription','validated_transcription','translated_transcription'],
    },
  };
}
