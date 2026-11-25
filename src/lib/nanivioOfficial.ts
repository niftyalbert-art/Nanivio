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
