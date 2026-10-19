import { useState } from 'react';
import Button from '@/components/ui/Button';
import Input from '@/components/ui/Input';
import Select from '@/components/ui/Select';
import Textarea from '@/components/ui/Textarea';
import { apiFetch } from '@/lib/utils/apiClient';
import Modal from './Modal';
import QuotaLimitInputs, { defaultLimitStrings } from './QuotaLimitInputs';
import TagSuggestions from './TagSuggestions';
import { buildQuotaSettings, parseTags, type QuotaType } from './shared';

export default function BulkCreateModal({
  allTags,
  onCreated,
  onCancel,
  onError,
}: {
  allTags: string[];
  /** Called after the users were created server-side; the parent reloads its data. */
  onCreated: (count: number) => void | Promise<void>;
  onCancel: () => void;
  onError: (message: string | null) => void;
}) {
  const [emailsText, setEmailsText] = useState('');
  const [quotaType, setQuotaType] = useState<QuotaType>('limited');
  const [limits, setLimits] = useState(defaultLimitStrings);
  const [tagsText, setTagsText] = useState('');
  const [loading, setLoading] = useState(false);

  const handleCreate = async () => {
    try {
      setLoading(true);
      onError(null);

      const emails = emailsText
        .split('\n')
        .map((email) => email.trim())
        .filter((email) => email.length > 0);

      if (emails.length === 0) {
        onError('Please enter at least one email address');
        return;
      }

      const defaultTags = parseTags(tagsText);

      const response = await apiFetch('/api/admin/users/bulk-create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          emails,
          defaultQuotas: buildQuotaSettings(quotaType, limits),
          defaultTags: defaultTags.length > 0 ? defaultTags : undefined,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.detail || 'Failed to create users');
      }

      await onCreated(emails.length);
    } catch (err) {
      onError(err instanceof Error ? err.message : 'Failed to create users');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal title="Add New Users" maxWidth="max-w-2xl">
      <div className="space-y-4">
        <Textarea
          label="Email Addresses (one per line)"
          value={emailsText}
          onChange={(e) => setEmailsText(e.target.value)}
          placeholder="alice@example.com&#10;bob@example.com&#10;charlie@example.com"
          rows={6}
        />
        <Select
          label="Default Quota Type"
          value={quotaType}
          onChange={(e) => setQuotaType(e.target.value as QuotaType)}
          options={[
            { value: 'limited', label: 'Limited (total usage quota)' },
            { value: 'unlimited', label: 'Unlimited (no restrictions)' },
          ]}
        />
        {quotaType !== 'unlimited' && (
          <QuotaLimitInputs
            className="grid grid-cols-3 gap-4"
            labelSuffix=" Quota"
            limits={limits}
            onChange={(type, value) => setLimits((prev) => ({ ...prev, [type]: value }))}
          />
        )}
        <div>
          <Input
            label="Tags (comma-separated, optional)"
            value={tagsText}
            onChange={(e) => setTagsText(e.target.value)}
            placeholder="course, team-a, premium"
          />
          <TagSuggestions label="Existing tags:" allTags={allTags} value={tagsText} onChange={setTagsText} />
        </div>
        <div className="flex gap-3 pt-4">
          <Button onClick={handleCreate} isLoading={loading} disabled={loading}>
            Create Users
          </Button>
          <Button
            onClick={() => {
              onCancel();
              onError(null);
            }}
            className="bg-gray-500 hover:bg-gray-600"
          >
            Cancel
          </Button>
        </div>
      </div>
    </Modal>
  );
}
