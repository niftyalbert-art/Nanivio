const env = import.meta.env as Record<string, string | undefined>;

const clean = (value?: string) => value?.trim() || '';

/** The official printed QR code opens this address. */
export const NANIVIO_OFFICIAL_URL = 'https://naniviio.com/';
export const NANIVIO_OFFICIAL_QR = '/brand/nanivio-official-qr.png';

export const isNanivioJoinLink = () =>
  typeof window !== 'undefined' && window.location.pathname.replace(/\/$/, '') === '/join';

export const NANIVIO_CONTACTS = {
  email: clean(env.VITE_NANIVIO_CONTACT_EMAIL),
  phone: clean(env.VITE_NANIVIO_CONTACT_PHONE),
  whatsapp: clean(env.VITE_NANIVIO_CONTACT_WHATSAPP),
  website: clean(env.VITE_NANIVIO_WEBSITE),
};
