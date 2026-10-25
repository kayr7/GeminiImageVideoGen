'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import Textarea from '@/components/ui/Textarea';
import { extractVariables } from '@/lib/templates/utils';
import { usePlaceholders } from '@/lib/hooks/usePlaceholders';

interface PlaceholderFieldsProps {
  /** Raw prompt / template text that may contain `{{NAME}}` placeholders. */
  text: string;
  /** Current values per placeholder name (owned by the parent). */
  values: Record<string, string>;
  onChange: (values: Record<string, string>) => void;
  disabled?: boolean;
  title?: string;
  className?: string;
  /** Placeholder names rendered elsewhere (e.g. already shown for the system prompt). */
  exclude?: string[];
}

const LONG_VALUE_LENGTH = 80;

const isLongValue = (value: string | undefined) =>
  !!value && (value.length > LONG_VALUE_LENGTH || value.includes('\n'));

/**
 * One field per `{{NAME}}` found in `text`. A field starts with the user's saved
 * value for that name (Profile → My placeholders) and can be edited per
 * generation; "Save as default" stores the current value for next time.
 *
 * Prefill rule: a saved value is only applied while `values[name]` is still
 * undefined, so anything the user typed (including an empty field) is kept.
 */
export default function PlaceholderFields({
  text,
  values,
  onChange,
  disabled = false,
  title = 'Placeholders',
  className = '',
  exclude,
}: PlaceholderFieldsProps) {
  const { byName, enabled, upsert } = usePlaceholders();
  const excludeKey = (exclude ?? []).join('\u0000');
  const variables = useMemo(() => {
    const skip = new Set(excludeKey ? excludeKey.split('\u0000') : []);
    return extractVariables(text).filter((name) => !skip.has(name));
  }, [text, excludeKey]);
  const [savingName, setSavingName] = useState<string | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  // Fields that were ever long stay multi-line so they don't shrink while editing.
  const [multiline, setMultiline] = useState<Record<string, boolean>>({});

  // Prefill newly appearing placeholders with their saved value.
  useEffect(() => {
    const prefills: Record<string, string> = {};
    for (const name of variables) {
      if (values[name] === undefined && byName[name]) {
        prefills[name] = byName[name].value;
      }
    }
    if (Object.keys(prefills).length > 0) {
      onChange({ ...values, ...prefills });
    }
  }, [variables, byName, values, onChange]);

  useEffect(() => {
    const longNow = variables.filter((name) => isLongValue(values[name]) && !multiline[name]);
    if (longNow.length > 0) {
      setMultiline((prev) => {
        const next = { ...prev };
        longNow.forEach((name) => {
          next[name] = true;
        });
        return next;
      });
    }
  }, [variables, values, multiline]);

  if (variables.length === 0) {
    return null;
  }

  const handleChange = (name: string, value: string) => {
    onChange({ ...values, [name]: value });
  };

  const handleSaveDefault = async (name: string) => {
    const value = values[name] ?? '';
    setSavingName(name);
    setErrors((prev) => {
      const next = { ...prev };
      delete next[name];
      return next;
    });
    try {
      await upsert(name, value);
    } catch (err) {
      setErrors((prev) => ({
        ...prev,
        [name]: err instanceof Error ? err.message : 'Failed to save placeholder',
      }));
    } finally {
      setSavingName(null);
    }
  };

  return (
    <div
      className={`p-4 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg space-y-3 ${className}`}
      data-testid="placeholder-fields"
    >
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm font-semibold text-blue-900 dark:text-blue-100">{title}</p>
        {enabled && (
          <Link
            href="/profile#placeholders"
            className="text-xs text-blue-700 dark:text-blue-300 hover:underline"
          >
            Manage in Profile → My placeholders
          </Link>
        )}
      </div>

      {variables.map((name) => {
        const value = values[name] ?? '';
        const saved = byName[name];
        const differs = !!saved && saved.value !== value;
        const canSave = enabled && value.trim() !== '' && (!saved || differs);
        const fieldId = `placeholder-${name}`;
        const rows = multiline[name] || isLongValue(value)
          ? Math.min(8, Math.max(3, value.split('\n').length))
          : 1;

        return (
          <div key={name} className="space-y-1">
            <div className="flex flex-wrap items-center gap-2">
              <label
                htmlFor={fieldId}
                className="text-sm font-medium text-gray-800 dark:text-gray-200 font-mono"
              >
                {`{{${name}}}`}
              </label>
              {saved && !differs && (
                <span className="px-2 py-0.5 text-xs rounded bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-200">
                  saved
                </span>
              )}
              {differs && (
                <span className="px-2 py-0.5 text-xs rounded bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-200">
                  differs from saved
                </span>
              )}
              {canSave && (
                <button
                  type="button"
                  onClick={() => void handleSaveDefault(name)}
                  disabled={disabled || savingName === name}
                  className="ml-auto text-xs text-blue-700 dark:text-blue-300 hover:underline disabled:opacity-50"
                >
                  {savingName === name ? 'Saving…' : '💾 Save as default'}
                </button>
              )}
            </div>
            <Textarea
              id={fieldId}
              value={value}
              onChange={(e) => handleChange(name, e.target.value)}
              placeholder={saved ? undefined : `Value for ${name}`}
              rows={rows}
              disabled={disabled}
              className={rows === 1 ? 'resize-none' : ''}
            />
            {errors[name] && (
              <p className="text-xs text-red-600 dark:text-red-400" role="alert">
                {errors[name]}
              </p>
            )}
          </div>
        );
      })}
    </div>
  );
}
