import crypto from 'crypto';
import { getServerSupabase } from './supabaseServer';
import { communicationAccess } from './communicationAccess.ts';
import { buildCommunicationMeter } from './langpretationMeter.ts';

function db() {
  const client = getServerSupabase();
  if (!client) throw new Error('Persistent billing database is not configured.');
  return client;
}

export function normalizedBillingEnabled(): boolean {
  return Boolean(process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY);
}

async function refreshBalancedTerms(userId: string) {
  const { error } = await db().rpc('nanivio_refresh_balanced_terms', { p_user: userId });
  // A pre-cutover database must still serve already-paid legacy benefits.
  // New checkouts independently require the rollout readiness RPC.
  if (error && !['PGRST202','42883'].includes(error.code)) throw new Error('Subscription allowances could not be refreshed.');
}
async function balancedAccess(userId: string) {
  const { data, error } = await db().rpc('nanivio_balanced_usage', { action: 'ACCESS', payload: { userId } });
  if (error && !['PGRST202','42883'].includes(error.code)) throw new Error('Purchased add-on balances could not be loaded.');
  return error ? null : data;
}
async function balancedPackCommand(payload: Record<string, unknown>) {
  const { data, error } = await db().rpc('nanivio_fulfill_balanced_pack', { payload });
  if (error || !data?.success) throw new Error('The add-on could not be activated. Check payment history before retrying.');
  return data;
}

export async function billingCommand(command: string, payload: Record<string, unknown>) {
  if (!normalizedBillingEnabled()) throw new Error('Normalized billing database is not configured.');
  const { data, error } = await db().rpc('nanivio_billing_command', { command_name: command, payload });
  if (error) throw new Error(`Billing database command failed: ${error.message}`);
  if (!data || data.success === false) throw new Error(data?.error || 'Billing database command failed.');
  return data as any;
}

export async function transferFintechToCommunication(payload: Record<string, unknown>) {
  return billingCommand('FINTECH_TO_COMMUNICATION', payload);
}

export async function transferPeerToPeer(payload: Record<string, unknown>) {
  return billingCommand('P2P_TRANSFER', payload);
}

export async function activateSubscriptionFromWallet(payload: Record<string, unknown>) {
  return billingCommand('SUBSCRIPTION_FROM_WALLET', payload);
}

export async function activatePaystackSubscriptionPersistent(payload: Record<string, unknown>) {
  const { data, error } = await db().rpc('nanivio_activate_paystack_subscription', { payload });
  if (error) throw new Error(`Paid subscription activation failed: ${error.message}`);
  if (!data?.success) throw new Error(data?.error || 'Paid subscription activation failed.');
  return data;
}

export async function recordLangpretationUsagePersistent(payload: Record<string, unknown>) {
  if (!normalizedBillingEnabled()) throw new Error('Normalized billing database is not configured.');
  const request = { ...payload, eventId: payload.eventId || `use_${crypto.randomUUID()}` };
  const { data, error } = await db().rpc('nanivio_langpretation_usage', { payload: request });
  if (error) throw new Error(`Langpretation usage recording failed: ${error.message}`);
  if (!data || data.success === false) throw new Error(data?.error || 'Langpretation usage recording failed.');
  return data as any;
}

export async function selectCommunicationPlanPersistent(payload: Record<string, unknown>) {
  if (!normalizedBillingEnabled()) throw new Error('Normalized billing database is not configured.');
  const { data, error } = await db().rpc('nanivio_select_communication_plan', { payload });
  if (error) throw new Error(`Communication plan selection failed: ${error.message}`);
  if (!data || data.success === false || !data.subscription) {
    throw new Error(data?.error || 'Communication plan selection failed.');
  }
  return data as any;
}

export async function getPersistentWallet(userId: string, accountType: string, currency: string) {
  const { data, error } = await db().from('nanivio_wallets').select('*').eq('user_id', userId).eq('account_type', accountType).eq('currency', currency).maybeSingle();
  if (error) throw new Error(`Unable to load wallet: ${error.message}`);
  return data;
}

