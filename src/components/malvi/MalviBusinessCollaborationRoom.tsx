import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ArrowDownToLine, ArrowLeft, BrainCircuit, Check, CheckSquare2, Clipboard, FileText,
  Lightbulb, LoaderCircle, LockKeyhole, MessageSquareText, Plus, Radio, RefreshCw,
  Send, ShieldCheck, Sparkles, Users, Video, X,
} from 'lucide-react';
import { useNanivio } from '../../context/NanivioContext';
import { malviBusinessClient } from '../../lib/malviBusinessClient';
import type { BusinessRoom } from '../../types/malviBusiness';
import { BusinessMeeting } from './BusinessMeeting';
import { subscriptionHasCapability } from '../../lib/malviCapabilities';

interface Props { onOpenSubscriptionHub?: () => void }
const card = 'rounded-2xl border border-[#dedbd3] bg-[#f8f6f0]';
const input = 'w-full rounded-xl border border-[#d9d5cc] bg-[#fffdf8] px-3 py-2.5 text-sm text-[#292b2b] outline-none transition focus:border-[#56766e] focus:ring-2 focus:ring-[#56766e]/15 placeholder:text-[#96958d]';
const button = 'inline-flex min-h-10 items-center justify-center gap-2 rounded-xl px-3.5 text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-45';
const primary = `${button} bg-[#344f49] text-[#fffdf7] hover:bg-[#263e39]`;
const secondary = `${button} border border-[#d8d4ca] bg-[#fffdf8] text-[#424541] hover:bg-[#eeece4]`;

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : 'The workspace could not complete this request.';
}

