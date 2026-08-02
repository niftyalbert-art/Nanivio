/**
 * Regional grouping for countries — used across Countries, Send, and Withdraw pages.
 * Order: Africa (West → North → East → South → Central) → Middle East → Asia → Europe → Americas → Others
 */

export interface RegionInfo {
  group: string;
  order: number;
}

/** Country-CODE → region (ISO 3166-1 alpha-2) */
export const CODE_REGION: Record<string, RegionInfo> = {
  // ── Africa · West ─────────────────────────────────────────────────
  GH: { group: 'Africa · West',    order: 1 },
  NG: { group: 'Africa · West',    order: 1 },
  SN: { group: 'Africa · West',    order: 1 },
  CI: { group: 'Africa · West',    order: 1 },
  BJ: { group: 'Africa · West',    order: 1 },
  LR: { group: 'Africa · West',    order: 1 },
  GN: { group: 'Africa · West',    order: 1 },
  ML: { group: 'Africa · West',    order: 1 },
  BF: { group: 'Africa · West',    order: 1 },
  TG: { group: 'Africa · West',    order: 1 },
  GM: { group: 'Africa · West',    order: 1 },
  GW: { group: 'Africa · West',    order: 1 },
  SL: { group: 'Africa · West',    order: 1 },
  CV: { group: 'Africa · West',    order: 1 },
  MR: { group: 'Africa · West',    order: 1 },
  NE: { group: 'Africa · West',    order: 1 },
  // ── Africa · North ────────────────────────────────────────────────
  EG: { group: 'Africa · North',   order: 2 },
  MA: { group: 'Africa · North',   order: 2 },
  DZ: { group: 'Africa · North',   order: 2 },
  TN: { group: 'Africa · North',   order: 2 },
  LY: { group: 'Africa · North',   order: 2 },
  SD: { group: 'Africa · North',   order: 2 },
  // ── Africa · East ─────────────────────────────────────────────────
  KE: { group: 'Africa · East',    order: 3 },
  UG: { group: 'Africa · East',    order: 3 },
  TZ: { group: 'Africa · East',    order: 3 },
  RW: { group: 'Africa · East',    order: 3 },
  ET: { group: 'Africa · East',    order: 3 },
  SO: { group: 'Africa · East',    order: 3 },
  DJ: { group: 'Africa · East',    order: 3 },
  ER: { group: 'Africa · East',    order: 3 },
  BI: { group: 'Africa · East',    order: 3 },
  // ── Africa · South & Central ─────────────────────────────────────
  ZA: { group: 'Africa · South',   order: 4 },
  ZW: { group: 'Africa · South',   order: 4 },
  ZM: { group: 'Africa · South',   order: 4 },
  MZ: { group: 'Africa · South',   order: 4 },
  BW: { group: 'Africa · South',   order: 4 },
  NA: { group: 'Africa · South',   order: 4 },
  MW: { group: 'Africa · South',   order: 4 },
  CM: { group: 'Africa · South',   order: 4 },
  CG: { group: 'Africa · South',   order: 4 },
  CD: { group: 'Africa · South',   order: 4 },
  AO: { group: 'Africa · South',   order: 4 },
  GA: { group: 'Africa · South',   order: 4 },
  GQ: { group: 'Africa · South',   order: 4 },
  // ── Middle East ───────────────────────────────────────────────────
  AE: { group: 'Middle East',      order: 10 },
  SA: { group: 'Middle East',      order: 10 },
  KW: { group: 'Middle East',      order: 10 },
  QA: { group: 'Middle East',      order: 10 },
  BH: { group: 'Middle East',      order: 10 },
  OM: { group: 'Middle East',      order: 10 },
  JO: { group: 'Middle East',      order: 10 },
  LB: { group: 'Middle East',      order: 10 },
  // ── Asia ──────────────────────────────────────────────────────────
  PH: { group: 'Asia',             order: 20 },
  IN: { group: 'Asia',             order: 20 },
  PK: { group: 'Asia',             order: 20 },
  BD: { group: 'Asia',             order: 20 },
  LK: { group: 'Asia',             order: 20 },
  MY: { group: 'Asia',             order: 20 },
  SG: { group: 'Asia',             order: 20 },
  TH: { group: 'Asia',             order: 20 },
  VN: { group: 'Asia',             order: 20 },
  ID: { group: 'Asia',             order: 20 },
  CN: { group: 'Asia',             order: 20 },
  JP: { group: 'Asia',             order: 20 },
  KR: { group: 'Asia',             order: 20 },
  HK: { group: 'Asia',             order: 20 },
  TW: { group: 'Asia',             order: 20 },
  NP: { group: 'Asia',             order: 20 },
  MM: { group: 'Asia',             order: 20 },
  KH: { group: 'Asia',             order: 20 },
  // ── Europe ────────────────────────────────────────────────────────
  GB: { group: 'Europe',           order: 30 },
  DE: { group: 'Europe',           order: 30 },
  FR: { group: 'Europe',           order: 30 },
  IT: { group: 'Europe',           order: 30 },
  ES: { group: 'Europe',           order: 30 },
  NL: { group: 'Europe',           order: 30 },
  SE: { group: 'Europe',           order: 30 },
  NO: { group: 'Europe',           order: 30 },
  DK: { group: 'Europe',           order: 30 },
  PL: { group: 'Europe',           order: 30 },
  PT: { group: 'Europe',           order: 30 },
  RO: { group: 'Europe',           order: 30 },
  // ── Americas ──────────────────────────────────────────────────────
  US: { group: 'Americas',         order: 40 },
  CA: { group: 'Americas',         order: 40 },
  MX: { group: 'Americas',         order: 40 },
  BR: { group: 'Americas',         order: 40 },
  CO: { group: 'Americas',         order: 40 },
  PE: { group: 'Americas',         order: 40 },
  CL: { group: 'Americas',         order: 40 },
  // ── Others / Pacific ─────────────────────────────────────────────
  AU: { group: 'Others',           order: 50 },
  NZ: { group: 'Others',           order: 50 },
};

