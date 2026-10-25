import { useState, type ReactNode } from 'react';
import Button from '@/components/ui/Button';
import Input from '@/components/ui/Input';
import Textarea from '@/components/ui/Textarea';

/** Modal for saving the current template / system prompt under a name. */
export default function SaveLibraryModal({
  title,
  nameLabel,
  namePlaceholder,
  previewLabel,
  previewText,
  saving,
  onSave,
  onCancel,
  children,
}: {
  title: string;
  nameLabel: string;
  namePlaceholder: string;
  previewLabel: string;
  previewText: string;
  saving: boolean;
  onSave: (name: string) => void;
  onCancel: () => void;
  children?: ReactNode;
}) {
  const [name, setName] = useState('');
  const labelClass = 'block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2';

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-700 p-6 max-w-md w-full">
        <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">{title}</h3>
        <div className="space-y-4">
          <div>
            <label className={labelClass}>{nameLabel}</label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={namePlaceholder}
              disabled={saving}
            />
          </div>
          <div>
            <label className={labelClass}>{previewLabel}</label>
            <Textarea value={previewText} readOnly rows={4} className="bg-gray-50 dark:bg-gray-800" />
          </div>
          {children}
          <div className="flex gap-3">
            <Button onClick={() => onSave(name)} disabled={saving || !name.trim()} className="flex-1">
              {saving ? 'Saving...' : 'Save'}
            </Button>
            <Button onClick={onCancel} disabled={saving} className="flex-1 bg-gray-500 hover:bg-gray-600">
              Cancel
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
