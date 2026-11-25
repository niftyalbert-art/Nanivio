import type { SupabaseClient } from '@supabase/supabase-js';
import { getServerSupabase } from './supabaseServer';

export type OfficialQrMode = 'official' | 'join';
export type OfficialProfile = {
  address: string; email: string; phone: string; whatsapp: string; website: string; qrMode: OfficialQrMode;
};
export class OfficialProfileError extends Error {
  constructor(public status: number, message: string) { super(message); }
}

export const EMPTY_OFFICIAL_PROFILE: OfficialProfile = {
  address: '', email: '', phone: '', whatsapp: '', website: '', qrMode: 'official',
};
const LIMITS = { address: 300, email: 254, phone: 40, whatsapp: 80, website: 200 } as const;
const TABLE = 'nanivio_official_profile';
const CACHE_MS = 60_000;

export function validateOfficialProfile(input: unknown): OfficialProfile {
  const body = (input && typeof input === 'object' ? input : {}) as Record<string, unknown>;
  const text = (key: keyof typeof LIMITS) => {
    const value = body[key] ?? '';
    if (typeof value !== 'string') throw new OfficialProfileError(400, `${key} must be text.`);
    const clean = value.trim();
    if (clean.length > LIMITS[key]) throw new OfficialProfileError(400, `${key} is too long.`);
    return clean;
  };
  const profile: OfficialProfile = {
    address: text('address'), email: text('email'), phone: text('phone'),
    whatsapp: text('whatsapp'), website: text('website'),
    qrMode: body.qrMode === 'join' ? 'join' : 'official',
  };
  if (body.qrMode !== undefined && body.qrMode !== 'join' && body.qrMode !== 'official')
    throw new OfficialProfileError(400, 'Choose the official QR or the registration link QR.');
  if (profile.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(profile.email))
    throw new OfficialProfileError(400, 'Enter a valid email address.');
  if (profile.phone && !/^\+?[\d\s()-]{6,}$/.test(profile.phone))
    throw new OfficialProfileError(400, 'Enter a valid phone number.');
  if (profile.whatsapp && !/^\+?[\d\s()-]{6,}$/.test(profile.whatsapp) && !/^https:\/\/(wa\.me|api\.whatsapp\.com)\//.test(profile.whatsapp))
    throw new OfficialProfileError(400, 'Enter a WhatsApp number or a wa.me link.');
  if (profile.website) {
    let url: URL | undefined;
    try { url = new URL(profile.website); } catch {}
    if (!url || url.protocol !== 'https:') throw new OfficialProfileError(400, 'The website must start with https://');
  }
  return profile;
}

type Row = { address: string; email: string; phone: string; whatsapp: string; website: string; qr_mode: string };
const fromRow = (row: Row): OfficialProfile => ({
  address: row.address || '', email: row.email || '', phone: row.phone || '',
  whatsapp: row.whatsapp || '', website: row.website || '',
  qrMode: row.qr_mode === 'join' ? 'join' : 'official',
});

let cache: { value: OfficialProfile; at: number } | null = null;
export const resetOfficialProfileCache = () => { cache = null; };

export async function readOfficialProfile(db: SupabaseClient | null = getServerSupabase()): Promise<OfficialProfile> {
  if (cache && Date.now() - cache.at < CACHE_MS) return cache.value;
  if (!db) return EMPTY_OFFICIAL_PROFILE;
  const { data, error } = await db.from(TABLE)
    .select('address,email,phone,whatsapp,website,qr_mode').eq('id', 1).maybeSingle();
  if (error) return cache?.value ?? EMPTY_OFFICIAL_PROFILE;
  const value = data ? fromRow(data as Row) : EMPTY_OFFICIAL_PROFILE;
  cache = { value, at: Date.now() };
  return value;
}

export async function saveOfficialProfile(
  input: unknown, adminId: string, db: SupabaseClient | null = getServerSupabase(),
): Promise<OfficialProfile> {
  const value = validateOfficialProfile(input);
  if (!db) throw new OfficialProfileError(503, 'The database is not configured.');
  const { error } = await db.from(TABLE).upsert({
    id: 1, address: value.address, email: value.email, phone: value.phone,
    whatsapp: value.whatsapp, website: value.website, qr_mode: value.qrMode,
    updated_by: adminId, updated_at: new Date().toISOString(),
  });
  if (error) throw new OfficialProfileError(503, 'Could not save. Apply migration 036_nanivio_official_profile.sql first.');
  cache = { value, at: Date.now() };
  return value;
}
