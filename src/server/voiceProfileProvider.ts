import { VoiceProfileError } from './voiceProfileStore.ts';

const base='https://api.palabra.ai/saas/voice';
const uuid=/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
export interface VoiceProvider {
  create(generation:string,language:string):Promise<{id:string;upload:unknown}>;
  upload(upload:unknown,id:string,audio:Buffer):Promise<void>;
  status(id:string):Promise<'ready'|'processing'|'failed'>;
  delete(id:string):Promise<void>;
}
/** False only for a conclusive rejection before a remote profile was created. */
export class VoiceCreationError extends VoiceProfileError {
  constructor(public uncertain:boolean) { super(502,uncertain
    ? 'Voice setup could not be confirmed. Do not submit again; check the profile or contact support.'
    : 'Voice setup was rejected by the speech service. Please contact Nanivio support.'); }
}
async function json(response:Response) {
  if(!response.body)throw new Error('Empty response');
  const reader=response.body.getReader();const parts:Uint8Array[]=[];let size=0;
  try {
    while(true){const item=await reader.read();if(item.done)break;size+=item.value.length;
      if(size>128000)throw new Error('Oversized response');parts.push(item.value);}
    return JSON.parse(Buffer.concat(parts).toString('utf8'));
  } catch(error){await reader.cancel().catch(()=>{});throw error;}
}
export class PalabraVoiceProvider implements VoiceProvider {
  constructor(private send:typeof fetch=fetch,private key:()=>string=()=>process.env.PALABRA_API_KEY??''){}
  private request(path:string,init:RequestInit={},timeout=15000) {
    const key=this.key();
    if(!key)throw new VoiceProfileError(503,'Voice setup is not configured.');
    return this.send(`${base}${path}`,{...init,redirect:'error',signal:AbortSignal.timeout(timeout),
      headers:{Authorization:`Bearer ${key}`,'Content-Type':'application/json'}});
  }
  async create(generation:string,language:string) {
    let response:Response;
    try {response=await this.request('/clone',{method:'POST',body:JSON.stringify({data:{
      name:`Nanivio ${generation}`,samples:[{filename:'reference.wav',mime_type:'audio/wav',
        lang_code:language,denoise:false,speech_normalization:true}],
    }})});} catch {throw new VoiceCreationError(true);}
    if(!response.ok) {
      await response.body?.cancel().catch(()=>{});
      throw new VoiceCreationError(![400,401,403,422,429].includes(response.status));
    }
    try {
      const result=await json(response);
      if(result.ok!==true||!uuid.test(result.data?.voice_id))throw new Error('Invalid response');
      return {id:result.data.voice_id as string,upload:result.data.samples?.[0]};
    } catch {throw new VoiceCreationError(true);}
  }
  async upload(value:unknown,id:string,audio:Buffer) {
    const sample=value as any;let url:URL;
    try {url=new URL(sample?.url);}catch{throw new VoiceProfileError(502,'Voice upload could not be prepared.');}
    const hosts=['palabra-prod-web-cdn.s3.amazonaws.com','palabra-prod-web-cdn.s3.eu-central-1.amazonaws.com'];
    const fields=sample.form_data;
    if(url.protocol!=='https:'||!hosts.includes(url.hostname)||url.port||url.username||url.password
      ||url.pathname!=='/'||url.search||url.hash||!fields||typeof fields!=='object'||Array.isArray(fields)
      ||Object.keys(fields).length>32||fields.acl!=='private'
      ||fields.bucket!=='palabra-prod-web-cdn'||fields['x-amz-meta-voice-id']!==id
      ||Object.values(fields).some(v=>typeof v!=='string'||v.length>24000))
      throw new VoiceProfileError(502,'The private voice upload could not be verified.');
    const form=new FormData();
    for(const [key,value] of Object.entries(fields))form.append(key,value as string);
    form.append('file',new Blob([new Uint8Array(audio)],{type:'audio/wav'}),'reference.wav');
    // Signed upload fields only. Never forward the API authorization to storage.
    const response=await this.send(url.toString(),{method:'POST',body:form,redirect:'error',signal:AbortSignal.timeout(45000)});
    await response.body?.cancel().catch(()=>{});
    if(!response.ok)throw new VoiceProfileError(502,'The voice sample could not be uploaded.');
  }
  async status(id:string) {
    const response=await this.request(`/m/${encodeURIComponent(id)}`);
    if(!response.ok){await response.body?.cancel().catch(()=>{});throw new VoiceProfileError(502,'Voice progress could not be checked.');}
    let result=await json(response);
    if(result.ok!==true||result.data?.voice_id!==id)throw new VoiceProfileError(502,'Voice progress could not be verified.');
    if(result.data.archived_at) {
      const restored=await this.request(`/m/${encodeURIComponent(id)}/restore`,{method:'POST'},48000);
      if(!restored.ok){await restored.body?.cancel().catch(()=>{});throw new VoiceProfileError(502,'Your saved voice is not prepared yet. Check again later.');}
      result=await json(restored);
      if(result.ok!==true||result.data?.voice_id!==id||result.data.archived_at)
        throw new VoiceProfileError(502,'Your saved voice could not be prepared.');
    }
    switch(result.data.processing_status){
      case 'ready':return 'ready' as const;
      case 'created':case 'pending':return 'processing' as const;
      case 'failed':return 'failed' as const;
      default:throw new VoiceProfileError(502,'The speech service returned an unknown voice state.');
    }
  }
  async delete(id:string) {
    const response=await this.request(`/m/${encodeURIComponent(id)}`,{method:'DELETE'});
    if(response.status===404){await response.body?.cancel().catch(()=>{});return;}
    if(!response.ok){await response.body?.cancel().catch(()=>{});throw new VoiceProfileError(502,'Your voice is disabled, but provider deletion is not confirmed. Retry deletion.');}
    const result=await json(response);
    if(result.ok!==true||result.data?.deleted_voice_id!==id)
      throw new VoiceProfileError(502,'Provider voice deletion could not be confirmed. Retry deletion.');
  }
}
