
import { useEffect, useState } from "react";
import { Search, X, MessageCircle, UserRound } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { API_BASE as API } from "@/lib/api";

interface NewChatFlowProps {
  open: boolean;
  onClose: () => void;
  onStartChat: (user: any) => void;
}

export default function NewChatFlow({
  open,
  onClose,
  onStartChat,
}: NewChatFlowProps) {

  const [number, setNumber] = useState("");
  const [user, setUser] = useState<any>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const q = number.trim();

    if (!/^0\d{9}$/.test(q)) {
      setUser(null);
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
          setUser(null);
          return;
        }

        const data = await res.json();

        if (data.userId) {
          setUser({
            id: data.userId,
            name: data.name,
            nanivioNumber: q,
          });
        }

      } finally {
        setLoading(false);
      }

    }, 400);

    return () => clearTimeout(timer);

  }, [number]);


  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[110] flex items-center justify-center bg-black/80 backdrop-blur-xl">

      <div className="w-[92%] max-w-md rounded-[36px] bg-black border border-white/10 p-6">

        <div className="flex justify-between mb-8">
          <h2 className="text-2xl font-bold text-white">
            New Chat
          </h2>

          <button onClick={onClose}>
            <X className="text-white/60" />
          </button>
        </div>

        <div className="relative">
          <Search className="absolute left-4 top-4 text-white/40" />

          <Input
            value={number}
            onChange={(e)=>setNumber(e.target.value)}
            placeholder="Nanivio Number"
            className="pl-12 h-14 bg-white/5 text-white"
          />
        </div>

        {loading && (
          <p className="text-white/50 mt-3">
            Searching...
          </p>
        )}

        {user && (
          <div className="mt-6 rounded-3xl bg-white/5 p-5">

            <UserRound className="text-primary mb-3" />

            <p className="text-white font-bold">
              {user.name}
            </p>

            <Button
              className="w-full mt-5"
              onClick={() => onStartChat(user)}
            >
              <MessageCircle className="mr-2"/>
              Start Conversation
            </Button>

          </div>
        )}

      </div>

    </div>
  );
}
