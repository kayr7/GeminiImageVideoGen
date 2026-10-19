'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import OutputPane from './OutputPane';
import SimpleMarkdown from './SimpleMarkdown';
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
  const [sysOpen, setSysOpen] = useState(false);
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

  // Compare-mode sides: each has its own model + thinking preset.
  const [leftModelId, setLeftModelId] = useState('');
  const [leftSel, setLeftSel] = useState('');
  const [rightModelId, setRightModelId] = useState('');
  const [rightSel, setRightSel] = useState('');
  const modelById = useCallback((id: string) => config.models.find((m) => m.id === id), [config.models]);
  const leftModel = modelById(leftModelId) ?? model;
  const rightModel = modelById(rightModelId) ?? model;
  const leftPreset = findPreset(leftModel, leftSel) ?? (leftModel ? lowestPreset(leftModel) : undefined);
  const rightPreset = findPreset(rightModel, rightSel) ?? (rightModel ? highestFixedPreset(rightModel) : undefined);

  const initCompare = () => {
    if (!model) return;
    const base = modelById(COMPARE_OFF_MODEL);
    const offPreset = base?.thinking.presets.find(isThinkingOff);
    if (base && offPreset) {
      setLeftModelId(base.id);
      setLeftSel(presetKey(offPreset));
    } else {
      setLeftModelId(model.id);
      setLeftSel(presetKey(lowestPreset(model) ?? { label: '' }));
    }
    setRightModelId(model.id);
    setRightSel(presetKey(highestFixedPreset(model) ?? { label: '' }));
  };

  const onModelChange = (id: string) => {
    setModelId(id);
    const m = config.models.find((x) => x.id === id);
    const dp = m ? defaultPreset(m) : undefined;
    if (dp) setPresetSel(presetKey(dp));
  };

  // Token estimate
  const used = useMemo(() => {
    const chars =
      system.length + prompt.length + (chat ? history.reduce((n, m) => n + m.text.length, 0) : 0);
    return Math.ceil(chars / 4);
  }, [system, prompt, history, chat]);
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
            systemInstruction: system.trim() ? system : null,
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
    [system, showThoughts, temperature, onInactive]
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
      const res = await runOne(setLeft, model, preset, messages, c1);
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
        runOne(setLeft, leftModel!, leftPreset!, messages, c1),
        runOne(setRight, rightModel!, rightPreset!, messages, c2),
      ]);
    } else {
      setRight(EMPTY_RUN);
      await runOne(setLeft, model, preset, messages, c1);
    }
  }, [canSend, model, preset, prompt, chat, history, compare, leftModel, leftPreset, rightModel, rightPreset, runOne]);

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

  const showCompare = compare && !chat;
  const thinkingOff = showCompare
    ? !!leftPreset && !!rightPreset && isThinkingOff(leftPreset) && isThinkingOff(rightPreset)
    : !!preset && isThinkingOff(preset);
  const showTemperature = showCompare
    ? !!leftModel?.supportsTemperature || !!rightModel?.supportsTemperature
    : model.supportsTemperature;
  const sideLabel = (m?: PromptLabModel, pr?: ThinkingPreset) => `${m?.name ?? ''} · ${pr?.label ?? ''}`;

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
              <p className="text-sm text-gray-600 dark:text-gray-300">Choose a model and thinking setting for each side below.</p>
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
          <div className="grid gap-4 md:grid-cols-2">
            {([
              ['Left', leftModel, leftSel, setLeftModelId, setLeftSel],
              ['Right', rightModel, rightSel, setRightModelId, setRightSel],
            ] as const).map(([side, m, sel, setM, setSel]) => (
              <div key={side} className="space-y-2 rounded-lg border border-gray-200 dark:border-gray-700 p-3">
                <label className="block space-y-1">
                  <span className="text-sm font-medium text-gray-700 dark:text-gray-300">{side} model</span>
                  <select
                    className={field}
                    aria-label={`${side} model`}
                    value={m?.id ?? ''}
                    onChange={(e) => {
                      setM(e.target.value);
                      const nm = modelById(e.target.value);
                      const np = nm ? (side === 'Left' ? lowestPreset(nm) : highestFixedPreset(nm)) : undefined;
                      if (np) setSel(presetKey(np));
                    }}
                  >
                    {config.models.map((x) => (
                      <option key={x.id} value={x.id}>
                        {x.name}
                      </option>
                    ))}
                  </select>
                </label>
                {m && <ThinkingControl label={`${side} thinking`} model={m} selected={sel} onSelect={setSel} />}
              </div>
            ))}
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
                if (e.target.checked) initCompare();
              }}
              className="h-4 w-4"
            />
            Compare thinking
          </label>

          <button type="button" className={smallBtn} onClick={() => setSysOpen((o) => !o)} aria-expanded={sysOpen}>
            {sysOpen ? 'Hide' : 'Show'} advanced
          </button>
        </div>

        {sysOpen && (
          <div className="grid gap-4 md:grid-cols-2">
            <label className="block space-y-1">
              <span className="text-sm font-medium text-gray-700 dark:text-gray-300">System instruction</span>
              <textarea
                className={field}
                rows={3}
                value={system}
                onChange={(e) => setSystem(e.target.value)}
                placeholder="You are a helpful tutor who answers in one sentence."
              />
            </label>
            {showTemperature && (
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
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm font-medium text-gray-700 dark:text-gray-300 mr-1">Techniques:</span>
          <button type="button" className={smallBtn} onClick={() => setPrompt((p) => (p.trim() ? `${p}\n\n${FEW_SHOT_SCAFFOLD}` : FEW_SHOT_SCAFFOLD))}>
            Few-shot
          </button>
          <button type="button" className={smallBtn} onClick={() => appendPrompt(COT_SUFFIX)}>
            Chain-of-thought
          </button>
          <button
            type="button"
            className={smallBtn}
            onClick={() => {
              setSystem((s) => (s.trim() ? s : ROLE_SCAFFOLD));
              setSysOpen(true);
            }}
          >
            Role
          </button>
          <select
            aria-label="Examples"
            className="rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-3 py-1.5 text-sm text-gray-700 dark:text-gray-200"
            value=""
            onChange={(e) => {
              const ex = EXAMPLES.find((x) => x.id === e.target.value);
              if (ex) {
                setPrompt(ex.prompt);
                if (ex.system) {
                  setSystem(ex.system);
                  setSysOpen(true);
                }
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
            <OutputPane key={`l${runId}`} run={left} title={sideLabel(leftModel, leftPreset)} />
          </div>
          <div className="rounded-xl border border-blue-300 dark:border-blue-700 p-4">
            <OutputPane key={`r${runId}`} run={right} title={sideLabel(rightModel, rightPreset)} />
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

function ThinkingControl({
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
