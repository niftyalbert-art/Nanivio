import React, { useState } from 'react';
import { malviPublicCopy } from '../../lib/malviPublicCopy';
import { ExternalLink, Image as ImageIcon, MapPinned, Video } from 'lucide-react';
import type { MalviMediaItem } from '../../shared/malviInputTypes';

export type MalviAssetPayload = {
  media?: MalviMediaItem[];
  map?: { url: string; destination: string; origin?: string };
  limitation?: string;
};

type Props = MalviAssetPayload;

const safeMediaUrl = (value: unknown) => {
  if (typeof value !== 'string') return null;
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && !url.username && !url.password ? url.href : null;
  } catch { return null; }
};

const safeMapsUrl = (value: unknown) => {
  const href = safeMediaUrl(value);
  if (!href) return null;
  const url = new URL(href);
  return (url.hostname === 'www.google.com' || url.hostname === 'maps.google.com')
    && url.pathname.startsWith('/maps') ? href : null;
};

const MediaPreview: React.FC<{ item: MalviMediaItem }> = ({ item }) => {
  const [unavailable, setUnavailable] = useState(false);
  const url = safeMediaUrl(item.url);
  const source = safeMediaUrl(item.sourceUrl);
  return (
    <li className="overflow-hidden rounded-xl border border-white/[.09] bg-[#0d100e]">
      {url && !unavailable && item.kind === 'image' && (
        <img src={url} alt={item.title || 'Licensed public image'} referrerPolicy="no-referrer" loading="lazy"
          onError={() => setUnavailable(true)} className="max-h-64 w-full bg-[#080b09] object-contain" />
      )}
      {url && !unavailable && item.kind === 'video' && (
        <video controls preload="metadata" playsInline referrerPolicy="no-referrer" onError={() => setUnavailable(true)}
          className="max-h-64 w-full bg-black">
          <source src={url} type={item.mimeType || undefined} />
          This video cannot be played here. Open its source instead.
        </video>
      )}
      {(!url || unavailable) && (
        <p role="status" className="flex items-center gap-2 px-3 py-3 text-[11px] text-[#bdb9ac]">
          {item.kind === 'video' ? <Video size={14} /> : <ImageIcon size={14} />}
          {item.kind === 'video' ? 'Video preview is unavailable; use its source link.' : 'Image preview is unavailable; use its source link.'}
        </p>
      )}
      <div className="space-y-1.5 p-3">
        <p className="text-xs font-semibold text-[#e7e3d7]">{item.title || 'Public media'}</p>
        <p className="text-[10px] leading-relaxed text-[#aaa9a2]">{item.attribution || 'Attribution not provided'} · {item.license || 'License not provided'}</p>
        <div className="flex flex-wrap gap-3 text-[10px]">
          {source && <a href={source} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-[#d5bf80] underline underline-offset-2">Source <ExternalLink size={10} /></a>}
          {url && <a href={url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-[#d5bf80] underline underline-offset-2">Open media <ExternalLink size={10} /></a>}
        </div>
      </div>
    </li>
  );
};

export const MalviAssetResults: React.FC<Props> = ({ media = [], map, limitation }) => {
  const validMedia = media.filter((item): item is MalviMediaItem => !!item
    && (item.kind === 'image' || item.kind === 'video')
    && typeof item.url === 'string');
  const mapUrl = map ? safeMapsUrl(map.url) : null;
  if (!validMedia.length && !mapUrl && !limitation) return null;
  return (
    <section aria-label="Malvi maps and media results" className="space-y-3 rounded-2xl border border-[#b89a5a]/25 bg-[#10130f] p-3.5">
      <div className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[.14em] text-[#d5bf80]">
        {validMedia.some(item => item.kind === 'video') ? <Video size={13} /> : <ImageIcon size={13} />}
        Related media and travel
      </div>
      {limitation && <p className="text-[10px] leading-relaxed text-[#bdb9ac]">{malviPublicCopy(limitation)}</p>}
      {validMedia.length > 0 && <ul className="grid gap-3 sm:grid-cols-2">{validMedia.map((item, index) => <MediaPreview key={`${item.url}-${index}`} item={item} />)}</ul>}
      {mapUrl && map && (
        <div className="flex flex-col gap-2 rounded-xl border border-[#b89a5a]/20 bg-[#b89a5a]/[.04] p-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-2">
            <MapPinned size={15} className="mt-0.5 shrink-0 text-[#d5bf80]" />
            <p className="text-[11px] leading-relaxed text-[#e0ded6]">
              Driving directions to <strong>{map.destination}</strong>{map.origin ? ` from ${map.origin}` : ''}. Nanivio map opens an external navigation service only when you choose the link; check your route there.
            </p>
          </div>
          <a href={mapUrl} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-9 shrink-0 items-center justify-center gap-1.5 rounded-lg bg-[#d4bd7d] px-3 text-[10px] font-semibold text-[#171918] hover:bg-[#e2d09f]">
            Open Nanivio map <ExternalLink size={11} />
          </a>
        </div>
      )}
    </section>
  );
};
