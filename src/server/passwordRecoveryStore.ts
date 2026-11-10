import { getServerSupabase } from './supabaseServer';

function database() {
  const db = getServerSupabase();
  if (!db) throw Error('Password recovery storage is unavailable.');
  return db;
}
function checked(result: any) {
  if (result.error) throw Error('Password recovery storage is unavailable.');
  return result.data;
}
export function tokenIssuedAtMs(token: string): number {
  try {
    const value = JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString()).iat;
    return Number.isSafeInteger(value) && value > 0 ? value * 1000 : 0;
  } catch { return 0; }
}
export async function passwordEpoch(owner: string): Promise<number> {
  const row = checked(await database().from('nanivio_password_epochs').select('not_before')
    .eq('user_id', owner).abortSignal(AbortSignal.timeout(4000)).maybeSingle());
  return row ? Number(row.not_before) * 1000 : 0;
}
export const passwordRecoveryStore = {
  async ready() {
    checked(await database().from('nanivio_password_recovery').select('id').limit(0).abortSignal(AbortSignal.timeout(4000)));
    checked(await database().from('nanivio_password_epochs').select('user_id').limit(0).abortSignal(AbortSignal.timeout(4000)));
  },
  async reserve(id: string, owner: string | null, ipHash: string, expires: number, subjectHash: string) {
    return checked(await database().rpc('nanivio_reserve_password_recovery', {
      p_id: id, p_owner: owner, p_ip_hash: ipHash, p_subject_hash: subjectHash, p_expires: new Date(expires).toISOString(),
    }).abortSignal(AbortSignal.timeout(4000))) === true;
  },
  async resetCapability(id: string, owner: string, expires: number) {
    checked(await database().from('nanivio_password_recovery').insert({
      id, user_id: owner, purpose: 'reset', expires_at: new Date(expires).toISOString(),
    }).abortSignal(AbortSignal.timeout(4000)));
  },
  async consume(id: string, purpose: 'pkce' | 'reset') {
    return checked(await database().rpc('nanivio_consume_password_recovery', {
      p_id: id, p_purpose: purpose,
    }).abortSignal(AbortSignal.timeout(4000))) as string | null;
  },
  async valid(id: string) {
    const row = checked(await database().from('nanivio_password_recovery').select('id')
      .eq('id', id).eq('purpose', 'reset').is('consumed_at', null)
      .gt('expires_at', new Date().toISOString()).abortSignal(AbortSignal.timeout(4000)).maybeSingle());
    return !!row;
  },
  async owner(authId: string) {
    const row = checked(await database().from('nanivio_users').select('id,status')
      .eq('auth_user_id', authId).abortSignal(AbortSignal.timeout(4000)).maybeSingle());
    return row?.status === 'ACTIVE' ? String(row.id) : null;
  },
};
