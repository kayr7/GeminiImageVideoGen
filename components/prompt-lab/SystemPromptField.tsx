'use client';

import { SYSTEM_PRESETS } from './examples';
import type { SystemPresetItem } from './types';

const field =
  'w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-3 py-2 text-base text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500';

interface Props {
  value: string;
  onChange: (value: string) => void;
  /** Instructor presets, shown first. */
  presets?: SystemPresetItem[];
  /** Prefix for accessible names, e.g. "A" gives "A system prompt". */
  prefix?: string;
}

/** System prompt textarea with a presets dropdown (instructor presets, then built-ins). */
export default function SystemPromptField({ value, onChange, presets = [], prefix }: Props) {
  const name = (s: string) => (prefix ? `${prefix} ${s}` : s[0].toUpperCase() + s.slice(1));
  const pick = (key: string) => {
    if (key.startsWith('i:')) onChange(presets[Number(key.slice(2))]?.text ?? value);
    else if (key.startsWith('b:')) onChange(SYSTEM_PRESETS.find((p) => p.id === key.slice(2))?.text ?? value);
  };
  return (
    <div className="space-y-1">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
          {prefix ? `${prefix} system prompt` : 'System prompt'}
        </span>
        <select
          aria-label={name('presets')}
          className="rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-2 py-1 text-sm text-gray-700 dark:text-gray-200"
          value=""
          onChange={(e) => pick(e.target.value)}
        >
          <option value="">Presets…</option>
          {presets.length > 0 && (
            <optgroup label="From your instructor">
              {presets.map((p, i) => (
                <option key={`i${i}`} value={`i:${i}`}>
                  {p.label}
                </option>
              ))}
            </optgroup>
          )}
          <optgroup label="Built-in">
            {SYSTEM_PRESETS.map((p) => (
              <option key={p.id} value={`b:${p.id}`}>
                {p.label}
              </option>
            ))}
          </optgroup>
        </select>
      </div>
      <textarea
        className={field}
        rows={3}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="Optional: tell the model who it is and how to answer, e.g. “You are a helpful tutor who answers in one sentence.”"
        aria-label={name('system prompt')}
      />
    </div>
  );
}
