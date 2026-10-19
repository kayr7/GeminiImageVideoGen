export interface ThinkingPreset {
  label: string;
  budget: number;
}

export interface ThinkingInfo {
  canDisable: boolean;
  min: number;
  max: number;
  defaultBudget: number;
  presets: ThinkingPreset[];
}

export interface PromptLabModel {
  id: string;
  name: string;
  description: string;
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
  thinkingBudget: number;
}

export interface GenerateRequest {
  model: string;
  messages: ChatMessage[];
  systemInstruction?: string | null;
  thinking: { budget: number };
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
  budget: number | null;
}

export const EMPTY_RUN: RunState = {
  status: 'idle',
  thought: '',
  answer: '',
  error: null,
  usage: null,
  budget: null,
};

export const estimateTokens = (text: string): number => Math.ceil(text.length / 4);