export async function getPersistentSubscription(userId: string) {
  await refreshBalancedTerms(userId);
  const database = db();
  const { data: active, error: activeError } = await database
    .from('nanivio_subscriptions')
    .select('*')
    .eq('user_id', userId)
    .in('status', ['ACTIVE', 'TRIAL'])
    .gt('current_period_end', new Date().toISOString())
    .order('current_period_start', { ascending: false })
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (activeError) throw new Error(`Unable to load subscription: ${activeError.message}`);

  let data = active;
  if (!data) {
    const { data: latest, error } = await database
      .from('nanivio_subscriptions')
      .select('*')
      .eq('user_id', userId)
      .order('updated_at', { ascending: false })
      .order('started_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) throw new Error(`Unable to load subscription: ${error.message}`);
    data = latest;
  }
  if (!data) return null;

  const periodEnd = data.current_period_end ? new Date(data.current_period_end).getTime() : Date.now();
  return {
    id: data.subscription_id,
    userId: data.user_id,
    planId: data.plan_id,
    tier: data.tier,
    planName: data.plan_name,
    billingCycle: data.billing_cycle,
    status: data.status === 'ACTIVE' && periodEnd <= Date.now() ? 'EXPIRED' : data.status,
    startedAt: data.started_at ? new Date(data.started_at).getTime() : Date.now(),
    currentPeriodStart: data.current_period_start ? new Date(data.current_period_start).getTime() : Date.now(),
    currentPeriodEnd: periodEnd,
    nextBillingAt: data.next_billing_at
      ? new Date(data.next_billing_at).getTime()
      : data.current_period_end ? new Date(data.current_period_end).getTime() : Date.now(),
    autoRenew: Boolean(data.auto_renew),
    pricePaid: Number(data.price_paid || 0),
    currency: data.currency,
    langpretationMinutesQuota: Number(data.langpretation_minutes_quota || 0),
    langpretationMinutesUsed: Number(data.langpretation_minutes_used || 0),
    langpretationMinutesRemaining: Number(data.langpretation_minutes_remaining || 0),
    voiceMinutesQuota: Number(data.voice_minutes_quota || 0),
    voiceMinutesUsed: Number(data.voice_minutes_used || 0),
    malviUnitsQuota: Number(data.malvi_units_quota || 0),
    malviUnitsUsed: Number(data.malvi_units_used || 0),
  };
}

export async function getPersistentTransactions(userId: string, limit = 50) {
  const { data, error } = await db().from('nanivio_billing_transactions').select('*').eq('user_id', userId).order('created_at', { ascending: false }).limit(limit);
  if (error) throw new Error(`Unable to load transactions: ${error.message}`);
  return data || [];
}

export async function getPersistentInvoices(userId: string, limit = 50) {
  const { data, error } = await db().from('nanivio_invoices').select('*').eq('user_id', userId).order('issued_at', { ascending: false }).limit(limit);
  if (error) throw new Error(`Unable to load invoices: ${error.message}`);
  return data || [];
}

export async function getPersistentInvoice(userId: string, invoiceId: string) {
  // Filter by the authenticated owner in the database, not after loading a
  // different user's invoice. Accept both external invoice IDs and UUID row IDs.
  const { data, error } = await db().from('nanivio_invoices').select('*')
    .eq('user_id', userId).eq('invoice_id', invoiceId).maybeSingle();
  if (error) throw new Error(`Unable to load invoice: ${error.message}`);
  if (data) return data;
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(invoiceId)) return null;
  const byRowId = await db().from('nanivio_invoices').select('*')
    .eq('user_id', userId).eq('id', invoiceId).maybeSingle();
  if (byRowId.error) throw new Error(`Unable to load invoice: ${byRowId.error.message}`);
  return byRowId.data || null;
}
export async function purchaseCommunicationMinutesPersistent(payload: Record<string, unknown>) {
  if (payload.billingTerms) return balancedPackCommand({ ...payload, method: 'PAYSTACK' });
  return billingCommand('COMMUNICATION_MINUTES_PURCHASE', payload);
}

