'use client';

import { useState } from 'react';
import { apiFetch } from '@/lib/utils/apiClient';

const MAX_CHARS = 2000;

export default function SimilarityPanel() {
  const [textA, setTextA] = useState('');
  const [textB, setTextB] = useState('');
  const [score, setScore] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canRun = textA.trim() !== '' && textB.trim() !== '' && !loading;

  const run = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await apiFetch('/api/admin/similarity', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ textA, textB }),
      });
      if (!res.ok) {
        const b = await res.json().catch(() => null);
        throw new Error(typeof b?.detail === 'string' ? b.detail : `Comparison failed (${res.status})`);
      }
      const body = await res.json();
      setScore(body.data.similarity);
    } catch (err) {
      setScore(null);
      setError(err instanceof Error ? err.message : 'Comparison failed');
    } finally {
      setLoading(false);
    }
  };

  const fieldClass =
    'w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 p-2 text-sm text-gray-900 dark:text-white';

  return (
    <section className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 p-4 space-y-3">
      <div>
        <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Similarity comparison</h2>
        <p className="text-sm text-gray-600 dark:text-gray-300">
          Cosine similarity of two short texts using nomic-embed-text (admin only).
        </p>
      </div>
      <div className="grid gap-3 md:grid-cols-2">
        <textarea
          aria-label="Text A"
          className={fieldClass}
          rows={4}
          maxLength={MAX_CHARS}
          value={textA}
          onChange={(e) => setTextA(e.target.value)}
          placeholder="Text A"
        />
        <textarea
          aria-label="Text B"
          className={fieldClass}
          rows={4}
          maxLength={MAX_CHARS}
          value={textB}
          onChange={(e) => setTextB(e.target.value)}
          placeholder="Text B"
        />
      </div>
      <div className="flex items-center gap-4">
        <button
          type="button"
          onClick={run}
          disabled={!canRun}
          className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
        >
          {loading ? 'Comparing…' : 'Compare'}
        </button>
        {score !== null && (
          <span className="text-sm text-gray-900 dark:text-white">
            Similarity: <strong>{score.toFixed(4)}</strong> ({Math.round(score * 100)}%)
          </span>
        )}
        {error && <span className="text-sm text-red-600">{error}</span>}
      </div>
    </section>
  );
}
