import type { SupportedLanguageCode } from '../types';
import type { ExpertApplication, BusinessApplication } from '../types/auth';

export type RegionalZoneId =
  | 'ARABIC_MENA'
  | 'WEST_AFRICA_ECOWAS'
  | 'EAST_AFRICA_EAC'
  | 'SOUTHERN_AFRICA'
  | 'NORTH_AMERICA'
  | 'EUROPE_UK'
  | 'GLOBAL';

export interface RegionalZoneDefinition {
  id: RegionalZoneId;
  name: string;
  shortName: string;
  flag: string;
  keyLanguages: string[];
  countries: string[];
}

export const REGIONAL_ZONES: Record<RegionalZoneId, RegionalZoneDefinition> = {
  ARABIC_MENA: {
    id: 'ARABIC_MENA',
    name: 'Arabic (MENA & Gulf) Region',
    shortName: 'Arabic MENA',
    flag: '🇪🇬 🇦🇪 🇸🇦',
    keyLanguages: ['ar', 'Arabic', 'en', 'English', 'fr', 'French'],
    countries: [
      'Egypt',
      'United Arab Emirates',
      'UAE',
      'Saudi Arabia',
      'Qatar',
      'Kuwait',
      'Bahrain',
      'Oman',
      'Jordan',
      'Lebanon',
      'Morocco',
      'Algeria',
      'Tunisia',
      'Iraq',
      'Sudan',
      'Libya',
      'Yemen',
      'Syria',
      'Palestine',
    ],
  },
  WEST_AFRICA_ECOWAS: {
    id: 'WEST_AFRICA_ECOWAS',
    name: 'West Africa (ECOWAS) Region',
    shortName: 'West Africa',
    flag: '🇬🇭 🇳🇬 🇸🇳',
    keyLanguages: ['ak', 'Twi', 'en', 'English', 'yo', 'ha', 'ig', 'fr'],
    countries: [
      'Ghana',
      'Nigeria',
      'Senegal',
      'Côte d’Ivoire',
      'Ivory Coast',
      'Togo',
      'Benin',
      'Burkina Faso',
      'Mali',
      'Niger',
      'Guinea',
      'Liberia',
      'Sierra Leone',
      'Gambia',
    ],
  },
  EAST_AFRICA_EAC: {
    id: 'EAST_AFRICA_EAC',
    name: 'East Africa (EAC) Region',
    shortName: 'East Africa',
    flag: '🇰🇪 🇺🇬 🇹🇿',
    keyLanguages: ['sw', 'Swahili', 'en', 'English', 'am', 'lg'],
    countries: ['Kenya', 'Uganda', 'Tanzania', 'Rwanda', 'Burundi', 'South Sudan', 'Ethiopia', 'Somalia'],
  },
  SOUTHERN_AFRICA: {
    id: 'SOUTHERN_AFRICA',
    name: 'Southern Africa (SADC) Region',
    shortName: 'Southern Africa',
    flag: '🇿🇦 🇿🇼 🇿🇲',
    keyLanguages: ['en', 'English', 'zu', 'xh'],
    countries: ['South Africa', 'Zimbabwe', 'Zambia', 'Botswana', 'Namibia', 'Mozambique'],
  },
  NORTH_AMERICA: {
    id: 'NORTH_AMERICA',
    name: 'North America Region',
    shortName: 'North America',
    flag: '🇺🇸 🇨🇦',
    keyLanguages: ['en', 'English', 'es', 'Spanish', 'fr', 'French'],
    countries: ['United States', 'USA', 'US', 'Canada', 'Mexico'],
  },
  EUROPE_UK: {
    id: 'EUROPE_UK',
    name: 'United Kingdom & Europe Region',
    shortName: 'Europe & UK',
    flag: '🇬🇧 🇫🇷 🇩🇪',
    keyLanguages: ['en', 'English', 'fr', 'French', 'de', 'es', 'it'],
    countries: ['United Kingdom', 'UK', 'France', 'Germany', 'Italy', 'Spain', 'Netherlands', 'Belgium', 'Switzerland'],
  },
  GLOBAL: {
    id: 'GLOBAL',
    name: 'Global Cross-Border Specialists',
    shortName: 'Global',
    flag: '🌐',
    keyLanguages: ['en', 'English'],
    countries: [],
  },
};

export interface UserLocationProfile {
  country?: string;
  state?: string;
  city?: string;
  constituency?: string;
  district?: string;
  preferredLanguage?: string;
  detectedZone: RegionalZoneDefinition;
  isArabicUser: boolean;
}

