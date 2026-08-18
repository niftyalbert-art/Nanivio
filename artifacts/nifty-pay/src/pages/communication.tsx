
import { PhoneCall, MessageCircle, ArrowRight } from "lucide-react";
import { useLocation } from "wouter";

export default function Communication() {
  const [, navigate] = useLocation();

  return (
    <div className="min-h-screen px-5 py-6 bg-gradient-to-b from-background via-background to-primary/5">
      <div className="max-w-md mx-auto space-y-6">

        <div className="text-center pt-4">
          <div className="mx-auto mb-4 w-16 h-16 rounded-3xl bg-primary/10 flex items-center justify-center">
            <MessageCircle className="w-8 h-8 text-primary" />
          </div>

          <h1 className="text-3xl font-bold tracking-tight">
            Communication
          </h1>

          <p className="text-sm text-muted-foreground mt-2">
            Connect using Nanivio Numbers
          </p>
        </div>

        <button
          onClick={() => navigate("/chat")}
          className="w-full rounded-3xl p-6 bg-card border shadow-sm hover:shadow-xl transition-all"
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div className="p-3 rounded-2xl bg-primary/10">
                <PhoneCall className="w-7 h-7 text-primary" />
              </div>

              <div className="text-left">
                <h2 className="text-xl font-bold">
                  Calling
                </h2>

                <p className="text-sm text-muted-foreground">
                  Audio & Video calls using NV numbers
                </p>
              </div>
            </div>

            <ArrowRight className="w-5 h-5" />
          </div>
        </button>


        <button
          onClick={() => navigate("/chat")}
          className="w-full rounded-3xl p-6 bg-card border shadow-sm hover:shadow-xl transition-all"
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">

              <div className="p-3 rounded-2xl bg-primary/10">
                <MessageCircle className="w-7 h-7 text-primary" />
              </div>

              <div className="text-left">
                <h2 className="text-xl font-bold">
                  Chat
                </h2>

                <p className="text-sm text-muted-foreground">
                  Message using NV numbers
                </p>
              </div>

            </div>

            <ArrowRight className="w-5 h-5" />
          </div>
        </button>

      </div>
    </div>
  );
}
