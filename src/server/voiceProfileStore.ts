import { randomUUID } from 'node:crypto';
import { getServerSupabase } from './supabaseServer.ts';
import { VOICE_PROFILE_CONSENT, type VoiceProfileStatus } from '../shared/voiceProfile.ts';

export class VoiceProfileError extends Error {
  constructor(public status:number, message:string) { super(message); }
}
export type VoiceRow = {
  owner_id:string; generation:string; state:Exclude<VoiceProfileStatus,'none'>;
  language:string; enabled:boolean; provider_voice_id:string|null;
  creation_uncertain:boolean; consent_version:string; consented_at:string;
  created_at:string; updated_at:string;
};
export interface VoiceStore {
  read(userId:string):Promise<{installed:boolean;row:VoiceRow|null}>;
  claim(userId:string,language:string,enabled:boolean):Promise<VoiceRow>;
  patch(userId:string,generation:string,changes:Partial<VoiceRow>,states?:VoiceRow['state'][]):Promise<VoiceRow|null>;
}
const table='nanivio_voice_profiles';
function db() {
  const client=getServerSupabase();
  if(!client)throw new VoiceProfileError(503,'Private voice storage is unavailable.');
  return client;
}
function failure(){return new VoiceProfileError(503,'Your private voice profile could not be checked. Please try again later.');}
export class SupabaseVoiceStore implements VoiceStore {
  async read(userId:string) {
    const {data,error}=await db().from(table).select('*').eq('owner_id',userId)
      .abortSignal(AbortSignal.timeout(3500)).maybeSingle();
    // Uninstalled optional feature must not interrupt existing standard calls.
    if(error && ['42P01','PGRST205'].includes(error.code))return {installed:false,row:null};
    if(error)throw failure();
    return {installed:true,row:data as VoiceRow|null};
  }
  async claim(userId:string,language:string,enabled:boolean) {
    const current=await this.read(userId);
    if(!current.installed)throw new VoiceProfileError(503,'One-time voice setup needs the private storage update.');
    if(current.row && current.row.state!=='deleted')throw new VoiceProfileError(409,'A voice profile already exists or is being processed. Check or delete it first.');
    if(current.row && Date.now()-Date.parse(current.row.created_at)<86400000)
      throw new VoiceProfileError(429,'Only one voice setup attempt is allowed per 24 hours. Please try tomorrow.');
    const now=new Date().toISOString();
    const row:VoiceRow={owner_id:userId,generation:randomUUID(),state:'creating',language,enabled,
      provider_voice_id:null,creation_uncertain:false,consent_version:VOICE_PROFILE_CONSENT,
      consented_at:now,created_at:now,updated_at:now};
    const query=current.row
      ? db().from(table).update(row).eq('owner_id',userId).eq('generation',current.row.generation).eq('state','deleted')
      : db().from(table).insert(row);
    const {data,error}=await query.select('*').abortSignal(AbortSignal.timeout(3500)).maybeSingle();
    if(error?.code==='23505'||(!error&&!data))throw new VoiceProfileError(409,'Voice setup is already in progress.');
    if(error)throw failure();
    return data as VoiceRow;
  }
  async patch(userId:string,generation:string,changes:Partial<VoiceRow>,states?:VoiceRow['state'][]) {
    let query=db().from(table).update({...changes,updated_at:new Date().toISOString()})
      .eq('owner_id',userId).eq('generation',generation);
    if(states)query=query.in('state',states);
    const {data,error}=await query.select('*').abortSignal(AbortSignal.timeout(3500)).maybeSingle();
    if(error)throw failure();
    return data as VoiceRow|null;
  }
}