export interface MatchedServiceItem {
  id: string;
  entityType: 'expert' | 'business';
  nvId: string;
  name: string;
  titleOrType: string;
  category: string;
  avatarOrLogo: string;
  country: string;
  countryFlag: string;
  stateOrCity: string;
  languages: string[];
  bioOrDescription: string;
  services: string[];
  pricingFormatted: string;
  ratePerMinUSD?: number;
  ratePerMinGHS?: number;
  isOnline: boolean;
  status: string;
  rating: number;
  reviewsCount: number;
  score: number;
  matchTier: 'same_city' | 'same_state' | 'same_country' | 'regional_zone' | 'language_match' | 'cross_border';
  matchBadgeText: string;
  matchExplanation: string;
  operatingHoursOrSchedule?: string;
  phone?: string;
  email?: string;
  consultationTypes?: ('audio' | 'video' | 'chat')[];
  originalExpert?: ExpertApplication;
  originalBusiness?: BusinessApplication;
}

function normalizeStr(str?: string): string {
  return (str || '').trim().toLowerCase();
}

export function detectCountryFlag(countryName: string): string {
  const norm = normalizeStr(countryName);
  if (norm.includes('egypt')) return '🇪🇬';
  if (norm.includes('emirates') || norm.includes('uae') || norm.includes('dubai')) return '🇦🇪';
  if (norm.includes('saudi') || norm.includes('ksa')) return '🇸🇦';
  if (norm.includes('qatar')) return '🇶🇦';
  if (norm.includes('kuwait')) return '🇰🇼';
  if (norm.includes('morocco')) return '🇲🇦';
  if (norm.includes('ghana')) return '🇬🇭';
  if (norm.includes('nigeria')) return '🇳🇬';
  if (norm.includes('kenya')) return '🇰🇪';
  if (norm.includes('south africa')) return '🇿🇦';
  if (norm.includes('united kingdom') || norm.includes('uk') || norm.includes('britain')) return '🇬🇧';
  if (norm.includes('united states') || norm.includes('usa') || norm.includes('us')) return '🇺🇸';
  if (norm.includes('france')) return '🇫🇷';
  if (norm.includes('germany')) return '🇩🇪';
  if (norm.includes('senegal')) return '🇸🇳';
  if (norm.includes('ivory') || norm.includes('ivoire')) return '🇨🇮';
  return '🌐';
}

/**
 * Detect the regional zone for a user based on their registered country, state, or language
 */
export function detectUserLocationProfile(input?: {
  country?: string;
  state?: string;
  city?: string;
  constituency?: string;
  district?: string;
  preferredLanguage?: string;
}): UserLocationProfile {
  const country = input?.country || '';
  const lang = (input?.preferredLanguage || 'en').toLowerCase();
  const normCountry = normalizeStr(country);

  const isArabicLang = lang.startsWith('ar');
  const isArabicCountry = REGIONAL_ZONES.ARABIC_MENA.countries.some((c) =>
    normCountry.includes(normalizeStr(c))
  );

  let detectedZone = REGIONAL_ZONES.WEST_AFRICA_ECOWAS; // default African platform root

  if (isArabicLang || isArabicCountry) {
    detectedZone = REGIONAL_ZONES.ARABIC_MENA;
  } else if (
    REGIONAL_ZONES.WEST_AFRICA_ECOWAS.countries.some((c) => normCountry.includes(normalizeStr(c))) ||
    ['ak', 'tw-ak', 'yo', 'ha', 'ig', 'ee', 'gaa'].includes(lang)
  ) {
    detectedZone = REGIONAL_ZONES.WEST_AFRICA_ECOWAS;
  } else if (
    REGIONAL_ZONES.EAST_AFRICA_EAC.countries.some((c) => normCountry.includes(normalizeStr(c))) ||
    ['sw', 'am', 'lg'].includes(lang)
  ) {
    detectedZone = REGIONAL_ZONES.EAST_AFRICA_EAC;
  } else if (REGIONAL_ZONES.NORTH_AMERICA.countries.some((c) => normCountry.includes(normalizeStr(c)))) {
    detectedZone = REGIONAL_ZONES.NORTH_AMERICA;
  } else if (REGIONAL_ZONES.EUROPE_UK.countries.some((c) => normCountry.includes(normalizeStr(c)))) {
    detectedZone = REGIONAL_ZONES.EUROPE_UK;
  }

  return {
    country: country || (detectedZone.id === 'ARABIC_MENA' ? 'Egypt' : 'Ghana'),
    state: input?.state || '',
    city: input?.city || '',
    constituency: input?.constituency,
    district: input?.district,
    preferredLanguage: input?.preferredLanguage || (detectedZone.id === 'ARABIC_MENA' ? 'ar' : 'en'),
    detectedZone,
    isArabicUser: Boolean(isArabicLang || isArabicCountry),
  };
}

/**
 * Nanivio Geo-Location & Cultural Proximity Matching Algorithm
 * Evaluates an expert or business against the active user's region and language profile.
 */
