import { createContext, useContext, useState, useCallback, type ReactNode } from 'react';
import { setAuthTokenGetter, setBaseUrl } from '@workspace/api-client-react';
import { API_BASE } from '@/lib/api';

// Generated API routes include their own /api prefix, while API_BASE includes it.
// Configure the client once so profile, dashboard, and wallet queries reach Render.
setBaseUrl(API_BASE.replace(/\/api$/, ''));
setAuthTokenGetter(() => localStorage.getItem('nanivio_token'));

const TOKEN_KEY = 'nanivio_token';

export interface AuthUser {
  id: number;
  name: string;
  email: string;
}

interface AuthContextType {
  user: AuthUser | null;
  token: string | null;
  isAuthenticated: boolean;
  setAuth: (token: string, user: AuthUser) => void;
  logout: () => void;
}

const AuthContext = createContext<AuthContextType | null>(null);

function parseJwtUser(token: string): AuthUser | null {
  try {
    const payload = JSON.parse(atob(token.split('.')[1]));
    if (!payload.userId || !payload.email || !payload.name) return null;
    return { id: payload.userId, name: payload.name, email: payload.email };
  } catch {
    return null;
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const storedToken = localStorage.getItem(TOKEN_KEY);
  const initialUser = storedToken ? parseJwtUser(storedToken) : null;

  const [token, setToken] = useState<string | null>(storedToken && initialUser ? storedToken : null);
  const [user, setUser] = useState<AuthUser | null>(initialUser);

  const setAuth = useCallback((newToken: string, newUser: AuthUser) => {
    localStorage.setItem(TOKEN_KEY, newToken);
    setToken(newToken);
    setUser(newUser);
  }, []);

  const logout = useCallback(() => {
    localStorage.removeItem(TOKEN_KEY);
    setToken(null);
    setUser(null);
    // Force full reload to clear all React Query caches
    window.location.href = '/';
  }, []);

  return (
    <AuthContext.Provider value={{ user, token, isAuthenticated: !!token && !!user, setAuth, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}
