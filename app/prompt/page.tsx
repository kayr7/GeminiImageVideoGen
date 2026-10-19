'use client';

import { useCallback, useEffect, useState } from 'react';
import PromptLab from '@/components/prompt-lab/PromptLab';
import type { PromptLabConfig } from '@/components/prompt-lab/types';
import { apiFetch } from '@/lib/utils/apiClient';

const RECHECK_MS = 20000;

const formatRemaining = (ms: number) => {
  const total = Math.max(0, Math.floor(ms / 1000));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
};

export default function PromptLabPage() {
  const [config, setConfig] = useState<PromptLabConfig | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [checking, setChecking] = useState(false);
  const [now, setNow] = useState(() => Date.now());

  const load = useCallback(async () => {
    setChecking(true);
    try {
      const res = await apiFetch('/api/prompt-lab/config');
      if (!res.ok) throw new Error('bad status');
      const body = await res.json();
      setConfig(body?.data ?? null);
    } catch {
      setConfig(null);
    } finally {
      setLoaded(true);
      setChecking(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const expiresMs = config?.expiresAt ? new Date(config.expiresAt).getTime() : null;
  const active = !!config?.enabled && (expiresMs === null || expiresMs > now);

  // Re-check periodically while inactive
  useEffect(() => {
    if (active) return;
    const id = setInterval(() => void load(), RECHECK_MS);
    return () => clearInterval(id);
  }, [active, load]);

  // Tick for the countdown / expiry
  useEffect(() => {
    if (!config?.enabled || expiresMs === null) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [config?.enabled, expiresMs]);

  const markInactive = useCallback(() => {
    setConfig((c) => (c ? { ...c, enabled: false } : c));
  }, []);

  if (!loaded) {
    return <p className="py-16 text-center text-gray-600 dark:text-gray-300">Loading Prompt Lab…</p>;
  }

  if (!active || !config) {
    return (
      <div className="mx-auto max-w-xl py-16 text-center space-y-4">
        <h1 className="text-3xl font-bold text-gray-900 dark:text-white">Prompt Lab</h1>
        <p className="text-lg text-gray-600 dark:text-gray-300">
          Prompt Lab is not active right now — your instructor will open it during the lecture.
        </p>
        <button
          type="button"
          onClick={() => {
            setNow(Date.now());
            void load();
          }}
          disabled={checking}
          className="rounded-lg bg-blue-600 px-6 py-3 text-lg font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
        >
          {checking ? 'Checking…' : 'Check again'}
        </button>
        <p className="text-sm text-gray-500 dark:text-gray-400">This page re-checks automatically every 20 seconds.</p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-6xl space-y-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h1 className="text-3xl font-bold text-gray-900 dark:text-white">Prompt Lab</h1>
        {expiresMs !== null && (
          <span className="text-sm text-gray-500 dark:text-gray-400" data-testid="remaining">
            Closes in {formatRemaining(expiresMs - now)}
          </span>
        )}
      </div>
      <PromptLab config={config} onInactive={markInactive} />
    </div>
  );
}
