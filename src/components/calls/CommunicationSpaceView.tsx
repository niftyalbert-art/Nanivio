import React, { useRef, useState } from 'react';
import { AudioLines, Clock3, Users, Video, Phone, Trash2, ArrowUpRight, Radio, Check, AlertCircle, Award, MessageCircle, Search, X } from 'lucide-react';
import { useNanivio } from '../../context/NanivioContext';
import { Participant } from '../../types';
import { PhoneDialerModal } from './PhoneDialerModal';
import { lookupNanivioUser, normalizeNanivioNumber } from '../../utils/userLookup';

type CallsSection = 'keypad' | 'history' | 'contacts' | 'groups' | 'specialists';

export const CommunicationSpaceView: React.FC = () => {
  const {
    currentUser, authUser, callLogs, clearCallLogs, contacts, experts, start1on1Call, startGroupCall,
    adminFeatures, startDirectChatWithUser, setActiveTab,
  } = useNanivio();
  const [section, setSection] = useState<CallsSection>('keypad');
  const [selected, setSelected] = useState<string[]>([]);
  const [groupGuests, setGroupGuests] = useState<Participant[]>([]);
  const [groupLookup, setGroupLookup] = useState('');
  const [groupLookupPending, setGroupLookupPending] = useState(false);
  const groupLookupInFlight = useRef(false);
  const [groupMode, setGroupMode] = useState<'audio' | 'video'>('audio');
  const [groupError, setGroupError] = useState('');
  const audioEnabled = adminFeatures?.audioCallsEnabled !== false;
  const videoEnabled = adminFeatures?.videoCallsEnabled !== false;
  const nav = [
    { id: 'keypad' as const, label: 'Keypad', icon: Phone },
    { id: 'history' as const, label: 'Recent', icon: Clock3 },
    { id: 'contacts' as const, label: 'Contacts', icon: Users },
    { id: 'groups' as const, label: 'Groups', icon: Users },
    { id: 'specialists' as const, label: 'Specialists', icon: Award },
  ];

  const isCurrentUser = (candidate: { id?: string; nvId?: string; nanivioNumber?: string }) => {
    const selfIds = [currentUser?.id, authUser?.id].filter(Boolean);
    const selfNumbers = [currentUser?.nvId, currentUser?.nanivioNumber, authUser?.nvId].filter(Boolean).map((value) => normalizeNanivioNumber(value!));
    const candidateNumber = normalizeNanivioNumber(candidate.nvId || candidate.nanivioNumber || '');
    return (!!candidate.id && selfIds.includes(candidate.id)) || (!!candidateNumber && selfNumbers.includes(candidateNumber));
  };
  const toggleContact = (id: string) => {
    const contact = contacts.find((item) => item.id === id);
    if (!contact || isCurrentUser({ id: contact.id, nvId: contact.nvId || contact.nanivioNumber })) {
      setGroupError('You cannot add yourself to a group call.');
      return;
    }
    if (groupGuests.some((guest) => guest.id === id)) {
      setGroupError('This member is already in the group.');
      return;
    }
    setGroupError('');
    setSelected((items) => items.includes(id) ? items.filter((item) => item !== id) : [...items, id]);
  };
  const startGroup = () => {
    const staged: Participant[] = [...contacts.filter((contact) => selected.includes(contact.id) && !isCurrentUser({ id: contact.id, nvId: contact.nvId || contact.nanivioNumber })).map((contact) => ({
      id: contact.id,
      name: contact.name,
      avatar: contact.avatar,
      initials: contact.initials || contact.name.slice(0, 2).toUpperCase(),
      myLanguage: contact.preferredLanguage || contact.language || 'en',
      role: 'user',
    })), ...groupGuests.filter((guest) => !isCurrentUser(guest))];
    const members = [...new Map(staged.map((member) => [normalizeNanivioNumber(member.nvId || member.nanivioNumber || '') || member.id, member])).values()];
    if (!members.length) { setGroupError('Choose one or more saved contacts to start a group call.'); return; }
    if ((groupMode === 'audio' && !audioEnabled) || (groupMode === 'video' && !videoEnabled)) return;
    setGroupError('');
    startGroupCall(members, groupMode);
  };
  const findGroupGuest = async (event: React.FormEvent) => {
    event.preventDefault();
    const value = groupLookup.trim();
    if (!value || groupLookupInFlight.current) return;
    groupLookupInFlight.current = true;
    setGroupLookupPending(true);
    setGroupError('');
    try {
      const user = await lookupNanivioUser(value);
      if (!user) {
        setGroupError(`No Nanivio member found for “${value}”.`);
        return;
      }
      if (isCurrentUser(user)) {
        setGroupError('You cannot add yourself to a group call.');
        return;
      }
      const userNumber = normalizeNanivioNumber(user.nvId || user.nanivioNumber || '');
      const alreadyAdded = selected.includes(user.id)
        || contacts.some((contact) => selected.includes(contact.id) && contact.id === user.id)
        || (!!userNumber && contacts.some((contact) => selected.includes(contact.id) && normalizeNanivioNumber(contact.nvId || contact.nanivioNumber || '') === userNumber))
        || groupGuests.some((person) => person.id === user.id || (!!userNumber && normalizeNanivioNumber(person.nvId || person.nanivioNumber || '') === userNumber));
      if (alreadyAdded) {
        setGroupError(`${user.name} is already in this group.`);
        return;
      }
      setGroupGuests((guests) => [...guests, {
        id: user.id,
        name: user.name,
        avatar: user.avatar,
        initials: user.initials || user.name.slice(0, 2).toUpperCase(),
        myLanguage: user.myLanguage || 'en',
        role: 'user',
      }]);
      setGroupLookup('');
    } catch {
      setGroupError('Nanivio directory is unavailable. Try again shortly.');
    } finally {
      groupLookupInFlight.current = false;
      setGroupLookupPending(false);
    }
  };
  const formatDuration = (seconds: number) => seconds > 0 ? `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}` : '';

  return (
    <div className="nv-calls-page">
      <header className="nv-calls-heading">
        <div className="nv-calls-title"><span className="nv-call-mark"><Radio size={18} /></span><div><p className="nv-section-index">NANIVIO · CALLS</p><h1>Say hello.</h1></div></div>
        <div className="nv-calls-line"><span>YOUR LINE</span><strong>{currentUser?.nvId || currentUser?.nanivioNumber || 'Not assigned'}</strong></div>
      </header>
      <nav className="nv-call-tabs" aria-label="Calls">
        {nav.map(({ id, label, icon: Icon }) => <button key={id} aria-current={section === id ? 'page' : undefined} onClick={() => setSection(id)} className={section === id ? 'is-active' : ''}><Icon size={16} /><span>{label}</span>{id === 'history' && callLogs.some((log) => log.direction === 'missed') && <i className="nv-missed-dot" aria-label="Missed calls" />}</button>)}
      </nav>
      {section === 'keypad' && <section className="nv-call-stage">
        <div className="nv-call-stage-copy"><span className="nv-section-index">01 / DIRECT CONNECTION</span><h2>Type a number.<br /><em>Hear a voice.</em></h2><p>Reach Nanivio members by their number. Your recent calls and saved contacts are close at hand.</p><div className="nv-call-capability"><span className={audioEnabled ? 'available' : 'unavailable'}><AudioLines size={15} /> Audio {audioEnabled ? 'available' : 'off'}</span><span className={videoEnabled ? 'available' : 'unavailable'}><Video size={15} /> Video {videoEnabled ? 'available' : 'off'}</span></div></div>
        <PhoneDialerModal isOpen onClose={() => {}} presentation="inline" />
      </section>}
      {section === 'history' && <section className="nv-calls-content">
        <div className="nv-content-heading"><div><span className="nv-section-index">YOUR CALLS</span><h2>Recent conversations</h2></div>{callLogs.length > 0 && <button className="nv-danger-quiet" onClick={clearCallLogs}><Trash2 size={15} /> Clear history</button>}</div>
        {!callLogs.length ? <div className="nv-call-empty"><Clock3 size={24} /><strong>No calls yet</strong><p>Your call history will appear here after your first conversation.</p><button onClick={() => setSection('keypad')}>Open keypad <ArrowUpRight size={15} /></button></div> :
          <div className="nv-history-list">{callLogs.map((log: any, index) => <article className="nv-history-row" key={log.id || `${log.timestamp || ''}-${index}`}>
            <span className={`nv-history-icon ${log.direction === 'missed' ? 'missed' : ''}`}>{log.callType === 'video' ? <Video size={17} /> : log.direction === 'missed' ? <AlertCircle size={17} /> : <Phone size={17} />}</span>
            <div className="nv-history-person"><strong>{log.participantName || 'Nanivio member'}</strong><small>{log.participantNvId || 'Nanivio call'} · {log.direction === 'missed' ? 'Missed' : log.direction === 'outgoing' ? 'Outgoing' : 'Incoming'}</small></div>
            <span className="nv-history-time">{formatDuration(log.durationSeconds) || (log.timestamp ? new Date(log.timestamp).toLocaleDateString() : '')}</span>
            {log.participantId && <button disabled={log.callType === 'video' ? !videoEnabled : !audioEnabled} aria-label={`${log.callType === 'video' ? 'Video' : 'Audio'} call ${log.participantName || 'member'} again`} onClick={() => start1on1Call({ id: log.participantId!, name: log.participantName || 'Nanivio member', nvId: log.participantNvId, avatar: log.participantAvatar || '', initials: log.participantName?.slice(0, 2).toUpperCase() || 'NV', myLanguage: currentUser.myLanguage || 'en' }, log.callType === 'video' ? 'video' : 'audio')}>{log.callType === 'video' ? <Video size={15} /> : <Phone size={15} />}</button>}
          </article>)}</div>}
      </section>}
      {section === 'contacts' && <section className="nv-calls-content">
        <div className="nv-content-heading"><div><span className="nv-section-index">SAVED PEOPLE</span><h2>Contacts</h2></div><span className="nv-history-time">{contacts.length} saved</span></div>
        {!contacts.length ? <div className="nv-call-empty"><Users size={24} /><strong>Your contacts live here</strong><p>Saved Nanivio contacts appear here for quick calling and chat.</p></div> : <div className="nv-specialists-list">{contacts.map((contact) => <article key={contact.id}>
          <span className="nv-contact-initials">{contact.initials || contact.name.slice(0, 2).toUpperCase()}</span><div className="nv-contact-meta"><strong>{contact.name}</strong><small>{contact.nvId || contact.nanivioNumber || 'Nanivio contact'}</small></div>
          <button disabled={!audioEnabled} aria-label={`Audio call ${contact.name}`} onClick={() => audioEnabled && start1on1Call(contact, 'audio')}><Phone size={15} /></button>
          <button disabled={!videoEnabled} aria-label={`Video call ${contact.name}`} onClick={() => videoEnabled && start1on1Call(contact, 'video')}><Video size={15} /></button>
          <button aria-label={`Chat with ${contact.name}`} onClick={() => startDirectChatWithUser({
            ...contact,
            myLanguage: contact.preferredLanguage || contact.language || 'en',
            role: 'user',
          })}><MessageCircle size={15} /></button>
        </article>)}</div>}
      </section>}
      {section === 'groups' && <section className="nv-calls-content">
        <div className="nv-content-heading"><div><span className="nv-section-index">TOGETHER, LIVE</span><h2>Start a group call</h2></div></div>
        <p className="nv-tool-intro">Select people from your saved contacts. Group calls use your existing Nanivio calling controls.</p>
        <form className="nv-group-lookup" onSubmit={findGroupGuest}>
          <Search size={16} />
          <input aria-label="Add group participant by Nanivio ID" value={groupLookup} onChange={(event) => setGroupLookup(event.target.value)} placeholder="Add a member by Nanivio ID" />
          <button disabled={!groupLookup.trim() || groupLookupPending} type="submit">{groupLookupPending ? 'Looking…' : 'Find'}</button>
        </form>
        <div className="nv-mode-select" role="group" aria-label="Call type">
          <button className={groupMode === 'audio' ? 'is-active' : ''} disabled={!audioEnabled} onClick={() => setGroupMode('audio')}><AudioLines size={16} /> Audio</button>
          <button className={groupMode === 'video' ? 'is-active' : ''} disabled={!videoEnabled} onClick={() => setGroupMode('video')}><Video size={16} /> Video</button>
        </div>
        {!contacts.length ? <div className="nv-call-empty"><Users size={24} /><strong>No saved contacts</strong><p>Add people in Contacts before starting a group call.</p></div> : <div className="nv-group-contacts">{contacts.map((contact) => {
          const isSelf = isCurrentUser({ id: contact.id, nvId: contact.nvId || contact.nanivioNumber });
          const contactNumber = normalizeNanivioNumber(contact.nvId || contact.nanivioNumber || '');
          const isGuest = groupGuests.some((guest) => guest.id === contact.id || (!!contactNumber && normalizeNanivioNumber(guest.nvId || guest.nanivioNumber || '') === contactNumber));
          return <button className={selected.includes(contact.id) ? 'is-selected' : ''} key={contact.id} disabled={isSelf || isGuest} aria-label={isSelf ? `${contact.name}, your account` : isGuest ? `${contact.name}, already added` : contact.name} onClick={() => toggleContact(contact.id)}><span className="nv-contact-initials">{contact.initials || contact.name.slice(0, 2).toUpperCase()}</span><span className="nv-contact-meta"><strong>{contact.name}</strong><small>{isSelf ? 'Your account' : contact.nvId || contact.nanivioNumber || 'Nanivio contact'}</small></span><span className="nv-check">{selected.includes(contact.id) && <Check size={15} />}</span></button>;
        })}</div>}
        {groupGuests.length > 0 && <div className="nv-group-guests">{groupGuests.map((guest) => <span key={guest.id}>{guest.name}<button type="button" aria-label={`Remove ${guest.name}`} onClick={() => setGroupGuests((items) => items.filter((item) => item.id !== guest.id))}><X size={13} /></button></span>)}</div>}
        {groupError && <p className="nv-group-error" role="alert">{groupError}</p>}
        <button className="nv-group-launch" disabled={groupLookupPending || selected.length + groupGuests.length === 0 || (groupMode === 'audio' ? !audioEnabled : !videoEnabled)} onClick={startGroup}><Phone size={16} /> Start {groupMode} call <span>{selected.length + groupGuests.length || ''}</span></button>
      </section>}
      {section === 'specialists' && <section className="nv-calls-content">
        <div className="nv-content-heading"><div><span className="nv-section-index">PEOPLE WITH EXPERTISE</span><h2>Live specialists</h2></div></div>
        {!experts.length ? <div className="nv-call-empty"><Award size={24} /><strong>No specialists to show</strong><p>Available specialists will appear here when the directory has listings.</p></div> : <div className="nv-specialists-list">{experts.map((expert) => {
          const canCall = audioEnabled && expert.isOnline && expert.availableFor.includes('audio');
          return <article key={expert.id}><span className="nv-contact-initials">{expert.initials || expert.name.slice(0, 2).toUpperCase()}</span><div className="nv-contact-meta"><strong>{expert.name}</strong><small>{expert.title} · {canCall ? 'Available for audio' : 'Audio unavailable'}</small></div><button disabled={!canCall} aria-label={`${canCall ? 'Call' : 'Audio unavailable for'} ${expert.name}`} onClick={() => canCall && start1on1Call(expert, 'audio', true, expert)}><Phone size={15} /></button></article>;
        })}</div>}
      </section>}
    </div>
  );
};
