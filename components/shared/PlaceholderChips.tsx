'use client';

import type { RefObject } from 'react';
import { usePlaceholders } from '@/lib/hooks/usePlaceholders';

interface PlaceholderChipsProps {
  /** Textarea the chosen `{{NAME}}` is inserted into (at the cursor / over the selection). */
  textareaRef: RefObject<HTMLTextAreaElement | null>;
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  className?: string;
}

/**
 * Clickable chips for the user's saved placeholders. Clicking one inserts the
 * literal `{{NAME}}` (not its saved value) into the prompt at the cursor.
 */
export default function PlaceholderChips({
  textareaRef,
  value,
  onChange,
  disabled = false,
  className = '',
}: PlaceholderChipsProps) {
  const { placeholders, enabled } = usePlaceholders();

  if (!enabled || placeholders.length === 0) return null;

  const insert = (name: string) => {
    const token = `{{${name}}}`;
    const el = textareaRef.current;
    const start = el?.selectionStart ?? value.length;
    const end = el?.selectionEnd ?? value.length;
    onChange(value.slice(0, start) + token + value.slice(end));
    const caret = start + token.length;
    requestAnimationFrame(() => {
      el?.focus();
      el?.setSelectionRange(caret, caret);
    });
  };

  return (
    <div className={`flex flex-wrap items-center gap-2 ${className}`}>
      <span className="text-xs text-gray-500 dark:text-gray-400">Insert placeholder:</span>
      {placeholders.map((p) => (
        <button
          key={p.id}
          type="button"
          disabled={disabled}
          title={p.description || p.value.slice(0, 200)}
          // Keep the textarea's selection when the button is pressed.
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => insert(p.name)}
          className="px-2 py-0.5 text-xs font-mono rounded-full border border-blue-200 dark:border-blue-800 bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 hover:bg-blue-100 dark:hover:bg-blue-900/60 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {`{{${p.name}}}`}
        </button>
      ))}
    </div>
  );
}
