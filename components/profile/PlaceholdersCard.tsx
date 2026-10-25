'use client';

import { useId, useState } from 'react';
import Button from '@/components/ui/Button';
import Input from '@/components/ui/Input';
import Textarea from '@/components/ui/Textarea';
import { usePlaceholders } from '@/lib/hooks/usePlaceholders';
import { validatePlaceholderName } from '@/lib/placeholders/api';
import { PLACEHOLDER_LIMITS, type Placeholder } from '@/types/placeholders';

type FormState = { name: string; value: string; description: string };

const emptyForm: FormState = { name: '', value: '', description: '' };

const truncate = (text: string, max = 160) =>
  text.length > max ? `${text.slice(0, max).trimEnd()}…` : text;

function validateForm(form: FormState): string | null {
  const nameError = validatePlaceholderName(form.name.trim());
  if (nameError) return nameError;
  if (!form.value.trim()) return 'Please enter a value.';
  if (form.value.length > PLACEHOLDER_LIMITS.maxValueLength) {
    return `Values can be at most ${PLACEHOLDER_LIMITS.maxValueLength} characters long.`;
  }
  if (form.description.length > PLACEHOLDER_LIMITS.maxDescriptionLength) {
    return `Descriptions can be at most ${PLACEHOLDER_LIMITS.maxDescriptionLength} characters long.`;
  }
  return null;
}

function PlaceholderForm({
  initial,
  submitLabel,
  saving,
  error,
  onSubmit,
  onCancel,
}: {
  initial: FormState;
  submitLabel: string;
  saving: boolean;
  error: string | null;
  onSubmit: (form: FormState) => void;
  onCancel?: () => void;
}) {
  const [form, setForm] = useState<FormState>(initial);
  const idPrefix = useId();
  const labelClass = 'block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1';
  const trimmedName = form.name.trim();
  const nameHint = trimmedName
    ? validatePlaceholderName(trimmedName) ?? `Use it as {{${trimmedName}}} in any prompt or template.`
    : 'Letters, digits and underscores, e.g. CONTEXT — use it as {{CONTEXT}}.';
  const nameInvalid = !!trimmedName && !!validatePlaceholderName(trimmedName);

  return (
    <form
      className="space-y-3"
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit(form);
      }}
    >
      <div>
        <label htmlFor={`${idPrefix}-name`} className={labelClass}>
          Name
        </label>
        <Input
          id={`${idPrefix}-name`}
          value={form.name}
          onChange={(e) => setForm({ ...form, name: e.target.value })}
          placeholder="CONTEXT"
          maxLength={PLACEHOLDER_LIMITS.maxNameLength}
          disabled={saving}
          error={nameInvalid ? nameHint : undefined}
          helperText={nameInvalid ? undefined : nameHint}
        />
      </div>
      <div>
        <label htmlFor={`${idPrefix}-value`} className={labelClass}>
          Value
        </label>
        <Textarea
          id={`${idPrefix}-value`}
          value={form.value}
          onChange={(e) => setForm({ ...form, value: e.target.value })}
          placeholder="e.g. a paragraph about your company"
          rows={4}
          maxLength={PLACEHOLDER_LIMITS.maxValueLength}
          disabled={saving}
        />
      </div>
      <div>
        <label htmlFor={`${idPrefix}-description`} className={labelClass}>
          Description (optional)
        </label>
        <Input
          id={`${idPrefix}-description`}
          value={form.description}
          onChange={(e) => setForm({ ...form, description: e.target.value })}
          maxLength={PLACEHOLDER_LIMITS.maxDescriptionLength}
          disabled={saving}
        />
      </div>
      {error && (
        <div
          className="p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded text-sm text-red-700 dark:text-red-300"
          role="alert"
        >
          {error}
        </div>
      )}
      <div className="flex gap-2">
        <Button type="submit" size="sm" isLoading={saving} disabled={saving}>
          {submitLabel}
        </Button>
        {onCancel && (
          <Button type="button" size="sm" variant="secondary" onClick={onCancel} disabled={saving}>
            Cancel
          </Button>
        )}
      </div>
    </form>
  );
}

