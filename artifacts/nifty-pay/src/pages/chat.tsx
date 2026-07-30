import '@/styles/stream-theme.css';

import { useState, useEffect, useRef, useCallback } from 'react';
import {
  Chat, Channel, ChannelList, MessageList, MessageComposer,
  useCreateChatClient, useChatContext,
} from 'stream-chat-react';
import {
  StreamVideo, StreamVideoClient, StreamCall,
  SpeakerLayout, CallControls, useCallStateHooks,
  CallingState, StreamTheme,
} from '@stream-io/video-react-sdk';
import type { Channel as StreamChannel } from 'stream-chat';
import { useToast } from '@/hooks/use-toast';
import { playMessageNotification, createRingtone } from '@/lib/sounds';
import {
  MessageSquare, Phone, Video, ArrowLeft, Plus, Users,
  Search, X, Check, PhoneCall, Sparkles, Bell,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { cn } from '@/lib/utils';

const API = `${import.meta.env.BASE_URL}api`;

interface StreamData { token: string; userId: string; userName: string; apiKey: string; }
interface SUser { id: string; name?: string; }

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

/* ─── call UI (inside StreamCall ctx) ─── */
function CallUI({ onEnd }: { onEnd: () => void }) {
  const { useCallCallingState } = useCallStateHooks();
  const state = useCallCallingState();
  useEffect(() => {
    if (state === CallingState.LEFT || state === CallingState.IDLE) onEnd();
  }, [state, onEnd]);
  return (
    <StreamTheme className="h-full">
      <SpeakerLayout />
      <CallControls onLeave={onEnd} />
    </StreamTheme>
  );
}

/* ─── incoming call banner ─── */
function IncomingCallBanner({ callerName, onAccept, onDecline }: { callerName: string; onAccept: () => void; onDecline: () => void }) {
  return (
    <div className="fixed inset-x-4 top-4 z-[100] bg-card border border-primary/30 rounded-2xl shadow-2xl p-4 flex items-center gap-3 animate-in slide-in-from-top-4 duration-300">
      <Avatar className="w-12 h-12 shrink-0">
        <AvatarFallback className="bg-primary/20 text-primary font-bold">{callerName.slice(0, 2).toUpperCase()}</AvatarFallback>
      </Avatar>
      <div className="flex-1 min-w-0">
        <p className="font-bold text-sm truncate">{callerName}</p>
        <p className="text-xs text-muted-foreground animate-pulse">Incoming call…</p>
      </div>
      <button onClick={onDecline} className="w-11 h-11 bg-destructive hover:bg-destructive/90 rounded-full flex items-center justify-center shrink-0 transition-colors">
        <PhoneCall className="w-4 h-4 text-white rotate-[135deg]" />
      </button>
      <button onClick={onAccept} className="w-11 h-11 bg-emerald-500 hover:bg-emerald-600 rounded-full flex items-center justify-center shrink-0 transition-colors">
        <PhoneCall className="w-4 h-4 text-white" />
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
}: {
  streamData: StreamData;
  onStartCall: (type: 'audio' | 'video', ch: StreamChannel) => void;
  onNewChat: () => void;
  setActiveChannelRef: React.MutableRefObject<((ch: StreamChannel | undefined) => void) | null>;
}) {
  const { client, channel: activeChannel, setActiveChannel } = useChatContext();
  const [tick, setTick] = useState(0);
  // In-app flash: { name, text } shown for 3 s when a message arrives in a background channel
  const [msgFlash, setMsgFlash] = useState<{ name: string; text: string } | null>(null);
  const flashTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    setActiveChannelRef.current = setActiveChannel as any;
  }, [setActiveChannel, setActiveChannelRef]);

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
      }
      setTick(t => t + 1);
    };
    client.on('message.new', handler);
    return () => {
      client.off('message.new', handler);
      if (flashTimerRef.current) clearTimeout(flashTimerRef.current);
    };
  }, [client, streamData.userId, activeChannel]);

  const channelFilters = { type: 'messaging', members: { $in: [streamData.userId] } };
  const channelSort = [{ last_message_at: -1 }] as const;
  const channelOptions = { limit: 30, state: true, presence: true, watch: true };

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
          <div className="flex items-center justify-between px-4 py-3 border-b border-border/40 shrink-0">
            <div>
              <h1 className="text-lg font-bold">Messages</h1>
              <p className="text-xs text-muted-foreground">Chats &amp; Groups</p>
            </div>
            <Button size="sm" className="gap-1.5 h-8 text-xs" onClick={onNewChat}>
              <Plus className="w-3.5 h-3.5" /> New Chat
            </Button>
          </div>
          <div className="flex-1 overflow-y-auto overscroll-contain pb-2">
            <ChannelList
              filters={channelFilters}
              sort={channelSort}
              options={channelOptions}
              setActiveChannelOnMount={false}
              renderChannels={(channels: StreamChannel[]) => {
                if (channels.length === 0) {
                  return (
                    <div className="flex flex-col items-center justify-center py-24 gap-4 px-6 text-center">
                      <div className="w-16 h-16 bg-primary/10 rounded-full flex items-center justify-center">
                        <MessageSquare className="w-8 h-8 text-primary" />
                      </div>
                      <div>
                        <p className="font-semibold">No chats yet</p>
                        <p className="text-sm text-muted-foreground mt-1">Tap &ldquo;New Chat&rdquo; to start a conversation</p>
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
                        active={ch.cid === activeChannel?.cid}
                        myUserId={streamData.userId}
                        tick={tick}
                        onSelect={() => {
                          setActiveChannel(ch);
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

          {/* ── messages + composer in a plain flex column ── */}
          <div className="flex flex-col flex-1 min-h-0 overflow-hidden w-full">
            <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain">
              <MessageList />
            </div>
            <div className="shrink-0 w-full">
              <MessageComposer
                additionalTextareaProps={{ placeholder: 'Message…' }}
                audioRecordingEnabled
              />
            </div>
          </div>
        </Channel>
      )}
    </div>
  );
}

/* ─── main page ─── */
export default function ChatPage() {
  const { toast } = useToast();
  const setActiveChannelRef = useRef<((ch: any) => void) | null>(null);
  const [streamData, setStreamData] = useState<StreamData | null>(null);
  const [videoClient, setVideoClient] = useState<StreamVideoClient | null>(null);
  const [activeCall, setActiveCall] = useState<any>(null);
  const [incomingCall, setIncomingCall] = useState<any>(null);
  const stopRingtoneRef = useRef<(() => void) | null>(null);

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
  }, []);

  /* fetch token */
  useEffect(() => {
    const token = localStorage.getItem('nivio_token');
    fetch(`${API}/stream/token`, { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.json())
      .then(setStreamData)
      .catch(() => toast({ title: 'Chat unavailable', variant: 'destructive' }));
  }, []);

  /* init chat client */
  const chatClient = useCreateChatClient({
    apiKey: streamData?.apiKey ?? '',
    tokenOrProvider: streamData?.token ?? '',
    userData: streamData
      ? { id: streamData.userId, name: streamData.userName }
      : { id: '__init__', name: '' },
  });

  /* init video client — uses a dedicated video token from @stream-io/node-sdk */
  useEffect(() => {
    if (!streamData) return;
    let cancelled = false;
    const authToken = localStorage.getItem('nivio_token');
    fetch(`${API}/stream/video-token`, { headers: { Authorization: `Bearer ${authToken}` } })
      .then(r => r.json())
      .then(({ token }: { token: string }) => {
        if (cancelled) return;
        const vc = new StreamVideoClient({
          apiKey: streamData.apiKey,
          user: { id: streamData.userId, name: streamData.userName },
          token,
        });
        setVideoClient(vc);
        vc.on('call.ring', (event: any) => {
          stopRingtoneRef.current?.();
          stopRingtoneRef.current = createRingtone('incoming');
          setIncomingCall(event.call);
        });
      })
      .catch((e) => {
        console.error('Video client init failed:', e);
      });
    return () => {
      cancelled = true;
      setVideoClient(prev => {
        prev?.disconnectUser().catch(() => {});
        return null;
      });
      stopRingtoneRef.current?.();
    };
  }, [streamData?.userId]);

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
      const members = [streamData!.userId, ...selectedUsers.map(u => u.id)];
      const ch = chatClient.channel('messaging', {
        members,
        ...(isGroup && groupName.trim() ? { name: groupName.trim() } : {}),
      });
      await ch.watch();
      closeNewChat();
      setActiveChannelRef.current?.(ch);
    } catch {
      toast({ title: 'Could not create chat', variant: 'destructive' });
    } finally {
      setCreating(false);
    }
  };

  const handleStartCall = useCallback(async (type: 'audio' | 'video', ch: StreamChannel) => {
    if (!videoClient) {
      toast({ title: 'Video not ready', description: 'Please wait a moment and try again.', variant: 'destructive' });
      return;
    }

    // Resolve the other member's Stream user ID (= their DB id as string)
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
      } catch {
        // If the check fails, allow the call to proceed rather than blocking
      }
    }

    stopRingtoneRef.current?.();
    stopRingtoneRef.current = createRingtone('outgoing');
    try {
      // Use a stable call ID per channel so retries rejoin the same call
      const callId = `nivio-${(ch.id ?? Date.now()).toString().replace(/[^a-zA-Z0-9_-]/g, '-')}`;
      const callType = type === 'audio' ? 'audio_room' : 'default';
      const call = videoClient.call(callType, callId);
      const memberIds = Object.keys(ch.state?.members ?? {});
      // Members must be passed at the top level for ringing to work in SDK v1
      await call.getOrCreate({
        ring: true,
        members_limit: memberIds.length + 1,
        data: {
          members: memberIds.map(id => ({ user_id: id })),
          settings_override: {
            audio: { default_device: type === 'audio' ? 'speaker' : 'earpiece', noise_cancellation: { mode: 'disabled' } },
            video: { enabled: type === 'video' },
          },
        },
      });
      await call.join({ create: false });
      stopRingtoneRef.current?.();
      stopRingtoneRef.current = null;
      setActiveCall(call);
    } catch (e: any) {
      stopRingtoneRef.current?.();
      const msg = e?.message ?? String(e);
      console.error('Call failed:', msg);
      toast({ title: 'Call failed', description: msg, variant: 'destructive' });
    }
  }, [videoClient]);

  const acceptCall = useCallback(async () => {
    if (!incomingCall) return;
    stopRingtoneRef.current?.();
    try {
      await incomingCall.join();
      setActiveCall(incomingCall);
      setIncomingCall(null);
    } catch {
      toast({ title: 'Could not join call', variant: 'destructive' });
    }
  }, [incomingCall]);

  const declineCall = useCallback(() => {
    stopRingtoneRef.current?.();
    incomingCall?.leave?.().catch(() => {});
    setIncomingCall(null);
  }, [incomingCall]);

  const endCall = useCallback(() => {
    stopRingtoneRef.current?.();
    activeCall?.leave?.().catch(() => {});
    setActiveCall(null);
  }, [activeCall]);

  const closeNewChat = () => {
    setShowNewChat(false);
    setSelectedUsers([]); setSearchQuery(''); setGroupName(''); setIsGroup(false);
  };

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

  return (
    /*
     * Mobile layout:  100dvh minus sticky header (56px) minus fixed bottom nav (56px).
     * Using 100dvh (dynamic) means the box shrinks when the virtual keyboard opens,
     * keeping the composer pinned just above the keyboard instead of hidden under it.
     * Desktop: h-full works fine — no fixed nav, no sticky header offset.
     */
    <div className="flex flex-col overflow-hidden md:h-full h-[calc(100dvh-56px-56px)]">
      {incomingCall && (
        <IncomingCallBanner
          callerName={
            (Object.values(incomingCall.state?.members ?? {})[0] as any)?.user?.name ?? 'Someone'
          }
          onAccept={acceptCall}
          onDecline={declineCall}
        />
      )}

      {activeCall && videoClient && (
        <div className="fixed inset-0 z-[90] bg-black flex flex-col">
          <StreamVideo client={videoClient}>
            <StreamCall call={activeCall}>
              <CallUI onEnd={endCall} />
            </StreamCall>
          </StreamVideo>
        </div>
      )}

      <Chat
        client={chatClient}
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
                'Start Conversation →'
              )}
            </Button>
          </div>

        </DialogContent>
      </Dialog>
    </div>
  );
}
