import { getServerSupabase } from '../supabaseServer';

export async function buyCommunicationWithCredit(userId: string, requestId: string, quote: any) {
  const db = getServerSupabase();
  if (!db) throw new Error('Persistent billing is required.');
  const product = quote.product;
  const referenceId = `NV-CREDIT-${requestId}`;
  const { data, error } = await db.rpc('nanivio_buy_communication_with_credit', { payload: {
    userId, requestId, referenceId, transactionId: `tx_credit_${userId}_${requestId}`,
    subscriptionId: `credit_${userId}_${requestId}`, tier: quote.planTier,
    planId: product.id, planName: product.name, billingCycle: quote.billingCycle,
    price: quote.amount, currency: quote.currency, paymentMethod: 'Nanivio credit (P2P eligible)',
    langpretationQuota: product.langpretationQuota, voiceQuota: product.voiceQuota,
    malviQuota: product.malviQuota, periodDays: product.periodDays,
    metadata: { source: 'nanivio_credit', product },
  } });
  if (error || !data?.success) {
    throw new Error('Nanivio credit payment could not complete. Check your balance and billing setup; no unpaid subscription is granted.');
  }
  return data;
}