/** Profile card: manage the user's saved placeholder values. */
export default function PlaceholdersCard() {
  const { placeholders, loading, error: loadError, create, update, remove } = usePlaceholders();
  const [adding, setAdding] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [listError, setListError] = useState<string | null>(null);

  const submit = async (form: FormState, existing?: Placeholder) => {
    const validationError = validateForm(form);
    if (validationError) {
      setFormError(validationError);
      return;
    }

    setSaving(true);
    setFormError(null);
    const payload = {
      name: form.name.trim(),
      value: form.value,
      description: form.description.trim() || null,
    };
    try {
      if (existing) {
        await update(existing.id, payload);
        setEditingId(null);
      } else {
        await create(payload);
        setAdding(false);
      }
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Failed to save placeholder');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (placeholder: Placeholder) => {
    if (!window.confirm(`Delete the placeholder {{${placeholder.name}}}?`)) {
      return;
    }
    setListError(null);
    try {
      await remove(placeholder.id);
      if (editingId === placeholder.id) setEditingId(null);
    } catch (err) {
      setListError(err instanceof Error ? err.message : 'Failed to delete placeholder');
    }
  };

  return (
    <div
      id="placeholders"
      className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-6"
    >
      <div className="flex items-start justify-between gap-4 mb-4">
        <div>
          <h2 className="text-xl font-semibold text-gray-900 dark:text-white">My placeholders</h2>
          <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
            Saved values for <code>{'{{NAME}}'}</code> placeholders. Wherever a prompt or template
            contains e.g. <code>{'{{CONTEXT}}'}</code>, the field is prefilled with your value.
          </p>
        </div>
        {!adding && (
          <Button
            size="sm"
            onClick={() => {
              setAdding(true);
              setEditingId(null);
              setFormError(null);
            }}
          >
            ➕ Add placeholder
          </Button>
        )}
      </div>

      {adding && (
        <div className="mb-4 p-4 bg-gray-50 dark:bg-gray-800 rounded-lg">
          <h3 className="text-sm font-semibold text-gray-900 dark:text-white mb-3">New placeholder</h3>
          <PlaceholderForm
            initial={emptyForm}
            submitLabel="Save placeholder"
            saving={saving}
            error={formError}
            onSubmit={(form) => void submit(form)}
            onCancel={() => setAdding(false)}
          />
        </div>
      )}

      {(loadError || listError) && (
        <div className="mb-4 p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded text-sm text-red-700 dark:text-red-300">
          {listError || loadError}
        </div>
      )}

      {loading && placeholders.length === 0 ? (
        <p className="text-sm text-gray-500 dark:text-gray-400">Loading placeholders…</p>
      ) : placeholders.length === 0 ? (
        <p className="text-sm text-gray-500 dark:text-gray-400 py-4 text-center">
          No placeholders yet. Add one, or click &quot;💾 Save as default&quot; next to a placeholder field
          when generating.
        </p>
      ) : (
        <ul className="space-y-3">
          {placeholders.map((placeholder) => (
            <li key={placeholder.id} className="p-4 bg-gray-50 dark:bg-gray-800 rounded-lg">
              {editingId === placeholder.id ? (
                <PlaceholderForm
                  initial={{
                    name: placeholder.name,
                    value: placeholder.value,
                    description: placeholder.description ?? '',
                  }}
                  submitLabel="Save changes"
                  saving={saving}
                  error={formError}
                  onSubmit={(form) => void submit(form, placeholder)}
                  onCancel={() => setEditingId(null)}
                />
              ) : (
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0 flex-1">
                    <p className="font-mono text-sm font-semibold text-gray-900 dark:text-white">
                      {`{{${placeholder.name}}}`}
                    </p>
                    {placeholder.description && (
                      <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                        {placeholder.description}
                      </p>
                    )}
                    <p className="text-sm text-gray-700 dark:text-gray-300 mt-2 whitespace-pre-wrap break-words">
                      {truncate(placeholder.value)}
                    </p>
                  </div>
                  <div className="flex shrink-0 gap-2">
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={() => {
                        setEditingId(placeholder.id);
                        setAdding(false);
                        setFormError(null);
                      }}
                      aria-label={`Edit ${placeholder.name}`}
                    >
                      ✏️ Edit
                    </Button>
                    <Button
                      size="sm"
                      variant="danger"
                      onClick={() => void handleDelete(placeholder)}
                      aria-label={`Delete ${placeholder.name}`}
                    >
                      🗑️ Delete
                    </Button>
                  </div>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
