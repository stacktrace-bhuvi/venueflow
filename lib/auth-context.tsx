'use client';

/**
 * Session state for the whole app.
 *
 * The JWT lives in a httpOnly cookie that JavaScript cannot read, so the
 * only way to know who is logged in is to ask the server (/api/auth/me).
 * This provider does that once on mount and caches the result.
 */

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { apiFetch, normaliseUser, type Role, type User } from '@/lib/api';

type AuthState = {
  user: User | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<User>;
  register: (input: {
    fullName: string;
    email: string;
    password: string;
    phone?: string;
    role?: 'customer' | 'manager';
  }) => Promise<void>;
  logout: () => Promise<void>;
  refresh: () => Promise<void>;
  hasRole: (...roles: Role[]) => boolean;
};

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    try {
      const data = await apiFetch('/auth/me');
      setUser(normaliseUser(data));
    } catch {
      setUser(null); // 401 simply means "not logged in"
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const login = useCallback(async (email: string, password: string) => {
    const data = await apiFetch('/auth/login', { method: 'POST', body: { email, password } });
    const u = normaliseUser(data.user);
    setUser(u);
    return u;
  }, []);

  const register = useCallback(
    async (input: {
      fullName: string;
      email: string;
      password: string;
      phone?: string;
      role?: 'customer' | 'manager';
    }) => {
      // NOTE: the backend expects `fullName` (the api-contract.md doc says
      // `name` — the doc is wrong, the Zod schema is the source of truth).
      await apiFetch('/auth/register', { method: 'POST', body: input });
    },
    []
  );

  const logout = useCallback(async () => {
    try {
      await apiFetch('/auth/logout', { method: 'POST' });
    } finally {
      setUser(null);
    }
  }, []);

  const hasRole = useCallback((...roles: Role[]) => !!user && roles.includes(user.role), [user]);

  const value = useMemo(
    () => ({ user, loading, login, register, logout, refresh, hasRole }),
    [user, loading, login, register, logout, refresh, hasRole]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>');
  return ctx;
}
