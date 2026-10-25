import { DEFAULT_LIMITS, type GenerationType, type Quota, type QuotaEdit, type QuotaType } from './shared';

const CONTROL =
  'text-xs px-2 py-1 rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 hover:border-blue-400 focus:border-blue-500 focus:ring-1 focus:ring-blue-500';

export default function QuotaCell({
  type,
  quota,
  edit,
  onChange,
  onSave,
  onCancel,
}: {
  type: GenerationType;
  quota: Quota | null;
  edit: QuotaEdit | undefined;
  onChange: (field: 'type' | 'limit', value: QuotaType | number) => void;
  onSave: () => void;
  onCancel: () => void;
}) {
  const currentType: QuotaType = edit?.type ?? (quota?.quotaType as QuotaType | undefined) ?? 'limited';
  const currentLimit = edit?.limit ?? (quota ? quota.quotaLimit : DEFAULT_LIMITS[type]);
  const hasChanges = edit?.hasChanges ?? false;
  const isUnlimited = currentType === 'unlimited';
  const usedPercentage =
    quota?.quotaLimit && !isUnlimited ? (quota.quotaUsed / quota.quotaLimit) * 100 : 0;

  return (
    <div className="flex flex-col items-center gap-1.5 py-1">
      {!quota ? (
        <div className="text-xs text-gray-400 dark:text-gray-500 mb-1">Not set</div>
      ) : !isUnlimited ? (
        <>
          <div className="text-xs font-medium text-gray-900 dark:text-white">
            {quota.quotaUsed} / {currentLimit ?? 0}
          </div>
          <div className="w-20 h-1.5 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
            <div
              className={`h-full transition-all ${usedPercentage >= 80 ? 'bg-red-600' : 'bg-blue-600'}`}
              style={{ width: `${Math.min(usedPercentage, 100)}%` }}
            />
          </div>
        </>
      ) : (
        <div className="text-sm font-semibold text-green-600 dark:text-green-400">Unlimited</div>
      )}
      <select
        aria-label={`${type} quota type`}
        className={`${CONTROL} w-24`}
        value={currentType}
        onChange={(e) => onChange('type', e.target.value as QuotaType)}
      >
        <option value="limited">Limited</option>
        <option value="unlimited">Unlimited</option>
      </select>
      {!isUnlimited && (
        <input
          type="number"
          aria-label={`${type} quota limit`}
          className={`${CONTROL} w-20 text-center`}
          value={currentLimit ?? ''}
          onChange={(e) => onChange('limit', e.target.value === '' ? 0 : parseInt(e.target.value))}
          min="0"
        />
      )}
      {hasChanges && (
        <div className="flex gap-1">
          <button
            onClick={onSave}
            className="px-2 py-1 text-xs bg-green-600 text-white rounded hover:bg-green-700 transition-colors"
          >
            {quota ? 'Save' : 'Create'}
          </button>
          <button
            onClick={onCancel}
            className="px-2 py-1 text-xs bg-gray-500 text-white rounded hover:bg-gray-600 transition-colors"
          >
            Cancel
          </button>
        </div>
      )}
    </div>
  );
}
