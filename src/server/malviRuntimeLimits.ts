import { Router } from 'express';
import { getServerSupabase } from './supabaseServer.ts';
import { AssistantError } from './assistant/redisStore.ts';

export const runtimeLimitFields = ['live_minutes_monthly', 'research_monthly', 'analyses_monthly', 'upload_mib_monthly'] as const;
export function validateRuntimeLimits(body: any) {
  if (!body || Object.keys(body).some(k => ![...runtimeLimitFields,'expectedVersion','reason'].includes(k))
    || !Number.isSafeInteger(body.expectedVersion) || body.expectedVersion < 0
    || typeof body.reason !== 'string' || body.reason.trim().length < 8 || body.reason.length > 500
    || runtimeLimitFields.some(k => !Number.isInteger(body[k]) || body[k] < 0 || body[k] > 1_000_000_000)) {
    throw new AssistantError(400, 'INVALID_RUNTIME_LIMITS', 'Set all four limits to whole numbers of zero or more, supply the saved version and an 8–500 character reason.');
  }
  return Object.fromEntries(runtimeLimitFields.map(k => [k, body[k]]));
}
const database = () => {
  const db = getServerSupabase();
  if (!db) throw new AssistantError(503, 'RUNTIME_STORAGE_UNAVAILABLE', 'Persistent Malvi usage settings are unavailable.');
  return db;
};
export async function readMalviRuntimeLimits() {
  const { data, error } = await database().from('nanivio_malvi_runtime_policy').select('*').eq('id',true).abortSignal(AbortSignal.timeout(5000)).single();
  if (error || !data) throw new AssistantError(503, 'RUNTIME_SETUP_REQUIRED', 'Apply the Malvi live-allowance migration before configuring usage limits.');
  return data;
}
export function createMalviRuntimeRouter() {
  const router = Router();
  const allowed = (req: any) => ['SUPER_ADMIN','FINANCE_ADMIN'].includes(req.billingAdmin?.adminRole);
  const run = (handler: any) => async (req: any,res: any) => {
    try { await handler(req,res); }
    catch (error) { res.status(error instanceof AssistantError ? error.status : 503).json({
      success:false,error:error instanceof AssistantError ? error.message : 'Malvi usage settings could not be saved. Reload before retrying.',
    }); }
  };
  router.get('/',run(async (req: any,res: any) => res.json({success:true,canEdit:allowed(req),policy:await readMalviRuntimeLimits()})));
  router.post('/save',run(async (req: any,res: any) => {
    if (!allowed(req) || !req.authUser?.id) throw new AssistantError(403,'FINANCE_ADMIN_REQUIRED','Only a finance administrator can change usage limits.');
    const limits = validateRuntimeLimits(req.body);
    const { data,error } = await database().rpc('nanivio_save_malvi_runtime_limits',{
      p_limits:limits,p_version:req.body.expectedVersion,p_actor:req.authUser.id,p_reason:req.body.reason.trim(),
    }).abortSignal(AbortSignal.timeout(5000));
    if (error?.message?.includes('MALVI_POLICY_CONFLICT')) throw new AssistantError(409,'MALVI_POLICY_CONFLICT','Another administrator saved first. Reload the limits before saving.');
    if (error || !data) throw new AssistantError(503,'RUNTIME_SAVE_UNCONFIRMED','The save could not be confirmed. Reload before retrying.');
    res.json({success:true,canEdit:true,policy:data});
  }));
  return router;
}
