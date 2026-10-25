export const MAX_INPUT_BYTES = 8 * 1024 * 1024;
export const MAX_TEXT_BYTES = 128 * 1024;
export const MAX_VIDEO_SECONDS = 60;
export const INPUT_ACCEPT = '.jpg,.jpeg,.png,.mp4,.webm,.mp3,.wav,.ogg,.pdf,.txt,.md,.csv,.json';

export interface MalviSharedLocation {
  kind: 'gps' | 'ip';
  latitude: number;
  longitude: number;
  accuracyMeters?: number;
  label?: string;
}
export interface MalviMediaItem {
  kind: 'image' | 'video';
  title: string;
  url: string;
  sourceUrl: string;
  attribution: string;
  license: string;
  mimeType: string;
}
export interface MalviInputResult {
  success: true;
  answer: string;
  limitations: string[];
  processed?: { name: string; kind: string };
  research?: unknown;
}
export interface MalviAssetResult {
  media?: MalviMediaItem[];
  map?: { url: string; destination: string; origin?: string };
  limitation?: string;
}
export function parseMalviAssets(value: unknown): MalviAssetResult | null {
  if (!value || typeof value !== 'object') return null;
  const a = value as MalviAssetResult;
  const urlOn = (value: unknown, hosts: string[]) => {
    try { const u = new URL(String(value));
      return u.protocol === 'https:' && !u.username && !u.password && !u.port && hosts.includes(u.hostname) ? u.href : null;
    } catch { return null; }
  };
  const result: MalviAssetResult = {};
  if (Array.isArray(a.media)) result.media = a.media.slice(0,6).filter(item => item
    && ['image','video'].includes(item.kind) && typeof item.title === 'string'
    && typeof item.license === 'string' && typeof item.attribution === 'string'
    && urlOn(item.url, ['upload.wikimedia.org','commons.wikimedia.org'])
    && urlOn(item.sourceUrl, ['commons.wikimedia.org']));
  if (a.map && typeof a.map.destination === 'string') {
    const url = urlOn(a.map.url, ['www.google.com']);
    if (url && new URL(url).pathname === '/maps/dir/') result.map = {
      url, destination: a.map.destination.slice(0,200),
      ...(typeof a.map.origin === 'string' ? { origin: a.map.origin.slice(0,200) } : {}) };
  }
  if (typeof a.limitation === 'string') result.limitation = a.limitation.slice(0,1000);
  return result.media || result.map ? result : null;
}
export function validateSharedLocation(value: unknown): MalviSharedLocation {
  const v = value as Partial<MalviSharedLocation> | null;
  if (!v || !['gps', 'ip'].includes(v.kind || '') || typeof v.latitude !== 'number'
    || typeof v.longitude !== 'number' || !Number.isFinite(v.latitude) || !Number.isFinite(v.longitude)
    || Math.abs(v.latitude) > 90 || Math.abs(v.longitude) > 180
    || (v.accuracyMeters !== undefined && (typeof v.accuracyMeters !== 'number'
      || !Number.isFinite(v.accuracyMeters) || v.accuracyMeters < 0 || v.accuracyMeters > 10000000))
    || (v.label !== undefined && (typeof v.label !== 'string' || v.label.length > 200))) {
    throw new Error('Share a valid location with latitude and longitude, or remove the location.');
  }
  return { kind: v.kind!, latitude: v.latitude, longitude: v.longitude,
    ...(v.accuracyMeters === undefined ? {} : { accuracyMeters: v.accuracyMeters }),
    ...(v.label ? { label: v.label.trim() } : {}) };
}
function mapQuery(value: string) {
  if (typeof value !== 'string' || !value.trim() || value.length > 200 || /[\u0000-\u001f]/.test(value)) {
    throw new Error('Enter a destination or place name of 1–200 characters.');
  }
  return value.trim();
}
export function googleMapsSearch(query: string) {
  const url = new URL('https://www.google.com/maps/search/');
  url.search = new URLSearchParams({ api: '1', query: mapQuery(query) }).toString();
  return url.href;
}
export function googleMapsDirections(destination: string, origin?: string | MalviSharedLocation) {
  const params = new URLSearchParams({ api: '1', destination: mapQuery(destination), travelmode: 'driving', dir_action: 'navigate' });
  if (typeof origin === 'string' && origin.trim()) params.set('origin', mapQuery(origin));
  else if (origin && typeof origin !== 'string') {
    const location = validateSharedLocation(origin);
    if (location.kind !== 'gps') throw new Error('Approximate IP location is not suitable for driving. Use GPS or enter your starting place.');
    params.set('origin', `${location.latitude.toFixed(6)},${location.longitude.toFixed(6)}`);
  }
  const url = new URL('https://www.google.com/maps/dir/');
  url.search = params.toString();
  return url.href;
}
