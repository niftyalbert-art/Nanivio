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
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/65 px-4 backdrop-blur-xl">
      <section className="w-full max-w-[450px] overflow-hidden rounded-[32px] border border-white/10 bg-gradient-to-b from-[#17181d] to-[#0d0e12] p-5 shadow-[0_24px_70px_rgba(0,0,0,0.5)]">
        <header className="mb-5 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl border border-white/10 bg-white/[0.07]">
              <Sparkles className="h-5 w-5 text-white/80" />
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
          <button onClick={onChat} className="group min-h-40 rounded-[24px] border border-white/10 bg-white/[0.035] p-4 text-center transition duration-200 hover:-translate-y-0.5 hover:border-white/20 hover:bg-white/[0.075]">
            <span className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-white/[0.08] transition group-hover:scale-105">
              <MessageSquare className="h-8 w-8 text-white/80" />
            </span>
            <span className="mt-4 block text-base font-bold text-white">Message</span>
            <span className="mt-1 block text-xs text-white/45">Start a private chat</span>
          </button>
          <button onClick={onCall} className="group min-h-40 rounded-[24px] border border-white/10 bg-white/[0.035] p-4 text-center transition duration-200 hover:-translate-y-0.5 hover:border-white/20 hover:bg-white/[0.075]">
            <span className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-white/[0.08] transition group-hover:scale-105">
              <Phone className="h-8 w-8 text-white/80" />
            </span>
            <span className="mt-4 block text-base font-bold text-white">Call</span>
            <span className="mt-1 block text-xs text-white/45">Start an audio call</span>
          </button>
        </div>
      </section>
    </div>
  );
}