export function matchExpertToUser(
  expert: ExpertApplication,
  userProfile: UserLocationProfile
): MatchedServiceItem {
  let score = 20; // baseline
  let matchTier: MatchedServiceItem['matchTier'] = 'cross_border';
  let matchBadgeText = '🌐 Cross-Border Langpretation';
  let matchExplanation = 'Available globally with live Langpretation voice translation';

  const userCountry = normalizeStr(userProfile.country);
  const userState = normalizeStr(userProfile.state);
  const userCity = normalizeStr(userProfile.city);
  const userLang = normalizeStr(userProfile.preferredLanguage);

  const expCountry = normalizeStr(expert.country);
  const expLocation = normalizeStr(expert.location);
  const expLangs = (expert.languages || []).map(normalizeStr);

  const inSameCountry = Boolean(userCountry && (expCountry.includes(userCountry) || expLocation.includes(userCountry)));
  const inSameCityOrState = Boolean(
    (userCity && expLocation.includes(userCity)) ||
    (userState && expLocation.includes(userState))
  );

  const targetInZone = userProfile.detectedZone.countries.some((c) =>
    expCountry.includes(normalizeStr(c)) || expLocation.includes(normalizeStr(c))
  );

  const speaksUserLang =
    expLangs.some((l) => l.includes(userLang) || (userLang === 'ar' && (l.includes('ar') || l.includes('arabic')))) ||
    (userProfile.isArabicUser && expLangs.some((l) => l.includes('arabic') || l.includes('ar')));

  if (inSameCityOrState) {
    score += 80;
    matchTier = 'same_city';
    matchBadgeText = `🎯 Local in ${expert.location || userProfile.city || userProfile.state}`;
    matchExplanation = `Located in your local area with zero delay direct consult`;
  } else if (inSameCountry) {
    score += 60;
    matchTier = 'same_country';
    matchBadgeText = `📍 Same Country (${expert.country})`;
    matchExplanation = `Verified national professional in your country`;
  } else if (targetInZone) {
    score += 45;
    matchTier = 'regional_zone';
    matchBadgeText = `🌐 ${userProfile.detectedZone.shortName} Regional Match`;
    matchExplanation = `Located within your regional economic & cultural zone`;
  } else if (speaksUserLang) {
    score += 35;
    matchTier = 'language_match';
    matchBadgeText = `💬 Native ${userProfile.isArabicUser ? 'Arabic' : 'Language'} Match`;
    matchExplanation = `Fluent in your preferred language`;
  }

  if (speaksUserLang && !matchTier.includes('city')) {
    score += 20;
  }

  if (expert.isOnline) {
    score += 15;
  }

  if (expert.featured) {
    score += 10;
  }

  const countryFlag = detectCountryFlag(expert.country);
  const pricingFormatted =
    expert.ratePerMinUSD && expert.ratePerMinUSD > 0
      ? `$${(expert.ratePerMinUSD * 60).toFixed(0)}/hr ($${expert.ratePerMinUSD.toFixed(2)}/min)`
      : expert.ratePerMinGHS && expert.ratePerMinGHS > 0
      ? `GH₵ ${(expert.ratePerMinGHS * 60).toFixed(0)}/hr`
      : 'Consultation Available';

  return {
    id: expert.id,
    entityType: 'expert',
    nvId: expert.nvId,
    name: expert.fullName,
    titleOrType: expert.title,
    category: expert.category,
    avatarOrLogo: expert.avatar,
    country: expert.country,
    countryFlag,
    stateOrCity: expert.location || expert.country,
    languages: expert.languages || ['English'],
    bioOrDescription: expert.bio,
    services: expert.services && expert.services.length > 0 ? expert.services : ['Direct Consultation', 'Voice Triage'],
    pricingFormatted,
    ratePerMinUSD: expert.ratePerMinUSD,
    ratePerMinGHS: expert.ratePerMinGHS,
    isOnline: expert.isOnline !== false,
    status: expert.status,
    rating: (expert as any).rating || 4.9,
    reviewsCount: (expert as any).reviewsCount || 48,
    score,
    matchTier,
    matchBadgeText,
    matchExplanation,
    operatingHoursOrSchedule: expert.workingHours,
    phone: expert.phone,
    email: expert.email,
    consultationTypes: expert.consultationTypes || ['video', 'audio', 'chat'],
    originalExpert: expert,
  };
}

