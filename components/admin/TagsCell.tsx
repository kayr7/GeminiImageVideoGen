export default function TagsCell({
  tags,
  editingValue,
  onStartEdit,
  onChange,
  onSave,
  onCancel,
}: {
  tags: string[];
  /** Defined while the cell is being edited. */
  editingValue: string | undefined;
  onStartEdit: () => void;
  onChange: (value: string) => void;
  onSave: () => void;
  onCancel: () => void;
}) {
  if (editingValue !== undefined) {
    return (
      <div className="flex flex-col gap-2">
        <input
          type="text"
          aria-label="Edit tags"
          className="text-xs px-2 py-1 rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 w-full hover:border-blue-400 focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
          value={editingValue}
          onChange={(e) => onChange(e.target.value)}
          placeholder="tag1, tag2, tag3"
        />
        <div className="flex gap-1">
          <button
            onClick={onSave}
            className="px-2 py-1 text-xs bg-green-600 text-white rounded hover:bg-green-700 transition-colors flex-1"
          >
            Save
          </button>
          <button
            onClick={onCancel}
            className="px-2 py-1 text-xs bg-gray-500 text-white rounded hover:bg-gray-600 transition-colors flex-1"
          >
            Cancel
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-1">
      {tags.length > 0 ? (
        <div className="flex flex-wrap gap-1">
          {tags.map((tag) => (
            <span
              key={tag}
              className="px-2 py-0.5 text-xs bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300 rounded font-medium"
            >
              {tag}
            </span>
          ))}
        </div>
      ) : (
        <span className="text-xs text-gray-400 dark:text-gray-500">No tags</span>
      )}
      <button onClick={onStartEdit} className="text-xs text-blue-600 dark:text-blue-400 hover:underline w-fit">
        Edit
      </button>
    </div>
  );
}
