import { getServerSupabase } from './supabaseServer';

let flushTimer: NodeJS.Timeout | null = null;
let dirty = false;
let lastSerialized = '';
let started = false;

function getDb() {
  const db = getServerSupabase();
  if (!db) throw new Error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required for persistent billing.');
  return db;
}

export function isPersistentBillingConfigured(): boolean {
  return Boolean(process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY);
}

function serializeMap(map: Map<any, any>) {
  return Array.from(map.entries()).map(([key, value]) => [key, value]);
}

function deserializeMap<T>(entries: Array<[string, T]> | undefined): Map<string, T> {
  return new Map(entries || []);
}

function serializeFinancialState(db: any) {
  return {
    version: 1,
    ledger: db.ledger,
    transactions: db.transactions,
    invoices: db.invoices,
    pricingVersions: db.pricingVersions,
    subscriptionPlans: db.subscriptionPlans,
    userSubscriptions: serializeMap(db.userSubscriptions),
    activeUsageSessions: serializeMap(db.activeUsageSessions),
    promotionalCredits: db.promotionalCredits,
    disputes: db.disputes,
    refunds: db.refunds,
    providerEarnings: serializeMap(db.providerEarnings),
    businessAccounts: serializeMap(db.businessAccounts),
    auditLogs: db.auditLogs,
    communicationWallets: Array.from(db.communicationWallets.entries()).map(([uid, wallets]: [string, Map<string, any>]) => [uid, serializeMap(wallets)]),
    fintechWallets: Array.from(db.fintechWallets.entries()).map(([uid, wallets]: [string, Map<string, any>]) => [uid, serializeMap(wallets)]),
    paymentGateways: db.paymentGateways,
    communicationMinutePackages: db.communicationMinutePackages,
    malviPlans: db.malviPlans,
    userMalviSubscriptions: serializeMap(db.userMalviSubscriptions),
    langpretationUsageLogs: db.langpretationUsageLogs,
    malviBusinessSessions: serializeMap(db.malviBusinessSessions),
    mobileMoneyCountries: db.mobileMoneyCountries,
    mobileMoneyNetworks: db.mobileMoneyNetworks,
    mobileMoneyReceivingAccounts: db.mobileMoneyReceivingAccounts,
    mobileMoneyDepositRequests: db.mobileMoneyDepositRequests,
    emergencyControls: db.emergencyControls,
  };
}

function applyFinancialState(db: any, state: any) {
  if (!state || state.version !== 1) return;
  for (const key of ['ledger','transactions','invoices','pricingVersions','subscriptionPlans','promotionalCredits','disputes','refunds','auditLogs','paymentGateways','communicationMinutePackages','malviPlans','langpretationUsageLogs','mobileMoneyCountries','mobileMoneyNetworks','mobileMoneyReceivingAccounts','mobileMoneyDepositRequests']) {
    if (Array.isArray(state[key]) && (key !== 'pricingVersions' && key !== 'subscriptionPlans' && key !== 'paymentGateways' && key !== 'communicationMinutePackages' && key !== 'malviPlans' || state[key].length)) db[key] = state[key];
  }
  if (state.emergencyControls) db.emergencyControls = state.emergencyControls;
  if (Array.isArray(state.userSubscriptions)) db.userSubscriptions = deserializeMap(state.userSubscriptions);
  if (Array.isArray(state.activeUsageSessions)) db.activeUsageSessions = deserializeMap(state.activeUsageSessions);
  if (Array.isArray(state.providerEarnings)) db.providerEarnings = deserializeMap(state.providerEarnings);
  if (Array.isArray(state.businessAccounts)) db.businessAccounts = deserializeMap(state.businessAccounts);
  if (Array.isArray(state.communicationWallets)) db.communicationWallets = new Map(state.communicationWallets.map(([uid, wallets]: [string, Array<[string, any]>]) => [uid, deserializeMap(wallets)]));
  if (Array.isArray(state.fintechWallets)) db.fintechWallets = new Map(state.fintechWallets.map(([uid, wallets]: [string, Array<[string, any]>]) => [uid, deserializeMap(wallets)]));
  if (Array.isArray(state.userMalviSubscriptions)) db.userMalviSubscriptions = deserializeMap(state.userMalviSubscriptions);
  if (Array.isArray(state.malviBusinessSessions)) db.malviBusinessSessions = deserializeMap(state.malviBusinessSessions);
}

