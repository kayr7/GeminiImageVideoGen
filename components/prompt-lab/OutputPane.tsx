'use client';

import { useState } from 'react';
import SimpleMarkdown from './SimpleMarkdown';
import type { RunState } from './types';

const thinkingStat = (u: { thinkingBudget: number | null; thinkingLevel: string | null }): { label: string; value: string } => {
  if (u.thinkingLevel) return { label: 'Thinking', value: u.thinkingLevel };
  const b = u.thinkingBudget;
  return { label: 'Thinking budget', value: b === null || b === undefined ? 'default' : b === 0 ? 'off' : b < 0 ? 'dynamic' : String(b) };
};
const secs = (ms: number) => `${(ms / 1000).toFixed(2)} s`;

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg bg-gray-100 dark:bg-gray-800 px-3 py-2">
      <div className="text-xs uppercase tracking-wide text-gray-500 dark:text-gray-400">{label}</div>
      <div className="text-base font-semibold text-gray-900 dark:text-white">{value}</div>
    </div>
  );
}

export default function OutputPane({ run, title }: { run: RunState; title?: string }) {
  const [manual, setManual] = useState<boolean | null>(null);
  const thinkingOpen = manual ?? run.answer.length === 0;
  const { usage } = run;

  return (
    <div className="space-y-3 min-w-0" data-testid="output-pane">
      {title && <h3 className="text-lg font-semibold text-gray-900 dark:text-white">{title}</h3>}

      {run.thought && (
        <div className="rounded-lg border border-purple-300 dark:border-purple-700 bg-purple-50 dark:bg-purple-950/40">
          <button
            type="button"
            onClick={() => setManual(!thinkingOpen)}
            className="flex w-full items-center justify-between px-3 py-2 text-left text-sm font-medium text-purple-800 dark:text-purple-200"
            aria-expanded={thinkingOpen}
          >
            <span>{run.status === 'running' && !run.answer ? 'Thinking…' : 'Thoughts'}</span>
            <span aria-hidden>{thinkingOpen ? '▾' : '▸'}</span>
          </button>
          {thinkingOpen && (
            <div className="px-3 pb-3 text-sm italic text-purple-900 dark:text-purple-100 whitespace-pre-wrap max-h-72 overflow-y-auto">
              {run.thought}
            </div>
          )}
        </div>
      )}

      {run.status === 'running' && !run.answer && !run.thought && (
        <p className="text-gray-500 dark:text-gray-400 animate-pulse">Waiting for the model…</p>
      )}

      {run.answer && (
        <div className="text-lg leading-relaxed text-gray-900 dark:text-gray-100">
          <SimpleMarkdown text={run.answer} />
        </div>
      )}

      {run.error && (
        <p role="alert" className="rounded-lg bg-red-50 dark:bg-red-950/40 border border-red-300 dark:border-red-800 px-3 py-2 text-red-700 dark:text-red-300">
          {run.error}
        </p>
      )}

      {usage && (() => {
        const t = thinkingStat(usage);
        return (
        <div className="grid grid-cols-2 gap-2 text-sm sm:grid-cols-3" data-testid="stats">
          <Stat label="Input tokens" value={String(usage.promptTokens)} />
          <Stat label="Thinking tokens" value={String(usage.thoughtsTokens)} />
          <Stat label="Output tokens" value={String(usage.outputTokens)} />
          <Stat label="First token" value={secs(usage.firstTokenMs)} />
          <Stat label="Total time" value={secs(usage.latencyMs)} />
          <Stat label={t.label} value={t.value} />
          <Stat label="Model" value={usage.model} />
        </div>
        );
      })()}
    </div>
  );
}
