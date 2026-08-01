import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { StreamChat } from 'stream-chat';

const BASE = import.meta.env.BASE_URL.replace(/\/$/, '');
const API = `${BASE}/api`;

export interface StreamData {
  token: string;
  userId: string;
  userName: string;
  apiKey: string;
}

interface StreamChatCtx {
  streamData: StreamData | null;
  chatClient: StreamChat | null;
}

const Ctx = createContext<StreamChatCtx>({ streamData: null, chatClient: null });

/**
 * Keeps a single Stream Chat client alive for the entire authenticated session.
 * Wrap the authenticated portion of the app so any page can read
 * real-time events (new messages, chat requests) without visiting /chat first.
 */
export function StreamChatProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<StreamChatCtx>({ streamData: null, chatClient: null });

  useEffect(() => {
    const authToken = localStorage.getItem('nanivio_token');
    if (!authToken) return;

    let cancelled = false;

    (async () => {
      try {
        const d: StreamData = await fetch(`${API}/stream/token`, {
          headers: { Authorization: `Bearer ${authToken}` },
        }).then(r => r.json());

        if (cancelled || !d?.token || !d?.apiKey) return;

        const client = StreamChat.getInstance(d.apiKey);
        // Avoid double-connect (React StrictMode runs effects twice in dev)
        if (client.userID !== d.userId) {
          await client.connectUser({ id: d.userId, name: d.userName }, d.token);
        }
        if (cancelled) return;
        setState({ streamData: d, chatClient: client });
      } catch { /* non-fatal — /chat page shows its own error */ }
    })();

    return () => { cancelled = true; };
    // Provider only unmounts on logout, so we intentionally skip disconnect here
    // (the browser/tab close handles that automatically via Stream's SDK)
  }, []);

  return <Ctx.Provider value={state}>{children}</Ctx.Provider>;
}

export function useStreamChat() {
  return useContext(Ctx);
}
