import { parseTags } from './shared';

/** Clickable list of existing tags that appends to a comma-separated tag input. */
export default function TagSuggestions({
  label,
  allTags,
  value,
  onChange,
}: {
  label: string;
  allTags: string[];
  value: string;
  onChange: (value: string) => void;
}) {
  if (allTags.length === 0) return null;

  return (
    <div className="mt-2">
      <p className="text-xs text-gray-500 dark:text-gray-400 mb-1">{label}</p>
      <div className="flex flex-wrap gap-1">
        {allTags.map((tag) => (
          <button
            key={tag}
            type="button"
            onClick={() => {
              const current = parseTags(value);
              if (!current.includes(tag)) onChange(current.concat(tag).join(', '));
            }}
            className="px-2 py-0.5 text-xs bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded hover:bg-gray-300 dark:hover:bg-gray-600 transition-colors"
          >
            {tag}
          </button>
        ))}
      </div>
    </div>
  );
}
