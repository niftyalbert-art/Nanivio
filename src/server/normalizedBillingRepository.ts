import crypto from 'crypto';
import { getServerSupabase } from './supabaseServer';

function db() {
  const client = getServerSupabase();
  if (!client) throw new Error('Persistent billing database is not configured.');
  return client;
}

export function normalizedBillingEnabled(): boolean {
  return Boolean(process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY);
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

export async function recordLangpretationUsagePersistent(payload: Record<string, unknown>) {
  return billingCommand('LANGPRETATION_USAGE', payload);
}

export async function getPersistentWallet(userId: string, accountType: string, currency: string) {
  const { data, error } = await db().from('nanivio_wallets').select('*').eq('user_id', userId).eq('account_type', accountType).eq('currency', currency).maybeSingle();
  if (error) throw new Error(`Unable to load wallet: ${error.message}`);
  return data;
}

export async function getPersistentSubscription(userId: string) {
  const { data, error } = await db().from('nanivio_subscriptions').select('*').eq('user_id', userId).order('updated_at', { ascending: false }).limit(1).maybeSingle();
  if (error) throw new Error(`Unable to load subscription: ${error.message}`);
  return data;
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

export async function purchaseCommunicationMinutesPersistent(payload: Record<string, unknown>) {
  return billingCommand('COMMUNICATION_MINUTES_PURCHASE', payload);
}

export async function activateMalviSubscriptionPersistent(payload: Record<string, unknown>) {
  return billingCommand('MALVI_SUBSCRIPTION', payload);
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
export async function getPersistentUsageMeter(userId:string){
  const {data,error}=await db().from('nanivio_usage_events').select('audio_seconds,credits_consumed,source_language,target_language,provider,created_at').eq('user_id',userId).order('created_at',{ascending:false}).limit(200);
  if(error) return {minutesUsed:0,recent:[]}; const rows=data||[]; return {minutesUsed:Number((rows.reduce((n:any,r:any)=>n+Number(r.audio_seconds||0),0)/60).toFixed(2)),recent:rows};
}
export async function getPersistentMalviSubscription(userId:string){
  const {data,error}=await db().from('nanivio_malvi_subscriptions').select('*').eq('user_id',userId).order('updated_at',{ascending:false}).limit(1).maybeSingle();
  if(error)throw new Error(`Unable to load Malvi subscription: ${error.message}`);
  if(!data) return null;
  return {
    id:data.subscription_id, userId:data.user_id, planId:data.plan_id, tier:data.tier, planName:data.plan_name,
    billingCycle:data.billing_cycle, status:data.status, startedAt:data.started_at?new Date(data.started_at).getTime():Date.now(),
    currentPeriodStart:data.current_period_start?new Date(data.current_period_start).getTime():Date.now(),
    currentPeriodEnd:data.current_period_end?new Date(data.current_period_end).getTime():Date.now(),
    nextBillingAt:data.next_billing_at?new Date(data.next_billing_at).getTime():Date.now(),
    pricePaid:Number(data.price_paid||0), currency:data.currency,
    videoMinutesAllowed:Number(data.video_minutes_allowed||0), videoMinutesUsed:Number(data.video_minutes_used||0),
    videoMinutesRemaining:Math.max(0,Number(data.video_minutes_allowed||0)-Number(data.video_minutes_used||0)),
    voiceMinutesAllowed:Number(data.voice_minutes_allowed||0), voiceMinutesUsed:Number(data.voice_minutes_used||0),
    voiceMinutesRemaining:Math.max(0,Number(data.voice_minutes_allowed||0)-Number(data.voice_minutes_used||0)), autoRenew:Boolean(data.auto_renew ?? true),
  };
}

export async function ensureMalviEntitlement(userId:string){
  let sub=await getPersistentMalviSubscription(userId);
  if(!sub){
    const now=new Date(); const end=new Date(now.getTime()+30*86400000);
    const {error}=await db().from('nanivio_malvi_subscriptions').insert({subscription_id:`malvi_trial_${userId}`,user_id:userId,plan_id:'malvi_free',tier:'free',plan_name:'Malvi Free Experience',billing_cycle:'MONTHLY',status:'TRIAL',started_at:now.toISOString(),current_period_start:now.toISOString(),current_period_end:end.toISOString(),next_billing_at:end.toISOString(),price_paid:0,currency:'GHS',video_minutes_allowed:3,voice_minutes_allowed:3});
    if(error && !String(error.message||'').toLowerCase().includes('duplicate')) throw new Error(error.message);
    sub=await getPersistentMalviSubscription(userId);
  }
  if(!sub || (sub.status!=='ACTIVE' && sub.status!=='TRIAL')) return await getMalviCreditAccount(userId);
  const dbx=db();
  const reference=`malvi_entitlement_${sub.id}`;
  const {data:existing,error:ee}=await dbx.from('malvi_credit_ledger').select('id').eq('user_id',userId).eq('reference',reference).maybeSingle();
  if(ee) throw new Error(ee.message);
  if(!existing){
    const amount=Math.max(0,Number(sub.videoMinutesAllowed||0));
    if(amount>0) await creditMalviAccount(userId,amount,reference,'MALVI_SUBSCRIPTION','MALVI_MINUTES',{planId:sub.planId,tier:sub.tier,periodStart:sub.currentPeriodStart,periodEnd:sub.currentPeriodEnd});
  }
  return getMalviCreditAccount(userId);
}
export async function getMalviCreditAccount(userId:string){const dbx=db();const {data,error}=await dbx.from('malvi_credit_accounts').select('*').eq('user_id',userId).maybeSingle();if(error)throw new Error(error.message);if(data)return data;const {data:created,error:ce}=await dbx.from('malvi_credit_accounts').insert({user_id:userId,credit_balance:0}).select('*').single();if(ce)throw new Error(ce.message);return created;}
export async function creditMalviAccount(userId:string,amount:number,reference:string,source:string,creditType='MALVI_USAGE',metadata:any={}){if(!(amount>0))throw new Error('Credit amount must be positive.');const {data,error}=await db().rpc('nanivio_malvi_credit_command',{command_name:'CREDIT',payload:{userId,amount,reference,source,creditType,metadata}});if(error)throw new Error(error.message);return getMalviCreditAccount(userId);}
export async function consumeMalviCredit(userId:string,amount:number,reference:string,source:string,creditType='MALVI_USAGE',metadata:any={}){if(!(amount>0))throw new Error('Usage amount must be positive.');const {data,error}=await db().rpc('nanivio_malvi_credit_command',{command_name:'DEBIT',payload:{userId,amount,reference,source,creditType,metadata}});if(error)throw new Error(error.message);return getMalviCreditAccount(userId);}
export async function recordMalviUsagePersistent(userId:string,seconds:number,metadata:any={}){await ensureMalviEntitlement(userId);const credits=Math.max(0,Number((seconds/60).toFixed(6)));const ref=`malvi_usage_${crypto.randomUUID()}`;const account=await consumeMalviCredit(userId,credits,ref,'MALVI_USAGE','MALVI_MINUTES',metadata);const {error}=await db().from('nanivio_usage_events').insert({event_id:ref,user_id:userId,service:'MALVI_AI',session_id:metadata.sessionId||null,source_language:metadata.sourceLang||null,target_language:metadata.targetLang||null,provider:metadata.provider||'gemini',input_units:seconds,audio_seconds:seconds,credits_consumed:credits,status:'COMPLETED',metadata});if(error)throw new Error(error.message);return {success:true,creditsConsumed:credits,remainingCredit:Number(account.credit_balance)};}
