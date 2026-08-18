import { useState } from "react";
import { Phone, Video, ArrowLeft } from "lucide-react";
import { useLocation } from "wouter";
import { Input } from "@/components/ui/input";

export default function Call() {
  const [, navigate] = useLocation();
  const [nvNumber, setNvNumber] = useState("");

  const valid = /^0\d{9}$/.test(nvNumber.trim());

  const startCall = (type: "audio" | "video") => {
    if (!valid) return;

    console.log("Starting", type, "call to", nvNumber);

    // Agora call connection will be attached here
  };

  return (
    <div className="min-h-screen px-5 py-6 bg-gradient-to-b from-background via-background to-primary/5">
      <div className="max-w-md mx-auto space-y-8">

        <button
          onClick={() => navigate("/communication")}
          className="flex items-center gap-2 text-sm text-muted-foreground"
        >
          <ArrowLeft className="w-4 h-4" />
          Communication
        </button>

        <div className="text-center">
          <div className="mx-auto mb-4 w-16 h-16 rounded-3xl bg-primary/10 flex items-center justify-center">
            <Phone className="w-8 h-8 text-primary" />
          </div>

          <h1 className="text-3xl font-bold">
            Call
          </h1>

          <p className="text-sm text-muted-foreground mt-2">
            Enter receiver Nanivio Number
          </p>
        </div>


        <div className="rounded-3xl bg-card border p-6 space-y-5 shadow-sm">

          <Input
            value={nvNumber}
            onChange={(e) => setNvNumber(e.target.value)}
            placeholder="User NV Number..."
            className="h-14 rounded-2xl text-lg"
          />


          <div className="grid grid-cols-2 gap-4">

            <button
              disabled={!valid}
              onClick={() => startCall("audio")}
              className="rounded-3xl p-5 bg-primary/10 hover:bg-primary/20 disabled:opacity-40 transition"
            >
              <Phone className="mx-auto w-7 h-7 text-primary" />

              <p className="mt-2 font-semibold">
                Audio
              </p>
            </button>


            <button
              disabled={!valid}
              onClick={() => startCall("video")}
              className="rounded-3xl p-5 bg-primary/10 hover:bg-primary/20 disabled:opacity-40 transition"
            >
              <Video className="mx-auto w-7 h-7 text-primary" />

              <p className="mt-2 font-semibold">
                Video
              </p>
            </button>

          </div>

        </div>

      </div>
    </div>
  );
}
