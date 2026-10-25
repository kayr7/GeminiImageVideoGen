'use client';

import { useCallback, useEffect, useState } from 'react';
import { templateAPI } from '@/lib/templates/api';
import { extractVariables } from '@/lib/templates/utils';
import { useAuth } from '@/lib/context/AuthContext';
import type { PromptTemplate } from '@/types/text-generation';
import Modal from '../admin/Modal';
import Button from '../ui/Button';
import Select from '../ui/Select';
import Input from '../ui/Input';

interface TemplateSelectorProps {
  mediaType: 'text' | 'image' | 'video';
  /** The current (raw) prompt text, which may contain `{{placeholders}}`. */
  value: string;
  /** Called with the template's raw text when a template is selected. */
  onChange: (value: string) => void;
  disabled?: boolean;
  label?: string;
}

/**
 * Pick, save, update and delete prompt templates.
 *
 * Selecting a template copies its RAW text (with `{{placeholders}}`) into the
 * prompt box via `onChange`. The prompt box is therefore the editable template
 * text: "Update Current Template" / "Save as New Template" store exactly what is
 * in the prompt box, placeholders included. The placeholder values are filled in
 * by `<PlaceholderFields>` below the prompt box and resolved when generating.
 *
 * Hidden when logged out (templates are personal).
 */
