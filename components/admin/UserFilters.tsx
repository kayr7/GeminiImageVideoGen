import Input from '@/components/ui/Input';
import Select from '@/components/ui/Select';

export type StatusFilter = 'all' | 'active' | 'inactive';

export default function UserFilters({
  searchQuery,
  onSearchChange,
  status,
  onStatusChange,
  tag,
  onTagChange,
  allTags,
}: {
  searchQuery: string;
  onSearchChange: (value: string) => void;
  status: StatusFilter;
  onStatusChange: (value: StatusFilter) => void;
  tag: string;
  onTagChange: (value: string) => void;
  allTags: string[];
}) {
  return (
    <div className="flex flex-wrap items-end gap-3">
      <div className="flex-1 min-w-[200px]">
        <Input
          label="Search"
          placeholder="Filter by email..."
          value={searchQuery}
          onChange={(e) => onSearchChange(e.target.value)}
        />
      </div>
      <div className="w-36">
        <Select
          label="Status"
          value={status}
          onChange={(e) => onStatusChange(e.target.value as StatusFilter)}
          options={[
            { value: 'all', label: 'All' },
            { value: 'active', label: 'Active' },
            { value: 'inactive', label: 'Inactive' },
          ]}
        />
      </div>
      {allTags.length > 0 && (
        <div className="w-40">
          <Select
            label="Tag"
            value={tag}
            onChange={(e) => onTagChange(e.target.value)}
            options={[{ value: '', label: 'All tags' }, ...allTags.map((t) => ({ value: t, label: t }))]}
          />
        </div>
      )}
      {(searchQuery || status !== 'all' || tag) && (
        <button
          onClick={() => {
            onSearchChange('');
            onStatusChange('all');
            onTagChange('');
          }}
          className="text-xs text-blue-600 dark:text-blue-400 hover:underline pb-2"
        >
          Clear filters
        </button>
      )}
    </div>
  );
}
