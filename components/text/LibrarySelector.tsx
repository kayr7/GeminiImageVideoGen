import Select from '@/components/ui/Select';

interface LibraryItem {
  id: string;
  name: string;
}

/** Sidebar card to pick, save, update or delete a saved template / system prompt. */
export default function LibrarySelector({
  title,
  ariaLabel,
  items,
  selected,
  loadingItems,
  busy,
  canSaveNew,
  onSelect,
  onSaveNew,
  onUpdate,
  onDelete,
}: {
  title: string;
  ariaLabel: string;
  items: LibraryItem[];
  selected: LibraryItem | null;
  loadingItems: boolean;
  busy: boolean;
  canSaveNew: boolean;
  onSelect: (id: string) => void;
  onSaveNew: () => void;
  onUpdate: () => void;
  onDelete: () => void;
}) {
  return (
    <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-700 p-4">
      <h3 className="font-semibold text-gray-900 dark:text-white mb-3">{title}</h3>
      {loadingItems ? (
        <div className="text-sm text-gray-500 dark:text-gray-400">Loading...</div>
      ) : (
        <>
          <Select
            value={selected?.id || ''}
            onChange={(e) => onSelect(e.target.value)}
            options={[{ value: '', label: '-- None --' }, ...items.map((i) => ({ value: i.id, label: i.name }))]}
            className="mb-2"
            aria-label={ariaLabel}
          />
          <button
            type="button"
            onClick={onSaveNew}
            className="text-sm text-blue-600 dark:text-blue-400 hover:underline"
            disabled={!canSaveNew}
          >
            💾 Save Current as New
          </button>
          {selected && (
            <button
              type="button"
              onClick={onUpdate}
              className="text-sm text-blue-600 dark:text-blue-400 hover:underline ml-4"
              disabled={busy}
            >
              ✏️ Update &quot;{selected.name}&quot;
            </button>
          )}
          {selected && (
            <button
              type="button"
              onClick={onDelete}
              className="text-sm text-red-600 dark:text-red-400 hover:underline ml-4"
              disabled={busy}
            >
              🗑️ Delete
            </button>
          )}
        </>
      )}
    </div>
  );
}
