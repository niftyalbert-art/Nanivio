/**
 * CallOverlay — rendered inside AppLayout so it is always present regardless
 * of which page the user is on.
 *
 * • IncomingCallBanner: fixed banner at top of screen — accepts or declines
 * • ActiveCallOverlay:  full-screen call UI that persists across navigation
 */
import { useEffect } from 'react';
import {
  StreamVideo, StreamCall, StreamTheme,
  ParticipantView, CallControls, useCallStateHooks, CallingState,
} from '@stream-io/video-react-sdk';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { PhoneCall, PhoneOff } from 'lucide-react';
import { useStreamVideo } from '@/contexts/stream-video';
import { useToast } from '@/hooks/use-toast';

/* ─── inner call UI — must live inside <StreamCall> context ─── */
function CallUI({ onEnd }: { onEnd: () => void }) {
  const { useCallCallingState, useLocalParticipant, useRemoteParticipants } = useCallStateHooks();
  const state  = useCallCallingState();
  const local  = useLocalParticipant();
  const remote = useRemoteParticipants();

  // Auto-end when the call leaves / goes idle
  useEffect(() => {
    if (state === CallingState.LEFT || state === CallingState.IDLE) onEnd();
  }, [state, onEnd]);

  const other = remote[0]; // 1:1 calls — first remote participant fills the screen

  // No-answer timeout: if nobody joins within 60s, end the call
  useEffect(() => {
    if (other) return;
    const t = setTimeout(() => onEnd(), 60_000);
    return () => clearTimeout(t);
  }, [other, onEnd]);

  return (
    <StreamTheme className="h-full wa-call">
      {/* ── Remote participant — fills the entire screen (WhatsApp style) ── */}
      <div className="absolute inset-0">
        {other ? (
          <ParticipantView participant={other} ParticipantViewUI={null} />
        ) : (
          <div className="w-full h-full flex flex-col items-center justify-center gap-3 text-white/80">
            <div className="w-20 h-20 rounded-full bg-white/10 flex items-center justify-center">
              <PhoneCall className="w-8 h-8 animate-pulse" />
            </div>
            <p className="text-sm animate-pulse">Waiting for the other person…</p>
          </div>
        )}
      </div>

      {/* ── Own camera — floating medium box, top-right ── */}
      {local && (
        <div className="absolute top-4 right-4 w-[30vw] max-w-[140px] aspect-[3/4] rounded-2xl overflow-hidden border border-white/20 shadow-2xl z-10 bg-black/60">
          <ParticipantView participant={local} ParticipantViewUI={null} muteAudio />
        </div>
      )}

      {/* ── Controls — bottom center ── */}
      <div className="absolute inset-x-0 bottom-6 z-10 flex justify-center">
        <CallControls onLeave={onEnd} />
      </div>
    </StreamTheme>
  );
}

/* ─── exported overlay — always rendered inside AppLayout ─── */
export function CallOverlay() {
  const { videoClient, incomingCall, activeCall, acceptCall, declineCall, endCall } = useStreamVideo();
  const { toast } = useToast();

  const callerName =
    (Object.values(incomingCall?.state?.members ?? {})[0] as any)?.user?.name ?? 'Someone';

  const handleAccept = async () => {
    try {
      await acceptCall();
    } catch (e: any) {
      console.error('[call] accept failed:', e); // full error for diagnostics
      const msg: string = e?.message ?? String(e);
      if (msg.toLowerCase().includes('country') || msg.toLowerCase().includes('region') || msg.toLowerCase().includes('geo')) {
        toast({
          title: 'Not available in your region',
          description: 'Video and audio calls are not supported in your country.',
          variant: 'destructive',
        });
      } else {
        toast({ title: 'Could not join call', description: msg, variant: 'destructive' });
      }
    }
  };

  return (
    <>
      {/* ── Incoming call banner — z-[200] guarantees it sits above nav bars ── */}
      {incomingCall && (
        <div className="fixed inset-x-4 top-4 z-[200] bg-card border border-primary/30 rounded-2xl shadow-2xl p-4 flex items-center gap-3 animate-in slide-in-from-top-4 duration-300"
          style={{ boxShadow: '0 0 0 1px rgba(45,212,191,0.15), 0 12px 48px rgba(0,0,0,0.6)' }}>
          <Avatar className="w-12 h-12 shrink-0">
            <AvatarFallback className="bg-primary/20 text-primary font-bold">
              {callerName.slice(0, 2).toUpperCase()}
            </AvatarFallback>
          </Avatar>
          <div className="flex-1 min-w-0">
            <p className="font-bold text-sm truncate">{callerName}</p>
            <p className="text-xs text-muted-foreground animate-pulse">Incoming call…</p>
          </div>
          {/* Decline */}
          <button
            onClick={declineCall}
            className="w-11 h-11 bg-destructive hover:bg-destructive/90 rounded-full flex items-center justify-center shrink-0 transition-colors"
            aria-label="Decline call"
          >
            <PhoneOff className="w-4 h-4 text-white" />
          </button>
          {/* Accept */}
          <button
            onClick={handleAccept}
            className="w-11 h-11 bg-emerald-500 hover:bg-emerald-600 rounded-full flex items-center justify-center shrink-0 transition-colors"
            aria-label="Accept call"
          >
            <PhoneCall className="w-4 h-4 text-white" />
          </button>
        </div>
      )}

      {/* ── Active call full-screen overlay — persists across navigation ── */}
      {activeCall && videoClient && (
        <div className="fixed inset-0 z-[190] bg-black flex flex-col">
          <StreamVideo client={videoClient}>
            <StreamCall call={activeCall}>
              <CallUI onEnd={endCall} />
            </StreamCall>
          </StreamVideo>
        </div>
      )}
    </>
  );
}
