'use client';

import { useEffect, useState } from 'react';
import { apiFetch } from '@/lib/utils/apiClient';

/** Polls the public Prompt Lab config (every 60 s) and reports whether it is active. */
export function usePromptLabStatus(intervalMs = 60000): boolean {
  const [enabled, setEnabled] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const check = async () => {
      try {
        const res = await apiFetch('/api/prompt-lab/config');
        if (!res.ok) throw new Error('bad status');
        const body = await res.json();
        if (!cancelled) setEnabled(Boolean(body?.data?.enabled));
      } catch {
        if (!cancelled) setEnabled(false);
      }
    };
    void check();
    const id = setInterval(check, intervalMs);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [intervalMs]);

  return enabled;
}
