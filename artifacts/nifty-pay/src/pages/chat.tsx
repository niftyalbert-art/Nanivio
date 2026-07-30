import '@/styles/stream-theme.css';

import { useState, useEffect, useRef, useCallback } from 'react';
import {
  Chat, Channel, ChannelList, MessageList, MessageComposer,
  Window, Thread, useCreateChatClient, useChatContext,
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
  Search, X, Check, PhoneCall,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
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
  // Increment on every incoming message → forces ChannelItem re-renders so
  // unread badges and last-message previews refresh in real time.
  const [tick, setTick] = useState(0);

  useEffect(() => {
    setActiveChannelRef.current = setActiveChannel as any;
  }, [setActiveChannel, setActiveChannelRef]);

  // New message: play sound + refresh channel list badges
  useEffect(() => {
    const handler = (event: any) => {
      if (event.message?.user?.id !== streamData.userId) {
        playMessageNotification();
      }
      setTick(t => t + 1);
    };
    client.on('message.new', handler);
    return () => { client.off('message.new', handler); };
  }, [client, streamData.userId]);

  const channelFilters = { type: 'messaging', members: { $in: [streamData.userId] } };
  const channelSort = [{ last_message_at: -1 }] as const;
  const channelOptions = { limit: 30, state: true, presence: true, watch: true };

  return (
    <div className="flex flex-col h-full overflow-hidden">
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
          <div className="flex-1 overflow-y-auto overscroll-contain">
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
          {/* Header lives OUTSIDE Window so it's never clipped by Window's internal flex layout */}
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
          <Window>
            <MessageList />
            <MessageComposer additionalTextareaProps={{ placeholder: 'Message…' }} />
          </Window>
          <Thread />
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
    <div className="h-full flex flex-col overflow-hidden">
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

      <Chat client={chatClient} theme="str-chat__theme-dark">
        <ChatInner
          streamData={streamData}
          onStartCall={handleStartCall}
          onNewChat={() => setShowNewChat(true)}
          setActiveChannelRef={setActiveChannelRef}
        />
      </Chat>

      {/* new chat dialog */}
      <Dialog open={showNewChat} onOpenChange={(o) => { if (!o) closeNewChat(); }}>
        <DialogContent className="max-w-sm gap-4">
          <DialogHeader>
            <div className="flex items-center gap-2">
              <DialogTitle>{isGroup ? 'New Group' : 'New Message'}</DialogTitle>
              <div className="ml-auto flex items-center gap-1">
                <button
                  onClick={() => setIsGroup(false)}
                  className={cn('flex items-center gap-1 text-xs px-2 py-1 rounded-md transition-colors', !isGroup ? 'bg-primary/15 text-primary font-semibold' : 'text-muted-foreground hover:text-foreground')}
                >
                  <MessageSquare className="w-3 h-3" /> DM
                </button>
                <button
                  onClick={() => setIsGroup(true)}
                  className={cn('flex items-center gap-1 text-xs px-2 py-1 rounded-md transition-colors', isGroup ? 'bg-primary/15 text-primary font-semibold' : 'text-muted-foreground hover:text-foreground')}
                >
                  <Users className="w-3 h-3" /> Group
                </button>
              </div>
            </div>
          </DialogHeader>

          {isGroup && (
            <Input placeholder="Group name…" value={groupName} onChange={e => setGroupName(e.target.value)} />
          )}

          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
            <Input className="pl-9" placeholder="Search by name or phone number…" value={searchQuery} onChange={e => setSearchQuery(e.target.value)} />
          </div>

          {selectedUsers.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {selectedUsers.map(u => (
                <Badge key={u.id} variant="secondary" className="gap-1 pr-1.5">
                  {u.name ?? u.id}
                  <button onClick={() => toggleUser(u)} className="hover:text-destructive transition-colors ml-0.5">
                    <X className="w-3 h-3" />
                  </button>
                </Badge>
              ))}
            </div>
          )}

          {searchResults.length > 0 && (
            <div className="max-h-48 overflow-y-auto rounded-xl border border-border divide-y divide-border/40">
              {searchResults.map(u => {
                const sel = selectedUsers.some(x => x.id === u.id);
                return (
                  <button
                    key={u.id}
                    className="w-full flex items-center gap-3 px-3 py-2.5 hover:bg-muted/40 transition-colors text-left"
                    onClick={() => isGroup ? toggleUser(u) : setSelectedUsers([u])}
                  >
                    <Avatar className="w-8 h-8 shrink-0">
                      <AvatarFallback className="bg-primary/20 text-primary text-xs font-bold">
                        {(u.name ?? u.id).slice(0, 2).toUpperCase()}
                      </AvatarFallback>
                    </Avatar>
                    <span className="flex-1 text-sm font-medium">{u.name ?? u.id}</span>
                    {sel && <Check className="w-4 h-4 text-primary shrink-0" />}
                  </button>
                );
              })}
            </div>
          )}

          {searchQuery.trim() && searchResults.length === 0 && (
            <p className="text-center text-sm text-muted-foreground py-3">No users found</p>
          )}

          <Button
            className="w-full font-semibold"
            onClick={startChat}
            disabled={selectedUsers.length === 0 || creating || (isGroup && !groupName.trim())}
          >
            {creating ? 'Starting…' : isGroup ? `Create Group${selectedUsers.length > 0 ? ` (${selectedUsers.length})` : ''}` : 'Start Chat'}
          </Button>
        </DialogContent>
      </Dialog>
    </div>
  );
}
