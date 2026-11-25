import React, { useEffect, useState } from 'react';
import QRCode from 'qrcode';
import { Check, Globe, Mail, MapPin, MessageCircle, Phone, Share2 } from 'lucide-react';
import {
  NANIVIO_COMPANY, NANIVIO_CONTACTS, NANIVIO_JOIN_URL, NANIVIO_OFFICIAL_QR,
  loadOfficialProfile, type NanivioOfficialProfile,
} from '../../lib/nanivioOfficial';
import { NanivioLogo } from './NanivioLogo';

export const NanivioOfficialCard: React.FC<{ className?: string }> = ({ className = '' }) => {
  const joinUrl = NANIVIO_JOIN_URL;
  const [shared, setShared] = useState(false);
  const [profile, setProfile] = useState<NanivioOfficialProfile>({ ...NANIVIO_CONTACTS, qrMode: 'official' });
  const [joinQr, setJoinQr] = useState('');

  useEffect(() => {
    const controller = new AbortController();
    loadOfficialProfile(controller.signal).then(setProfile);
    return () => controller.abort();
  }, []);

  useEffect(() => {
    if (profile.qrMode !== 'join') return;
    let active = true;
    QRCode.toDataURL(joinUrl, { width: 320, margin: 1, color: { dark: '#1a1530', light: '#ffffff' } })
      .then(url => { if (active) setJoinQr(url); })
      .catch(() => { if (active) setJoinQr(''); });
    return () => { active = false; };
  }, [profile.qrMode, joinUrl]);

  const share = async () => {
    try {
      if (navigator.share) await navigator.share({ title: 'Join Nanivio', url: joinUrl });
      else await navigator.clipboard.writeText(joinUrl);
      setShared(true);
      window.setTimeout(() => setShared(false), 1800);
    } catch {
      // The user cancelled sharing or the clipboard is unavailable.
    }
  };

  const { address, email, phone, whatsapp, website } = profile;
  const qrSrc = profile.qrMode === 'join' && joinQr ? joinQr : NANIVIO_OFFICIAL_QR;
  const whatsappUrl = whatsapp && (/^https?:/.test(whatsapp) ? whatsapp : `https://wa.me/${whatsapp.replace(/\D/g, '')}`);
  const contacts = [
    email && { label: email, href: `mailto:${email}`, icon: Mail },
    phone && { label: phone, href: `tel:${phone.replace(/\s/g, '')}`, icon: Phone },
    whatsappUrl && { label: 'WhatsApp', href: whatsappUrl, icon: MessageCircle },
    website && { label: website.replace(/^https?:\/\//, ''), href: website, icon: Globe },
  ].filter(Boolean) as { label: string; href: string; icon: typeof Mail }[];

  return (
    <section
      aria-labelledby="nanivio-official-title"
      className={`nv-official-card flex flex-col gap-5 rounded-3xl border border-white/10 bg-gradient-to-br from-[#121838]/90 via-[#161a3d]/90 to-[#2a1640]/90 p-5 shadow-[0_0_40px_rgba(139,92,246,.18)] sm:flex-row sm:items-center ${className}`}
    >
      <div className="mx-auto shrink-0 rounded-2xl shadow-[0_0_24px_rgba(34,211,238,.35)] sm:mx-0">
        <img src={qrSrc} alt="Nanivio official QR code" className="h-40 w-40 rounded-2xl" />
      </div>
      <div className="min-w-0 flex-1 space-y-3 text-center sm:text-left">
        <div className="flex items-center justify-center gap-2 sm:justify-start">
          <NanivioLogo size="sm" showTagline={false} />
          <span className="rounded-full border border-cyan-300/40 bg-cyan-400/10 px-2 py-0.5 text-[11px] font-semibold text-cyan-200">Official</span>
        </div>
        <h2 id="nanivio-official-title" className="text-lg font-bold text-white">Scan to join Nanivio</h2>
        <p className="text-sm text-slate-300">Installs the app and opens registration.</p>
        <div className="text-sm text-slate-200">
          <p className="font-semibold">{NANIVIO_COMPANY}</p>
          {address && <p className="mt-0.5 inline-flex items-start gap-1.5 text-slate-300"><MapPin className="mt-0.5 h-4 w-4 shrink-0 text-fuchsia-300" />{address}</p>}
        </div>
        <div className="flex flex-wrap justify-center gap-2 sm:justify-start">
          <button type="button" onClick={share} className="inline-flex min-h-10 items-center gap-2 rounded-xl bg-gradient-to-r from-cyan-500 to-fuchsia-500 px-4 text-sm font-semibold text-white">
            {shared ? <Check className="h-4 w-4" /> : <Share2 className="h-4 w-4" />}
            {shared ? 'Link ready' : 'Share invite'}
          </button>
          {contacts.map(({ label, href, icon: Icon }) => (
            <a key={href} href={href} target={href.startsWith('http') ? '_blank' : undefined} rel="noreferrer"
              className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-3 text-sm text-slate-100 hover:border-cyan-300/50">
              <Icon className="h-4 w-4 text-cyan-300" />{label}
            </a>
          ))}
        </div>
      </div>
    </section>
  );
};
