'use client';

import { useCallback, useEffect, useMemo, useSyncExternalStore } from 'react';
import { useAuth } from '@/lib/context/AuthContext';
import { placeholderAPI } from '@/lib/placeholders/api';
import type {
  CreatePlaceholderRequest,
  Placeholder,
  UpdatePlaceholderRequest,
} from '@/types/placeholders';

/**
 * Module-level cache of the logged-in user's saved placeholders, shared by every
 * component that calls `usePlaceholders()` (generators, template selector, profile).
 * It is loaded once per token and kept in sync by the mutating helpers.
 */
type StoreState = {
  token: string | null;
  placeholders: Placeholder[];
  loading: boolean;
  loaded: boolean;
  error: string | null;
};

const initialState: StoreState = {
  token: null,
  placeholders: [],
  loading: false,
  loaded: false,
  error: null,
};

let state: StoreState = initialState;
let inflight: Promise<void> | null = null;
const listeners = new Set<() => void>();

const sortByName = (items: Placeholder[]) =>
  [...items].sort((a, b) => a.name.localeCompare(b.name));

function setState(patch: Partial<StoreState>) {
  state = { ...state, ...patch };
  listeners.forEach((listener) => listener());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

const getSnapshot = () => state;

/** Reset the shared cache (used on logout and in tests). */
export function resetPlaceholderStore() {
  inflight = null;
  state = initialState;
  listeners.forEach((listener) => listener());
}

function load(token: string): Promise<void> {
  if (inflight && state.token === token) {
    return inflight;
  }

  setState({ token, loading: true, error: null, ...(state.token !== token ? { placeholders: [], loaded: false } : {}) });

  const request = placeholderAPI
    .list()
    .then((placeholders) => {
      if (state.token !== token) return;
      setState({ placeholders: sortByName(placeholders), loading: false, loaded: true, error: null });
    })
    .catch((err: unknown) => {
      if (state.token !== token) return;
      setState({
        loading: false,
        loaded: true,
        error: err instanceof Error ? err.message : 'Failed to load placeholders',
      });
    })
    .finally(() => {
      if (inflight === request) inflight = null;
    });

  inflight = request;
  return request;
}

function replaceOne(placeholder: Placeholder) {
  const rest = state.placeholders.filter((p) => p.id !== placeholder.id && p.name !== placeholder.name);
  setState({ placeholders: sortByName([...rest, placeholder]) });
}

export interface UsePlaceholdersResult {
  placeholders: Placeholder[];
  byName: Record<string, Placeholder>;
  loading: boolean;
  loaded: boolean;
  error: string | null;
  /** True when a user is logged in (placeholders can be saved). */
  enabled: boolean;
  /** Save `value` as the default for `name` (create or update by name). */
  save: (name: string, value: string, description?: string | null) => Promise<Placeholder>;
  upsert: (name: string, value: string, description?: string | null) => Promise<Placeholder>;
  create: (request: CreatePlaceholderRequest) => Promise<Placeholder>;
  update: (id: string, request: UpdatePlaceholderRequest) => Promise<Placeholder>;
  remove: (id: string) => Promise<void>;
  refresh: () => Promise<void>;
}

const requireToken = (token: string | null) => {
  if (!token) {
    throw new Error('Please log in to save placeholders.');
  }
};

export function usePlaceholders(): UsePlaceholdersResult {
  const { token } = useAuth();
  const snapshot = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);

  useEffect(() => {
    if (!token) {
      if (state.token !== null || state.placeholders.length > 0) {
        resetPlaceholderStore();
      }
      return;
    }
    if (state.token !== token || (!state.loaded && !inflight)) {
      void load(token);
    }
  }, [token]);

  const active = !!token && snapshot.token === token;
  const placeholders = useMemo(() => (active ? snapshot.placeholders : []), [active, snapshot.placeholders]);

  const byName = useMemo(() => {
    const map: Record<string, Placeholder> = {};
    for (const placeholder of placeholders) {
      map[placeholder.name] = placeholder;
    }
    return map;
  }, [placeholders]);

  const upsert = useCallback(
    async (name: string, value: string, description?: string | null) => {
      requireToken(token);
      const request: { value: string; description?: string | null } = { value };
      if (description !== undefined) request.description = description;
      const saved = await placeholderAPI.upsertByName(name, request);
      replaceOne(saved);
      return saved;
    },
    [token],
  );

  const create = useCallback(
    async (request: CreatePlaceholderRequest) => {
      requireToken(token);
      const created = await placeholderAPI.create(request);
      replaceOne(created);
      return created;
    },
    [token],
  );

  const update = useCallback(
    async (id: string, request: UpdatePlaceholderRequest) => {
      requireToken(token);
      const updated = await placeholderAPI.update(id, request);
      setState({ placeholders: state.placeholders.filter((p) => p.id !== id) });
      replaceOne(updated);
      return updated;
    },
    [token],
  );

  const remove = useCallback(
    async (id: string) => {
      requireToken(token);
      await placeholderAPI.delete(id);
      setState({ placeholders: state.placeholders.filter((p) => p.id !== id) });
    },
    [token],
  );

  const refresh = useCallback(async () => {
    if (!token) return;
    inflight = null;
    await load(token);
  }, [token]);

  return {
    placeholders,
    byName,
    loading: active ? snapshot.loading : false,
    loaded: active ? snapshot.loaded : false,
    error: active ? snapshot.error : null,
    enabled: !!token,
    save: upsert,
    upsert,
    create,
    update,
    remove,
    refresh,
  };
}
