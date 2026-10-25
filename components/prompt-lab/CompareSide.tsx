'use client';

import SystemPromptField from './SystemPromptField';
import ThinkingControl from './ThinkingControl';
import { findPreset, highestFixedPreset, lowestPreset, presetKey, type PromptLabModel, type SystemPresetItem } from './types';

export interface SideState {
  modelId: string;
  sel: string;
  system: string;
}

const field =
  'w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-3 py-2 text-base text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500';

interface Props {
  letter: 'A' | 'B';
  models: PromptLabModel[];
  model?: PromptLabModel;
  state: SideState;
  presets: SystemPresetItem[];
  onChange: (next: SideState) => void;
}

/** One side of an A/B comparison: model, thinking preset and system prompt. */
export default function CompareSide({ letter, models, model, state, presets, onChange }: Props) {
  return (
    <div className="space-y-2 rounded-lg border border-gray-200 dark:border-gray-700 p-3">
      <label className="block space-y-1">
        <span className="text-sm font-medium text-gray-700 dark:text-gray-300">{letter} model</span>
        <select
          className={field}
          aria-label={`${letter} model`}
          value={model?.id ?? ''}
          onChange={(e) => {
            const nm = models.find((x) => x.id === e.target.value);
            // Keep the current thinking setting if the new model has it (e.g. "Medium").
            const np = nm
              ? (findPreset(nm, state.sel) ?? (letter === 'A' ? lowestPreset(nm) : highestFixedPreset(nm)))
              : undefined;
            onChange({ ...state, modelId: e.target.value, sel: np ? presetKey(np) : state.sel });
          }}
        >
          {models.map((x) => (
            <option key={x.id} value={x.id}>
              {x.name}
            </option>
          ))}
        </select>
      </label>
      {model && (
        <ThinkingControl label={`${letter} thinking`} model={model} selected={state.sel} onSelect={(sel) => onChange({ ...state, sel })} />
      )}
      <SystemPromptField prefix={letter} value={state.system} presets={presets} onChange={(system) => onChange({ ...state, system })} />
    </div>
  );
}
