'use client';

import { defaultPreset, findPreset, presetKey, type PromptLabModel } from './types';

export default function ThinkingControl({
  label,
  model,
  selected,
  onSelect,
}: {
  label: string;
  model: PromptLabModel;
  selected: string;
  onSelect: (key: string) => void;
}) {
  const active = findPreset(model, selected) ?? defaultPreset(model);
  return (
    <div className="space-y-1">
      <span className="text-sm font-medium text-gray-700 dark:text-gray-300">{label}</span>
      <div role="radiogroup" aria-label={label} className="flex flex-wrap gap-1 rounded-xl bg-gray-100 dark:bg-gray-800 p-1">
        {model.thinking.presets.map((p) => {
          const on = !!active && presetKey(p) === presetKey(active);
          return (
            <button
              key={presetKey(p)}
              type="button"
              role="radio"
              aria-checked={on}
              onClick={() => onSelect(presetKey(p))}
              className={`flex-1 rounded-lg px-3 py-2 text-base font-semibold transition-colors ${
                on ? 'bg-blue-600 text-white shadow' : 'text-gray-700 dark:text-gray-200 hover:bg-white dark:hover:bg-gray-700'
              }`}
            >
              {p.label}
            </button>
          );
        })}
      </div>
      {model.thinking.note && <p className="text-sm text-gray-500 dark:text-gray-400">{model.thinking.note}</p>}
    </div>
  );
}
