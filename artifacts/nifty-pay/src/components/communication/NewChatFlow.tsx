
import { useEffect, useState } from "react";
import { Search, X, MessageCircle, UserRound, Phone, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { API_BASE as API } from "@/lib/api";

interface NewChatFlowProps {
  open: boolean;
  onClose: () => void;
  mode: "chat" | "call";
  onStartChat: (user: { id: string; name: string; nanivioNumber: string }) => Promise<void>;
  onStartCall: (user: { id: string; name: string; nanivioNumber: string }) => Promise<void>;
}

export default function NewChatFlow({
  open,
  onClose,
  mode,
  onStartChat,
  onStartCall,
}: NewChatFlowProps) {

  const [number, setNumber] = useState("");
  const [user, setUser] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    const q = number.trim();

    if (!/^0\d{9}$/.test(q)) {
      setUser(null);
      setError('');
      return;
    }

    const timer = setTimeout(async () => {
      try {
        setLoading(true);

        const token = localStorage.getItem("nanivio_token");

        const res = await fetch(
          `${API}/stream/chat/${encodeURIComponent(q)}`,
          {
            headers: {
              Authorization: `Bearer ${token}`,
            },
          }
        );

        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          setUser(null);
          setError(body?.error ?? 'No active Nanivio user found for this number.');
          return;
        }

        const data = await res.json();

        if (data.userId) {
          const foundUser = {
            id: data.userId,
            name: data.name,
            nanivioNumber: q,
          };

          setUser(foundUser);

          setError('');
        }

      } catch {
        setUser(null);
        setError('Could not look up this Nanivio number. Check your connection and try again.');
      } finally {
        setLoading(false);
      }

    }, 400);

    return () => clearTimeout(timer);

  }, [number]);


  if (!open) return null;

  const proceed = async () => {
    if (!user || actionLoading) return;
    setActionLoading(true);
    setError('');
    try {
      if (mode === 'call') await onStartCall(user);
      else await onStartChat(user);
    } catch (caught: any) {
      setError(caught?.message ?? 'Could not start communication.');
    } finally {
      setActionLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[110] flex items-center justify-center bg-black/75 px-4 backdrop-blur-2xl">
      <section className="w-full max-w-md rounded-[30px] border border-white/10 bg-[radial-gradient(circle_at_12%_0%,rgba(34,211,238,0.16),transparent_38%),radial-gradient(circle_at_100%_100%,rgba(139,92,246,0.16),transparent_50%),#090a11] p-5 shadow-[0_28px_80px_rgba(0,0,0,0.65)]">
        <header className="mb-6 flex items-center justify-between">
          <div><p className="text-xs font-semibold uppercase tracking-[0.16em] text-cyan-200/70">Nanivio Connect</p><h2 className="mt-1 text-2xl font-extrabold text-white">{mode === 'call' ? 'Start a call' : 'New message'}</h2></div>
          <button onClick={onClose} aria-label="Close" className="rounded-full border border-white/5 bg-white/5 p-2 text-white/60 hover:bg-white/10"><X className="h-5 w-5" /></button>
        </header>
        <label className="text-sm font-medium text-white/70">Recipient NV number</label>
        <div className="relative mt-2"><Search className="absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-white/35" /><Input autoFocus inputMode="numeric" value={number} onChange={(e) => setNumber(e.target.value.replace(/\D/g, '').slice(0, 10))} placeholder="0XXXXXXXXX" className="h-14 rounded-2xl border-white/10 bg-white/[0.05] pl-12 font-mono text-base text-white placeholder:text-white/25" /></div>
        <p className="mt-2 text-xs text-white/40">Enter the 10-digit NV number beginning with 0.</p>
        {loading && <p className="mt-4 flex items-center gap-2 text-sm text-cyan-100"><Loader2 className="h-4 w-4 animate-spin" /> Verifying recipient…</p>}
        {error && <p className="mt-4 rounded-xl border border-red-400/20 bg-red-400/10 px-3 py-2 text-sm text-red-200">{error}</p>}
        {user && <div className="mt-5 rounded-2xl border border-white/10 bg-white/[0.045] p-4"><div className="flex items-center gap-3"><div className="flex h-11 w-11 items-center justify-center rounded-full bg-gradient-to-br from-cyan-400/30 to-violet-500/35"><UserRound className="h-5 w-5 text-white" /></div><div><p className="font-bold text-white">{user.name}</p><p className="font-mono text-xs text-cyan-100/65">NV. {user.nanivioNumber}</p></div></div><Button disabled={actionLoading} onClick={() => void proceed()} className="mt-4 h-12 w-full rounded-xl bg-gradient-to-r from-cyan-500 to-violet-500 font-bold text-white hover:from-cyan-400 hover:to-violet-400">{actionLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : mode === 'call' ? <Phone className="mr-2 h-4 w-4" /> : <MessageCircle className="mr-2 h-4 w-4" />}{actionLoading ? 'Connecting…' : mode === 'call' ? 'Start audio call' : 'Open conversation'}</Button></div>}
      </section>
    </div>
  );
}
