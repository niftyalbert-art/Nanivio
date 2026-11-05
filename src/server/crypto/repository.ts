import { getServerSupabase } from '../supabaseServer';
import { TRON_USDT_CONTRACT, usdtAmount, type TronProof } from './tron';
import type { CryptoInvoice } from '../../lib/cryptoBillingClient';

export async function cryptoCommand(command: string, payload: Record<string, unknown> = {}) {
  const client = getServerSupabase();
  if (!client) throw new Error('Persistent billing is not configured.');
  const { data, error } = await client.rpc('nanivio_tron_usdt_command', { command, payload });
  if (error || !data?.success) throw new Error('TRON billing setup or activation is unavailable. Contact Nanivio support with your invoice ID; do not pay again.');
  return data;
}

export function publicCryptoInvoice(row: any): CryptoInvoice {
  return {
    id: row.id, userId: row.user_id, purpose: row.purchase.purpose,
    planTier: row.purchase.planTier, billingCycle: row.purchase.billingCycle,
    planName: row.purchase.product.name, amount: usdtAmount(row.amount_units),
    basePriceUSD: Number(row.purchase.amount),
    matchingDiscount: usdtAmount(BigInt(Math.round(Number(row.purchase.amount) * 1_000_000)) - BigInt(row.amount_units)),
    network: 'TRON', token: 'USDT', tokenContract: TRON_USDT_CONTRACT,
    receivingAddress: row.receiving_address, createdAt: row.created_at, expiresAt: row.expires_at,
    status: row.status === 'PENDING' && Date.parse(row.expires_at) <= Date.now() ? 'EXPIRED' : row.status,
    transactionId: row.proof?.transactionId, activation: row.activation || undefined,
  };
}

export async function activateCryptoInvoice(id: string, proof: TronProof, actorId: string, acceptLate = false) {
  return cryptoCommand('CONFIRM', { id, proof, actorId, acceptLate });
}