/** Fallback region for unknown codes */
export function getRegion(code: string): RegionInfo {
  return CODE_REGION[code] ?? { group: 'Others', order: 99 };
}

/** Country name → ISO code (for withdraw.tsx which uses full names) */
export const NAME_TO_CODE: Record<string, string> = {
  // Africa · West
  Ghana: 'GH', Nigeria: 'NG', Senegal: 'SN',
  'Ivory Coast': 'CI', 'Côte d\'Ivoire': 'CI',
  Mali: 'ML', 'Burkina Faso': 'BF', Togo: 'TG', Benin: 'BJ',
  Guinea: 'GN', 'Sierra Leone': 'SL', Liberia: 'LR', Gambia: 'GM',
  // Africa · North
  Egypt: 'EG', Morocco: 'MA', Algeria: 'DZ', Tunisia: 'TN', Sudan: 'SD',
  // Africa · East
  Kenya: 'KE', Uganda: 'UG', Tanzania: 'TZ', Rwanda: 'RW', Ethiopia: 'ET',
  Burundi: 'BI', Somalia: 'SO',
  // Africa · South & Central
  'South Africa': 'ZA', Zambia: 'ZM', Mozambique: 'MZ', Zimbabwe: 'ZW',
  Botswana: 'BW', Namibia: 'NA', Malawi: 'MW', Angola: 'AO',
  'DR Congo': 'CD', Congo: 'CG', Cameroon: 'CM', Gabon: 'GA',
  // Middle East
  UAE: 'AE', 'Saudi Arabia': 'SA',
  // Asia
  Philippines: 'PH', India: 'IN', Pakistan: 'PK', Bangladesh: 'BD', 'Sri Lanka': 'LK',
  Malaysia: 'MY', Singapore: 'SG', Thailand: 'TH',
  // Europe
  UK: 'GB', Germany: 'DE', France: 'FR',
  // Americas
  USA: 'US', Canada: 'CA', Mexico: 'MX', Brazil: 'BR',
};

export function getRegionByName(name: string): RegionInfo {
  const code = NAME_TO_CODE[name];
  return code ? getRegion(code) : { group: 'Others', order: 99 };
}

/** Sort an array by region (Africa first, then Asia, then Europe, etc.) */
export function sortByRegion<T>(items: T[], getCode: (item: T) => string): T[] {
  return [...items].sort((a, b) => {
    const ra = getRegion(getCode(a));
    const rb = getRegion(getCode(b));
    if (ra.order !== rb.order) return ra.order - rb.order;
    if (ra.group !== rb.group) return ra.group.localeCompare(rb.group);
    return getCode(a).localeCompare(getCode(b));
  });
}

/** Group items into region sections, preserving Africa → Asia → Europe order */
export function groupByRegion<T>(items: T[], getCode: (item: T) => string): { group: string; items: T[] }[] {
  const sorted = sortByRegion(items, getCode);
  const map = new Map<string, T[]>();
  for (const item of sorted) {
    const { group } = getRegion(getCode(item));
    if (!map.has(group)) map.set(group, []);
    map.get(group)!.push(item);
  }
  return Array.from(map.entries()).map(([group, items]) => ({ group, items }));
}

/** Country name-based grouping (for withdraw.tsx) */
export function groupByRegionByName<T>(items: T[], getName: (item: T) => string): { group: string; items: T[] }[] {
  const map = new Map<string, { order: number; items: T[] }>();
  for (const item of items) {
    const { group, order } = getRegionByName(getName(item));
    if (!map.has(group)) map.set(group, { order, items: [] });
    map.get(group)!.items.push(item);
  }
  return Array.from(map.entries())
    .sort((a, b) => a[1].order - b[1].order)
    .map(([group, { items }]) => ({ group, items }));
}