export function matchBusinessToUser(
  business: BusinessApplication,
  userProfile: UserLocationProfile
): MatchedServiceItem {
  let score = 20;
  let matchTier: MatchedServiceItem['matchTier'] = 'cross_border';
  let matchBadgeText = '🌐 Cross-Border Enterprise';
  let matchExplanation = 'Registered enterprise with international service delivery';

  const userCountry = normalizeStr(userProfile.country);
  const userState = normalizeStr(userProfile.state);
  const userCity = normalizeStr(userProfile.city);

  const bizCountry = normalizeStr(business.country);
  const bizLocation = normalizeStr(business.location || business.city || '');

  const inSameCountry = Boolean(userCountry && (bizCountry.includes(userCountry) || bizLocation.includes(userCountry)));
  const inSameCityOrState = Boolean(
    (userCity && (bizLocation.includes(userCity) || normalizeStr(business.city).includes(userCity))) ||
    (userState && (bizLocation.includes(userState) || normalizeStr(business.state).includes(userState)))
  );

  const targetInZone = userProfile.detectedZone.countries.some((c) =>
    bizCountry.includes(normalizeStr(c)) || bizLocation.includes(normalizeStr(c))
  );

  if (inSameCityOrState) {
    score += 85;
    matchTier = 'same_city';
    matchBadgeText = `🎯 Local Business in ${business.city || business.location || userProfile.city}`;
    matchExplanation = `Operating directly in your city/state with immediate local fulfillment`;
  } else if (inSameCountry) {
    score += 65;
    matchTier = 'same_country';
    matchBadgeText = `📍 National Business (${business.country})`;
    matchExplanation = `Registered enterprise in your country`;
  } else if (targetInZone) {
    score += 50;
    matchTier = 'regional_zone';
    matchBadgeText = `🌐 ${userProfile.detectedZone.shortName} Regional Business`;
    matchExplanation = `Active regional business operating in ${userProfile.detectedZone.shortName}`;
  }

  const countryFlag = detectCountryFlag(business.country);

  return {
    id: business.id,
    entityType: 'business',
    nvId: business.businessNvId,
    name: business.businessName,
    titleOrType: business.businessType || business.category,
    category: business.category,
    avatarOrLogo: business.businessLogo,
    country: business.country,
    countryFlag,
    stateOrCity: business.location || business.city || business.country,
    languages: userProfile.isArabicUser ? ['Arabic', 'English'] : ['English'],
    bioOrDescription: business.description,
    services: business.services && business.services.length > 0 ? business.services : ['General Business Services'],
    pricingFormatted: 'Verified Commercial Provider',
    isOnline: true,
    status: business.status,
    rating: 4.92,
    reviewsCount: 65,
    score,
    matchTier,
    matchBadgeText,
    matchExplanation,
    operatingHoursOrSchedule: business.operatingHours,
    phone: business.contactPhone,
    email: business.contactEmail,
    consultationTypes: ['video', 'audio', 'chat'],
    originalBusiness: business,
  };
}

/**
 * Master Query Function that ranks experts and businesses for any user location
 */
export function rankLocationMatchedServices(
  userProfile: UserLocationProfile,
  experts: ExpertApplication[],
  businesses: BusinessApplication[],
  options?: {
    filterType?: 'all' | 'experts' | 'businesses';
    category?: string;
    searchQuery?: string;
    onlyOnline?: boolean;
    forceZoneOnly?: boolean;
  }
): MatchedServiceItem[] {
  const results: MatchedServiceItem[] = [];

  const verifiedExperts = experts.filter((e) => e.status === 'VERIFIED');
  const verifiedBusinesses = businesses.filter((b) => b.status === 'VERIFIED');

  if (!options?.filterType || options.filterType === 'all' || options.filterType === 'experts') {
    for (const exp of verifiedExperts) {
      results.push(matchExpertToUser(exp, userProfile));
    }
  }

  if (!options?.filterType || options.filterType === 'all' || options.filterType === 'businesses') {
    for (const biz of verifiedBusinesses) {
      results.push(matchBusinessToUser(biz, userProfile));
    }
  }

  let filtered = results;

  // Category filter
  if (options?.category && options.category !== 'all') {
    const normCat = normalizeStr(options.category);
    filtered = filtered.filter((item) => normalizeStr(item.category).includes(normCat));
  }

  // Online only
  if (options?.onlyOnline) {
    filtered = filtered.filter((item) => item.isOnline);
  }

  // Search Query filter
  if (options?.searchQuery) {
    const q = normalizeStr(options.searchQuery);
    filtered = filtered.filter(
      (item) =>
        normalizeStr(item.name).includes(q) ||
        normalizeStr(item.titleOrType).includes(q) ||
        normalizeStr(item.country).includes(q) ||
        normalizeStr(item.stateOrCity).includes(q) ||
        item.services.some((s) => normalizeStr(s).includes(q))
    );
  }

  // Sort: Highest score first, then online status, then rating
  return filtered.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    if (b.isOnline !== a.isOnline) return b.isOnline ? 1 : -1;
    return b.rating - a.rating;
  });
}
