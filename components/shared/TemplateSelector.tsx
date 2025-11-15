'use client';

import { useEffect, useState } from 'react';
import { templateAPI } from '@/lib/templates/api';
import { extractVariables, fillTemplate } from '@/lib/templates/utils';
import type { PromptTemplate, CreateTemplateRequest, UpdateTemplateRequest } from '@/types/text-generation';
import Button from '../ui/Button';
import Select from '../ui/Select';
import Input from '../ui/Input';
import Textarea from '../ui/Textarea';

interface TemplateSelectorProps {
  mediaType: 'text' | 'image' | 'video';
  value: string; // The current prompt text
  onChange: (value: string) => void; // Called when the filled template changes
  disabled?: boolean;
  label?: string;
}

export default function TemplateSelector({
  mediaType,
  value,
  onChange,
  disabled = false,
  label = 'Prompt Template',
}: TemplateSelectorProps) {
  const [templates, setTemplates] = useState<PromptTemplate[]>([]);
  const [selectedTemplateId, setSelectedTemplateId] = useState<string>('');
  const [selectedTemplate, setSelectedTemplate] = useState<PromptTemplate | null>(null);
  const [variableValues, setVariableValues] = useState<Record<string, string>>({});
  const [showSaveModal, setShowSaveModal] = useState(false);
  const [showUpdateModal, setShowUpdateModal] = useState(false);
  const [templateName, setTemplateName] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Load templates
  useEffect(() => {
    loadTemplates();
  }, [mediaType]);

  const loadTemplates = async () => {
    try {
      const loaded = await templateAPI.list(mediaType);
      setTemplates(loaded);
    } catch (err) {
      console.error('Failed to load templates:', err);
    }
  };

  // Update selected template when selection changes
  useEffect(() => {
    if (selectedTemplateId) {
      const template = templates.find((t) => t.id === selectedTemplateId);
      setSelectedTemplate(template || null);
      
      if (template) {
        // Initialize variable values
        const vars = extractVariables(template.templateText);
        const initialValues: Record<string, string> = {};
        vars.forEach((v) => {
          initialValues[v] = '';
        });
        setVariableValues(initialValues);
      }
    } else {
      setSelectedTemplate(null);
      setVariableValues({});
    }
  }, [selectedTemplateId, templates]);

  // Fill template and update parent when variables change
  useEffect(() => {
    if (selectedTemplate) {
      const filled = fillTemplate(selectedTemplate.templateText, variableValues);
      onChange(filled);
    }
  }, [selectedTemplate, variableValues]);

  const handleVariableChange = (variable: string, newValue: string) => {
    setVariableValues((prev) => ({
      ...prev,
      [variable]: newValue,
    }));
  };

  const handleClearTemplate = () => {
    setSelectedTemplateId('');
    setSelectedTemplate(null);
    setVariableValues({});
  };

  const handleSaveAsNewTemplate = async () => {
    if (!templateName.trim()) {
      setError('Template name is required');
      return;
    }

    setSaving(true);
    setError(null);

    try {
      const variables = extractVariables(value);
      const request: CreateTemplateRequest = {
        name: templateName.trim(),
        mediaType,
        templateText: value,
        variables,
      };

      await templateAPI.create(request);
      await loadTemplates();
      setShowSaveModal(false);
      setTemplateName('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save template');
    } finally {
      setSaving(false);
    }
  };

  const handleUpdateTemplate = async () => {
    if (!selectedTemplate) return;

    setSaving(true);
    setError(null);

    try {
      const variables = extractVariables(value);
      const request: UpdateTemplateRequest = {
        templateText: value,
        variables,
      };

      await templateAPI.update(selectedTemplate.id, request);
      await loadTemplates();
      setShowUpdateModal(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update template');
    } finally {
      setSaving(false);
    }
  };

  const variables = selectedTemplate ? extractVariables(selectedTemplate.templateText) : [];

  return (
    <div className="space-y-4">
      {/* Template Selector */}
      <div className="flex gap-2">
        <div className="flex-1">
          <Select
            label={label}
            value={selectedTemplateId}
            onChange={(e) => setSelectedTemplateId(e.target.value)}
            disabled={disabled}
            options={[
              { value: '', label: '-- No Template --' },
              ...templates.map((t) => ({ value: t.id, label: t.name })),
            ]}
          />
        </div>
        {selectedTemplate && (
          <Button
            variant="secondary"
            onClick={handleClearTemplate}
            disabled={disabled}
            className="mt-7"
          >
            Clear
          </Button>
        )}
      </div>

      {/* Variable Inputs */}
      {variables.length > 0 && (
        <div className="p-4 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg space-y-3">
          <p className="text-sm font-semibold text-blue-900 dark:text-blue-100">
            Template Variables
          </p>
          {variables.map((variable) => (
            <Input
              key={variable}
              label={variable}
              value={variableValues[variable] || ''}
              onChange={(e) => handleVariableChange(variable, e.target.value)}
              placeholder={`Enter value for ${variable}`}
              disabled={disabled}
            />
          ))}
        </div>
      )}

      {/* Save/Update Buttons */}
      {!disabled && value.trim() && (
        <div className="flex gap-2">
          <Button
            variant="secondary"
            onClick={() => setShowSaveModal(true)}
            className="text-sm"
          >
            💾 Save as New Template
          </Button>
          {selectedTemplate && (
            <Button
              variant="secondary"
              onClick={() => setShowUpdateModal(true)}
              className="text-sm"
            >
              ✏️ Update Current Template
            </Button>
          )}
        </div>
      )}

      {/* Save Modal */}
      {showSaveModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white dark:bg-gray-800 rounded-lg p-6 max-w-md w-full mx-4">
            <h3 className="text-lg font-semibold mb-4">Save Template</h3>
            <Input
              label="Template Name"
              value={templateName}
              onChange={(e) => setTemplateName(e.target.value)}
              placeholder="Enter template name"
            />
            {error && (
              <p className="text-sm text-red-600 dark:text-red-400 mt-2">{error}</p>
            )}
            <div className="flex gap-2 mt-4">
              <Button onClick={handleSaveAsNewTemplate} isLoading={saving} disabled={saving}>
                Save
              </Button>
              <Button variant="secondary" onClick={() => setShowSaveModal(false)} disabled={saving}>
                Cancel
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Update Modal */}
      {showUpdateModal && selectedTemplate && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white dark:bg-gray-800 rounded-lg p-6 max-w-md w-full mx-4">
            <h3 className="text-lg font-semibold mb-4">Update Template</h3>
            <p className="text-sm mb-4">
              Update template <strong>{selectedTemplate.name}</strong> with current prompt?
            </p>
            {error && (
              <p className="text-sm text-red-600 dark:text-red-400 mt-2">{error}</p>
            )}
            <div className="flex gap-2 mt-4">
              <Button onClick={handleUpdateTemplate} isLoading={saving} disabled={saving}>
                Update
              </Button>
              <Button variant="secondary" onClick={() => setShowUpdateModal(false)} disabled={saving}>
                Cancel
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

