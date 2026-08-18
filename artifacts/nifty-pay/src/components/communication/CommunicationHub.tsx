import { MessageSquare, Phone, Users, Star, X, Sparkles } from "lucide-react";

interface CommunicationHubProps {
  open: boolean;
  onClose: () => void;
  onChat: () => void;
  onCall: () => void;
}

export default function CommunicationHub({
  open,
  onClose,
  onChat,
  onCall,
}: CommunicationHubProps) {

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 backdrop-blur-xl">
      <div className="w-[92%] max-w-lg rounded-[36px] border border-white/10 bg-gradient-to-br from-slate-950 via-black to-slate-900 p-6 shadow-2xl">

        <div className="flex items-start justify-between mb-8">
          <div>
            <div className="flex items-center gap-2">
              <Sparkles className="w-5 h-5 text-primary" />
              <h1 className="text-2xl font-bold text-white">
                Nanivio Connect
              </h1>
            </div>

            <p className="text-sm text-white/50 mt-2">
              Connect instantly with people around you
            </p>
          </div>

          <button onClick={onClose}>
            <X className="text-white/60" />
          </button>
        </div>


        <div className="space-y-4">

          <button
            onClick={onChat}
            className="w-full rounded-3xl p-5 bg-white/5 border border-white/10 text-left hover:bg-primary/10 transition"
          >
            <MessageSquare className="text-primary mb-3" />

            <h3 className="text-white font-bold text-lg">
              Start Chat
            </h3>

            <p className="text-white/50 text-sm">
              Message any Nanivio user instantly
            </p>
          </button>


          <button
            onClick={onCall}
            className="w-full rounded-3xl p-5 bg-white/5 border border-white/10 text-left hover:bg-primary/10 transition"
          >
            <Phone className="text-primary mb-3" />

            <h3 className="text-white font-bold text-lg">
              Start Call
            </h3>

            <p className="text-white/50 text-sm">
              Voice and video communication
            </p>
          </button>


          <div className="grid grid-cols-2 gap-4">

            <button className="rounded-3xl p-4 bg-white/5 border border-white/10 text-left">
              <Users className="text-white/70 mb-2" />

              <p className="text-white text-sm font-semibold">
                Contacts
              </p>
            </button>


            <button className="rounded-3xl p-4 bg-white/5 border border-white/10 text-left">
              <Star className="text-white/70 mb-2" />

              <p className="text-white text-sm font-semibold">
                Favorites
              </p>
            </button>

          </div>

        </div>

      </div>
    </div>
  );
}
