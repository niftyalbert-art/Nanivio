import type { Express, Request, RequestHandler } from 'express';
import { getServerSupabase } from './supabaseServer.ts';
import { malviCatalogService } from './malviPlanCatalog.ts';

export function validateMalviAdjustment(body: any) {
  if (!body || typeof body.userId !== 'string' || !body.userId.trim() || body.userId.length > 200 ||
    !['CREDIT','DEBIT'].includes(body.direction) || !['voice','avatar'].includes(body.mode) ||
    !['MONTHLY','ANNUAL'].includes(body.billingCycle) || !Number.isInteger(body.minutes) ||
    body.minutes < 1 || body.minutes > 525600 || typeof body.reason !== 'string' ||
    body.reason.trim().length < 10 || body.reason.trim().length > 500 ||
    typeof body.requestId !== 'string' || !/^[\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12}$/i.test(body.requestId) ||
    (body.planId !== undefined && (typeof body.planId !== 'string' || body.planId.length > 200))) {
    throw new Error('Enter a user, credit/debit, voice/avatar, billing cycle, whole minutes, a reason of 10–500 characters and a valid request ID.');
  }
  return { ...body, userId: body.userId.trim(), reason: body.reason.trim() };
}

const failures: Record<string,string> = {
  ADMIN_REQUIRED: 'Only an active administrator can adjust Malvi minutes.',
  USER_NOT_FOUND: 'The selected user no longer exists.',
  MALVI_CYCLE_MISMATCH: 'Choose the user’s current monthly or annual cycle. This adjustment cannot replace an existing billing period.',
  MALVI_INSUFFICIENT_UNUSED_MINUTES: 'The debit exceeds the user’s unused minutes. Already-used or reserved minutes cannot be removed.',
  MALVI_PLAN_REQUIRED: 'There is no active Malvi plan to debit.',
  MALVI_AVATAR_NOT_INCLUDED: 'The current voice-only plan cannot receive avatar minutes.',
  PUBLISHED_PLAN_REQUIRED: 'Select a published Malvi plan for this user’s first administrative grant.',
  ADJUSTMENT_CONFLICT: 'This request ID was already used for a different adjustment. Refresh before creating a new operation.',
};

export function registerAdminMalviMinutes(
  app: Express, requireAdmin: RequestHandler, actor: (request: Request) => string,
  database = getServerSupabase,
) {
  const setup = 'Admin Malvi minutes setup is unavailable. Apply migrations/017_admin_malvi_minutes.sql; no adjustment was made.';
  const uncertain = 'The adjustment status could not be confirmed. Keep this form open and retry the same request to recover its receipt; do not create another adjustment yet.';
  const schemaMissing = (error: any) => ['PGRST202','PGRST205','42883','42P01'].includes(error?.code);
  app.get('/api/admin/malvi/overview', requireAdmin, async (req,res) => {
    try {
      const db = database();
      if (!db) return res.status(503).json({success:false,error:setup});
      const {data,error} = await db.rpc('nanivio_admin_malvi_overview',{p_admin:actor(req)}).abortSignal(AbortSignal.timeout(5000));
      if (String(error?.message||'').includes('ADMIN_REQUIRED')) return res.status(403).json({success:false,error:'Administrator access has changed. Sign in again.'});
      if (error || !data || !['totalUsers','paidSubscribers','unsubscribedUsers','malviPaidSubscribers','malviTrialUsers']
        .every(key => Number.isSafeInteger(data[key]) && data[key]>=0)) {
        return res.status(503).json({success:false,error:schemaMissing(error)?setup:'Account totals are temporarily unavailable. Retry without assuming an empty directory.'});
      }
      return res.json({success:true,metrics:data});
    } catch { return res.status(503).json({success:false,error:setup}); }
  });
  app.post('/api/admin/malvi/adjustments', requireAdmin, async (req,res) => {
    let body: ReturnType<typeof validateMalviAdjustment>;
    try { body=validateMalviAdjustment(req.body); }
    catch(error) { return res.status(400).json({success:false,error:(error as Error).message}); }
    try {
      const db = database();
      if (!db) return res.status(503).json({success:false,error:setup});
      let plan: {id:string;tier:string;name:string}|null = null;
      if (body.planId) {
        // A retry must still recover its receipt after a plan is unpublished.
        // An empty plan can replay an existing operation, but the SQL refuses
        // to use it for a first grant, so an unavailable catalogue cannot grant.
        plan = {id:body.planId,tier:'',name:''};
        try {
          const catalog = await malviCatalogService.read();
          const published = catalog.snapshot.plans.find(item => item.id === body.planId && item.status === 'PUBLISHED');
          if (published) plan = {id:published.id,tier:published.tier,name:published.name};
        } catch { /* The SQL can recover an existing receipt, never invent a plan. */ }
      }
      const {data,error} = await db.rpc('nanivio_admin_adjust_malvi_minutes',{
        p_admin:actor(req),p_request:body.requestId,p_user:body.userId,p_direction:body.direction,
        p_mode:body.mode,p_minutes:body.minutes,p_cycle:body.billingCycle,p_reason:body.reason,p_plan:plan,
      }).abortSignal(AbortSignal.timeout(8000));
      if (error || !data) {
        const code = Object.keys(failures).find(key => String(error?.message||'').includes(key));
        return res.status(code==='ADMIN_REQUIRED'?403:code==='USER_NOT_FOUND'?404:code?409:503)
          .json({success:false,error:code?failures[code]:schemaMissing(error)?setup:uncertain});
      }
      if (data.userId!==body.userId || data.direction!==body.direction || data.mode!==body.mode ||
        data.minutes!==body.minutes || !Number.isFinite(data.creditBalance) || data.creditBalance<0) {
        return res.status(503).json({success:false,error:uncertain});
      }
      return res.json({success:true,result:data,message:`Malvi ${body.mode} minutes ${body.direction==='CREDIT'?'credited':'debited'} successfully.`});
    } catch { return res.status(503).json({success:false,error:uncertain}); }
  });
}
