import '@/styles/stream-theme.css';

import { useState, useEffect, useRef, useCallback } from 'react';
import {
  Chat, Channel, ChannelList, MessageList, MessageComposer,
  useChatContext,
} from 'stream-chat-react';
import { useStreamChat } from '@/contexts/stream-chat';
import { useStreamVideo } from '@/contexts/stream-video';
import Picker from '@emoji-mart/react';
import data from '@emoji-mart/data';
import { init, SearchIndex } from 'emoji-mart';

// Initialise the emoji data once at module load (powers the :emoji: autocomplete)
init({ data });
// StreamVideo components are no longer imported here — they live in call-overlay.tsx
// which renders inside AppLayout so the call UI persists across navigation.
import type { Channel as StreamChannel } from 'stream-chat';
import { useToast } from '@/hooks/use-toast';
import { playMessageNotification } from '@/lib/sounds';
import {
  MessageSquare, Phone, Video, ArrowLeft, Plus, Users,
  Search, X, Check, PhoneCall, Sparkles, Bell,
  UserCheck, UserX, Clock, UserPlus, ChevronDown, ChevronUp,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { cn } from '@/lib/utils';

const API = `${import.meta.env.BASE_URL}api`;

// Module-level: survives React remounts so the active channel is restored
// when the user navigates away and back.
let _lastChannelId:   string | null = null;
let _lastChannelType: string        = 'messaging';

interface StreamData { token: string; userId: string; userName: string; apiKey: string; }
interface SUser { id: string; name?: string; }
interface ContactEntry { id: number; streamUserId: string; name: string; }

/* ─── custom channel list item ─── */
function ChannelItem({
  channel,
  active,
  myUserId,
  onSelect,
  tick: _tick, // consumed only to force re-render when new messages arrive
}: {
  channel: StreamChannel;
  active: boolean;
  myUserId: string;
  onSelect: () => void;
  tick: number;
}) {
  const members = Object.values(channel.state.members ?? {});
  const other = members.find((m: any) => m.user_id !== myUserId);
  const title =
    (channel.data as any)?.name ??
    (other as any)?.user?.name ??
    'Chat';
  const msgs = channel.state.messages;
  const last = msgs[msgs.length - 1];
  const lastText =
    last?.text ??
    (last?.attachments?.length ? '📎 Attachment' : null) ??
    'No messages yet';
  const unread = channel.countUnread();
  const initials = title.slice(0, 2).toUpperCase();
  const lastAt = channel.state.last_message_at
    ? new Date(channel.state.last_message_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    : '';

  return (
    <button
      className={cn(
        'w-full flex items-center gap-3 px-4 py-3 text-left transition-colors border-l-2',
        active ? 'bg-primary/10 border-primary' : 'hover:bg-muted/30 border-transparent',
      )}
      onClick={onSelect}
    >
      <div className="relative shrink-0">
        <Avatar className="w-11 h-11">
          <AvatarFallback className="bg-primary/20 text-primary font-bold text-sm">{initials}</AvatarFallback>
        </Avatar>
        {unread > 0 && (
          <span className="absolute -top-1 -right-1 w-5 h-5 bg-primary text-primary-foreground rounded-full text-[10px] font-bold flex items-center justify-center leading-none">
            {unread > 99 ? '99+' : unread}
          </span>
        )}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between gap-1">
          <p className={cn('text-sm truncate', unread ? 'font-bold text-foreground' : 'font-medium text-foreground/90')}>
            {title}
          </p>
          {lastAt && <span className="text-[10px] text-muted-foreground shrink-0">{lastAt}</span>}
        </div>
        <p className={cn('text-xs truncate mt-0.5', unread ? 'text-foreground/70 font-medium' : 'text-muted-foreground')}>
          {lastText}
        </p>
      </div>
    </button>
  );
}

/* ─── emoji picker — standalone button that inserts into Stream's textarea via DOM ─── */
function StreamEmojiPicker() {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  const insertEmoji = (native: string) => {
    // Locate Stream's composer textarea and insert the emoji at the cursor position
    const textarea = document.querySelector('.str-chat__message-textarea') as HTMLTextAreaElement | null;
    if (textarea) {
      const start = textarea.selectionStart ?? textarea.value.length;
      const end = textarea.selectionEnd ?? textarea.value.length;
      const newVal = textarea.value.slice(0, start) + native + textarea.value.slice(end);
      // Trigger React's synthetic onChange via the native HTMLTextAreaElement setter
      const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')?.set;
      setter?.call(textarea, newVal);
      textarea.dispatchEvent(new Event('input', { bubbles: true }));
      // Restore cursor right after the inserted emoji
      requestAnimationFrame(() => {
        textarea.setSelectionRange(start + native.length, start + native.length);
        textarea.focus();
      });
    }
    setOpen(false);
  };

  return (
    <div ref={containerRef} className="relative shrink-0">
      <button
        type="button"
        aria-label="Emoji"
        onClick={() => setOpen(o => !o)}
        className={cn(
          'w-9 h-9 flex items-center justify-center rounded-full text-lg transition-colors',
          open ? 'bg-primary/15 text-primary' : 'text-muted-foreground hover:text-foreground hover:bg-muted/40',
        )}
      >
        😊
      </button>
      {open && (
        <div
          className="absolute z-[200] shadow-2xl rounded-2xl overflow-hidden"
          style={{ bottom: '48px', left: '-4px' }}
        >
          <Picker
            data={data}
            theme="dark"
            set="native"
            previewPosition="none"
            skinTonePosition="none"
            maxFrequentRows={2}
            onEmojiSelect={(emoji: any) => insertEmoji(emoji.native)}
          />
        </div>
      )}
    </div>
  );
}

/* ─── invite request banner — shown as a floating card when an invite arrives
       while the user is already viewing a conversation ─── */
function InviteRequestBanner({
  channel, myUserId, onAccept, onDecline,
}: {
  channel: StreamChannel;
  myUserId: string;
  onAccept: (ch: StreamChannel) => void;
  onDecline: (ch: StreamChannel) => void;
}) {
  const members = Object.values(channel.state.members ?? {});
  // The inviter is the member who is NOT the current user and was never in an
  // invited state (they created / own the channel).  Stream Chat marks invited
  // members with invite_accepted_at / invite_rejected_at timestamps; the
  // creator's membership has neither, so filtering by their absence finds them.
  const inviter = members.find((m: any) =>
    m.user_id !== myUserId &&
    !m.invite_accepted_at &&
    !m.invite_rejected_at &&
    !m.invited
  ) ?? members.find((m: any) => m.user_id !== myUserId); // fallback: any non-self member
  const inviterName: string = (inviter as any)?.user?.name ?? 'Someone';
  return (
    <div
      className="fixed inset-x-4 top-20 z-[150] bg-card border border-amber-500/30 rounded-2xl shadow-2xl p-4 flex items-center gap-3 animate-in slide-in-from-top-4 duration-300"
      style={{ boxShadow: '0 0 0 1px rgba(251,191,36,0.15), 0 12px 40px rgba(0,0,0,0.5)' }}
    >
      <div className="w-12 h-12 rounded-full bg-amber-500/15 flex items-center justify-center shrink-0">
        <span className="text-xl font-bold text-amber-400">{inviterName.slice(0, 1).toUpperCase()}</span>
      </div>
      <div className="flex-1 min-w-0">
        <p className="font-bold text-sm truncate">{inviterName}</p>
        <p className="text-xs text-muted-foreground">wants to chat with you</p>
      </div>
      <button onClick={() => onDecline(channel)} className="w-11 h-11 bg-muted hover:bg-muted/60 rounded-full flex items-center justify-center shrink-0 transition-colors" title="Decline">
        <UserX className="w-4 h-4 text-muted-foreground" />
      </button>
      <button onClick={() => onAccept(channel)} className="w-11 h-11 bg-emerald-500 hover:bg-emerald-600 rounded-full flex items-center justify-center shrink-0 transition-colors" title="Accept">
        <UserCheck className="w-4 h-4 text-white" />
      </button>
    </div>
  );
}

/* ─── inner component (needs Chat ctx) ─── */
function ChatInner({
  streamData,
  onStartCall,
  onNewChat,
  setActiveChannelRef,
  contacts,
  contactPresence,
  onAddContact,
  onRemoveContact,
  onRequestChat,
}: {
  streamData: StreamData;
  onStartCall: (type: 'audio' | 'video', ch: StreamChannel) => void;
  onNewChat: () => void;
  setActiveChannelRef: React.MutableRefObject<((ch: StreamChannel | undefined) => void) | null>;
  contacts: ContactEntry[];
  contactPresence: Record<string, boolean>;
  onAddContact: (user: SUser) => Promise<void>;
  onRemoveContact: (streamUserId: string) => Promise<void>;
  onRequestChat: (user: SUser) => void;
}) {
  const { client, channel: activeChannel, setActiveChannel } = useChatContext();
  const [tick, setTick] = useState(0);
  // In-app flash: { name, text } shown for 3 s when a message arrives in a background channel
  const [msgFlash, setMsgFlash] = useState<{ name: string; text: string } | null>(null);
  const flashTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Pending chat invites — channels where the current user was invited but hasn't accepted yet
  const [pendingInvites, setPendingInvites] = useState<StreamChannel[]>([]);

  useEffect(() => {
    setActiveChannelRef.current = setActiveChannel as any;
  }, [setActiveChannel, setActiveChannelRef]);

  // Auto-save whichever channel is active (covers onSelect, startChat, acceptInvite, etc.)
  useEffect(() => {
    if (activeChannel) {
      _lastChannelId   = (activeChannel as any).id   ?? null;
      _lastChannelType = (activeChannel as any).type  ?? 'messaging';
    }
  }, [activeChannel]);

  // On mount: fetch pending invites first.
  // Invites take priority — only restore the previous channel if there are none.
  // This prevents the channel restore from hiding the "Chat Requests" section
  // when the user has an unread invite waiting for them.
  useEffect(() => {
    const restoreLastChannel = () => {
      if (!_lastChannelId) return;
      const ch = client.channel(_lastChannelType, _lastChannelId);
      ch.watch().then(() => setActiveChannel(ch as any)).catch(() => {});
    };

    client.queryChannels(
      { invites: 'pending', type: 'messaging' } as any,
      [{ created_at: -1 }],
      { limit: 20, watch: true, state: true },
    ).then((chs: any) => {
      const list: StreamChannel[] = Array.isArray(chs) ? chs : chs?.channels ?? [];
      setPendingInvites(list);
      // Only restore last channel when there are no pending invites to review
      if (list.length === 0) restoreLastChannel();
    }).catch(() => {
      // If the invite query fails, still try to restore the last channel
      restoreLastChannel();
    });
  }, [client]); // eslint-disable-line react-hooks/exhaustive-deps

  // Listen for incoming invites and invite status changes
  useEffect(() => {
    const onInvited = (event: any) => {
      const cid = event.channel?.cid;
      if (!cid) return;
      // Watch the channel to get full state then add to pending list
      client.queryChannels({ cid }, [], { limit: 1, watch: true, state: true })
        .then(([ch]) => {
          if (ch) {
            setPendingInvites(prev => [ch, ...prev.filter(c => c.cid !== ch.cid)]);
            // Browser notification for the invite
            const inviterName = event.member?.user?.name ?? 'Someone';
            if ('Notification' in window && Notification.permission === 'granted') {
              try {
                new Notification(inviterName, {
                  body: 'wants to start a chat with you',
                  icon: '/icons/icon-192.png',
                  badge: '/icons/icon-192.png',
                  tag: `invite-${cid}`,
                  silent: false,
                });
              } catch { /* ignore */ }
            }
            playMessageNotification();
            window.dispatchEvent(new CustomEvent('nivio:unread', { detail: 1 }));
          }
        }).catch(() => {});
    };

    const onMemberUpdated = (event: any) => {
      // Remove from pending if current user accepted or rejected
      if (event.member?.user_id === streamData.userId) {
        const accepted = !!(event.member as any)?.invite_accepted_at;
        const rejected = !!(event.member as any)?.invite_rejected_at;
        if (accepted || rejected) {
          setPendingInvites(prev => prev.filter(c => c.cid !== event.cid));
        }
      }
      setTick(t => t + 1); // refresh channel items so invite state re-renders
    };

    client.on('notification.invited', onInvited);
    client.on('member.updated', onMemberUpdated);
    return () => {
      client.off('notification.invited', onInvited);
      client.off('member.updated', onMemberUpdated);
    };
  }, [client, streamData.userId]);

  const acceptInvite = async (ch: StreamChannel) => {
    try {
      await ch.acceptInvite();
      setPendingInvites(prev => prev.filter(c => c.cid !== ch.cid));
      setActiveChannel(ch as any);
      setTick(t => t + 1);
    } catch { /* ignore */ }
  };

  const declineInvite = async (ch: StreamChannel) => {
    try {
      await ch.rejectInvite();
      setPendingInvites(prev => prev.filter(c => c.cid !== ch.cid));
    } catch { /* ignore */ }
  };

  // New message: sound + browser notification + in-app flash
  useEffect(() => {
    const handler = (event: any) => {
      const isFromOther = event.message?.user?.id !== streamData.userId;
      if (isFromOther) {
        playMessageNotification();

        const senderName: string = event.message?.user?.name ?? 'New message';
        const preview: string = event.message?.text
          ?? (event.message?.attachments?.length ? '📎 Attachment' : 'Sent you a message');

        // Browser / PWA notification (works when app is backgrounded or screen is off)
        if ('Notification' in window && Notification.permission === 'granted') {
          try {
            new Notification(senderName, {
              body: preview.length > 80 ? preview.slice(0, 77) + '…' : preview,
              icon: '/icons/icon-192.png',
              badge: '/icons/icon-192.png',
              tag: String(event.channel_id ?? ''),   // collapses dupes from same chat
              silent: true,                           // we handle sound ourselves
            });
          } catch { /* Safari may block non-HTTPS contexts */ }
        }

        // In-app flash banner when the message is NOT in the currently open channel
        if (event.channel_id !== (activeChannel as any)?.id) {
          if (flashTimerRef.current) clearTimeout(flashTimerRef.current);
          setMsgFlash({ name: senderName, text: preview.length > 50 ? preview.slice(0, 47) + '…' : preview });
          flashTimerRef.current = setTimeout(() => setMsgFlash(null), 3500);
        }

        // Update the chat FAB unread badge (listened to in app-layout.tsx)
        const totalUnread = (client.user as any)?.total_unread_count ?? 1;
        window.dispatchEvent(new CustomEvent('nivio:unread', { detail: totalUnread }));
      }
      setTick(t => t + 1);
    };
    client.on('message.new', handler);
    return () => {
      client.off('message.new', handler);
      if (flashTimerRef.current) clearTimeout(flashTimerRef.current);
    };
  }, [client, streamData.userId, activeChannel]);

  // "Add user" search — queries Stream API, shows results with Add Contact / Chat buttons
  const [addUserQuery, setAddUserQuery] = useState('');
  const [addUserResults, setAddUserResults] = useState<SUser[]>([]);
  const [addingId, setAddingId] = useState<string | null>(null); // contact being added (loading state)
  const [expandedContactId, setExpandedContactId] = useState<string | null>(null);
  const [contactsExpanded, setContactsExpanded] = useState(true);

  useEffect(() => {
    if (!addUserQuery.trim()) { setAddUserResults([]); return; }
    const tid = setTimeout(() => {
      const token = localStorage.getItem('nivio_token');
      fetch(`${API}/stream/users/search?q=${encodeURIComponent(addUserQuery)}`, {
        headers: { Authorization: `Bearer ${token}` },
      }).then(r => r.json()).then(d => setAddUserResults(d.users ?? [])).catch(() => {});
    }, 300);
    return () => clearTimeout(tid);
  }, [addUserQuery]);

  const channelFilters = { type: 'messaging', members: { $in: [streamData.userId] } };
  // Secondary sort by created_at so brand-new channels (no messages yet) still appear at top
  const channelSort = [{ last_message_at: -1 }, { created_at: -1 }] as const;
  const channelOptions = { limit: 50, state: true, presence: true, watch: true, message_limit: 1 };

  return (
    <div className="flex flex-col h-full overflow-hidden">

      {/* ── In-app message flash banner ── */}
      {msgFlash && (
        <div
          className="absolute top-2 inset-x-3 z-50 flex items-center gap-3 px-4 py-3 rounded-2xl border border-primary/30 bg-card/95 backdrop-blur-md shadow-xl shadow-black/30 animate-in slide-in-from-top-3 duration-300"
          style={{ boxShadow: '0 0 0 1px rgba(45,212,191,0.12), 0 8px 32px rgba(0,0,0,0.4)' }}
        >
          <div className="w-8 h-8 rounded-full bg-primary/20 flex items-center justify-center shrink-0">
            <Bell className="w-3.5 h-3.5 text-primary animate-pulse" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-xs font-bold text-foreground truncate">{msgFlash.name}</p>
            <p className="text-[11px] text-muted-foreground truncate">{msgFlash.text}</p>
          </div>
          <button onClick={() => setMsgFlash(null)} className="text-muted-foreground hover:text-foreground shrink-0">
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {!activeChannel ? (
        /* ── channel list ── */
        <div className="flex flex-col h-full">
          {/* header */}
          <div className="px-4 pt-3 pb-2 border-b border-border/40 shrink-0 space-y-2.5">
            <div className="flex items-center justify-between">
              <div>
                <h1 className="text-lg font-bold">Messages</h1>
                <p className="text-xs text-muted-foreground">Chats &amp; Groups</p>
              </div>
              <Button size="sm" className="gap-1.5 h-8 text-xs" onClick={onNewChat}>
                <Plus className="w-3.5 h-3.5" /> New Chat
              </Button>
            </div>
            {/* "Add user" search — finds people to add as contacts */}
            <div className="relative">
              <UserPlus className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground pointer-events-none" />
              <Input
                className="pl-8 h-9 text-sm rounded-xl bg-muted/40 border-border/30 focus-visible:border-primary/40 focus-visible:ring-primary/10"
                placeholder="Add user"
                value={addUserQuery}
                onChange={e => setAddUserQuery(e.target.value)}
              />
              {addUserQuery && (
                <button
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  onClick={() => { setAddUserQuery(''); setAddUserResults([]); }}
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>

            {/* Search results dropdown */}
            {addUserResults.length > 0 && (
              <div className="mt-1 rounded-xl border border-border/40 bg-card shadow-lg overflow-hidden">
                {addUserResults.map(u => {
                  const isContact = contacts.some(c => c.streamUserId === u.id);
                  return (
                    <div key={u.id} className="flex items-center gap-3 px-3 py-2.5 border-b border-border/20 last:border-0 hover:bg-muted/20 transition-colors">
                      <Avatar className="w-8 h-8 shrink-0">
                        <AvatarFallback className="text-[10px] bg-primary/20 text-primary font-bold">
                          {(u.name ?? u.id).slice(0, 2).toUpperCase()}
                        </AvatarFallback>
                      </Avatar>
                      <p className="flex-1 text-sm font-medium truncate">{u.name ?? u.id}</p>
                      <button
                        disabled={isContact || addingId === u.id}
                        onClick={async () => {
                          setAddingId(u.id);
                          await onAddContact(u);
                          setAddingId(null);
                          setAddUserQuery('');
                          setAddUserResults([]);
                        }}
                        className={cn(
                          'shrink-0 flex items-center gap-1 text-[11px] font-semibold px-2.5 py-1 rounded-lg transition-colors',
                          isContact
                            ? 'bg-muted text-muted-foreground cursor-default'
                            : 'bg-primary/15 text-primary hover:bg-primary/25 border border-primary/20',
                        )}
                      >
                        {addingId === u.id ? (
                          <span className="w-3 h-3 border border-primary/40 border-t-primary rounded-full animate-spin" />
                        ) : (
                          <UserPlus className="w-3 h-3" />
                        )}
                        {isContact ? 'Added' : 'Add'}
                      </button>
                    </div>
                  );
                })}
              </div>
            )}

            {/* empty search state */}
            {addUserQuery.trim() && addUserResults.length === 0 && (
              <p className="mt-1 text-center text-xs text-muted-foreground py-2">No users found</p>
            )}

            {/* ── Contacts panel — premium card below search bar ── */}
            {contacts.length > 0 && (
              <div
                className="mt-1 rounded-2xl overflow-hidden"
                style={{
                  background: 'linear-gradient(135deg, rgba(45,212,191,0.06) 0%, rgba(20,184,166,0.03) 100%)',
                  border: '1px solid rgba(45,212,191,0.15)',
                  boxShadow: '0 2px 16px rgba(0,0,0,0.25), inset 0 1px 0 rgba(255,255,255,0.04)',
                }}
              >
                {/* header row */}
                <button
                  onClick={() => setContactsExpanded(e => !e)}
                  className="w-full flex items-center justify-between px-3.5 py-2.5 hover:bg-white/[0.03] transition-colors"
                >
                  <span className="flex items-center gap-2">
                    <span
                      className="w-5 h-5 rounded-full flex items-center justify-center shrink-0"
                      style={{ background: 'rgba(45,212,191,0.15)' }}
                    >
                      <Users className="w-2.5 h-2.5 text-primary" />
                    </span>
                    <span className="text-[11px] font-semibold text-foreground/80 tracking-wide">Contacts</span>
                    <span className="text-[10px] text-muted-foreground/60">
                      {contacts.filter(c => contactPresence[c.streamUserId]).length} online
                    </span>
                  </span>
                  {contactsExpanded
                    ? <ChevronUp className="w-3 h-3 text-muted-foreground/50" />
                    : <ChevronDown className="w-3 h-3 text-muted-foreground/50" />}
                </button>

                {contactsExpanded && (
                  <div className="max-h-48 overflow-y-auto overscroll-contain divide-y divide-white/[0.04]">
                    {contacts.map(c => {
                      const online = contactPresence[c.streamUserId] ?? false;
                      const busy   = contactPresence[`busy_${c.streamUserId}`] ?? false;
                      const dotCls = busy ? 'bg-amber-400' : online ? 'bg-emerald-400' : 'bg-zinc-500';
                      const statusLabel = busy ? 'Busy' : online ? 'Online' : 'Offline';
                      const isExpanded = expandedContactId === c.streamUserId;

                      return (
                        <div key={c.streamUserId}>
                          <button
                            onClick={() => setExpandedContactId(isExpanded ? null : c.streamUserId)}
                            className="w-full flex items-center gap-3 px-3.5 py-2.5 hover:bg-white/[0.04] active:bg-white/[0.06] transition-colors text-left"
                          >
                            <div className="relative shrink-0">
                              <Avatar className="w-8 h-8">
                                <AvatarFallback
                                  className="text-[10px] font-bold"
                                  style={{ background: 'linear-gradient(135deg,rgba(45,212,191,0.25),rgba(20,184,166,0.12))', color: '#2dd4bf' }}
                                >
                                  {c.name.slice(0, 2).toUpperCase()}
                                </AvatarFallback>
                              </Avatar>
                              <span className={`absolute bottom-0 right-0 w-2.5 h-2.5 rounded-full border-2 border-background ${dotCls}`} />
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-medium leading-tight truncate text-foreground/90">{c.name}</p>
                              <p className="text-[10px] text-muted-foreground/70">{statusLabel}</p>
                            </div>
                            <button
                              onClick={e => { e.stopPropagation(); onRemoveContact(c.streamUserId); }}
                              className="p-1 rounded-full text-muted-foreground/30 hover:text-destructive/70 hover:bg-destructive/10 transition-colors shrink-0"
                              title="Remove"
                            >
                              <X className="w-3 h-3" />
                            </button>
                          </button>

                          {/* expanded: "Request for Chat" */}
                          {isExpanded && (
                            <div className="px-3.5 pb-3 pt-1 flex items-center gap-2">
                              <Button
                                size="sm"
                                className="h-8 text-xs gap-1.5 rounded-xl font-semibold flex-1 transition-all active:scale-[0.97]"
                                style={{
                                  background: 'linear-gradient(135deg,rgba(45,212,191,0.18),rgba(20,184,166,0.10))',
                                  border: '1px solid rgba(45,212,191,0.25)',
                                  color: '#2dd4bf',
                                  boxShadow: '0 2px 8px rgba(45,212,191,0.12)',
                                }}
                                onClick={() => {
                                  setExpandedContactId(null);
                                  onRequestChat({ id: c.streamUserId, name: c.name });
                                }}
                              >
                                <MessageSquare className="w-3.5 h-3.5" />
                                Request for Chat
                              </Button>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}
          </div>

          <div className="flex-1 overflow-y-auto overscroll-contain pb-2">

            {/* ── Pending chat requests — rendered from state, not from ChannelList.
                 ChannelList uses members:$in which only returns full members; pending
                 invitees are not full members, so they never appear in that array.
                 pendingInvites is populated by queryChannels({invites:'pending'}) +
                 notification.invited events, so it always has the right data. ── */}
            {pendingInvites.length > 0 && (
              <div>
                <p className="px-4 pt-3 pb-1 text-[10px] font-semibold tracking-widest text-amber-400 uppercase">
                  Chat Requests
                </p>
                {pendingInvites.map(ch => {
                  const members = Object.values(ch.state.members ?? {}) as any[];
                  // The inviter is any member who is not the current user
                  const inviter = members.find((m: any) => m.user_id !== streamData.userId);
                  const inviterName: string = inviter?.user?.name ?? 'Someone';
                  const chName: string = (ch.data as any)?.name ?? inviterName;
                  return (
                    <div key={ch.cid} className="mx-2 mb-2 rounded-2xl border border-amber-500/20 bg-amber-500/5 p-3 flex items-center gap-3">
                      <div className="w-10 h-10 rounded-full bg-amber-500/15 flex items-center justify-center shrink-0">
                        <span className="text-sm font-bold text-amber-400">{inviterName.slice(0, 2).toUpperCase()}</span>
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold truncate">{chName}</p>
                        <p className="text-[11px] text-muted-foreground">wants to chat with you</p>
                      </div>
                      <button
                        onClick={() => declineInvite(ch)}
                        className="w-8 h-8 rounded-full bg-muted/60 hover:bg-muted flex items-center justify-center shrink-0 transition-colors"
                        title="Decline"
                      >
                        <UserX className="w-3.5 h-3.5 text-muted-foreground" />
                      </button>
                      <button
                        onClick={() => acceptInvite(ch)}
                        className="w-8 h-8 rounded-full bg-emerald-500 hover:bg-emerald-600 flex items-center justify-center shrink-0 transition-colors"
                        title="Accept"
                      >
                        <UserCheck className="w-3.5 h-3.5 text-white" />
                      </button>
                    </div>
                  );
                })}
                <p className="px-4 pt-2 pb-1 text-[10px] font-semibold tracking-widest text-muted-foreground uppercase">Messages</p>
              </div>
            )}

            <ChannelList
              filters={channelFilters}
              sort={channelSort}
              options={channelOptions}
              setActiveChannelOnMount={false}
              renderChannels={(channels: StreamChannel[]) => {
                // Show empty state only when there are no pending invites either
                if (channels.length === 0 && pendingInvites.length === 0) {
                  return (
                    <div className="flex flex-col items-center justify-center py-16 gap-4 px-6 text-center">
                      <div className="w-16 h-16 bg-primary/10 rounded-full flex items-center justify-center">
                        <MessageSquare className="w-8 h-8 text-primary" />
                      </div>
                      <div>
                        <p className="font-semibold">No chats yet</p>
                        <p className="text-sm text-muted-foreground mt-1">Search above to add contacts, then request a chat</p>
                      </div>
                    </div>
                  );
                }

                return (
                  <>
                    {channels.map((ch) => (
                      <ChannelItem
                        key={ch.cid}
                        channel={ch}
                        active={ch.cid === (activeChannel as any)?.cid}
                        myUserId={streamData.userId}
                        tick={tick}
                        onSelect={() => {
                          setActiveChannel(ch);
                          // Persist so the channel is restored after navigation
                          _lastChannelId   = ch.id   ?? null;
                          _lastChannelType = ch.type  ?? 'messaging';
                          ch.markRead?.().catch(() => {});
                        }}
                      />
                    ))}
                  </>
                );
              }}
            />

          </div>
        </div>
      ) : (
        /* ── active channel ── */
        <Channel channel={activeChannel}>
          {/*
           * Layout is controlled by customClasses.channel on <Chat> above,
           * which replaces str-chat__channel's default flex-row with flex-col.
           */}

          {/* ── channel header ── */}
          <div className="flex items-center gap-3 px-3 py-2.5 border-b border-border/40 shrink-0 bg-background">
            <button
              onClick={() => (setActiveChannel as any)(undefined)}
              className="text-muted-foreground hover:text-foreground transition-colors p-1 shrink-0"
            >
              <ArrowLeft className="w-5 h-5" />
            </button>
            <Avatar className="w-9 h-9 shrink-0">
              <AvatarFallback className="bg-primary/20 text-primary font-bold text-sm">
                {((activeChannel.data as any)?.name ?? 'C').slice(0, 2).toUpperCase()}
              </AvatarFallback>
            </Avatar>
            <div className="flex-1 min-w-0">
              <p className="font-semibold text-sm truncate">
                {(activeChannel.data as any)?.name ?? 'Chat'}
              </p>
              <p className="text-[11px] text-muted-foreground">
                {Object.keys(activeChannel.state?.members ?? {}).length} members
              </p>
            </div>
            <div className="flex items-center gap-0.5 shrink-0">
              <Button
                size="icon" variant="ghost"
                className="w-10 h-10 rounded-full text-muted-foreground hover:text-foreground hover:bg-primary/10"
                title="Audio call"
                onClick={() => onStartCall('audio', activeChannel)}
              >
                <Phone className="w-4 h-4" />
              </Button>
              <Button
                size="icon" variant="ghost"
                className="w-10 h-10 rounded-full text-muted-foreground hover:text-foreground hover:bg-primary/10"
                title="Video call"
                onClick={() => onStartCall('video', activeChannel)}
              >
                <Video className="w-4 h-4" />
              </Button>
            </div>
          </div>

          {/* ── invite state awareness ── */}
          {(() => {
            const myMembership = (activeChannel.state.members ?? {})[streamData.userId] as any;
            const iAmInvited = myMembership?.invited && !myMembership?.invite_accepted_at && !myMembership?.invite_rejected_at;

            const allMembers = Object.values(activeChannel.state.members ?? {}) as any[];
            const pendingInvitees = allMembers.filter(m =>
              m.user_id !== streamData.userId && m.invited && !m.invite_accepted_at && !m.invite_rejected_at
            );
            const isWaitingForAcceptance = !iAmInvited && pendingInvitees.length > 0;

            if (iAmInvited) {
              // ── User B: accept or decline the invitation ──
              const inviterMember = allMembers.find(m => m.user_id !== streamData.userId && !m.invited);
              const inviterName: string = inviterMember?.user?.name ?? 'Someone';
              return (
                <div className="flex flex-col flex-1 items-center justify-center gap-5 px-6 text-center">
                  <div className="w-20 h-20 rounded-full bg-amber-500/10 border border-amber-500/20 flex items-center justify-center">
                    <span className="text-3xl font-bold text-amber-400">{inviterName.slice(0, 1).toUpperCase()}</span>
                  </div>
                  <div>
                    <p className="font-bold text-lg">{inviterName}</p>
                    <p className="text-sm text-muted-foreground mt-1">wants to start a chat with you</p>
                  </div>
                  <p className="text-xs text-muted-foreground max-w-[260px]">
                    Accept to begin messaging. If you decline, this request will be removed.
                  </p>
                  <div className="flex items-center gap-3">
                    <Button
                      variant="outline"
                      className="gap-2 border-border/50 hover:border-destructive/40 hover:text-destructive hover:bg-destructive/5"
                      onClick={() => declineInvite(activeChannel)}
                    >
                      <UserX className="w-4 h-4" />
                      Decline
                    </Button>
                    <Button
                      className="gap-2 bg-emerald-500 hover:bg-emerald-600 text-white"
                      onClick={() => acceptInvite(activeChannel)}
                    >
                      <UserCheck className="w-4 h-4" />
                      Accept
                    </Button>
                  </div>
                </div>
              );
            }

            if (isWaitingForAcceptance) {
              // ── User A: waiting for B to accept ──
              const inviteeName: string = pendingInvitees[0]?.user?.name ?? 'them';
              return (
                <div className="flex flex-col flex-1 items-center justify-center gap-5 px-6 text-center">
                  <div className="w-20 h-20 rounded-full bg-primary/10 border border-primary/20 flex items-center justify-center">
                    <Clock className="w-8 h-8 text-primary animate-pulse" />
                  </div>
                  <div>
                    <p className="font-bold text-base">Waiting for {inviteeName}</p>
                    <p className="text-sm text-muted-foreground mt-1">
                      Your chat request has been sent. You can start messaging once they accept.
                    </p>
                  </div>
                  <p className="text-xs text-muted-foreground/70">
                    {inviteeName} will see your request in their Messages tab.
                  </p>
                </div>
              );
            }

            // ── Normal: both users are full members ──
            return (
              <div className="flex flex-col flex-1 min-h-0 overflow-hidden w-full">
                <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain">
                  <MessageList />
                </div>
                {/* Composer + visible emoji button */}
                <div className="shrink-0 w-full border-t border-border/20">
                  <div className="flex items-center px-3 pt-2 pb-0.5">
                    <StreamEmojiPicker />
                    <span className="ml-2 text-[11px] text-muted-foreground/50">emoji</span>
                  </div>
                  <MessageComposer
                    additionalTextareaProps={{ placeholder: 'Message…' }}
                    audioRecordingEnabled
                    emojiSearchIndex={SearchIndex}
                  />
                </div>
              </div>
            );
          })()}
        </Channel>
      )}

      {/* ── Floating invite banners (one per pending invite, stacked) ── */}
      {pendingInvites
        .filter(ch => !(activeChannel && ch.cid === activeChannel.cid)) // don't double-show if channel is open
        .slice(0, 2) // show at most 2 banners at a time
        .map((ch, i) => (
          <div key={ch.cid} style={{ transform: `translateY(${i * 88}px)` }}>
            <InviteRequestBanner
              channel={ch}
              myUserId={streamData.userId}
              onAccept={acceptInvite}
              onDecline={declineInvite}
            />
          </div>
        ))
      }
    </div>
  );
}

/* ─── connected page — uses persistent clients from context providers ─── */
function ChatConnected() {
  const { streamData: _sd, chatClient } = useStreamChat();
  const streamData = _sd!; // guaranteed by ChatPage guard
  const streamVideo = useStreamVideo();
  const { toast } = useToast();
  const setActiveChannelRef = useRef<((ch: any) => void) | null>(null);

  // ── contacts list (persistent, stored in DB) ──
  const [contacts, setContacts] = useState<ContactEntry[]>([]);
  // contactPresence: streamUserId → online boolean (from Stream presence API)
  const [contactPresence, setContactPresence] = useState<Record<string, boolean>>({});

  // new-chat dialog
  const [showNewChat, setShowNewChat] = useState(false);
  const [isGroup, setIsGroup] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<SUser[]>([]);
  const [selectedUsers, setSelectedUsers] = useState<SUser[]>([]);
  const [groupName, setGroupName] = useState('');
  const [creating, setCreating] = useState(false);

  /* request browser notification permission (delayed so it doesn't fire on first paint) */
  useEffect(() => {
    if ('Notification' in window && Notification.permission === 'default') {
      const tid = setTimeout(() => Notification.requestPermission(), 2500);
      return () => clearTimeout(tid);
    }
    return undefined;
  }, []);

  /* load contacts from DB + fetch presence from Stream */
  useEffect(() => {
    if (!chatClient) return;
    const token = localStorage.getItem('nivio_token');
    fetch(`${API}/contacts`, { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.json())
      .then(async (d) => {
        const list: ContactEntry[] = d.contacts ?? [];
        setContacts(list);
        if (list.length === 0) return;
        // Query Stream for real-time presence data for all contacts
        try {
          const result = await chatClient.queryUsers(
            { id: { $in: list.map(c => c.streamUserId) } },
            {},
            { presence: true },
          );
          const pm: Record<string, boolean> = {};
          for (const u of result.users) pm[u.id] = (u as any).online ?? false;
          setContactPresence(pm);
        } catch { /* non-fatal */ }
      })
      .catch(() => {});
  }, [chatClient]);

  /* real-time presence updates for contacts */
  useEffect(() => {
    if (!chatClient) return;
    const handler = (event: any) => {
      const uid: string | undefined = event.user?.id;
      if (uid) setContactPresence(prev => ({ ...prev, [uid]: event.user?.online ?? false }));
    };
    chatClient.on('user.presence.changed', handler);
    return () => chatClient.off('user.presence.changed', handler);
  }, [chatClient]);

  /* add a user to the contacts list */
  const addContact = useCallback(async (user: SUser) => {
    const token = localStorage.getItem('nivio_token');
    try {
      const r = await fetch(`${API}/contacts`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ contactUserId: user.id }),
      });
      const d = await r.json();
      if (r.ok) {
        const newEntry: ContactEntry = { id: d.contact?.id ?? Date.now(), streamUserId: user.id, name: user.name ?? user.id };
        setContacts(prev => prev.some(c => c.streamUserId === user.id) ? prev : [...prev, newEntry]);
        toast({ title: `${user.name ?? 'User'} added to contacts` });
        // Fetch their presence
        if (chatClient) {
          chatClient.queryUsers({ id: { $in: [user.id] } }, {}, { presence: true })
            .then(res => { const u = res.users[0]; if (u) setContactPresence(p => ({ ...p, [u.id]: (u as any).online ?? false })); })
            .catch(() => {});
        }
      } else {
        toast({ title: d.error ?? 'Could not add contact', variant: 'destructive' });
      }
    } catch {
      toast({ title: 'Could not add contact', variant: 'destructive' });
    }
  }, [chatClient, toast]);

  /* remove a contact from the list */
  const removeContact = useCallback(async (streamUserId: string) => {
    const token = localStorage.getItem('nivio_token');
    try {
      await fetch(`${API}/contacts/${streamUserId}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });
      setContacts(prev => prev.filter(c => c.streamUserId !== streamUserId));
    } catch { /* ignore */ }
  }, []);

  /* start a 1-to-1 chat directly with a contact (from "Request for Chat" button) */
  const requestChatWith = useCallback((user: SUser) => {
    setSelectedUsers([user]);
    setIsGroup(false);
    setGroupName('');
    setShowNewChat(true);
  }, []);

  /* search users */
  useEffect(() => {
    if (!showNewChat || !searchQuery.trim()) { setSearchResults([]); return; }
    const tid = setTimeout(() => {
      const token = localStorage.getItem('nivio_token');
      fetch(`${API}/stream/users/search?q=${encodeURIComponent(searchQuery)}`, {
        headers: { Authorization: `Bearer ${token}` },
      })
        .then(r => r.json())
        .then(d => setSearchResults(d.users ?? []));
    }, 300);
    return () => clearTimeout(tid);
  }, [searchQuery, showNewChat]);

  const toggleUser = (u: SUser) =>
    setSelectedUsers(prev => prev.some(x => x.id === u.id) ? prev.filter(x => x.id !== u.id) : [...prev, u]);

  const startChat = async () => {
    if (!chatClient || selectedUsers.length === 0) return;
    setCreating(true);
    try {
      const inviteeIds = selectedUsers.map(u => u.id);

      // Query channels *the current user* is a member of, then search for an
      // existing match client-side.  Using the current user's own ID in the
      // filter avoids Stream Chat's server-side security rejection that occurs
      // when you filter by a third party's ID only.
      const rawExisting = await chatClient.queryChannels(
        { type: 'messaging', members: { $in: [streamData.userId] } },
        [{ last_message_at: -1 }],
        { limit: 50, state: true },
      );
      const existingList: StreamChannel[] = Array.isArray(rawExisting)
        ? rawExisting
        : (rawExisting as any)?.channels ?? [];

      // For 1-to-1 chats find a channel that has exactly these two members
      const match = !isGroup
        ? existingList.find(ch => {
            const memberIds = Object.keys(ch.state.members ?? {});
            return (
              memberIds.length === 2 &&
              inviteeIds.every(id => memberIds.includes(id)) &&
              memberIds.includes(streamData.userId)
            );
          })
        : undefined;

      if (match) {
        closeNewChat();
        setActiveChannelRef.current?.(match);
        return;
      }

      // Explicit channel ID avoids Stream's "≥2 members" rule for distinct channels
      const channelId = `ch-${streamData.userId}-${Date.now()}`;
      const ch = chatClient.channel('messaging', channelId, {
        ...(isGroup && groupName.trim() ? { name: groupName.trim() } : {}),
        members: [streamData.userId],
      });
      await ch.create();
      // Invite selected users — they must accept before messaging starts
      await ch.inviteMembers(inviteeIds);
      await ch.watch();
      closeNewChat();
      setActiveChannelRef.current?.(ch);
    } catch (err: any) {
      console.error('startChat error:', err);
      toast({
        title: 'Could not create chat',
        description: err?.message ?? 'Please try again',
        variant: 'destructive',
      });
    } finally {
      setCreating(false);
    }
  };

  const handleStartCall = useCallback(async (type: 'audio' | 'video', ch: StreamChannel) => {
    if (!streamVideo.videoClient) {
      toast({ title: 'Video not ready', description: 'Please wait a moment and try again.', variant: 'destructive' });
      return;
    }
    // Check the other user's calling preferences before dialling
    const members = Object.values(ch.state?.members ?? {}) as any[];
    const other = members.find((m: any) => m.user_id !== streamData?.userId);
    if (other?.user_id) {
      try {
        const authToken = localStorage.getItem('nivio_token');
        const prefs = await fetch(`${API}/user/calling-settings/${other.user_id}`, {
          headers: { Authorization: `Bearer ${authToken}` },
        }).then(r => r.json());
        if (!prefs.callsEnabled) {
          toast({ title: 'Calls not allowed', description: `${other.user?.name ?? 'This user'} has disabled calls.`, variant: 'destructive' });
          return;
        }
        if (type === 'video' && !prefs.videoCallsEnabled) {
          toast({ title: 'Video calls not allowed', description: `${other.user?.name ?? 'This user'} has disabled video calls.`, variant: 'destructive' });
          return;
        }
      } catch { /* allow the call if the preference check fails */ }
    }
    const callId = `nivio-${(ch.id ?? Date.now()).toString().replace(/[^a-zA-Z0-9_-]/g, '-')}`;
    const memberIds = Object.keys(ch.state?.members ?? {});
    try {
      await streamVideo.startCall(type, callId, memberIds);
    } catch (e: any) {
      const msg: string = e?.message ?? String(e);
      const isRegion = msg.toLowerCase().includes('country') || msg.toLowerCase().includes('region') || msg.toLowerCase().includes('geo');
      toast({
        title: isRegion ? 'Not available in your region' : 'Call failed',
        description: isRegion ? 'Video and audio calls are not supported in your country.' : msg,
        variant: 'destructive',
      });
    }
  }, [streamVideo, streamData?.userId, toast]);

  const closeNewChat = () => {
    setShowNewChat(false);
    setSelectedUsers([]); setSearchQuery(''); setGroupName(''); setIsGroup(false);
  };

  return (
    /*
     * Mobile layout:  100dvh minus sticky header (56px) minus fixed bottom nav (56px).
     * Using 100dvh (dynamic) means the box shrinks when the virtual keyboard opens,
     * keeping the composer pinned just above the keyboard instead of hidden under it.
     * Desktop: h-full works fine — no fixed nav, no sticky header offset.
     */
    <div className="flex flex-col overflow-hidden md:h-full h-[calc(100dvh-56px-56px)]">
      {/* IncomingCallBanner and activeCall overlay are rendered inside AppLayout
          (via CallOverlay) so they work from any page — not just /chat. */}

      <Chat
        client={chatClient!}
        theme="str-chat__theme-dark"
        customClasses={{
          // Channel's outer container — keep the class so theme CSS vars apply,
          // force column so header + messages stack vertically.
          channel: 'str-chat__channel !flex !flex-col flex-1 min-h-0 overflow-hidden',
          // ChannelInner wraps children in .str-chat__container which defaults to
          // flex-direction:row — the real cause of the side-by-side layout bug.
          // Override it to column here (CSS rule in stream-theme.css is the backup).
          chatContainer: 'str-chat__container !flex !flex-col flex-1 min-h-0 overflow-hidden w-full',
        }}
      >
        <ChatInner
          streamData={streamData}
          onStartCall={handleStartCall}
          onNewChat={() => setShowNewChat(true)}
          setActiveChannelRef={setActiveChannelRef}
          contacts={contacts}
          contactPresence={contactPresence}
          onAddContact={addContact}
          onRemoveContact={removeContact}
          onRequestChat={requestChatWith}
        />
      </Chat>

      {/* ── Premium New Chat / New Group dialog ── */}
      <Dialog open={showNewChat} onOpenChange={(o) => { if (!o) closeNewChat(); }}>
        <DialogContent className="max-w-sm p-0 gap-0 overflow-hidden border border-white/8 shadow-2xl shadow-black/60 rounded-2xl">

          {/* gradient header */}
          <div className="relative px-5 pt-6 pb-4 overflow-hidden"
            style={{ background: 'linear-gradient(135deg, rgba(45,212,191,0.12) 0%, rgba(20,184,166,0.06) 50%, transparent 100%)' }}>
            {/* top shimmer line */}
            <div className="absolute top-0 inset-x-0 h-px bg-gradient-to-r from-transparent via-primary/50 to-transparent" />

            {/* title + type toggle */}
            <div className="flex items-start justify-between mb-5">
              <div>
                <div className="flex items-center gap-2">
                  <Sparkles className="w-4 h-4 text-primary" />
                  <h2 className="text-lg font-bold tracking-tight">
                    {isGroup ? 'New Group' : 'New Message'}
                  </h2>
                </div>
                <p className="text-xs text-muted-foreground mt-0.5 ml-6">
                  {isGroup ? 'Create a group conversation' : 'Start a private conversation'}
                </p>
              </div>

              {/* DM / Group pill toggle */}
              <div className="flex items-center p-1 bg-black/30 rounded-xl gap-0.5 shrink-0 border border-white/8">
                <button
                  onClick={() => setIsGroup(false)}
                  className={cn(
                    'flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg font-medium transition-all duration-200',
                    !isGroup ? 'bg-primary text-black shadow shadow-primary/40' : 'text-muted-foreground hover:text-foreground',
                  )}
                >
                  <MessageSquare className="w-3 h-3" /> DM
                </button>
                <button
                  onClick={() => setIsGroup(true)}
                  className={cn(
                    'flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg font-medium transition-all duration-200',
                    isGroup ? 'bg-primary text-black shadow shadow-primary/40' : 'text-muted-foreground hover:text-foreground',
                  )}
                >
                  <Users className="w-3 h-3" /> Group
                </button>
              </div>
            </div>

            {/* group name */}
            {isGroup && (
              <Input
                placeholder="Group name…"
                value={groupName}
                onChange={e => setGroupName(e.target.value)}
                className="mb-3 h-10 rounded-xl bg-black/30 border-white/10 text-sm focus-visible:border-primary/60 focus-visible:ring-primary/20"
              />
            )}

            {/* search bar */}
            <div className="relative">
              <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
              <Input
                className="pl-10 h-11 rounded-xl bg-black/30 border-white/10 text-sm focus-visible:border-primary/60 focus-visible:ring-1 focus-visible:ring-primary/20"
                placeholder="Search by name or phone…"
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                autoFocus
              />
            </div>
          </div>

          {/* selected user chips */}
          {selectedUsers.length > 0 && (
            <div className="px-4 py-2.5 flex flex-wrap gap-2 border-y border-white/6 bg-primary/5">
              {selectedUsers.map(u => (
                <div key={u.id}
                  className="flex items-center gap-1.5 bg-primary/15 border border-primary/25 text-primary px-2.5 py-1 rounded-full text-xs font-semibold"
                >
                  <span className="w-4 h-4 bg-primary/30 rounded-full flex items-center justify-center text-[8px] font-bold">
                    {(u.name ?? u.id).slice(0, 1).toUpperCase()}
                  </span>
                  {u.name ?? u.id}
                  <button onClick={() => toggleUser(u)} className="ml-0.5 hover:text-destructive transition-colors">
                    <X className="w-3 h-3" />
                  </button>
                </div>
              ))}
            </div>
          )}

          {/* results list */}
          <div className="max-h-56 overflow-y-auto overscroll-contain">
            {searchResults.length > 0 ? (
              searchResults.map(u => {
                const sel = selectedUsers.some(x => x.id === u.id);
                return (
                  <button
                    key={u.id}
                    className={cn(
                      'w-full flex items-center gap-3.5 px-4 py-3 transition-colors text-left border-b border-white/5 last:border-0',
                      sel ? 'bg-primary/8' : 'hover:bg-white/4 active:bg-white/6',
                    )}
                    onClick={() => isGroup ? toggleUser(u) : setSelectedUsers([u])}
                  >
                    {/* avatar + online dot */}
                    <div className="relative shrink-0">
                      <Avatar className="w-11 h-11">
                        <AvatarFallback
                          className="font-bold text-sm"
                          style={{ background: 'linear-gradient(135deg, rgba(45,212,191,0.3), rgba(20,184,166,0.15))', color: '#2dd4bf' }}
                        >
                          {(u.name ?? u.id).slice(0, 2).toUpperCase()}
                        </AvatarFallback>
                      </Avatar>
                      <span className="absolute bottom-0 right-0 w-3 h-3 bg-emerald-400 rounded-full border-2 border-background ring-1 ring-emerald-400/30" />
                    </div>

                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-sm leading-tight">{u.name ?? u.id}</p>
                      <p className="text-[11px] text-muted-foreground mt-0.5">
                        {isGroup ? (sel ? '✓ Added to group' : 'Tap to add') : 'Tap to message'}
                      </p>
                    </div>

                    {/* checkbox */}
                    <div className={cn(
                      'w-6 h-6 rounded-full border-2 flex items-center justify-center transition-all duration-150 shrink-0',
                      sel ? 'bg-primary border-primary shadow shadow-primary/40' : 'border-white/20',
                    )}>
                      {sel && <Check className="w-3.5 h-3.5 text-black" />}
                    </div>
                  </button>
                );
              })
            ) : searchQuery.trim() ? (
              <div className="flex flex-col items-center justify-center py-10 gap-2 text-center px-4">
                <div className="w-10 h-10 bg-muted/40 rounded-full flex items-center justify-center">
                  <Search className="w-4 h-4 text-muted-foreground" />
                </div>
                <p className="text-sm font-medium">No users found</p>
                <p className="text-xs text-muted-foreground">Try a different name or phone number</p>
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center py-10 gap-2 text-center px-4">
                <div className="w-10 h-10 bg-primary/10 rounded-full flex items-center justify-center">
                  <Search className="w-4 h-4 text-primary/50" />
                </div>
                <p className="text-sm text-muted-foreground">Search for someone to connect with</p>
              </div>
            )}
          </div>

          {/* CTA */}
          <div className="p-4 border-t border-white/6 bg-black/20">
            <Button
              className="w-full h-12 font-semibold rounded-xl text-sm text-black disabled:opacity-40 transition-all duration-200 active:scale-[0.98]"
              style={{
                background: selectedUsers.length > 0 && !(isGroup && !groupName.trim())
                  ? 'linear-gradient(135deg, #2dd4bf, #14b8a6)'
                  : undefined,
                boxShadow: selectedUsers.length > 0 ? '0 4px 20px rgba(45,212,191,0.35)' : undefined,
              }}
              onClick={startChat}
              disabled={selectedUsers.length === 0 || creating || (isGroup && !groupName.trim())}
            >
              {creating ? (
                <span className="flex items-center gap-2">
                  <span className="w-4 h-4 border-2 border-black/30 border-t-black rounded-full animate-spin" />
                  Starting…
                </span>
              ) : isGroup ? (
                `Create Group${selectedUsers.length > 0 ? ` · ${selectedUsers.length} member${selectedUsers.length !== 1 ? 's' : ''}` : ''}`
              ) : (
                'Send Chat Request'
              )}
            </Button>
          </div>

        </DialogContent>
      </Dialog>
    </div>
  );
}

/* ─── page entry — reads persistent client from StreamChatProvider ─── */
export default function ChatPage() {
  const { streamData, chatClient } = useStreamChat();

  if (!streamData || !chatClient) {
    return (
      <div className="flex flex-col items-center justify-center h-full min-h-[60vh] gap-4">
        <div className="w-16 h-16 bg-primary/10 rounded-full flex items-center justify-center">
          <MessageSquare className="w-8 h-8 text-primary animate-pulse" />
        </div>
        <p className="text-sm text-muted-foreground">Connecting to chat…</p>
      </div>
    );
  }

  return <ChatConnected />;
}
