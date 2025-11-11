'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { apiFetch } from '@/lib/utils/apiClient';
import type { ApiResponse, LoginConfig, LoginResponse, LoginResponseData, LoginUser } from '@/types';

const STORAGE_KEY = 'gemini-auth-session';

type AuthContextValue = {
  token: string | null;
  user: LoginUser | null;
  config: LoginConfig | null;
  initialising: boolean;
  login: (username: string, password: string) => Promise<LoginResponseData>;
  logout: () => void;
};

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

type StoredSession = {
  token: string;
  user: LoginUser;
  config: LoginConfig;
};

function readStoredSession(): StoredSession | null {
  if (typeof window === 'undefined') {
    return null;
  }

  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return null;
    }

    const parsed = JSON.parse(raw) as StoredSession;
    if (!parsed?.token || !parsed?.user || !parsed?.config) {
      return null;
    }

    return parsed;
  } catch (error) {
    console.warn('Failed to parse stored auth session', error);
    return null;
  }
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [token, setToken] = useState<string | null>(null);
  const [user, setUser] = useState<LoginUser | null>(null);
  const [config, setConfig] = useState<LoginConfig | null>(null);
  const [initialising, setInitialising] = useState(true);

  const fetchApplicationConfiguration = useCallback(async (): Promise<LoginConfig | null> => {
    try {
      const response = await apiFetch('/api/config');
      if (!response.ok) {
        throw new Error(`Failed to load configuration: ${response.status}`);
      }

      const payload = (await response.json()) as ApiResponse<LoginConfig>;
      if (payload.success && payload.data) {
        return payload.data;
      }
    } catch (error) {
      console.warn('Failed to load application configuration', error);
    }

    return null;
  }, []);

  useEffect(() => {
    let cancelled = false;

    const initialise = async () => {
      const stored = readStoredSession();
      if (stored) {
        setToken(stored.token);
        setUser(stored.user);
        setConfig(stored.config);
      }

      const latestConfig = await fetchApplicationConfiguration();
      if (!cancelled && latestConfig) {
        setConfig(latestConfig);
      }

      if (!cancelled) {
        setInitialising(false);
      }
    };

    initialise();

    return () => {
      cancelled = true;
    };
  }, [fetchApplicationConfiguration]);

  const persistSession = useCallback((session: StoredSession | null) => {
    if (typeof window === 'undefined') {
      return;
    }

    if (session) {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(session));
    } else {
      window.localStorage.removeItem(STORAGE_KEY);
    }
  }, []);

  const login = useCallback<AuthContextValue['login']>(async (username, password) => {
    const response = await apiFetch('/api/auth/login', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ username, password }),
    });

    type ErrorPayload = { detail?: unknown; error?: unknown };

    let payload: LoginResponse | ErrorPayload | null = null;
    try {
      payload = (await response.json()) as LoginResponse;
    } catch (error) {
      console.warn('Failed to parse login response', error);
    }

    const isLoginResponse = (value: unknown): value is LoginResponse => {
      return (
        typeof value === 'object' &&
        value !== null &&
        'success' in value &&
        'data' in value
      );
    };

    if (!payload || !isLoginResponse(payload) || !payload.success || !payload.data) {
      const errorPayload = payload as ErrorPayload | null;
      const detailMessage =
        (errorPayload && typeof errorPayload.detail === 'string' ? errorPayload.detail : null) ??
        (errorPayload && typeof errorPayload.error === 'string' ? errorPayload.error : null);
      throw new Error(detailMessage ?? 'Invalid username or password');
    }

    const session = payload.data;

    setToken(session.token);
    setUser(session.user);
    setConfig(session.config);
    persistSession(session);

    return session;
  }, [persistSession]);

  const logout = useCallback(() => {
    setToken(null);
    setUser(null);
    setConfig(null);
    persistSession(null);

    setInitialising(true);
    fetchApplicationConfiguration().then((latestConfig) => {
      setInitialising(false);
      if (latestConfig) {
        setConfig(latestConfig);
      }
    });
  }, [persistSession, fetchApplicationConfiguration]);

  useEffect(() => {
    if (!token || !user || !config) {
      return;
    }

    persistSession({ token, user, config });
  }, [token, user, config, persistSession]);

  const value = useMemo<AuthContextValue>(() => ({
    token,
    user,
    config,
    initialising,
    login,
    logout,
  }), [token, user, config, initialising, login, logout]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