export default function TemplateSelector({
  mediaType,
  value,
  onChange,
  disabled = false,
  label = 'Prompt Template',
}: TemplateSelectorProps) {
  const { token } = useAuth();
  const [templates, setTemplates] = useState<PromptTemplate[]>([]);
  const [selectedTemplateId, setSelectedTemplateId] = useState<string>('');
  const [showSaveModal, setShowSaveModal] = useState(false);
  const [showUpdateModal, setShowUpdateModal] = useState(false);
  const [templateName, setTemplateName] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [modalError, setModalError] = useState<string | null>(null);

  const selectedTemplate = templates.find((t) => t.id === selectedTemplateId) ?? null;

  const loadTemplates = useCallback(async () => {
    try {
      const loaded = await templateAPI.list(mediaType);
      setTemplates(loaded);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load templates');
    }
  }, [mediaType]);

  useEffect(() => {
    if (!token) {
      setTemplates([]);
      setSelectedTemplateId('');
      return;
    }
    void loadTemplates();
  }, [token, loadTemplates]);

  if (!token) {
    return null;
  }

  const isModified = !!selectedTemplate && selectedTemplate.templateText !== value;

  const handleSelect = (templateId: string) => {
    setError(null);
    if (!templateId) {
      setSelectedTemplateId('');
      return;
    }
    const template = templates.find((t) => t.id === templateId);
    if (!template) return;

    const current = value.trim();
    const unchanged = !current || current === selectedTemplate?.templateText.trim();
    if (
      !unchanged &&
      current !== template.templateText.trim() &&
      !window.confirm(`Replace the current prompt with the template "${template.name}"?`)
    ) {
      return;
    }

    setSelectedTemplateId(template.id);
    onChange(template.templateText);
  };

  const openSaveModal = () => {
    setTemplateName('');
    setModalError(null);
    setShowSaveModal(true);
  };

  const handleSaveAsNewTemplate = async () => {
    if (!templateName.trim()) {
      setModalError('Template name is required');
      return;
    }

    setSaving(true);
    setModalError(null);

    try {
      const created = await templateAPI.create({
        name: templateName.trim(),
        mediaType,
        templateText: value,
        variables: extractVariables(value),
      });
      await loadTemplates();
      setSelectedTemplateId(created.id);
      setShowSaveModal(false);
      setTemplateName('');
    } catch (err) {
      setModalError(err instanceof Error ? err.message : 'Failed to save template');
    } finally {
      setSaving(false);
    }
  };

  const handleUpdateTemplate = async () => {
    if (!selectedTemplate) return;

    setSaving(true);
    setModalError(null);

    try {
      const updated = await templateAPI.update(selectedTemplate.id, {
        templateText: value,
        variables: extractVariables(value),
      });
      setTemplates((prev) => prev.map((t) => (t.id === updated.id ? updated : t)));
      setShowUpdateModal(false);
    } catch (err) {
      setModalError(err instanceof Error ? err.message : 'Failed to update template');
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteTemplate = async () => {
    if (!selectedTemplate) return;
    if (!window.confirm(`Delete the template "${selectedTemplate.name}"? This cannot be undone.`)) {
      return;
    }

    setSaving(true);
    setError(null);
    try {
      await templateAPI.delete(selectedTemplate.id);
      setTemplates((prev) => prev.filter((t) => t.id !== selectedTemplate.id));
      setSelectedTemplateId('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete template');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-3">
      <div className="flex gap-2">
        <div className="flex-1">
          <Select
            label={label}
            aria-label={label}
            value={selectedTemplateId}
            onChange={(e) => handleSelect(e.target.value)}
            disabled={disabled || saving}
            options={[
              { value: '', label: '-- No Template --' },
              ...templates.map((t) => ({ value: t.id, label: t.name })),
            ]}
          />
        </div>
        {selectedTemplate && (
          <Button
            variant="secondary"
            onClick={() => setSelectedTemplateId('')}
            disabled={disabled || saving}
            className="mt-7"
          >
            Clear
          </Button>
        )}
      </div>

      {selectedTemplate && (
        <p className="text-xs text-gray-600 dark:text-gray-400">
          The template text is in the prompt box below — edit it there and fill in the{' '}
          <code>{'{{placeholders}}'}</code> underneath.
          {isModified && (
            <span className="text-amber-700 dark:text-amber-300">
              {' '}
              Modified — use &quot;Update Current Template&quot; to keep your changes.
            </span>
          )}
        </p>
      )}

      {error && (
        <div className="p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg text-sm text-red-700 dark:text-red-300">
          {error}
        </div>
      )}

      {!disabled && (value.trim() || selectedTemplate) && (
        <div className="flex flex-wrap gap-2">
          {value.trim() && (
            <Button variant="secondary" size="sm" onClick={openSaveModal}>
              💾 Save as New Template
            </Button>
          )}
          {selectedTemplate && value.trim() && (
            <Button
              variant="secondary"
              size="sm"
              onClick={() => {
                setModalError(null);
                setShowUpdateModal(true);
              }}
              disabled={saving}
            >
              ✏️ Update Current Template
            </Button>
          )}
          {selectedTemplate && (
            <Button
              variant="secondary"
              size="sm"
              onClick={() => void handleDeleteTemplate()}
              disabled={saving}
            >
              🗑️ Delete Template
            </Button>
          )}
        </div>
      )}

      {showSaveModal && (
        <Modal title="Save Template" subtitle="Saves the prompt text including its {{placeholders}}." maxWidth="max-w-md">
          <Input
            label="Template Name"
            value={templateName}
            onChange={(e) => setTemplateName(e.target.value)}
            placeholder="Enter template name"
            disabled={saving}
          />
          {modalError && (
            <p className="text-sm text-red-600 dark:text-red-400 mt-2" role="alert">
              {modalError}
            </p>
          )}
          <div className="flex gap-2 mt-4">
            <Button onClick={() => void handleSaveAsNewTemplate()} isLoading={saving} disabled={saving}>
              Save
            </Button>
            <Button variant="secondary" onClick={() => setShowSaveModal(false)} disabled={saving}>
              Cancel
            </Button>
          </div>
        </Modal>
      )}

      {showUpdateModal && selectedTemplate && (
        <Modal title="Update Template" maxWidth="max-w-md">
          <p className="text-sm text-gray-700 dark:text-gray-300 mb-2">
            Update template <strong>{selectedTemplate.name}</strong> with the current prompt text?
          </p>
          <pre className="text-xs whitespace-pre-wrap max-h-48 overflow-y-auto p-2 rounded bg-gray-50 dark:bg-gray-800 text-gray-800 dark:text-gray-200">
            {value}
          </pre>
          {modalError && (
            <p className="text-sm text-red-600 dark:text-red-400 mt-2" role="alert">
              {modalError}
            </p>
          )}
          <div className="flex gap-2 mt-4">
            <Button onClick={() => void handleUpdateTemplate()} isLoading={saving} disabled={saving}>
              Update
            </Button>
            <Button variant="secondary" onClick={() => setShowUpdateModal(false)} disabled={saving}>
              Cancel
            </Button>
          </div>
        </Modal>
      )}
    </div>
  );
}
