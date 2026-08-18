import { MessageSquare, Phone, X, Sparkles } from "lucide-react";

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
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 backdrop-blur-xl">

      <div className="
        w-[92%]
        max-w-md
        rounded-[40px]
        border border-white/10
        bg-gradient-to-br from-slate-950 via-black to-slate-900
        p-7
        shadow-2xl
      ">

        <div className="flex items-center justify-between mb-8">

          <div className="flex items-center gap-3">

            <div className="
              w-12 h-12
              rounded-3xl
              bg-gradient-to-br from-cyan-400/30 to-purple-500/30
              flex items-center justify-center
            ">
              <Sparkles className="text-cyan-300 w-6 h-6" />
            </div>

            <div>
              <h1 className="text-xl font-bold text-white">
                Connect
              </h1>

              <p className="text-xs text-white/50">
                Communication hub
              </p>
            </div>

          </div>


          <button
            onClick={onClose}
            className="
              w-10 h-10
              rounded-full
              bg-white/5
              flex items-center justify-center
            "
          >
            <X className="text-white/60" />
          </button>

        </div>


        <div className="grid grid-cols-2 gap-5">


          <button
            onClick={onChat}
            className="
              h-48
              rounded-[32px]
              bg-white/[0.05]
              border border-white/10
              hover:bg-cyan-500/10
              transition
              flex
              flex-col
              items-center
              justify-center
              gap-4
            "
          >

            <div className="
              w-20
              h-20
              rounded-full
              bg-cyan-400/20
              flex
              items-center
              justify-center
              animate-pulse
            ">
              <MessageSquare className="w-10 h-10 text-cyan-300" />
            </div>


            <span className="text-white font-semibold">
              Message
            </span>

          </button>



          <button
            onClick={onCall}
            className="
              h-48
              rounded-[32px]
              bg-white/[0.05]
              border border-white/10
              hover:bg-purple-500/10
              transition
              flex
              flex-col
              items-center
              justify-center
              gap-4
            "
          >

            <div className="
              w-20
              h-20
              rounded-full
              bg-purple-400/20
              flex
              items-center
              justify-center
              animate-pulse
            ">
              <Phone className="w-10 h-10 text-purple-300" />
            </div>


            <span className="text-white font-semibold">
              Call
            </span>

          </button>


        </div>


      </div>

    </div>
  );
}
