import { AudioSegment, AsrResult } from '../types';
import { authenticatedFetch } from '../../authenticatedFetch';
import { LANGUAGE_CODES,requireLanguage } from '../languagePlan';
import { PcmUtils } from '../audio/pcm';
export class AsrSubsystem {
  public async transcribe(segment:AudioSegment, language:string):Promise<AsrResult>{
    requireLanguage(language);
    if(!segment.pcmData?.length||!Number.isFinite(segment.sampleRate)||segment.sampleRate<8000)throw new Error('Real microphone PCM and its sample rate are required.');
    const start=Date.now();
    const offline=new OfflineAudioContext(1,Math.ceil(segment.pcmData.length*16000/segment.sampleRate),16000);
    const buffer=offline.createBuffer(1,segment.pcmData.length,segment.sampleRate);buffer.copyToChannel(new Float32Array(segment.pcmData),0);
    const source=offline.createBufferSource();source.buffer=buffer;source.connect(offline.destination);source.start();
    const rendered=await offline.startRendering();
    const wav=PcmUtils.float32ToWavBlob(rendered.getChannelData(0),16000);
    const bytes=new Uint8Array(await wav.arrayBuffer());let binary='';
    for(let i=0;i<bytes.length;i+=32768)binary+=String.fromCharCode(...bytes.subarray(i,i+32768));
    const response=await authenticatedFetch('/api/langpretation/transcribe',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({language,audioBase64:btoa(binary)})});
    const data=await response.json();
    if(!response.ok||!data.success||typeof data.text!=='string'||!data.text.trim())throw new Error(data.error||'Production speech recognition failed.');
    return {text:data.text,language,confidence:data.confidence??null,isFinal:true,latencyMs:Date.now()-start};
  }
  public getSupportedLanguages(){return [...LANGUAGE_CODES];}
}
