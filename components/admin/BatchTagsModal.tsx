import { useState } from 'react';
import Button from '@/components/ui/Button';
import Input from '@/components/ui/Input';
import Select from '@/components/ui/Select';
import Modal from './Modal';
import TagSuggestions from './TagSuggestions';
import { parseTags } from './shared';

export type TagMode = 'replace' | 'add';

export default function BatchTagsModal({
  selectedCount,
  allTags,
  loading,
  onApply,
  onCancel,
}: {
  selectedCount: number;
  allTags: string[];
  loading: boolean;
  onApply: (tags: string[], mode: TagMode) => void;
  onCancel: () => void;
}) {
  const [tagsInput, setTagsInput] = useState('');
  const [mode, setMode] = useState<TagMode>('add');

  return (
    <Modal title="Set Tags" subtitle={`Apply to ${selectedCount} selected user(s)`}>
      <div className="space-y-4">
        <Select
          label="Mode"
          value={mode}
          onChange={(e) => setMode(e.target.value as TagMode)}
          options={[
            { value: 'add', label: 'Add to existing tags' },
            { value: 'replace', label: 'Replace all tags' },
          ]}
        />
        <div>
          <Input
            label="Tags (comma-separated)"
            value={tagsInput}
            onChange={(e) => setTagsInput(e.target.value)}
            placeholder="course-a, premium"
          />
          <TagSuggestions label="Quick add:" allTags={allTags} value={tagsInput} onChange={setTagsInput} />
        </div>
        <div className="flex gap-3 pt-2">
          <Button onClick={() => onApply(parseTags(tagsInput), mode)} isLoading={loading} disabled={loading}>
            Apply Tags
          </Button>
          <Button onClick={onCancel} className="bg-gray-500 hover:bg-gray-600">
            Cancel
          </Button>
        </div>
      </div>
    </Modal>
  );
}