export async function ensureBillingPersistenceSchema(): Promise<void> {
  // Supabase/Postgres schema is managed explicitly by migrations/001_billing_persistence.sql.
  // Refuse to silently fall back to an in-memory financial database.
  if (!isPersistentBillingConfigured()) throw new Error('Persistent billing database is not configured.');
  const { error } = await getDb().from('nanivio_billing_state').select('state_id').eq('state_id', 'primary').limit(1);
  if (error) throw new Error(`Persistent billing schema is unavailable: ${error.message}`);
}

export async function hydrateBillingDatabase(db: any): Promise<void> {
  await ensureBillingPersistenceSchema();
  const { data, error } = await getDb().from('nanivio_billing_state').select('state,version').eq('state_id', 'primary').maybeSingle();
  if (error) throw new Error(`Unable to load persistent billing state: ${error.message}`);
  if (data?.state) {
    applyFinancialState(db, data.state);
    lastSerialized = JSON.stringify(data.state);
  } else {
    await flushBillingDatabase(db, true);
  }
}

export function markBillingDatabaseDirty(db: any): void {
  dirty = true;
  if (started) return;
  started = true;
  flushTimer = setInterval(() => {
    void flushBillingDatabase(db, true).catch((error) => console.error('[billing] durable flush failed:', error));
  }, Number(process.env.BILLING_FLUSH_INTERVAL_MS || 1000));
  flushTimer.unref?.();
}

export async function flushBillingDatabase(db: any, force = false): Promise<void> {
  if (!force && !dirty) return;
  await ensureBillingPersistenceSchema();
  const state = serializeFinancialState(db);
  const serialized = JSON.stringify(state);
  if (!force && serialized === lastSerialized) { dirty = false; return; }
  const { error } = await getDb().from('nanivio_billing_state').upsert({
    state_id: 'primary',
    state,
    version: Date.now(),
    updated_at: new Date().toISOString(),
  }, { onConflict: 'state_id' });
  if (error) throw new Error(`Unable to persist billing state: ${error.message}`);
  lastSerialized = serialized;
  dirty = false;
}

export async function savePaystackOrder(reference: string, userId: string, payload: any): Promise<void> {
  const { error } = await getDb().from('nanivio_paystack_orders').upsert({
    reference, user_id: userId, status: 'PENDING', payload, updated_at: new Date().toISOString(),
  }, { onConflict: 'reference' });
  if (error) throw new Error(`Unable to persist Paystack order: ${error.message}`);
}

export async function getPaystackOrder(reference: string): Promise<any | null> {
  const { data, error } = await getDb().from('nanivio_paystack_orders').select('payload,status').eq('reference', reference).maybeSingle();
  if (error) throw new Error(`Unable to load Paystack order: ${error.message}`);
  if (!data || data.status === 'FULFILLED') return null;
  return data.payload;
}

export async function markPaystackOrderFulfilled(reference: string): Promise<void> {
  const { error } = await getDb().from('nanivio_paystack_orders').update({ status: 'FULFILLED', updated_at: new Date().toISOString() }).eq('reference', reference);
  if (error) throw new Error(`Unable to mark Paystack order fulfilled: ${error.message}`);
}

export async function claimPaystackWebhook(eventId: string, eventType: string, payload: any): Promise<boolean> {
  const { data, error } = await getDb().from('nanivio_paystack_events').insert({
    provider: 'paystack', event_id: eventId, event_type: eventType, payload, processed_at: new Date().toISOString(),
  }).select('event_id').maybeSingle();
  if (!error) return Boolean(data);
  if (error.code === '23505') return false;
  throw new Error(`Unable to record Paystack webhook event: ${error.message}`);
}

export async function closeBillingPersistence(): Promise<void> {
  if (flushTimer) clearInterval(flushTimer);
  flushTimer = null;
  started = false;
}
