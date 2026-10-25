import { AssistantError } from './redisStore.ts';
import { validateWebQuery } from './webResearch.ts';
import type { MalviMediaItem } from '../../shared/malviInputTypes.ts';
export const MEDIA_TOOL = {
  name: 'search_public_media',
  description: 'Find real public, licensed images or videos requested by the user using Wikimedia Commons. Use a short public topic query without private information. Results include playable media URLs, source, author and license metadata; do not invent assets or guarantee that every browser can play a returned video. This is not an all-web/private media search.',
  parametersJsonSchema: { type: 'object', additionalProperties: false,
    properties: { query: { type: 'string', minLength: 3, maxLength: 180 }, kind: { type: 'string', enum: ['images', 'videos'] } },
    required: ['query','kind'] },
};

function commonsUrl(value: unknown, media = false) {
  try {
    const u = new URL(String(value));
    if (u.protocol !== 'https:' || u.username || u.password || u.port
      || !(media ? ['upload.wikimedia.org', 'commons.wikimedia.org'] : ['commons.wikimedia.org']).includes(u.hostname)) return null;
    return u.href;
  } catch { return null; }
}
// Provider metadata is plain text, never executable HTML.
function text(value: unknown, max = 300) {
  return String(value || '').replace(/<[^>]*>/g, '').replace(/&(?:nbsp|amp|quot|#39);/g, ' ').replace(/\s+/g, ' ').trim().slice(0,max);
}
export function parseCommonsMedia(body: any, kind: 'images' | 'videos'): MalviMediaItem[] {
  const pages = Array.isArray(body?.query?.pages) ? body.query.pages : Object.values(body?.query?.pages || {});
  return pages.slice(0,12).flatMap((p: any) => {
    const info = p?.imageinfo?.[0];
    const mimeType = info?.mime;
    const valid = kind === 'images' ? ['image/jpeg', 'image/png', 'image/webp'].includes(mimeType)
      : ['video/webm', 'video/ogg', 'video/mp4'].includes(mimeType)
        && Number.isFinite(info?.size) && info.size <= 32 * 1024 * 1024;
    if (!valid) return [];
    const url = commonsUrl(kind === 'images' ? info.thumburl || info.url : info.url, true);
    const sourceUrl = commonsUrl(info.descriptionurl);
    const license = text(info.extmetadata?.LicenseShortName?.value,120);
    if (!url || !sourceUrl || !license) return [];
    return [{ kind: kind === 'images' ? 'image' : 'video', title: text(p.title).replace(/^File:/,''),
      url, sourceUrl, attribution: text(info.extmetadata?.Artist?.value) || 'See author and full attribution on the source page.',
      license, mimeType } satisfies MalviMediaItem];
  }).slice(0,6);
}
export async function researchPublicMedia(body: unknown, fetcher: typeof fetch = fetch) {
  const b = body as any;
  if (!['images','videos'].includes(b?.kind)) throw new AssistantError(400, 'INVALID_MEDIA_KIND', 'Choose images or videos.');
  const { query } = validateWebQuery({ query: b.query, scope: 'web' });
  if (process.env.MALVI_WEB_RESEARCH_ENABLED === 'false') throw new AssistantError(503, 'RESEARCH_DISABLED', 'Public research is disabled by the administrator.');
  const url = new URL('https://commons.wikimedia.org/w/api.php');
  url.search = new URLSearchParams({ action: 'query', format: 'json', formatversion: '2', generator: 'search',
    gsrsearch: `${query.replace(/[:"|<>]/g,' ')} filetype:${b.kind === 'videos' ? 'video' : 'bitmap'}`,
    gsrnamespace: '6', gsrlimit: '6', prop: 'imageinfo', iiprop: 'url|mime|size|extmetadata', iiurlwidth: '720',
    iiextmetadatafilter: 'Artist|LicenseShortName' }).toString();
  let data;
  try {
    const response = await fetcher(url, { signal: AbortSignal.timeout(10000), redirect: 'error',
      headers: { Accept: 'application/json', 'User-Agent': 'NanivioMalvi/1.0 (public media research)' } });
    if (!response.ok) throw Error();
    // Bound remote metadata before parsing. No arbitrary source-page fetches.
    const reader = response.body?.getReader();
    if (!reader) throw Error();
    let size = 0; const chunks: Uint8Array[] = [];
    try { for (;;) { const { done, value } = await reader.read(); if (done) break;
      size += value.length; if (size > 1000000) { await reader.cancel(); throw Error(); } chunks.push(value); } }
    finally { reader.releaseLock(); }
    data = JSON.parse(Buffer.concat(chunks).toString('utf8'));
    if (data?.error) throw Error();
  } catch { throw new AssistantError(503, 'MEDIA_RESEARCH_UNAVAILABLE', 'Wikimedia Commons media search is unavailable. No substitute results were generated.'); }
  return { success: true, items: parseCommonsMedia(data, b.kind),
    limitation: 'Public Wikimedia Commons results, not the entire internet. Open the source to verify relevance, attribution and reuse terms. Video playback depends on browser codec support. Results are not proof of factual claims.' };
}
