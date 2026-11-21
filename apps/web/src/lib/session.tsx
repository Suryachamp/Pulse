import { createContext, useContext, type ReactNode } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { Permission } from '@pulse/shared';
import { api, ApiError } from './api';
import type { Me } from '@/types/api';

interface SessionValue {
  me: Me | null;
  isLoading: boolean;
  can: (p: Permission) => boolean;
  setMe: (me: Me | null) => void;
}

const SessionContext = createContext<SessionValue | null>(null);

export const ME_KEY = ['me'] as const;

export function SessionProvider({ children }: { children: ReactNode }) {
  const qc = useQueryClient();
  const query = useQuery({
    queryKey: ME_KEY,
    queryFn: async () => {
      try {
        return await api.get<Me>('/auth/me');
      } catch (err) {
        if (err instanceof ApiError && err.status === 401) return null;
        throw err;
      }
    },
    staleTime: 5 * 60_000,
    retry: false,
  });
  const me = query.data ?? null;
  const value: SessionValue = {
    me,
    isLoading: query.isLoading,
    // UI affordance only. The API enforces every permission server-side.
    can: (p) => !!me?.permissions.includes(p),
    setMe: (next) => {
      qc.setQueryData(ME_KEY, next);
    },
  };
  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession() {
  const ctx = useContext(SessionContext);
  if (!ctx) throw new Error('useSession must be used inside SessionProvider');
  return ctx;
}
