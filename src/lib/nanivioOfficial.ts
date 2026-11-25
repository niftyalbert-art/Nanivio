const env = import.meta.env as Record<string, string | undefined>;

const clean = (value?: string) => value?.trim() || '';

/** The official printed QR code opens this address. */
export const NANIVIO_OFFICIAL_URL = 'https://naniviio.com/';
export const NANIVIO_OFFICIAL_QR = '/brand/nanivio-official-qr.png';
/** Shared invites open registration and always offer installation. */
export const NANIVIO_JOIN_URL = `${NANIVIO_OFFICIAL_URL}join`;

export const isNanivioJoinLink = () =>
  typeof window !== 'undefined' && window.location.pathname.replace(/\/$/, '') === '/join';

export const NANIVIO_COMPANY = 'Nanivio Tech. Ghana';

export const NANIVIO_CONTACTS = {
  address: clean(env.VITE_NANIVIO_ADDRESS),
  email: clean(env.VITE_NANIVIO_CONTACT_EMAIL),
  phone: clean(env.VITE_NANIVIO_CONTACT_PHONE),
  whatsapp: clean(env.VITE_NANIVIO_CONTACT_WHATSAPP),
  website: clean(env.VITE_NANIVIO_WEBSITE),
};

export type NanivioOfficialProfile = typeof NANIVIO_CONTACTS & { qrMode: 'official' | 'join' };

/** Admin-edited details win; build-time values fill anything left empty. */
export async function loadOfficialProfile(signal?: AbortSignal): Promise<NanivioOfficialProfile> {
  const fallback: NanivioOfficialProfile = { ...NANIVIO_CONTACTS, qrMode: 'official' };
  try {
    const response = await fetch('/api/official-profile', { signal });
    if (!response.ok) return fallback;
    const saved = await response.json();
    const pick = (key: keyof typeof NANIVIO_CONTACTS) =>
      typeof saved?.[key] === 'string' && saved[key].trim() ? saved[key].trim() : fallback[key];
    return {
      address: pick('address'), email: pick('email'), phone: pick('phone'),
      whatsapp: pick('whatsapp'), website: pick('website'),
      qrMode: saved?.qrMode === 'join' ? 'join' : 'official',
    };
  } catch {
    return fallback;
  }
}
