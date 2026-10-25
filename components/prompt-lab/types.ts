export type ThinkingLevel = 'minimal' | 'low' | 'medium' | 'high';

export interface ThinkingPreset {
  label: string;
  budget?: number;
  level?: ThinkingLevel;
}

export interface ThinkingInfo {
  kind: 'budget' | 'level';
  canDisable: boolean;
  /** Ordered lowest to highest effort. */
  presets: ThinkingPreset[];
  default: { budget?: number; level?: string };
  min?: number;
  max?: number;
  note?: string;
}

export interface PromptLabModel {
  id: string;
  name: string;
  description: string;
  supportsTemperature: boolean;
  thinking: ThinkingInfo;
}

export interface PromptLabConfig {
  enabled: boolean;
  expiresAt: string | null;
  maxInputTokens: number;
  maxOutputTokens: number;
  allowHistory: boolean;
  defaultModel: string | null;
  models: PromptLabModel[];
  /** Instructor-defined system prompt presets (missing = none). */
  systemPresets?: SystemPresetItem[];
}

export interface SystemPresetItem {
  label: string;
  text: string;
}

export interface ChatMessage {
  role: 'user' | 'model';
  text: string;
}

export interface UsageInfo {
  promptTokens: number;
  thoughtsTokens: number;
  outputTokens: number;
  totalTokens: number;
  firstTokenMs: number;
  latencyMs: number;
  model: string;
  thinkingBudget: number | null;
  thinkingLevel: string | null;
}

export interface GenerateRequest {
  model: string;
  messages: ChatMessage[];
  systemInstruction?: string | null;
  thinking: { budget: number } | { level: string };
  includeThoughts?: boolean;
  temperature?: number | null;
}

export type RunStatus = 'idle' | 'running' | 'done' | 'error';

export interface RunState {
  status: RunStatus;
  thought: string;
  answer: string;
  error: string | null;
  usage: UsageInfo | null;
}

export const EMPTY_RUN: RunState = {
  status: 'idle',
  thought: '',
  answer: '',
  error: null,
  usage: null,
};

export const estimateTokens = (text: string): number => Math.ceil(text.length / 4);

export const presetKey = (p: ThinkingPreset): string => p.label;

export const presetToThinking = (
  model: PromptLabModel,
  preset: ThinkingPreset
): { budget: number } | { level: string } =>
  model.thinking.kind === 'level'
    ? { level: preset.level ?? model.thinking.default.level ?? 'low' }
    : { budget: preset.budget ?? model.thinking.default.budget ?? -1 };

export const isThinkingOff = (preset: ThinkingPreset): boolean => preset.budget === 0;

export const defaultPreset = (model: PromptLabModel): ThinkingPreset | undefined => {
  const { presets, default: d } = model.thinking;
  return (
    presets.find((p) =>
      model.thinking.kind === 'level' ? p.level === d.level : p.budget === d.budget
    ) ?? presets[0]
  );
};

export const lowestPreset = (model: PromptLabModel): ThinkingPreset | undefined =>
  model.thinking.presets[0];

/** Highest-effort preset that is not dynamic (budget -1). */
export const highestFixedPreset = (model: PromptLabModel): ThinkingPreset | undefined => {
  const fixed = model.thinking.presets.filter((p) => p.budget !== -1);
  return fixed[fixed.length - 1] ?? model.thinking.presets[model.thinking.presets.length - 1];
};

export const findPreset = (model: PromptLabModel | undefined, key: string): ThinkingPreset | undefined =>
  model?.thinking.presets.find((p) => presetKey(p) === key);

export const COMPARE_OFF_MODEL = 'gemini-2.5-flash';
