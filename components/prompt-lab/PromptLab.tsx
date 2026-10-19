'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import CompareSide, { type SideState } from './CompareSide';
import OutputPane from './OutputPane';
import SimpleMarkdown from './SimpleMarkdown';
import SystemPromptField from './SystemPromptField';
import ThinkingControl from './ThinkingControl';
import TokenMeter from './TokenMeter';
import { PromptLabError, streamGenerate } from './client';
import { COT_SUFFIX, EXAMPLES, FEW_SHOT_SCAFFOLD, ROLE_SCAFFOLD } from './examples';
import {
  EMPTY_RUN,
  type ChatMessage,
  type PromptLabConfig,
  type RunState,
  COMPARE_OFF_MODEL,
  defaultPreset,
  estimateTokens,
  findPreset,
  highestFixedPreset,
  isThinkingOff,
  lowestPreset,
  presetKey,
  presetToThinking,
  type PromptLabModel,
  type ThinkingPreset,
} from './types';

interface Props {
  config: PromptLabConfig;
  onInactive: () => void;
}

const field =
  'w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-3 py-2 text-base text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500';
const smallBtn =
  'rounded-lg border border-gray-300 dark:border-gray-600 px-3 py-1.5 text-sm font-medium text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-800';

export default function PromptLab({ config, onInactive }: Props) {
  const [modelId, setModelId] = useState(config.defaultModel ?? config.models[0]?.id ?? '');
  const model = useMemo(
    () => config.models.find((m) => m.id === modelId) ?? config.models[0],
    [config.models, modelId]
  );
  const [presetSel, setPresetSel] = useState<string>(() => (model ? presetKey(defaultPreset(model) ?? { label: '' }) : ''));
  const [showThoughts, setShowThoughts] = useState(true);
  const [system, setSystem] = useState('');
  const [advOpen, setAdvOpen] = useState(false);
  const [temperature, setTemperature] = useState<number | null>(null);
  const [mode, setMode] = useState<'single' | 'chat'>('single');
  const [compare, setCompare] = useState(false);
  const [prompt, setPrompt] = useState('');
  const [history, setHistory] = useState<ChatMessage[]>([]);
  const [pending, setPending] = useState<string | null>(null);
  const [left, setLeft] = useState<RunState>(EMPTY_RUN);
  const [right, setRight] = useState<RunState>(EMPTY_RUN);
  const [runId, setRunId] = useState(0);
  const controllers = useRef<AbortController[]>([]);

  const chat = mode === 'chat' && config.allowHistory;
  const running = left.status === 'running' || right.status === 'running';
  const preset = findPreset(model, presetSel) ?? (model ? defaultPreset(model) : undefined);

  // Compare-mode sides A and B: each has its own model, thinking preset and system prompt.
  const [sideA, setSideA] = useState<SideState>({ modelId: '', sel: '', system: '' });
  const [sideB, setSideB] = useState<SideState>({ modelId: '', sel: '', system: '' });
  const modelById = useCallback((id: string) => config.models.find((m) => m.id === id), [config.models]);
  const modelA = modelById(sideA.modelId) ?? model;
  const modelB = modelById(sideB.modelId) ?? model;
  const presetA = findPreset(modelA, sideA.sel) ?? (modelA ? lowestPreset(modelA) : undefined);
  const presetB = findPreset(modelB, sideB.sel) ?? (modelB ? highestFixedPreset(modelB) : undefined);
  const instructorPresets = config.systemPresets ?? [];

  // Quick setups. "thinking": same prompt, different thinking. "system": same model, different system prompt.
  const setupCompare = (kind: 'thinking' | 'system') => {
    if (!model) return;
    if (kind === 'system') {
      const sel = presetKey(preset ?? { label: '' });
      setSideA({ modelId: model.id, sel, system });
      setSideB({ modelId: model.id, sel, system: '' });
      return;
    }
    const base = modelById(COMPARE_OFF_MODEL);
    const offPreset = base?.thinking.presets.find(isThinkingOff);
    const a = base && offPreset ? { modelId: base.id, sel: presetKey(offPreset) } : { modelId: model.id, sel: presetKey(lowestPreset(model) ?? { label: '' }) };
    setSideA({ ...a, system });
    setSideB({ modelId: model.id, sel: presetKey(highestFixedPreset(model) ?? { label: '' }), system });
  };

  const onModelChange = (id: string) => {
    setModelId(id);
    const m = config.models.find((x) => x.id === id);
    const dp = m ? defaultPreset(m) : undefined;
    if (dp) setPresetSel(presetKey(dp));
  };

  // Token estimate (compare mode: the larger of the two sides)
  const showCompare = compare && !chat;
  const histTokens = chat ? estimateTokens(history.map((m) => m.text).join('')) : 0;
  const tokensFor = (sys: string) => estimateTokens(sys + prompt) + histTokens;
  const used = showCompare ? Math.max(tokensFor(sideA.system), tokensFor(sideB.system)) : tokensFor(system);
  const over = used > config.maxInputTokens;
  const canSend = !running && !over && prompt.trim().length > 0 && !!model;

  const stop = () => {
    controllers.current.forEach((c) => c.abort());
  };
  useEffect(() => () => controllers.current.forEach((c) => c.abort()), []);

  const runOne = useCallback(
    async (
      set: (fn: (r: RunState) => RunState) => void,
      runModel: PromptLabModel,
      runPreset: ThinkingPreset,
      runSystem: string,
      messages: ChatMessage[],
      controller: AbortController
    ): Promise<{ answer: string; ok: boolean }> => {
      let answer = '';
      set(() => ({ ...EMPTY_RUN, status: 'running' }));
      try {
        await streamGenerate(
          {
            model: runModel.id,
            messages,
            systemInstruction: runSystem.trim() ? runSystem : null,
            thinking: presetToThinking(runModel, runPreset),
            includeThoughts: showThoughts && !isThinkingOff(runPreset),
            ...(runModel.supportsTemperature ? { temperature } : {}),
          },
          {
            onThought: (t) => set((r) => ({ ...r, thought: r.thought + t })),
            onAnswer: (t) => {
              answer += t;
              set((r) => ({ ...r, answer: r.answer + t }));
            },
            onUsage: (u) => set((r) => ({ ...r, usage: u })),
          },
          controller.signal
        );
        set((r) => ({ ...r, status: 'done' }));
        return { answer, ok: true };
      } catch (err) {
        if ((err as { name?: string })?.name === 'AbortError') {
          set((r) => ({ ...r, status: 'done' }));
          return { answer, ok: false };
        }
        const e = err as PromptLabError;
        if (e.status === 403) onInactive();
        set((r) => ({ ...r, status: 'error', error: e.message || 'Something went wrong' }));
        return { answer, ok: false };
      }
    },
    [showThoughts, temperature, onInactive]
  );

  const send = useCallback(async () => {
    if (!canSend || !model || !preset) return;
    const text = prompt;
    const messages: ChatMessage[] = chat
      ? [...history, { role: 'user', text }]
      : [{ role: 'user', text }];
    setRunId((n) => n + 1);
    const c1 = new AbortController();
    controllers.current = [c1];

    if (chat) {
      setPending(text);
      setPrompt('');
      setRight(EMPTY_RUN);
      const res = await runOne(setLeft, model, preset, system, messages, c1);
      if (res.answer) {
        setHistory([...messages, { role: 'model', text: res.answer }]);
      } else if (!res.ok) {
        setPrompt(text);
      }
      setPending(null);
      return;
    }

    if (compare) {
      const c2 = new AbortController();
      controllers.current = [c1, c2];
      await Promise.all([
        runOne(setLeft, modelA!, presetA!, sideA.system, messages, c1),
        runOne(setRight, modelB!, presetB!, sideB.system, messages, c2),
      ]);
    } else {
      setRight(EMPTY_RUN);
      await runOne(setLeft, model, preset, system, messages, c1);
    }
  }, [canSend, model, preset, prompt, chat, history, compare, system, modelA, presetA, sideA.system, modelB, presetB, sideB.system, runOne]);

  const clearHistory = () => {
    stop();
    setHistory([]);
    setPending(null);
    setLeft(EMPTY_RUN);
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key !== 'Enter') return;
    if (chat ? !e.shiftKey : e.ctrlKey || e.metaKey) {
      e.preventDefault();
      void send();
    }
  };

  const appendPrompt = (text: string) =>
    setPrompt((p) => (p.trim() ? `${p.replace(/\s+$/, '')}\n\n${text}` : text));

  if (!model) {
    return <p className="text-gray-600 dark:text-gray-300">No models are available right now.</p>;
  }

  const thinkingOff = showCompare
    ? !!presetA && !!presetB && isThinkingOff(presetA) && isThinkingOff(presetB)
    : !!preset && isThinkingOff(preset);
  const showTemperature = showCompare
    ? !!modelA?.supportsTemperature || !!modelB?.supportsTemperature
    : model.supportsTemperature;
  const sideTitle = (letter: string, m?: PromptLabModel, pr?: ThinkingPreset, sys = '') => {
    const flat = sys.trim().replace(/\s+/g, ' ');
    const hint = flat ? `‘${flat.length > 40 ? `${flat.slice(0, 40).trimEnd()}…` : flat}’` : 'no system prompt';
    return `${letter} · ${m?.name ?? ''} · ${pr?.label ?? ''} · ${hint}`;
  };

  return (
    <div className="space-y-6">
      {/* Controls */}
      <section className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 p-4 space-y-4">
        <div className="grid gap-4 md:grid-cols-2">
          <label className="block space-y-1">
            <span className="text-sm font-medium text-gray-700 dark:text-gray-300">Model</span>
            <select className={field} value={model.id} onChange={(e) => onModelChange(e.target.value)} aria-label="Model">
              {config.models.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name}
                </option>
              ))}
            </select>
            <span className="block text-sm text-gray-500 dark:text-gray-400">{model.description}</span>
          </label>

          <div className="space-y-1">
            {!showCompare ? (
              <ThinkingControl label="Thinking" model={model} selected={presetSel} onSelect={setPresetSel} />
            ) : (
              <p className="text-sm text-gray-600 dark:text-gray-300">Choose a model, thinking setting and system prompt for each side below.</p>
            )}
            {!thinkingOff && (
              <label className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300">
                <input type="checkbox" checked={showThoughts} onChange={(e) => setShowThoughts(e.target.checked)} />
                Show thoughts
              </label>
            )}
          </div>
        </div>

        {showCompare && (
          <div className="space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-sm font-medium text-gray-700 dark:text-gray-300">What do you want to compare?</span>
              <button type="button" className={smallBtn} onClick={() => setupCompare('thinking')}>
                Thinking
              </button>
              <button type="button" className={smallBtn} onClick={() => setupCompare('system')}>
                System prompt
              </button>
            </div>
            <div className="grid gap-4 md:grid-cols-2">
              <CompareSide letter="A" models={config.models} model={modelA} state={sideA} presets={instructorPresets} onChange={setSideA} />
              <CompareSide letter="B" models={config.models} model={modelB} state={sideB} presets={instructorPresets} onChange={setSideB} />
            </div>
          </div>
        )}

        <p className="text-sm text-gray-500 dark:text-gray-400">
          Gemini 3.x models always think a little; use Gemini 2.5 Flash · Off to see a model with no reasoning.
        </p>

        <div className="flex flex-wrap items-center gap-4">
          <div role="group" aria-label="Mode" className="inline-flex rounded-lg bg-gray-100 dark:bg-gray-800 p-1">
            <button
              type="button"
              aria-pressed={!chat}
              onClick={() => setMode('single')}
              className={`rounded-md px-3 py-1.5 text-sm font-medium ${!chat ? 'bg-white dark:bg-gray-700 shadow text-gray-900 dark:text-white' : 'text-gray-600 dark:text-gray-300'}`}
            >
              Single prompt
            </button>
            <button
              type="button"
              aria-pressed={chat}
              disabled={!config.allowHistory}
              title={config.allowHistory ? undefined : 'Chat is disabled by the instructor'}
              onClick={() => {
                setMode('chat');
                setCompare(false);
              }}
              className={`rounded-md px-3 py-1.5 text-sm font-medium disabled:opacity-40 ${chat ? 'bg-white dark:bg-gray-700 shadow text-gray-900 dark:text-white' : 'text-gray-600 dark:text-gray-300'}`}
            >
              Chat (keeps history)
            </button>
          </div>

          <label className={`flex items-center gap-2 text-base font-medium ${chat ? 'opacity-40' : 'text-gray-800 dark:text-gray-100'}`}>
            <input
              type="checkbox"
              checked={compare && !chat}
              disabled={chat}
              onChange={(e) => {
                setCompare(e.target.checked);
                if (e.target.checked) setupCompare(system.trim() ? 'system' : 'thinking');
              }}
              className="h-4 w-4"
            />
            Compare A/B
          </label>

          <button type="button" className={smallBtn} onClick={() => setAdvOpen((o) => !o)} aria-expanded={advOpen}>
            {advOpen ? 'Hide' : 'Show'} advanced
          </button>
        </div>

        {advOpen && showTemperature && (
          <div className="space-y-2">
            <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
              Temperature: {temperature === null ? 'model default' : temperature.toFixed(1)}
            </span>
            <div className="flex items-center gap-3">
              <input
                type="range"
                min={0}
                max={2}
                step={0.1}
                value={temperature ?? 1}
                onChange={(e) => setTemperature(parseFloat(e.target.value))}
                className="flex-1"
                aria-label="Temperature"
              />
              <button type="button" className={smallBtn} onClick={() => setTemperature(null)}>
                Default
              </button>
            </div>
          </div>
        )}
      </section>

      {/* Chat history */}
      {chat && (history.length > 0 || pending !== null) && (
        <section className="space-y-3" aria-label="Conversation">
          {history.map((m, i) => (
            <Bubble key={i} role={m.role} text={m.text} />
          ))}
          {pending !== null && <Bubble role="user" text={pending} />}
          {pending !== null && (
            <div className="mr-8 rounded-2xl rounded-bl-sm bg-gray-100 dark:bg-gray-800 p-4">
              <OutputPane key={runId} run={left} />
            </div>
          )}
        </section>
      )}

      {/* Prompt */}
      <section className="space-y-3">
        {!showCompare && <SystemPromptField value={system} presets={instructorPresets} onChange={setSystem} />}

        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm font-medium text-gray-700 dark:text-gray-300 mr-1">Techniques:</span>
          <button type="button" className={smallBtn} onClick={() => setPrompt((p) => (p.trim() ? `${p}\n\n${FEW_SHOT_SCAFFOLD}` : FEW_SHOT_SCAFFOLD))}>
            Few-shot
          </button>
          <button type="button" className={smallBtn} onClick={() => appendPrompt(COT_SUFFIX)}>
            Chain-of-thought
          </button>
          {!showCompare && (
            <button
              type="button"
              className={smallBtn}
              onClick={() => setSystem((s) => (s.trim() ? s : ROLE_SCAFFOLD))}
            >
              Role
            </button>
          )}
          <select
            aria-label="Examples"
            className="rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-3 py-1.5 text-sm text-gray-700 dark:text-gray-200"
            value=""
            onChange={(e) => {
              const ex = EXAMPLES.find((x) => x.id === e.target.value);
              if (ex) {
                setPrompt(ex.prompt);
                if (ex.system) setSystem(ex.system);
              }
            }}
          >
            <option value="">Examples…</option>
            {EXAMPLES.map((ex) => (
              <option key={ex.id} value={ex.id}>
                {ex.label}
              </option>
            ))}
          </select>
        </div>

        <textarea
          className={`${field} text-lg`}
          rows={chat ? 3 : 6}
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          onKeyDown={onKeyDown}
          placeholder={chat ? 'Type a message… (Enter to send, Shift+Enter for a new line)' : 'Write your prompt… (Ctrl+Enter to send)'}
          aria-label="Prompt"
        />

        <TokenMeter used={used} limit={config.maxInputTokens} />

        <div className="flex flex-wrap items-center gap-3">
          {running ? (
            <button type="button" onClick={stop} className="rounded-lg bg-red-600 px-6 py-3 text-lg font-semibold text-white hover:bg-red-700">
              Stop
            </button>
          ) : (
            <button
              type="button"
              onClick={() => void send()}
              disabled={!canSend}
              className="rounded-lg bg-blue-600 px-6 py-3 text-lg font-semibold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {showCompare ? 'Compare' : 'Send'}
            </button>
          )}
          {chat && history.length > 0 && (
            <button type="button" className={smallBtn} onClick={clearHistory}>
              Clear history
            </button>
          )}
        </div>
      </section>

      {/* Output (single / compare) */}
      {!chat && showCompare && (left.status !== 'idle' || right.status !== 'idle') && (
        <section className="grid gap-4 lg:grid-cols-2">
          <div className="rounded-xl border border-gray-200 dark:border-gray-700 p-4">
            <OutputPane key={`l${runId}`} run={left} title={sideTitle('A', modelA, presetA, sideA.system)} />
          </div>
          <div className="rounded-xl border border-blue-300 dark:border-blue-700 p-4">
            <OutputPane key={`r${runId}`} run={right} title={sideTitle('B', modelB, presetB, sideB.system)} />
          </div>
        </section>
      )}
      {!chat && !showCompare && left.status !== 'idle' && (
        <section className="rounded-xl border border-gray-200 dark:border-gray-700 p-4">
          <OutputPane key={`s${runId}`} run={left} />
        </section>
      )}
    </div>
  );
}

function Bubble({ role, text }: { role: 'user' | 'model'; text: string }) {
  return role === 'user' ? (
    <div className="ml-8 rounded-2xl rounded-br-sm bg-blue-600 p-4 text-lg text-white whitespace-pre-wrap">{text}</div>
  ) : (
    <div className="mr-8 rounded-2xl rounded-bl-sm bg-gray-100 dark:bg-gray-800 p-4 text-lg text-gray-900 dark:text-gray-100">
      <SimpleMarkdown text={text} />
    </div>
  );
}
