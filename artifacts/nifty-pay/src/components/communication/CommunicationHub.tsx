import { MessageSquare, Phone, X, Sparkles } from 'lucide-react';

interface CommunicationHubProps {
  open: boolean;
  onClose: () => void;
  onChat: () => void;
  onCall: () => void;
}

export default function CommunicationHub({ open, onClose, onChat, onCall }: CommunicationHubProps) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 px-4 backdrop-blur-2xl">
      <section className="w-full max-w-[450px] overflow-hidden rounded-[32px] border border-white/10 bg-[radial-gradient(circle_at_12%_0%,rgba(33,216,224,0.16),transparent_36%),radial-gradient(circle_at_100%_100%,rgba(144,89,255,0.18),transparent_48%),linear-gradient(145deg,#10111a,#07080d)] p-5 shadow-[0_28px_90px_rgba(0,0,0,0.6)]">
        <header className="mb-5 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl border border-cyan-300/15 bg-gradient-to-br from-cyan-400/25 to-violet-500/30 shadow-[0_0_28px_rgba(83,225,255,0.18)]">
              <Sparkles className="h-5 w-5 text-cyan-200" />
            </div>
            <div>
              <h1 className="text-xl font-extrabold tracking-tight text-white">Connect</h1>
              <p className="text-xs text-white/45">Communication hub</p>
            </div>
          </div>
          <button onClick={onClose} aria-label="Close Connect" className="flex h-10 w-10 items-center justify-center rounded-full border border-white/5 bg-white/[0.045] text-white/55 transition hover:bg-white/10 hover:text-white">
            <X className="h-5 w-5" />
          </button>
        </header>

        <div className="grid grid-cols-2 gap-3">
          <button onClick={onChat} className="group min-h-40 rounded-[24px] border border-cyan-200/10 bg-white/[0.035] p-4 text-center transition duration-200 hover:-translate-y-0.5 hover:border-cyan-300/30 hover:bg-cyan-400/[0.075]">
            <span className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-cyan-400/15 shadow-[0_0_26px_rgba(34,211,238,0.18)] transition group-hover:scale-105">
              <MessageSquare className="h-8 w-8 text-cyan-200" />
            </span>
            <span className="mt-4 block text-base font-bold text-white">Message</span>
            <span className="mt-1 block text-xs text-white/45">Start a private chat</span>
          </button>
          <button onClick={onCall} className="group min-h-40 rounded-[24px] border border-violet-200/10 bg-white/[0.035] p-4 text-center transition duration-200 hover:-translate-y-0.5 hover:border-violet-300/30 hover:bg-violet-400/[0.075]">
            <span className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-violet-400/15 shadow-[0_0_26px_rgba(167,139,250,0.18)] transition group-hover:scale-105">
              <Phone className="h-8 w-8 text-violet-200" />
            </span>
            <span className="mt-4 block text-base font-bold text-white">Call</span>
            <span className="mt-1 block text-xs text-white/45">Start an audio call</span>
          </button>
        </div>
      </section>
    </div>
  );
}
