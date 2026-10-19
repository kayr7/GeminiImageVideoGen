'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { apiFetch } from '@/lib/utils/apiClient';
import type { PromptLabModel, SystemPresetItem } from '@/components/prompt-lab/types';

interface Settings {
  enabled: boolean;
  expiresAt: string | null;
  allowedModels: string[];
  defaultModel: string | null;
  maxOutputTokens: number;
  allowHistory: boolean;
  systemPresets?: SystemPresetItem[];
}

interface Stats {
  today: {
    date: string;
    requests: number;
    promptTokens: number;
    thoughtsTokens: number;
    outputTokens: number;
    errors: number;
    rejected: number;
  };
  activeRequests: number;
}

interface PanelData {
  settings: Settings;
  availableModels: PromptLabModel[];
  stats: Stats;
}

const DURATIONS: Array<{ label: string; value: number | null }> = [
  { label: '30 minutes', value: 30 },
  { label: '1 hour', value: 60 },
  { label: '2 hours', value: 120 },
  { label: '3 hours', value: 180 },
  { label: 'Until I turn it off', value: null },
];

const REFRESH_MS = 10000;

const formatTime = (iso: string) =>
  new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

export default function PromptLabPanel() {
  const [data, setData] = useState<PanelData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [copied, setCopied] = useState(false);
  const [duration, setDuration] = useState<string>('60');

  // Editable form fields (not overwritten by polling once touched)
  const [allowed, setAllowed] = useState<string[]>([]);
  const [defaultModel, setDefaultModel] = useState<string>('');
  const [maxOutput, setMaxOutput] = useState<number>(2048);
  const [allowHistory, setAllowHistory] = useState(true);
  const [presets, setPresets] = useState<SystemPresetItem[]>([]);
  const [newLabel, setNewLabel] = useState('');
  const [newText, setNewText] = useState('');
  const dirty = useRef(false);

  const apply = useCallback((d: PanelData, force = false) => {
    setData(d);
    if (force || !dirty.current) {
      setAllowed(d.settings.allowedModels);
      setDefaultModel(d.settings.defaultModel ?? '');
      setMaxOutput(d.settings.maxOutputTokens);
      setAllowHistory(d.settings.allowHistory);
      setPresets(d.settings.systemPresets ?? []);
      dirty.current = false;
    }
  }, []);

  const load = useCallback(async () => {
    try {
      const res = await apiFetch('/api/admin/prompt-lab');
      if (!res.ok) throw new Error(`Failed to load Prompt Lab (${res.status})`);
      const body = await res.json();
      apply(body.data);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load Prompt Lab');
    }
  }, [apply]);

  useEffect(() => {
    void load();
    const id = setInterval(() => {
      if (typeof document === 'undefined' || document.visibilityState !== 'hidden') void load();
    }, REFRESH_MS);
    return () => clearInterval(id);
  }, [load]);

  const save = async (patch: Record<string, unknown>): Promise<boolean> => {
    setSaving(true);
    try {
      const res = await apiFetch('/api/admin/prompt-lab', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(patch),
      });
      if (!res.ok) {
        const b = await res.json().catch(() => null);
        throw new Error(typeof b?.detail === 'string' ? b.detail : `Save failed (${res.status})`);
      }
      const body = await res.json();
      apply(body.data, true);
      setError(null);
      return true;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Save failed');
      return false;
    } finally {
      setSaving(false);
    }
  };

  const studentUrl = `${typeof window !== 'undefined' ? window.location.origin : ''}${process.env.NEXT_PUBLIC_BASE_PATH ?? ''}/prompt`;

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(studentUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setError('Could not copy automatically — select the URL and copy it manually.');
    }
  };

  const touch = () => {
    dirty.current = true;
  };

  if (!data) {
    return (
      <section className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 p-4">
        <h2 className="text-xl font-bold text-gray-900 dark:text-white">Prompt Lab</h2>
        <p className="text-sm text-gray-600 dark:text-gray-300">{error ?? 'Loading…'}</p>
      </section>
    );
  }

  const { settings, availableModels, stats } = data;
  const enabled = settings.enabled;
  const input = 'rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-3 py-2 text-sm text-gray-900 dark:text-white';

  return (
    <section className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 p-4 space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-gray-900 dark:text-white">Prompt Lab</h2>
          <p className={`text-sm font-medium ${enabled ? 'text-green-600 dark:text-green-400' : 'text-gray-500 dark:text-gray-400'}`}>
            {enabled
              ? settings.expiresAt
                ? `Active — closes at ${formatTime(settings.expiresAt)}`
                : 'Active — open until you turn it off'
              : 'Inactive'}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          {!enabled && (
            <select
              aria-label="Duration"
              className={input}
              value={duration}
              onChange={(e) => setDuration(e.target.value)}
            >
              {DURATIONS.map((d) => (
                <option key={d.label} value={d.value === null ? 'none' : String(d.value)}>
                  {d.label}
                </option>
              ))}
            </select>
          )}
          <button
            type="button"
            role="switch"
            aria-checked={enabled}
            aria-label="Prompt Lab on/off"
            disabled={saving}
            onClick={() =>
              enabled
                ? save({ enabled: false })
                : save({ enabled: true, durationMinutes: duration === 'none' ? null : parseInt(duration, 10) })
            }
            className={`relative inline-flex h-10 w-20 items-center rounded-full transition-colors disabled:opacity-50 ${enabled ? 'bg-green-500' : 'bg-gray-400 dark:bg-gray-600'}`}
          >
            <span className={`inline-block h-8 w-8 transform rounded-full bg-white shadow transition-transform ${enabled ? 'translate-x-11' : 'translate-x-1'}`} />
          </button>
        </div>
      </div>

      {error && <p role="alert" className="text-sm text-red-600 dark:text-red-400">{error}</p>}

      <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm text-gray-600 dark:text-gray-300">Student URL:</span>
        <code className="rounded bg-gray-100 dark:bg-gray-800 px-2 py-1 text-sm break-all text-gray-900 dark:text-gray-100">{studentUrl}</code>
        <button type="button" onClick={copy} className="rounded-lg border border-gray-300 dark:border-gray-600 px-3 py-1 text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-800">
          {copied ? 'Copied!' : 'Copy'}
        </button>
      </div>

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-7 text-sm">
        {[
          ['Active requests', stats.activeRequests],
          ['Requests today', stats.today.requests],
          ['Input tokens', stats.today.promptTokens],
          ['Thinking tokens', stats.today.thoughtsTokens],
          ['Output tokens', stats.today.outputTokens],
          ['Errors', stats.today.errors],
          ['Rejected', stats.today.rejected],
        ].map(([label, value]) => (
          <div key={label as string} className="rounded-lg bg-gray-100 dark:bg-gray-800 px-3 py-2">
            <div className="text-xs text-gray-500 dark:text-gray-400">{label}</div>
            <div className="text-lg font-semibold text-gray-900 dark:text-white">{(value as number).toLocaleString()}</div>
          </div>
        ))}
      </div>

      <details className="rounded-lg border border-gray-200 dark:border-gray-700 p-3">
        <summary className="cursor-pointer text-sm font-medium text-gray-800 dark:text-gray-100">Settings</summary>
        <div className="mt-3 space-y-3">
          <fieldset>
            <legend className="text-sm font-medium text-gray-700 dark:text-gray-300">Allowed models</legend>
            <div className="mt-1 flex flex-wrap gap-4">
              {availableModels.map((m) => (
                <label key={m.id} className="flex items-center gap-2 text-sm text-gray-800 dark:text-gray-200">
                  <input
                    type="checkbox"
                    checked={allowed.includes(m.id)}
                    onChange={(e) => {
                      touch();
                      setAllowed((a) => (e.target.checked ? [...a, m.id] : a.filter((x) => x !== m.id)));
                    }}
                  />
                  {m.name}
                </label>
              ))}
            </div>
          </fieldset>
          <div className="flex flex-wrap items-end gap-4">
            <label className="text-sm text-gray-700 dark:text-gray-300">
              <span className="block">Default model</span>
              <select
                className={input}
                value={defaultModel}
                onChange={(e) => {
                  touch();
                  setDefaultModel(e.target.value);
                }}
              >
                <option value="">(first allowed)</option>
                {availableModels
                  .filter((m) => allowed.includes(m.id))
                  .map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.name}
                    </option>
                  ))}
              </select>
            </label>
            <label className="text-sm text-gray-700 dark:text-gray-300">
              <span className="block">Max output tokens</span>
              <input
                type="number"
                min={64}
                className={`${input} w-32`}
                value={maxOutput}
                onChange={(e) => {
                  touch();
                  setMaxOutput(parseInt(e.target.value, 10) || 0);
                }}
              />
            </label>
            <label className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300">
              <input
                type="checkbox"
                checked={allowHistory}
                onChange={(e) => {
                  touch();
                  setAllowHistory(e.target.checked);
                }}
              />
              Allow chat history
            </label>
            <button
              type="button"
              disabled={saving || allowed.length === 0}
              onClick={() =>
                save({
                  allowedModels: allowed,
                  defaultModel: defaultModel || null,
                  maxOutputTokens: maxOutput,
                  allowHistory,
                })
              }
              className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
            >
              Save settings
            </button>
          </div>
        </div>
      </details>

      <details className="rounded-lg border border-gray-200 dark:border-gray-700 p-3">
        <summary className="cursor-pointer text-sm font-medium text-gray-800 dark:text-gray-100">System prompt presets</summary>
        <div className="mt-3 space-y-3">
          <p className="text-sm text-gray-600 dark:text-gray-300">
            Students see these first in the Presets menu next to the system prompt. Adding or removing a preset saves immediately.
          </p>
          {presets.length === 0 && <p className="text-sm text-gray-500 dark:text-gray-400">No presets yet.</p>}
          <ul className="space-y-2">
            {presets.map((p, i) => (
              <li key={i} className="flex items-start justify-between gap-3 rounded-lg bg-gray-100 dark:bg-gray-800 px-3 py-2">
                <div className="min-w-0 text-sm">
                  <div className="font-medium text-gray-900 dark:text-white">{p.label}</div>
                  <div className="text-gray-600 dark:text-gray-300 break-words">
                    {p.text.length > 120 ? `${p.text.slice(0, 120)}…` : p.text}
                  </div>
                </div>
                <button
                  type="button"
                  aria-label={`Remove ${p.label}`}
                  disabled={saving}
                  onClick={() => void save({ systemPresets: presets.filter((_, j) => j !== i) })}
                  className="shrink-0 rounded-lg border border-gray-300 dark:border-gray-600 px-3 py-1 text-sm text-red-600 dark:text-red-400 hover:bg-white dark:hover:bg-gray-700"
                >
                  Remove
                </button>
              </li>
            ))}
          </ul>
          <div className="space-y-2">
            <input
              aria-label="Preset label"
              className={`${input} w-full sm:w-64`}
              maxLength={60}
              placeholder="Label"
              value={newLabel}
              onChange={(e) => setNewLabel(e.target.value)}
            />
            <textarea
              aria-label="Preset text"
              className={`${input} w-full`}
              rows={3}
              maxLength={8000}
              placeholder="System prompt text"
              value={newText}
              onChange={(e) => setNewText(e.target.value)}
            />
            <div className="flex flex-wrap gap-3">
              <button
                type="button"
                disabled={saving || !newLabel.trim() || presets.length >= 20}
                onClick={async () => {
                  if (await save({ systemPresets: [...presets, { label: newLabel.trim(), text: newText }] })) {
                    setNewLabel('');
                    setNewText('');
                  }
                }}
                className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
              >
                Add preset
              </button>
            </div>
          </div>
        </div>
      </details>
    </section>
  );
}