export async function purchaseCommunicationMinutesFromWalletPersistent(payload: Record<string, unknown>) {
  if (payload.billingTerms) return balancedPackCommand({ ...payload, method: 'CREDIT' });
  return billingCommand('COMMUNICATION_MINUTES_FROM_WALLET', payload);
}

export async function activateMalviSubscriptionPersistent(payload: Record<string, unknown>) {
  const { data, error } = await db().rpc('nanivio_activate_paystack_malvi', { payload });
  if (error) throw new Error(`Malvi paid activation failed: ${error.message}`);
  if (!data?.success) throw new Error(data?.error || 'Malvi paid activation failed.');
  return data;
}

export async function activateMalviSubscriptionFromWalletPersistent(payload: Record<string, unknown>) {
  return billingCommand('MALVI_SUBSCRIPTION_FROM_WALLET', payload);
}

export async function getPersistentPayment(provider: string, providerReference: string) {
  if (!normalizedBillingEnabled()) return null;
  const { data, error } = await db().from('nanivio_payments').select('*').eq('provider', provider).eq('provider_reference', providerReference).maybeSingle();
  if (error) throw new Error(`Unable to load payment: ${error.message}`);
  return data;
}

export async function paystackTopUpPersistent(payload: Record<string, unknown>) {
  return billingCommand('PAYSTACK_TOPUP', payload);
}
export async function getPersistentWallets(userId:string, accountType:'COMMUNICATION'|'FINTECH'){
  const {data,error}=await db().from('nanivio_wallets').select('*').eq('user_id',userId).eq('account_type',accountType).order('currency');
  if(error) throw new Error(`Unable to load ${accountType.toLowerCase()} wallets: ${error.message}`); return data||[];
}
export async function getPersistentCreditAccount(userId:string){
  const {data,error}=await db().from('nanivio_credit_accounts').select('*').eq('user_id',userId).maybeSingle(); if(error)throw new Error(`Unable to load Nanivio credit: ${error.message}`); return data;
}
export async function getPersistentUsageMeter(userId:string, subscription?: Awaited<ReturnType<typeof getPersistentSubscription>>){
  const [access, currentSubscription] = await Promise.all([
    communicationAccess.access(userId), subscription === undefined ? getPersistentSubscription(userId) : subscription,
  ]);
  let trialSeconds = 0;
  for (let offset = 0; ; offset += 500) {
    const { data, error } = await db().from('nanivio_communication_reservations').select('amount')
      .eq('user_id', userId).eq('source', 'live_trial').in('status', ['RESERVED', 'COMMITTED'])
      .order('event_id').range(offset, offset + 499);
    if (error || !data) throw new Error('Unable to read live trial consumption.');
    for (const row of data) {
      const amount = Number(row.amount);
      if (!Number.isFinite(amount) || amount < 0) throw new Error('Live trial consumption is invalid.');
      trialSeconds += amount;
    }
    if (data.length < 500) break;
  }
  return buildCommunicationMeter(userId, access, currentSubscription, Date.now(), trialSeconds / 60);
}
export async function getPersistentMalviSubscription(userId:string){
  await refreshBalancedTerms(userId);
  const database=db(),now=new Date().toISOString();
  const current=await database.from('nanivio_malvi_subscriptions').select('*').eq('user_id',userId)
    .in('status',['ACTIVE','TRIAL']).lte('current_period_start',now).gt('current_period_end',now)
    .order('current_period_start',{ascending:false}).order('created_at',{ascending:false}).limit(1).maybeSingle();
  if(current.error)throw new Error(`Unable to load Malvi subscription: ${current.error.message}`);
  let data=current.data;
  if(!data){
    const latest=await database.from('nanivio_malvi_subscriptions').select('*').eq('user_id',userId)
      .order('current_period_start',{ascending:false}).order('created_at',{ascending:false}).limit(1).maybeSingle();
    if(latest.error)throw new Error(`Unable to load Malvi subscription: ${latest.error.message}`);
    data=latest.data;
  }
  if(!data) return null;
  const packs = await balancedAccess(userId);
  const voiceExtra = Number(packs?.remaining?.voiceSeconds || 0) / 60;
  const avatarExtra = Number(packs?.remaining?.avatarSeconds || 0) / 60;
  const voicePackQuota = Number(packs?.quota?.voiceSeconds || 0) / 60;
  const avatarPackQuota = Number(packs?.quota?.avatarSeconds || 0) / 60;
  let heldVoice = 0, heldAvatar = 0;
  if (voicePackQuota || avatarPackQuota) {
    const held = await db().from('nanivio_balanced_malvi_pack_leases').select('mode,seconds')
      .eq('user_id',userId).eq('settled',false);
    if (held.error) throw new Error('Live Malvi add-on reservations could not be loaded.');
    for (const lease of held.data || []) {
      if (lease.mode === 'voice') heldVoice += Number(lease.seconds)/60;
      else heldAvatar += Number(lease.seconds)/60;
    }
  }
  return {
    id:data.subscription_id, userId:data.user_id, planId:data.plan_id, tier:data.tier, planName:data.plan_name,
    billingCycle:data.billing_cycle, status:data.status, startedAt:data.started_at?new Date(data.started_at).getTime():Date.now(),
    currentPeriodStart:data.current_period_start?new Date(data.current_period_start).getTime():Date.now(),
    currentPeriodEnd:data.current_period_end?new Date(data.current_period_end).getTime():Date.now(),
    nextBillingAt:data.next_billing_at?new Date(data.next_billing_at).getTime():Date.now(),
    pricePaid:Number(data.price_paid||0), currency:data.currency,
    purchasedCapabilities: Array.isArray(data.capabilities)
      ? data.capabilities.filter((v: unknown): v is string => typeof v === 'string') : null,
    subscriptionVideoMinutesAllowed:Math.max(0,Number(data.video_minutes_allowed||0)-heldAvatar),
    subscriptionVoiceMinutesAllowed:Math.max(0,Number(data.voice_minutes_allowed||0)-heldVoice),
    videoMinutesAllowed:Math.max(0,Number(data.video_minutes_allowed||0)-heldAvatar)+avatarPackQuota,
    videoMinutesUsed:Math.max(0,Number(data.video_minutes_used||0)-heldAvatar)+avatarPackQuota-avatarExtra,
    videoMinutesRemaining:Math.max(0,Number(data.video_minutes_allowed||0)-Number(data.video_minutes_used||0))+avatarExtra,
    voiceMinutesAllowed:Math.max(0,Number(data.voice_minutes_allowed||0)-heldVoice)+voicePackQuota,
    voiceMinutesUsed:Math.max(0,Number(data.voice_minutes_used||0)-heldVoice)+voicePackQuota-voiceExtra,
    voiceMinutesRemaining:Math.max(0,Number(data.voice_minutes_allowed||0)-Number(data.voice_minutes_used||0))+voiceExtra, autoRenew:Boolean(data.auto_renew ?? true),
  };
}

