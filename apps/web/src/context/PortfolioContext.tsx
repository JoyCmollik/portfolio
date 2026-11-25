import { createContext, useContext, useCallback, useEffect, useState, type ReactNode } from 'react';
import type { PortfolioContent } from '../types';
import { demoContent } from '../data/demo';
import { api } from '../lib/api';
interface PortfolioContextValue extends PortfolioContent { isDemo: boolean; loading: boolean; refresh: () => Promise<void> }
const Context = createContext<PortfolioContextValue | undefined>(undefined);
export function PortfolioProvider({ children }: { children: ReactNode }) {
  const [content, setContent] = useState<PortfolioContent>(demoContent);
  const [isDemo, setIsDemo] = useState(true);
  const [loading, setLoading] = useState(true);
  const refresh = useCallback(async () => {
    try {
      const response = await api<PortfolioContent>('/public/content');
      if (!response.site) throw new Error('Missing site content');
      setContent(response); setIsDemo(false);
    } catch { setContent(demoContent); setIsDemo(true); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { void refresh(); }, [refresh]);
  return <Context.Provider value={{ ...content, isDemo, loading, refresh }}>{children}</Context.Provider>;
}
export function usePortfolio() {
  const context = useContext(Context);
  if (!context) throw new Error('PortfolioProvider is missing.');
  return context;
}
