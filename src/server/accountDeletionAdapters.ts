import type { DeletionAdapter } from './accountDeletionWorker';
import { DeletionBlocked } from './accountDeletionWorker';
import type { VoiceProfileService } from './voiceProfileService';
import type { SupabaseClient } from '@supabase/supabase-js';

export function voiceDeletionAdapter(voices: Pick<VoiceProfileService,'delete'>): DeletionAdapter {
  return {
    idempotent: true,
    async run({ ownerId }) {
      const result = await voices.delete(ownerId);
      // Missing installation is not proof that no provider voice exists.
      if (!result.available && result.status === 'none') throw new DeletionBlocked('REVIEW_REQUIRED');
      if (!['none','deleted'].includes(result.status) || result.enabled) throw new DeletionBlocked('REVIEW_REQUIRED');
      return { verified: true, receipt: { code: 'SAVED_VOICE_REMOVAL_VERIFIED' } };
    },
  };
}

export interface StreamErasureTransport {
  startPruning(ownerId: string): Promise<{ operationId: string }>;
  check(operationId: string, ownerId: string): Promise<'pending' | 'completed' | 'failed'>;
}
export function streamDeletionAdapter(transport: StreamErasureTransport): DeletionAdapter {
  return {
    idempotent: false,
    async run({ ownerId, checkpoint }) {
      if (checkpoint?.state === 'waiting') {
        const operationId = checkpoint.receipt.operationId;
        if (!operationId) throw new DeletionBlocked('PROVIDER_OUTCOME_UNCONFIRMED');
        const status = await transport.check(operationId,ownerId);
        if (status === 'failed') throw new DeletionBlocked('REVIEW_REQUIRED');
        if (status === 'completed') return { verified: true, receipt: { code: 'STREAM_PRUNING_VERIFIED',operationId } };
        if (status !== 'pending') throw new DeletionBlocked('PROVIDER_OUTCOME_UNCONFIRMED');
        return { verified: false, receipt: { code: 'STREAM_PRUNING_PENDING',operationId } };
      }
      const { operationId } = await transport.startPruning(ownerId);
      // An asynchronous acceptance is never reported as completed erasure.
      return { verified: false, receipt: { code: 'STREAM_PRUNING_PENDING',operationId } };
    },
  };
}

export function localDeletionAdapter(db: SupabaseClient): DeletionAdapter {
  return {
    idempotent: true,
    async run({ requestId,leaseToken }) {
      const {data,error}=await db.rpc('nanivio_deletion_clean_local',{
        p_request:requestId,p_token:leaseToken,
      }).abortSignal(AbortSignal.timeout(15000));
      if(error||data?.cleaned!==true)throw new DeletionBlocked('REVIEW_REQUIRED');
      return {verified:true,receipt:{code:'LOCAL_PERSONAL_DATA_REMOVED'}};
    },
  };
}

export function identityDeletionAdapter(db: SupabaseClient): DeletionAdapter {
  return {
    idempotent: true,
    async run({ ownerId }) {
      const {data:profile,error}=await db.from('nanivio_users')
        .select('id,status,auth_user_id,erased_at').eq('id',ownerId)
        .abortSignal(AbortSignal.timeout(5000)).maybeSingle();
      if(error||!profile||profile.status!=='DEACTIVATED'||!profile.erased_at)
        throw new DeletionBlocked('REVIEW_REQUIRED');
      if(profile.auth_user_id) {
        const id=profile.auth_user_id;
        const missing=(error:any)=>error?.status===404&&error?.code==='user_not_found';
        const before=await boundedIdentityCall(db.auth.admin.getUserById(id));
        if(before.error && !missing(before.error))throw Error('Identity check unavailable');
        if(!before.error) {
          if(before.data?.user?.id!==id)throw new DeletionBlocked('REVIEW_REQUIRED');
          const deleted=await boundedIdentityCall(db.auth.admin.deleteUser(id,false));
          if(deleted.error && !missing(deleted.error))throw Error('Identity removal unavailable');
        }
        const after=await boundedIdentityCall(db.auth.admin.getUserById(id));
        if(!missing(after.error))throw new DeletionBlocked('PROVIDER_OUTCOME_UNCONFIRMED');
        const cleared=await db.from('nanivio_users').update({auth_user_id:null})
          .eq('id',ownerId).eq('auth_user_id',id).eq('status','DEACTIVATED')
          .select('id').abortSignal(AbortSignal.timeout(5000)).maybeSingle();
        if(cleared.error||!cleared.data)throw Error('Identity checkpoint unavailable');
      }
      return {verified:true,receipt:{code:'AUTH_IDENTITY_ABSENCE_VERIFIED'}};
    },
  };
}

async function boundedIdentityCall<T>(work:Promise<T>):Promise<T> {
  let timeout:ReturnType<typeof setTimeout>|undefined;
  try {
    return await Promise.race([work,new Promise<never>((_resolve,reject)=>{
      timeout=setTimeout(()=>reject(Error('Identity operation was not confirmed.')),15000);
    })]);
  } finally {if(timeout)clearTimeout(timeout);}
}

export function localVerificationAdapter(db: SupabaseClient): DeletionAdapter {
  return {
    idempotent:true,
    async run({requestId,leaseToken}) {
      const {data,error}=await db.rpc('nanivio_deletion_clean_local',{
        p_request:requestId,p_token:leaseToken,p_verify_only:true,
      }).abortSignal(AbortSignal.timeout(15000));
      if(error||data?.verified!==true)throw new DeletionBlocked('REVIEW_REQUIRED');
      return {verified:true,receipt:{code:'LOCAL_STATE_REVERIFIED'}};
    },
  };
}