export async function ensureMalviEntitlement(userId:string){
  let sub=await getPersistentMalviSubscription(userId);
  if(!sub){
    const now=new Date(); const end=new Date(now.getTime()+30*86400000);
    // Read only on a new trial, never recalculate an existing user's benefits.
    // No FX/provider calls are needed to grant a zero-priced trial.
    const catalogue = await (await import('./malviPlanCatalog')).malviCatalogService.read();
    const free = catalogue.snapshot.plans.find(plan => plan.tier === 'free' && plan.status === 'PUBLISHED');
    if (!free) throw new Error('The Free trial plan is unavailable.');
    const {error}=await db().from('nanivio_malvi_subscriptions').insert({subscription_id:`malvi_trial_${userId}`,user_id:userId,plan_id:free.id,tier:'free',plan_name:free.name,billing_cycle:'MONTHLY',status:'TRIAL',started_at:now.toISOString(),current_period_start:now.toISOString(),current_period_end:end.toISOString(),next_billing_at:end.toISOString(),price_paid:0,currency:'USD',video_minutes_allowed:free.videoInteractionMinutesLimit,voice_minutes_allowed:free.voiceInteractionMinutesLimit,auto_renew:false});
    if(error && !String(error.message||'').toLowerCase().includes('duplicate')) throw new Error(error.message);
    sub=await getPersistentMalviSubscription(userId);
  }
  if(!sub || (sub.status!=='ACTIVE' && sub.status!=='TRIAL')) return await getMalviCreditAccount(userId);
  const dbx=db();
  const reference=`malvi_entitlement_${sub.id}`;
  const {data:existing,error:ee}=await dbx.from('malvi_credit_ledger').select('id').eq('user_id',userId).eq('reference',reference).maybeSingle();
  if(ee) throw new Error(ee.message);
  if(!existing){
    const amount=Math.max(0,Number(sub.subscriptionVideoMinutesAllowed||0),Number(sub.subscriptionVoiceMinutesAllowed||0));
    if(amount>0) await creditMalviAccount(userId,amount,reference,'MALVI_SUBSCRIPTION','MALVI_MINUTES',{planId:sub.planId,tier:sub.tier,periodStart:sub.currentPeriodStart,periodEnd:sub.currentPeriodEnd});
  }
  return getMalviCreditAccount(userId);
}
export async function getMalviCreditAccount(userId:string){
  const dbx=db();
  const {data,error}=await dbx.from('malvi_credit_accounts').select('*').eq('user_id',userId).maybeSingle();
  if(error)throw new Error(error.message);
  let account=data;
  if(!account){
    const {data:created,error:ce}=await dbx.from('malvi_credit_accounts').insert({user_id:userId,credit_balance:0}).select('*').single();
    if(ce)throw new Error(ce.message);
    account=created;
  }
  const packs=await balancedAccess(userId);
  return {...account,voiceAddonMinutes:Number(packs?.remaining?.voiceSeconds||0)/60,
    avatarAddonMinutes:Number(packs?.remaining?.avatarSeconds||0)/60};
}
export async function creditMalviAccount(userId:string,amount:number,reference:string,source:string,creditType='MALVI_USAGE',metadata:any={}){if(!(amount>0))throw new Error('Credit amount must be positive.');const {data,error}=await db().rpc('nanivio_malvi_credit_command',{command_name:'CREDIT',payload:{userId,amount,reference,source,creditType,metadata}});if(error)throw new Error(error.message);return getMalviCreditAccount(userId);}
export async function consumeMalviCredit(userId:string,amount:number,reference:string,source:string,creditType='MALVI_USAGE',metadata:any={}){if(!(amount>0))throw new Error('Usage amount must be positive.');const {data,error}=await db().rpc('nanivio_malvi_credit_command',{command_name:'DEBIT',payload:{userId,amount,reference,source,creditType,metadata}});if(error)throw new Error(error.message);return getMalviCreditAccount(userId);}
export async function recordMalviUsagePersistent(userId:string,seconds:number,metadata:any={}){await ensureMalviEntitlement(userId);const credits=Math.max(0,Number((seconds/60).toFixed(6)));const ref=`malvi_usage_${crypto.randomUUID()}`;const account=await consumeMalviCredit(userId,credits,ref,'MALVI_USAGE','MALVI_MINUTES',metadata);const {error}=await db().from('nanivio_usage_events').insert({event_id:ref,user_id:userId,service:'MALVI_AI',session_id:metadata.sessionId||null,source_language:metadata.sourceLang||null,target_language:metadata.targetLang||null,provider:metadata.provider||'gemini',input_units:seconds,audio_seconds:seconds,credits_consumed:credits,status:'COMPLETED',metadata});if(error)throw new Error(error.message);return {success:true,creditsConsumed:credits,remainingCredit:Number(account.credit_balance)};}
