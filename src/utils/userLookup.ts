import { Participant } from '../types';

export function normalizeNanivioNumber(raw: string): string {
  if (!raw) return '';
  let cleaned = raw.trim();

  // Strip SIP URI wrapper (e.g. sip:0486484804@rtc.nanivio.net -> 0486484804)
  if (cleaned.toLowerCase().startsWith('sip:')) {
    cleaned = cleaned.slice(4).split('@')[0];
  }

  // Remove NV- or NV prefix if present
  if (cleaned.toUpperCase().startsWith('NV-')) {
    cleaned = cleaned.substring(3);
  } else if (cleaned.toUpperCase().startsWith('NV')) {
    cleaned = cleaned.substring(2);
  }

  // Remove all non-alphanumeric characters (spaces, dashes, parens)
  cleaned = cleaned.replace(/[^0-9a-zA-Z]/g, '');
  return cleaned;
}

export async function lookupNanivioUser(rawNumber: string): Promise<Participant | null> {
  const cleanNumber = normalizeNanivioNumber(rawNumber);
  if (!cleanNumber) return null;

  // 1. First: Query the authoritative backend server database directly
  try {
    const res = await fetch(`/api/users/lookup?nvId=${encodeURIComponent(cleanNumber)}`);
    if (res.ok) {
      const data = await res.json();
      if (data.success && data.user) {
        const u = data.user;
        const participant: Participant = {
          id: u.id,
          nvId: u.nvId,
          name: u.displayName || `${u.firstName || ''} ${u.lastName || ''}`.trim() || `User ${u.nvId}`,
          avatar: u.avatar || '',
          initials: ((u.firstName?.[0] || 'N') + (u.lastName?.[0] || 'V')).toUpperCase(),
          myLanguage: u.preferredLanguage || 'en',
          country: u.country || 'Ghana',
          role: u.role === 'ADMIN' ? 'admin' : u.role === 'EXPERT' ? 'expert' : u.role === 'BUSINESS' ? 'business' : 'user',
        };
        return participant;
      }
    }
  } catch (err) {
    console.warn('Realtime server user lookup network notice:', err);
  }

  // 2. Check actively authenticated local session
  try {
    const rawStored = localStorage.getItem('nanivio_auth_user');
    if (rawStored) {
      const stored = JSON.parse(rawStored);
      if (
        normalizeNanivioNumber(stored.nvId || '') === cleanNumber ||
        stored.id === cleanNumber ||
        (stored.phoneNumber && stored.phoneNumber.replace(/[^0-9]/g, '') === cleanNumber)
      ) {
        return {
          id: stored.id,
          nvId: stored.nvId,
          name: stored.displayName || `${stored.firstName} ${stored.lastName}`.trim(),
          avatar: stored.avatar || '',
          initials: ((stored.firstName?.[0] || 'N') + (stored.lastName?.[0] || 'V')).toUpperCase(),
          myLanguage: stored.preferredLanguage || 'en',
          country: stored.country || 'Ghana',
          role: stored.role === 'ADMIN' ? 'admin' : stored.role === 'EXPERT' ? 'expert' : stored.role === 'BUSINESS' ? 'business' : 'user',
          isExpert: stored.role === 'EXPERT',
        };
      }
    }
  } catch (e) {
    // Ignore JSON parse errors
  }

  // 3. Check user's saved local contacts
  try {
    const rawContacts = localStorage.getItem('nanivio_saved_contacts');
    if (rawContacts) {
      const savedList = JSON.parse(rawContacts);
      if (Array.isArray(savedList)) {
        const match = savedList.find(
          (c) =>
            normalizeNanivioNumber(c.nvId || '') === cleanNumber ||
            c.id === cleanNumber ||
            (c.phoneNumber && c.phoneNumber.replace(/[^0-9]/g, '') === cleanNumber)
        );
        if (match) {
          return {
            id: match.id,
            nvId: match.nvId,
            name: match.name,
            avatar: match.avatar || '',
            initials: match.initials || 'NV',
            myLanguage: match.preferredLanguage || 'en',
            role: 'user',
          };
        }
      }
    }
  } catch (e) {
    // Ignore JSON parse errors
  }

  // 4. International Telecom Carrier & Country Dialing Code Routing (PSTN / Cellular Gateway)
  const isCountryCode = rawNumber.trim().startsWith('+') || rawNumber.trim().startsWith('00');
  if (isCountryCode && cleanNumber.length >= 7) {
    let countryName = 'Global PSTN';
    let countryFlag = '🌐';

    if (rawNumber.startsWith('+233') || cleanNumber.startsWith('233')) {
      countryName = 'Ghana';
      countryFlag = '🇬🇭';
    } else if (rawNumber.startsWith('+234') || cleanNumber.startsWith('234')) {
      countryName = 'Nigeria';
      countryFlag = '🇳🇬';
    } else if (rawNumber.startsWith('+254') || cleanNumber.startsWith('254')) {
      countryName = 'Kenya';
      countryFlag = '🇰🇪';
    } else if (rawNumber.startsWith('+1') || cleanNumber.startsWith('1')) {
      countryName = 'USA / Canada';
      countryFlag = '🇺🇸';
    } else if (rawNumber.startsWith('+44') || cleanNumber.startsWith('44')) {
      countryName = 'United Kingdom';
      countryFlag = '🇬🇧';
    } else if (rawNumber.startsWith('+27') || cleanNumber.startsWith('27')) {
      countryName = 'South Africa';
      countryFlag = '🇿🇦';
    } else if (rawNumber.startsWith('+225') || cleanNumber.startsWith('225')) {
      countryName = "Côte d'Ivoire";
      countryFlag = '🇨🇮';
    } else if (rawNumber.startsWith('+33') || cleanNumber.startsWith('33')) {
      countryName = 'France';
      countryFlag = '🇫🇷';
    } else if (rawNumber.startsWith('+49') || cleanNumber.startsWith('49')) {
      countryName = 'Germany';
      countryFlag = '🇩🇪';
    }

    const formattedDisplay = rawNumber.startsWith('+') ? rawNumber : `+${cleanNumber}`;
    return {
      id: `usr_pstn_${cleanNumber}`,
      nvId: formattedDisplay,
      name: `${countryFlag} ${countryName} (${formattedDisplay})`,
      avatar: '',
      initials: countryName.slice(0, 2).toUpperCase(),
      myLanguage: 'en',
      country: countryName,
      role: 'user',
    };
  }

  // 5. Valid Nanivio Network Number (0486XXXXXX or 10-digit mobile line)
  if (cleanNumber.length >= 7) {
    const isNvPrefix = cleanNumber.startsWith('0486');
    const formatted = isNvPrefix
      ? `${cleanNumber.slice(0, 4)} ${cleanNumber.slice(4, 7)} ${cleanNumber.slice(7)}`
      : cleanNumber;
    return {
      id: `usr_nv_${cleanNumber}`,
      nvId: cleanNumber,
      name: isNvPrefix ? `Nanivio Line (${formatted})` : `Line (${formatted})`,
      avatar: '',
      initials: 'NV',
      myLanguage: 'en',
      country: 'Ghana',
      role: 'user',
    };
  }

  // If number not registered in real database and not valid line, return null
  return null;
}
