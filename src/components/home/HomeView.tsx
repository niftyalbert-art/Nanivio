import React, { useState } from 'react';
import { ArrowUpRight, AudioLines, Copy, Check, Fingerprint, MessageCircle, Phone, Search, Sparkles, Tv, Users, Video } from 'lucide-react';
import { useNanivio } from '../../context/NanivioContext';
import { lookupNanivioUser } from '../../utils/userLookup';
import { VerifiedServicesLocationSection } from './VerifiedServicesLocationSection';

export const HomeView: React.FC = () => {
  const { currentUser, authUser, setActiveTab, start1on1Call, startDirectChatWithUser, contacts, adminFeatures } = useNanivio();
  const audioEnabled = adminFeatures?.audioCallsEnabled !== false;
  const videoEnabled = adminFeatures?.videoCallsEnabled !== false;
  const [query, setQuery] = useState('');
  const [feedback, setFeedback] = useState<{ message: string; user?: any; error?: boolean } | null>(null);
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState(false);
  const nvId = authUser?.nvId || currentUser.nvId || currentUser.nanivioNumber || '';

  const searchUser = async (event: React.FormEvent) => {
    event.preventDefault();
    const value = query.trim();
    if (!value || loading) return;
    setLoading(true);
    setFeedback(null);
    try {
      const saved = contacts.find((person) =>
        [person.nanivioNumber, person.nvId, person.name, person.username].some((field) => field?.toLowerCase().includes(value.toLowerCase()))
      );
      const user = saved || await lookupNanivioUser(value);
      setFeedback(user
        ? { message: `${user.name} · ${user.nanivioNumber || user.nvId || 'Nanivio member'}`, user }
        : { message: `No Nanivio member found for “${value}”. Check the ID and try again.`, error: true });
    } catch {
      setFeedback({ message: 'Directory lookup is unavailable right now. Try again shortly.', error: true });
    } finally {
      setLoading(false);
    }
  };

  const copyId = async () => {
    if (!nvId) return;
    try {
      await navigator.clipboard.writeText(nvId);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch { /* Clipboard may be unavailable in restricted browsers. */ }
  };

  const firstName = currentUser?.name?.trim().split(/\s+/)[0];
  return (
    <div className="nv-home nv-home-dashboard mx-auto w-full max-w-7xl px-4 pb-8 pt-5 sm:px-6 lg:px-8">
      <section className="nv-home-hero" aria-labelledby="home-title">
        <div className="nv-home-hero-copy">
          <p className="nv-eyebrow"><span className="nv-home-mark">N</span> YOUR NANIVIO</p>
          <h1 id="home-title">{firstName ? `Good to see you, ${firstName}.` : 'Good to see you.'}</h1>
          <p className="nv-home-lede">Your conversations, calls and people—together in one place.</p>
          <div className="nv-home-hero-actions">
            <button className="nv-primary-action" onClick={() => setActiveTab('chat')}><MessageCircle size={17} /> Open messages <ArrowUpRight size={16} /></button>
            <button className="nv-secondary-action" onClick={() => setActiveTab('calls')}><Phone size={17} /> Make a call</button>
          </div>
        </div>
        <div className="nv-home-identity">
          <div className="nv-id-top"><Fingerprint size={18} /><span>YOUR NANIVIO ID</span></div>
          <div className="nv-id-value">{nvId || 'Not assigned'}</div>
          {nvId && <button className="nv-copy-button" onClick={copyId} aria-label="Copy Nanivio ID">{copied ? <Check size={15} /> : <Copy size={15} />}{copied ? 'Copied' : 'Copy ID'}</button>}
          <div className="nv-id-rule" />
          <p>Share this ID so people can find you.</p>
        </div>
      </section>

      <section className="nv-home-connect" aria-labelledby="connect-title">
        <div className="nv-section-heading">
          <div><span className="nv-section-index">FIND SOMEONE</span><h2 id="connect-title">Start with a person.</h2></div>
          <button className="nv-quiet-link" onClick={() => setActiveTab('contacts')}>Open contacts <ArrowUpRight size={15} /></button>
        </div>
        <form className="nv-lookup" onSubmit={searchUser}>
          <Search size={18} />
          <input aria-label="Search by Nanivio ID or name" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Nanivio ID, phone number, or name" />
          <button type="submit" disabled={loading || !query.trim()}>{loading ? 'Searching…' : 'Find person'} <ArrowUpRight size={15} /></button>
        </form>
        {feedback && <div className={`nv-lookup-result ${feedback.error ? 'is-error' : ''}`} role={feedback.error ? 'alert' : 'status'}>
          <span>{feedback.message}</span>
          {feedback.user && <div className="nv-result-actions">
            <button aria-label="Start audio call" disabled={!audioEnabled} onClick={() => audioEnabled && start1on1Call(feedback.user, 'audio')}><Phone size={16} /></button>
            <button aria-label="Start video call" disabled={!videoEnabled} onClick={() => videoEnabled && start1on1Call(feedback.user, 'video')}><Video size={16} /></button>
            <button aria-label="Open chat" onClick={() => startDirectChatWithUser({
              ...feedback.user,
              myLanguage: feedback.user.myLanguage || feedback.user.preferredLanguage || 'en',
              role: feedback.user.role || 'user',
            })}><MessageCircle size={16} /></button>
          </div>}
        </div>}
        <div className="nv-home-shortcuts">
          <button onClick={() => setActiveTab('chat')}><span className="nv-shortcut-icon"><MessageCircle size={19} /></span><span><strong>Messages</strong><small>Continue a conversation</small></span><ArrowUpRight size={16} /></button>
          <button onClick={() => setActiveTab('calls')}><span className="nv-shortcut-icon"><AudioLines size={19} /></span><span><strong>Audio &amp; video</strong><small>Call someone on Nanivio</small></span><ArrowUpRight size={16} /></button>
          <button onClick={() => setActiveTab('nvnumber')}><span className="nv-shortcut-icon"><Fingerprint size={19} /></span><span><strong>NV Number</strong><small>Manage your identity</small></span><ArrowUpRight size={16} /></button>
        </div>
      </section>

      <section className="nv-home-language">
        <div className="nv-language-stamp"><span>NV</span><i /></div>
        <div><span className="nv-section-index">LANGPRETATION</span><h2>Make room for every language.</h2></div>
        <p>Find Langpretation in your conversation controls to help people understand one another across languages.</p>
      </section>

      <section className="nv-home-services">
        <div className="nv-section-heading"><div><span className="nv-section-index">EXPLORE NANIVIO</span><h2>More ways to connect.</h2></div></div>
        <VerifiedServicesLocationSection />
      </section>

      <section className="nv-home-footer">
        <div><span className="nv-section-index">YOUR NANIVIO</span><h2>Everything you need<br />to stay in touch.</h2></div>
        <div className="nv-home-footer-links">
          <button onClick={() => setActiveTab('services')}><Tv size={18} /><span>Services &amp; live</span><ArrowUpRight size={15} /></button>
          <button onClick={() => setActiveTab('malvi')}><Sparkles size={18} /><span>Ask Malvi</span><ArrowUpRight size={15} /></button>
          <button onClick={() => setActiveTab('contacts')}><Users size={18} /><span>Your contacts</span><ArrowUpRight size={15} /></button>
        </div>
      </section>
    </div>
  );
};
