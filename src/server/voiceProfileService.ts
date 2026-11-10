import { PALABRA_LANGUAGES, supportsPalabraVoiceCloning } from '../shared/palabraLanguages.ts';
import { VOICE_PROFILE_CONSENT, type VoiceProfileView } from '../shared/voiceProfile.ts';
import { parsePalabraWav, palabraConfigured } from './palabraSpeech.ts';
import { VoiceProfileError, SupabaseVoiceStore, type VoiceStore, type VoiceRow } from './voiceProfileStore.ts';
import { PalabraVoiceProvider, VoiceCreationError, type VoiceProvider } from './voiceProfileProvider.ts';
import { reservePalabraCapacity } from './palabraCapacity.ts';

export type SavedVoiceReference={voiceId:string;generation:string};
export class VoiceProfileService {
  constructor(
    private store:VoiceStore=new SupabaseVoiceStore(),
    private provider:VoiceProvider=new PalabraVoiceProvider(),
    private configured=palabraConfigured,
    private revoked:(userId:string)=>void=()=>{},
  ){}
  setRevocationHandler(handler:(userId:string)=>void){this.revoked=handler;}
  private view(installed:boolean,row:VoiceRow|null):VoiceProfileView {
    return {available:installed&&this.configured(),status:row?.state??'none',
      enabled:row?.enabled===true,language:row?.language,consentedAt:row?.consented_at,
      supportedLanguages:[...PALABRA_LANGUAGES]};
  }
  async get(userId:string) {
    const {installed,row}=await this.store.read(userId);
    return this.view(installed,row);
  }
  async enroll(userId:string,audio:Buffer,language:string,consent:unknown,enabled:boolean) {
    if(consent!==VOICE_PROFILE_CONSENT)
      throw new VoiceProfileError(400,'Confirm that you are 18 or older and consent to storing your own voice for future translated calls.');
    if(!PALABRA_LANGUAGES.some(code=>code===language))
      throw new VoiceProfileError(422,'Voice enrollment is not supported in this language. Standard translation availability is separate.');
    const {seconds,pcm}=parsePalabraWav(audio,60);
    if(seconds<30)throw new VoiceProfileError(400,'Record at least 30 seconds of your own voice, up to 60 seconds.');
    let energy=0;
    for(let i=0;i<pcm.length;i+=2)energy+=pcm.readInt16LE(i)**2;
    if(Math.sqrt(energy/(pcm.length/2))<70)
      throw new VoiceProfileError(400,'The recording is too quiet. Record your own voice in a quiet place, close to the microphone.');
    if(!this.configured())throw new VoiceProfileError(503,'Voice setup is not configured.');
    const release=reservePalabraCapacity(userId);
    let row:VoiceRow;
    try {row=await this.store.claim(userId,language,enabled);}catch(error){release();throw error;}
    let remoteId:string|null=null,creationStarted=false;
    try {
      // Persist uncertainty before the side effect; never silently retry a
      // creation whose response may have been lost.
      const active=await this.store.patch(userId,row.generation,{creation_uncertain:true},['creating']);
      if(!active) {
        await this.store.patch(userId,row.generation,{state:'deleted',enabled:false},['deleting']);
        return this.get(userId);
      }
      creationStarted=true;
      const created=await this.provider.create(row.generation,language);
      remoteId=created.id;
      const persisted=await this.store.patch(userId,row.generation,{
        provider_voice_id:remoteId,creation_uncertain:false,
      },['creating','deleting']);
      if(!persisted)throw new VoiceProfileError(409,'Voice setup was cancelled.');
      if(persisted.state==='deleting')return this.finishDelete(userId,persisted);
      await this.provider.upload(created.upload,remoteId,audio);
      const processing=await this.store.patch(userId,row.generation,{state:'processing'},['creating']);
      if(!processing) {
        const current=await this.store.read(userId);
        if(current.row?.generation===row.generation&&current.row.state==='deleting')
          return this.finishDelete(userId,current.row);
        throw new VoiceProfileError(409,'Voice setup was cancelled.');
      }
      return this.view(true,processing);
    } catch(error) {
      let removed=false;
      if(remoteId)try {await this.provider.delete(remoteId);removed=true;}catch{/* Keep private cleanup state for explicit retry. */}
      const uncertain=!remoteId&&creationStarted&&(!(error instanceof VoiceCreationError)||error.uncertain);
      const changes:Partial<VoiceRow>={
        state:remoteId&&!removed||uncertain?'attention':'deleted',enabled:false,
        provider_voice_id:removed?null:remoteId,creation_uncertain:uncertain,
      };
      await this.store.patch(userId,row.generation,changes,['creating','processing','attention']).catch(()=>{});
      // Never turn a pending deletion back into an activatable attention state.
      await this.store.patch(userId,row.generation,{
        ...changes,state:removed||!remoteId&&!uncertain?'deleted':'deleting',
      },['deleting']).catch(()=>{});
      throw error instanceof VoiceProfileError?error:new VoiceProfileError(502,
        'Voice setup could not be completed. Check your profile before trying again.');
    } finally {release();}
  }
  async refresh(userId:string) {
    const {installed,row}=await this.store.read(userId);
    if(!installed||!row||row.state==='deleted')return this.view(installed,row);
    if(row.state==='deleting')return this.delete(userId);
    if(!row.provider_voice_id) {
      if(row.creation_uncertain||Date.now()-Date.parse(row.updated_at)>120000)
        throw new VoiceProfileError(409,'Voice setup is unconfirmed and disabled. Contact support before another enrollment.');
      return this.view(installed,row);
    }
    if(row.state==='creating')return this.view(installed,row);
    const status=await this.provider.status(row.provider_voice_id);
    const updated=await this.store.patch(userId,row.generation,{
      state:status==='failed'?'attention':status,
      ...(status==='failed'?{enabled:false}:{}),
    },['processing','ready','attention']);
    return updated?this.view(installed,updated):this.get(userId);
  }
  async enable(userId:string,enabled:boolean) {
    const {row}=await this.store.read(userId);
    if(!row||row.state!=='ready')throw new VoiceProfileError(409,'Wait for your own voice profile to be ready.');
    if(enabled&&row.consent_version!==VOICE_PROFILE_CONSENT)
      throw new VoiceProfileError(409,'Your voice permission needs renewal. Delete the old profile before setting it up again.');
    const updated=await this.store.patch(userId,row.generation,{enabled},['ready']);
    if(!enabled)this.revoked(userId);
    return updated?this.view(true,updated):this.get(userId);
  }
  private async finishDelete(userId:string,row:VoiceRow) {
    if(!row.provider_voice_id) {
      if(row.creation_uncertain)throw new VoiceProfileError(409,
        'Your voice is disabled. Provider creation is unconfirmed; support must confirm removal.');
      const updated=await this.store.patch(userId,row.generation,{state:'deleted',enabled:false},['deleting']);
      return updated?this.view(true,updated):this.get(userId);
    }
    await this.provider.delete(row.provider_voice_id);
    const updated=await this.store.patch(userId,row.generation,{
      state:'deleted',provider_voice_id:null,creation_uncertain:false,enabled:false,
    },['deleting']);
    return updated?this.view(true,updated):this.get(userId);
  }
  async delete(userId:string) {
    const {installed,row}=await this.store.read(userId);
    if(!row||row.state==='deleted')return this.view(installed,row);
    const deleting=await this.store.patch(userId,row.generation,{state:'deleting',enabled:false});
    this.revoked(userId);
    return deleting?this.finishDelete(userId,deleting):this.get(userId);
  }
  async resolve(userId:string,source:string,target:string):Promise<SavedVoiceReference|null> {
    if(!supportsPalabraVoiceCloning(source,target))return null;
    const {row}=await this.store.read(userId);
    if(!row||row.state!=='ready'||!row.enabled||!row.provider_voice_id
      ||row.consent_version!==VOICE_PROFILE_CONSENT)return null;
    return {voiceId:row.provider_voice_id,generation:row.generation};
  }
  async allowed(userId:string,reference:SavedVoiceReference) {
    const {row}=await this.store.read(userId);
    return !!row&&row.state==='ready'&&row.enabled&&row.generation===reference.generation
      &&row.provider_voice_id===reference.voiceId&&row.consent_version===VOICE_PROFILE_CONSENT;
  }
}
export const voiceProfiles=new VoiceProfileService();
