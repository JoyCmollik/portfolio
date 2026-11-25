import { createContext, useContext, useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import type { User } from '../types';
import { api } from '../lib/api';
interface AuthState {
  user: User | null; loading: boolean;
  loginGoogle: (credential: string) => Promise<void>;
  logout: () => Promise<void>; refresh: () => Promise<void>;
}
const Context = createContext<AuthState | undefined>(undefined);
export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const refresh = useCallback(async () => {
    try { const result = await api<{ user: User | null }>('/auth/me'); setUser(result.user); }
    catch { setUser(null); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { void refresh(); }, [refresh]);
  const loginGoogle = useCallback(async (credential: string) => {
    const result = await api<{ user: User }>('/auth/google', { method: 'POST', body: JSON.stringify({ credential }) });
    setUser(result.user);
  }, []);
  const logout = useCallback(async () => { await api('/auth/logout', { method: 'POST' }); setUser(null); }, []);
  const value = useMemo(() => ({ user, loading, loginGoogle, logout, refresh }), [user, loading, loginGoogle, logout, refresh]);
  return <Context.Provider value={value}>{children}</Context.Provider>;
}
export function useAuth() { const value = useContext(Context); if (!value) throw new Error('AuthProvider is missing.'); return value; }
