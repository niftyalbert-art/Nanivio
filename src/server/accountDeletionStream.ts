import type { StreamErasureTransport } from './accountDeletionAdapters';
import { DeletionBlocked } from './accountDeletionWorker';

type Request = (path:string,method?:string,body?:unknown)=>Promise<any>;
// Provider contract checked against Stream's published Chat OpenAPI and GDPR
// documentation. Files and other participants' content are not blanket-deleted.
export function createStreamDeletionTransport(send:Request):StreamErasureTransport {
  const identifier=(value:string)=>typeof value==='string'&&/^[a-zA-Z0-9_:-]{1,160}$/.test(value);
  return {
    async startPruning(ownerId) {
      if(!identifier(ownerId))throw new DeletionBlocked('REVIEW_REQUIRED');
      const response=await send('/users/delete','POST',{
        user_ids:[ownerId],user:'pruning',messages:'pruning',
        conversations:'keep',files:false,
      });
      if(!identifier(response?.task_id))throw new DeletionBlocked('PROVIDER_OUTCOME_UNCONFIRMED');
      return {operationId:response.task_id};
    },
    async check(operationId,ownerId) {
      if(!identifier(operationId)||!identifier(ownerId))throw new DeletionBlocked('REVIEW_REQUIRED');
      const result=await send(`/tasks/${encodeURIComponent(operationId)}`,'GET');
      if(result?.task_id!==operationId)throw new DeletionBlocked('PROVIDER_OUTCOME_UNCONFIRMED');
      if(result.error && Object.keys(result.error).length)return 'failed';
      if(['pending','running','waiting'].includes(result.status))return 'pending';
      if(result.status!=='completed')return 'failed';
      // Bind completion to this owner as well as the saved operation. A wrong
      // task ID or a restored/still-active user must not pass verification.
      const query={filter_conditions:{id:{$eq:ownerId}},limit:1};
      const users=await send(`/users?payload=${encodeURIComponent(JSON.stringify(query))}`,'GET');
      if(!Array.isArray(users?.users))throw new DeletionBlocked('PROVIDER_OUTCOME_UNCONFIRMED');
      return users.users.length===0?'completed':'failed';
    },
  };
}