export const MalviBusinessCollaborationRoom: React.FC<Props> = ({ onOpenSubscriptionHub }) => {
  const { malviSubscription, currentUser } = useNanivio();
  const isBusiness = subscriptionHasCapability(malviSubscription, 'business');
  const [rooms, setRooms] = useState<BusinessRoom[]>([]);
  const [room, setRoom] = useState<BusinessRoom | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadAttempt, setLoadAttempt] = useState(0);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [topic, setTopic] = useState('');
  const [objective, setObjective] = useState('');
  const [joinCode, setJoinCode] = useState('');
  const [inviteCode, setInviteCode] = useState('');
  const [message, setMessage] = useState('');
  const [messageKind, setMessageKind] = useState<'idea' | 'transcript'>('idea');
  const [task, setTask] = useState('');
  const [taskOwnerId, setTaskOwnerId] = useState(currentUser.id);
  const [knowledgeTitle, setKnowledgeTitle] = useState('');
  const [knowledgeText, setKnowledgeText] = useState('');
  const [showCreate, setShowCreate] = useState(false);
  const [showKnowledgeForm, setShowKnowledgeForm] = useState(false);
  const [copied, setCopied] = useState(false);
  const roomSnapshot = useRef<BusinessRoom | null>(null);
  const selectedId = useRef<string | null>(null);
  const selectionEpoch = useRef(0);
  const mutationRevision = useRef(0);
  const pollController = useRef<AbortController | null>(null);

  useEffect(() => { setTaskOwnerId(currentUser.id); }, [currentUser.id]);

  const applyRoom = useCallback((next: BusinessRoom) => {
    const current = roomSnapshot.current;
    if (selectedId.current && selectedId.current !== next.id) return;
    if (current?.id === next.id && next.version < current.version) return;
    roomSnapshot.current = next;
    setRoom(next);
    setRooms(prev => prev.map(item => item.id === next.id ? next : item));
  }, []);
  const applySelectedRoom = useCallback((next: BusinessRoom) => {
    if (selectedId.current === next.id) {
      mutationRevision.current += 1;
      applyRoom(next);
    }
  }, [applyRoom]);

  useEffect(() => {
    let alive = true;
    const controller = new AbortController();
    setLoading(true);
    malviBusinessClient.list(controller.signal)
      .then(result => { if (alive) { setRooms(result.rooms); setError(''); } })
      .catch(err => { if (alive && !controller.signal.aborted) setError(errorMessage(err)); })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; controller.abort(); };
  }, [loadAttempt]);

  const selectRoom = useCallback(async (id: string) => {
    const epoch = ++selectionEpoch.current;
    selectedId.current = id;
    pollController.current?.abort();
    roomSnapshot.current = null;
    setRoom(null);
    setInviteCode('');
    setError('');
    setBusy('open');
    try {
      const result = await malviBusinessClient.read(id);
      if (selectionEpoch.current === epoch && selectedId.current === id) applyRoom(result.room);
    } catch (err) {
      if (selectionEpoch.current === epoch) setError(errorMessage(err));
    } finally {
      if (selectionEpoch.current === epoch) setBusy('');
    }
  }, [applyRoom]);

  const runRoomMutation = useCallback(async (label: string, action: (id: string) => Promise<{ room: BusinessRoom }>) => {
    const id = selectedId.current;
    const epoch = selectionEpoch.current;
    if (!id) return;
    setBusy(label);
    setError('');
    const operationRevision = ++mutationRevision.current;
    try {
      const result = await action(id);
      if (selectionEpoch.current === epoch && selectedId.current === id && mutationRevision.current === operationRevision) {
        mutationRevision.current += 1;
        applyRoom(result.room);
      }
    } catch (err) {
      if (selectionEpoch.current === epoch && selectedId.current === id) setError(errorMessage(err));
    } finally {
      if (selectionEpoch.current === epoch && selectedId.current === id) setBusy('');
    }
  }, [applyRoom]);

  useEffect(() => {
    if (!room?.id) return;
    let active = true;
    const id = room.id;
    const epoch = selectionEpoch.current;
    let controller: AbortController | null = null;
    const poll = async () => {
      controller?.abort();
      controller = new AbortController();
      pollController.current = controller;
      const revision = mutationRevision.current;
      try {
        const result = await malviBusinessClient.read(id, controller.signal);
        if (active && selectionEpoch.current === epoch && selectedId.current === id && revision === mutationRevision.current) applyRoom(result.room);
      } catch (err) {
        if (active && !controller?.signal.aborted && selectionEpoch.current === epoch) setError(errorMessage(err));
      }
    };
    const timer = window.setInterval(poll, 3000);
    return () => { active = false; window.clearInterval(timer); controller?.abort(); };
  }, [room?.id, applyRoom]);

  const createRoom = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!topic.trim() || !objective.trim()) return;
    const requestEpoch = selectionEpoch.current;
    setBusy('create'); setError('');
    try {
      const result = await malviBusinessClient.create(topic.trim(), objective.trim());
      setRooms(prev => [result.room, ...prev.filter(item => item.id !== result.room.id)]);
      if (selectionEpoch.current !== requestEpoch) return;
      setShowCreate(false);
      setTopic(''); setObjective('');
      await selectRoom(result.room.id);
    } catch (err) { if (selectionEpoch.current === requestEpoch) setError(errorMessage(err)); }
    finally { if (selectionEpoch.current === requestEpoch) setBusy(''); }
  };

  const joinRoom = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!joinCode.trim()) return;
    const requestEpoch = selectionEpoch.current;
    setBusy('join'); setError('');
    try {
      const result = await malviBusinessClient.join(joinCode.trim());
      setRooms(prev => [result.room, ...prev.filter(item => item.id !== result.room.id)]);
      if (selectionEpoch.current !== requestEpoch) return;
      setJoinCode('');
      await selectRoom(result.room.id);
    } catch (err) { if (selectionEpoch.current === requestEpoch) setError(errorMessage(err)); }
    finally { if (selectionEpoch.current === requestEpoch) setBusy(''); }
  };

  const generateInvite = async () => {
    if (!room || room.ownerId !== currentUser.id) return;
    const epoch = selectionEpoch.current;
    setBusy('invite'); setError('');
    try {
      const result = await malviBusinessClient.invite(room.id);
      if (selectedId.current === room.id && selectionEpoch.current === epoch) setInviteCode(result.code);
    } catch (err) { if (selectedId.current === room.id && selectionEpoch.current === epoch) setError(errorMessage(err)); }
    finally { if (selectedId.current === room.id && selectionEpoch.current === epoch) setBusy(''); }
  };

  const submitMessage = (event: React.FormEvent) => {
    event.preventDefault();
    if (!message.trim()) return;
    const text = message.trim();
    setMessage('');
    void runRoomMutation('message', id => malviBusinessClient.command(id, {
      type: 'message', id: crypto.randomUUID(), text, kind: messageKind,
    }));
  };

  const addTask = (event: React.FormEvent) => {
    event.preventDefault();
    if (!task.trim()) return;
    const text = task.trim(); setTask('');
    void runRoomMutation('action', id => malviBusinessClient.command(id, {
      type: 'action', id: crypto.randomUUID(), task: text, ownerId: taskOwnerId,
    }));
  };

  const addKnowledge = (event: React.FormEvent) => {
    event.preventDefault();
    if (!knowledgeTitle.trim() || !knowledgeText.trim()) return;
    const title = knowledgeTitle.trim(), text = knowledgeText.trim();
    setKnowledgeTitle(''); setKnowledgeText(''); setShowKnowledgeForm(false);
    void runRoomMutation('knowledge', id => malviBusinessClient.command(id, {
      type: 'knowledge', id: crypto.randomUUID(), title, text,
    }));
  };

  const exportRoom = () => {
    if (!room) return;
    const transcript = [
      'NANIVIO · MALVI BUSINESS WORKSPACE',
      `Topic: ${room.topic}`, `Objective: ${room.objective}`,
      `Updated: ${new Date(room.updatedAt).toLocaleString()}`, '',
      'ROOM TRANSCRIPT',
      ...room.messages.map(item => `[${new Date(item.at).toLocaleString()}] ${item.author} · ${item.kind}\n${item.text}`),
      '', 'SAVED KNOWLEDGE',
      ...room.knowledge.map(item => `${item.title}\n${item.text}`),
      '', 'ACTIONS',
      ...room.actions.map(item => `[${item.completed ? 'x' : ' '}] ${item.task} — ${room.members.find(member => member.id === item.ownerId)?.name ?? 'Member'}`),
      '', 'SUMMARY', room.summary || 'No saved summary.',
    ].join('\n');
    const blob = new Blob([transcript], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url; link.download = `nanivio-workspace-${room.id}.txt`;
    link.click(); URL.revokeObjectURL(url);
  };

  const leaveRoom = () => {
    selectionEpoch.current += 1; selectedId.current = null; pollController.current?.abort();
    roomSnapshot.current = null;
    setRoom(null); setInviteCode(''); setError(''); setBusy('');
  };

  return (
    <section className={`${card} overflow-hidden text-[#292b2b]`}>
      <header className="flex flex-col gap-4 border-b border-[#dedbd3] bg-[#eeece4] px-4 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-6">
        <div className="flex items-center gap-3">
          {room && <button onClick={leaveRoom} className={`${secondary} !min-h-9 !px-2.5`} aria-label="Back to rooms"><ArrowLeft size={16}/></button>}
          <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-[#344f49] text-[#f8f6f0]"><MessageSquareText size={19}/></div>
          <div><div className="flex flex-wrap items-center gap-2"><p className="text-xs font-semibold uppercase tracking-[.16em] text-[#72756e]">Malvi Business</p><span className="inline-flex items-center gap-1 rounded-full border border-[#b8c9bd] bg-[#e4ece4] px-2 py-0.5 text-[10px] font-semibold text-[#48675a]"><Check size={11}/> {room ? 'Owner-funded workspace' : isBusiness ? 'Business plan' : 'Invited access'}</span></div>
            <h2 className="text-lg font-semibold tracking-tight">{room?.topic ?? 'Shared workspaces'}</h2></div>
        </div>
        {room && <div className="flex flex-wrap gap-2">
          <button className={secondary} onClick={exportRoom}><ArrowDownToLine size={15}/> Export room</button>
          <button className={secondary} onClick={() => void runRoomMutation('analysis', id => malviBusinessClient.assist(id, 'analysis'))} disabled={!!busy}><BrainCircuit size={15}/> Analyze</button>
          <button className={primary} onClick={() => void runRoomMutation('summary', id => malviBusinessClient.assist(id, 'summary'))} disabled={!!busy}><Sparkles size={15}/> Summarize</button>
        </div>}
      </header>
      {!isBusiness && <div className="border-b border-[#dedbd3] px-4 py-3 text-xs text-[#696c66] sm:px-6">
        Join with an owner’s invitation. Shared workspace tools and meetings use the owner’s allowance; this does not upgrade your private Malvi access.
        {' '}<button type="button" onClick={onOpenSubscriptionHub} disabled={!onOpenSubscriptionHub} className="font-semibold underline">Compare plans to create your own rooms</button>
      </div>}

      {error && <div role="alert" className="mx-4 mt-4 flex items-center gap-2 rounded-xl border border-[#d7a49b] bg-[#f8e9e4] px-3 py-2.5 text-sm text-[#803f35] sm:mx-6"><span className="min-w-0 flex-1">{error}</span><button onClick={() => { const id = room?.id ?? selectedId.current; if (id) void selectRoom(id); else setLoadAttempt(value=>value+1); }} className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-semibold hover:bg-[#efd8d2]"><RefreshCw size={13}/>Retry</button><button aria-label="Dismiss error" onClick={() => setError('')}><X size={16}/></button></div>}
      {busy && <div className="flex items-center gap-2 px-5 pt-3 text-xs text-[#73766e]"><LoaderCircle size={14} className="animate-spin"/>{busy === 'open' ? 'Opening shared workspace…' : 'Saving to shared workspace…'}</div>}

      {!room ? <div className="grid gap-5 p-4 sm:p-6 lg:grid-cols-[minmax(0,1fr)_minmax(280px,.8fr)]">
        <div className="space-y-3">
          <div className="flex items-center justify-between"><div><h3 className="font-semibold">Your rooms</h3><p className="mt-0.5 text-xs text-[#777971]">Shared with your Nanivio account</p></div><button className={primary} disabled={!isBusiness} title={!isBusiness ? 'Creating rooms requires your own Business plan. You can still join an invited workspace.' : undefined} onClick={() => setShowCreate(value => !value)}><Plus size={15}/> New room</button></div>
          {loading ? <div className="space-y-2" aria-label="Loading rooms">{[1,2,3].map((_,i)=><div key={i} className="h-[74px] animate-pulse rounded-xl bg-[#e9e6de]"/>)}</div> :
            rooms.length ? <div className="space-y-2">{rooms.map(item=><button key={item.id} onClick={() => void selectRoom(item.id)} className="flex w-full items-center justify-between gap-3 rounded-xl border border-[#dedbd3] bg-[#fffdf8] px-4 py-3 text-left transition hover:border-[#aabbb0] hover:bg-[#f4f3ec]">
              <span className="min-w-0"><span className="block truncate text-sm font-semibold">{item.topic}</span><span className="mt-1 block truncate text-xs text-[#777971]">{item.objective}</span></span><span className="flex shrink-0 items-center gap-1 text-xs text-[#72756e]"><Users size={14}/>{item.members.length}</span>
            </button>)}</div> : <div className="rounded-xl border border-dashed border-[#d2cec4] bg-[#f4f2eb] px-5 py-8 text-center"><MessageSquareText className="mx-auto text-[#687f74]" size={23}/><p className="mt-3 text-sm font-semibold">No shared rooms yet</p><p className="mt-1 text-xs text-[#777971]">Create a room or join a team with an invite code.</p></div>}
          {showCreate && isBusiness && <form onSubmit={createRoom} className="space-y-3 rounded-xl border border-[#d8d4ca] bg-[#eeece4] p-4">
            <div className="flex items-center justify-between"><h4 className="text-sm font-semibold">Create a shared room</h4><button type="button" onClick={() => setShowCreate(false)} aria-label="Close form"><X size={16}/></button></div>
            <label className="block text-xs font-medium text-[#5e625c]">Topic<input className={`${input} mt-1`} value={topic} onChange={e=>setTopic(e.target.value)} maxLength={160} required placeholder="What are you working through?"/></label>
            <label className="block text-xs font-medium text-[#5e625c]">Objective<textarea className={`${input} mt-1 min-h-[76px] resize-y`} value={objective} onChange={e=>setObjective(e.target.value)} maxLength={1000} required placeholder="What should the team decide or accomplish?"/></label>
            <button className={primary} disabled={!!busy} type="submit">Create room</button>
          </form>}
        </div>
        <div className="rounded-2xl border border-[#d8d4ca] bg-[#eeece4] p-4 sm:p-5">
          <div className="flex items-center gap-2"><LockKeyhole size={16} className="text-[#557268]"/><h3 className="font-semibold">Join a team room</h3></div>
          <p className="mt-2 text-sm leading-5 text-[#6e716a]">Enter an invite code shared by the room owner.</p>
          <form onSubmit={joinRoom} className="mt-4 space-y-2"><input className={input} value={joinCode} onChange={e=>setJoinCode(e.target.value)} placeholder="Invite code" autoComplete="off" required/><button type="submit" className={`${primary} w-full`} disabled={!!busy}>Join workspace</button></form>
        </div>
      </div> : <div className="grid gap-4 p-4 sm:p-6 xl:grid-cols-[minmax(0,1fr)_310px]">
        <main className="min-w-0 space-y-4">
          <div className="flex flex-wrap items-start justify-between gap-3 rounded-xl border border-[#dedbd3] bg-[#fffdf8] px-4 py-3">
            <div><p className="text-xs font-semibold uppercase tracking-[.12em] text-[#777971]">Room objective</p><p className="mt-1 text-sm leading-5">{room.objective}</p></div>
            <div className="flex items-center gap-1.5 rounded-full bg-[#eeece4] px-2.5 py-1 text-xs text-[#62665f]"><Users size={13}/>{room.members.length} / 12</div>
          </div>
          {room.members.length >= 12 && <p className="text-xs text-[#8a564b]">This room has reached its 12-member limit.</p>}
          <BusinessMeeting room={room} currentUserId={currentUser.id} currentUserLanguage={currentUser.myLanguage} onCommand={runRoomMutation} onRoomUpdated={applySelectedRoom} />
          <section className="rounded-xl border border-[#dedbd3] bg-[#fffdf8]">
            <div className="flex items-center justify-between border-b border-[#e6e2d9] px-4 py-3"><div className="flex items-center gap-2"><Lightbulb size={16} className="text-[#8b7650]"/><h3 className="text-sm font-semibold">Room conversation</h3></div><span className="text-xs text-[#85867f]">Shared with members</span></div>
            <div className="max-h-[390px] min-h-[120px] space-y-3 overflow-y-auto p-4">
              {room.messages.length ? room.messages.map(item=><article key={item.id} className="rounded-xl bg-[#f1efe8] px-3.5 py-3">
                <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1"><span className="text-xs font-semibold">{item.author}</span><span className="text-[10px] text-[#83857e]">{item.kind === 'transcript' ? 'Pasted transcript' : item.kind === 'assistant' ? 'Malvi response' : 'Idea'} · {new Date(item.at).toLocaleString()}</span></div>
                <p className="mt-1.5 whitespace-pre-wrap break-words text-sm leading-5 text-[#484b47]">{item.text}</p>
              </article>) : <div className="py-8 text-center text-sm text-[#85867f]">The conversation starts when a member shares an idea.</div>}
            </div>
            <form onSubmit={submitMessage} className="border-t border-[#e6e2d9] p-3">
              <label className="sr-only" htmlFor="workspace-message">Share an idea or pasted transcript</label>
              <div className="flex gap-2"><textarea id="workspace-message" className={`${input} min-h-[44px] resize-y`} value={message} onChange={e=>setMessage(e.target.value)} maxLength={5000} placeholder="Share an idea or paste a transcript…" />
                <button type="submit" className={`${primary} shrink-0 self-end !px-3`} disabled={!message.trim() || !!busy} aria-label="Send to room"><Send size={16}/><span className="hidden sm:inline">Share</span></button></div>
              <div className="mt-2 flex flex-wrap items-center justify-between gap-2"><label className="flex items-center gap-2 text-[11px] text-[#686b64]">Share as
                <select value={messageKind} onChange={event=>setMessageKind(event.target.value as 'idea'|'transcript')} className="rounded-lg border border-[#d9d5cc] bg-[#fffdf8] px-2 py-1.5 text-xs text-[#424541]"><option value="idea">Idea / message</option><option value="transcript">Pasted transcript</option></select>
              </label><p className="text-[10px] text-[#85867f]">Text only; microphone audio is not recorded.</p></div>
            </form>
          </section>
          {room.summary && <section className="rounded-xl border border-[#cbd7ce] bg-[#edf2eb] p-4"><div className="flex items-center gap-2"><Sparkles size={16} className="text-[#56766e]"/><h3 className="text-sm font-semibold">Saved room summary</h3></div><p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-[#4d554f]">{room.summary}</p></section>}
        </main>
        <aside className="space-y-4">
          <section className="rounded-xl border border-[#dedbd3] bg-[#fffdf8] p-4">
            <div className="flex items-center justify-between"><div className="flex items-center gap-2"><Users size={15} className="text-[#56766e]"/><h3 className="text-sm font-semibold">People</h3></div><span className="text-xs text-[#85867f]">{room.members.length}/12</span></div>
            <div className="mt-3 space-y-2">{room.members.map(member=><div key={member.id} className="flex items-center gap-2.5"><span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-[#e4e9df] text-xs font-semibold text-[#496259]">{member.name.trim().split(/\s+/).map(part=>part[0]).join('').slice(0,2).toUpperCase()}</span><span className="min-w-0 flex-1 truncate text-sm">{member.name}{member.id === currentUser.id ? ' · you' : ''}</span>{member.id === room.ownerId && <span className="text-[10px] uppercase tracking-wide text-[#7b7d75]">Owner</span>}</div>)}</div>
            {room.ownerId === currentUser.id && <div className="mt-4 border-t border-[#e6e2d9] pt-3">
              <button onClick={() => void generateInvite()} disabled={!!busy} className={`${secondary} w-full`}><Plus size={14}/> Generate invite code</button>
              {inviteCode && <div className="mt-2 rounded-lg bg-[#edf2eb] p-2.5"><p className="text-[10px] font-semibold uppercase tracking-wide text-[#69766c]">Share with teammates</p><div className="mt-1 flex items-center gap-2"><code className="min-w-0 flex-1 break-all text-sm font-semibold">{inviteCode}</code><button className="rounded-md p-2 hover:bg-[#dce6db]" aria-label="Copy invite code" onClick={async () => { try { if (!navigator.clipboard) throw new Error('Clipboard access is unavailable. You can select and copy the invite code.'); await navigator.clipboard.writeText(inviteCode); setCopied(true); window.setTimeout(()=>setCopied(false),1600); } catch (err) { setError(errorMessage(err)); } }}>{copied ? <Check size={15}/> : <Clipboard size={15}/>}</button></div></div>}
            </div>}
          </section>
          <section className="rounded-xl border border-[#dedbd3] bg-[#fffdf8] p-4">
            <div className="flex items-center justify-between gap-2"><div className="flex items-center gap-2"><CheckSquare2 size={15} className="text-[#56766e]"/><h3 className="text-sm font-semibold">Actions</h3></div><span className="text-xs text-[#85867f]">{room.actions.filter(action=>action.completed).length}/{room.actions.length}</span></div>
            <div className="mt-3 space-y-2">{room.actions.map(action=><label key={action.id} className="flex cursor-pointer items-start gap-2.5 rounded-lg bg-[#f1efe8] p-2.5">
              <input type="checkbox" checked={action.completed} disabled={!!busy} onChange={e=>void runRoomMutation('complete', id=>malviBusinessClient.command(id,{type:'complete',id:action.id,completed:e.target.checked}))} className="mt-0.5 accent-[#48675a]"/>
              <span className={`min-w-0 flex-1 text-xs leading-5 ${action.completed?'text-[#85867f] line-through':'text-[#484b47]'}`}>{action.task}<span className="mt-0.5 block text-[10px] text-[#85867f]">Assigned to {room.members.find(member=>member.id===action.ownerId)?.name ?? 'room member'}</span></span>
            </label>)}</div>
            <form onSubmit={addTask} className="mt-3 space-y-2"><label className="block text-[11px] text-[#777971]">Assign to<select value={taskOwnerId} onChange={event=>setTaskOwnerId(event.target.value)} className={`${input} mt-1 !py-2 text-xs`}>{room.members.map(member=><option key={member.id} value={member.id}>{member.name}{member.id===currentUser.id?' · you':''}</option>)}</select></label><div className="flex gap-2"><input className={`${input} min-w-0`} value={task} onChange={e=>setTask(e.target.value)} maxLength={300} placeholder="Add an action…" aria-label="New action"/><button className={`${secondary} !px-3`} type="submit" disabled={!task.trim() || !!busy} aria-label="Add action"><Plus size={16}/></button></div></form>
          </section>
          <section className="rounded-xl border border-[#dedbd3] bg-[#fffdf8] p-4">
            <div className="flex items-center justify-between gap-2"><div className="flex items-center gap-2"><FileText size={15} className="text-[#8b7650]"/><h3 className="text-sm font-semibold">Saved knowledge</h3></div><button className="rounded-lg p-1.5 hover:bg-[#eeece4]" onClick={()=>setShowKnowledgeForm(value=>!value)} aria-label="Add saved knowledge"><Plus size={16}/></button></div>
            {showKnowledgeForm && <form className="mt-3 space-y-2" onSubmit={addKnowledge}><input className={input} value={knowledgeTitle} onChange={e=>setKnowledgeTitle(e.target.value)} maxLength={120} placeholder="Title" required/><textarea className={`${input} min-h-[68px] resize-y`} value={knowledgeText} onChange={e=>setKnowledgeText(e.target.value)} maxLength={3000} placeholder="Knowledge to keep in this room" required/><button className={`${primary} w-full`} disabled={!!busy}>Save knowledge</button></form>}
            <div className="mt-3 space-y-2">{room.knowledge.length ? room.knowledge.map(item=><article key={item.id} className="rounded-lg bg-[#f1efe8] p-2.5"><div className="flex items-start gap-2"><div className="min-w-0 flex-1"><h4 className="text-xs font-semibold">{item.title}</h4><p className="mt-1 whitespace-pre-wrap text-xs leading-5 text-[#666a64]">{item.text}</p><p className="mt-1.5 text-[10px] text-[#888a82]">Added by {room.members.find(member=>member.id===item.authorId)?.name ?? 'member'}</p></div><button onClick={()=>void runRoomMutation('remove knowledge',id=>malviBusinessClient.command(id,{type:'removeKnowledge',id:item.id}))} disabled={!!busy} className="rounded-md p-1.5 text-[#777971] hover:bg-[#e5e2d9]" aria-label={`Remove ${item.title}`}><X size={14}/></button></div></article>) : <p className="py-3 text-center text-xs text-[#85867f]">No saved knowledge yet.</p>}</div>
          </section>
        </aside>
      </div>}
      {room && <footer className="flex flex-wrap items-center justify-between gap-2 border-t border-[#dedbd3] bg-[#eeece4] px-4 py-3 text-[11px] text-[#777971] sm:px-6"><span className="inline-flex items-center gap-1.5"><Radio size={13}/> Shared room refreshes every 3 seconds</span><span>Updated {new Date(room.updatedAt).toLocaleString()}</span></footer>}
    </section>
  );
};

export default MalviBusinessCollaborationRoom;
