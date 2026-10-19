import { formatDate } from '@/lib/utils/files';
import QuotaCell from './QuotaCell';
import TagsCell from './TagsCell';
import {
  GENERATION_TYPES,
  type GenerationType,
  type QuotaEdit,
  type QuotaType,
  type UserWithQuotas,
} from './shared';

const TH = 'px-4 py-3 text-xs font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wider';
const CHECKBOX = 'h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500 cursor-pointer';

const EDITABLE_HINT = (
  <div className="text-[10px] font-normal text-gray-500 dark:text-gray-400 normal-case mt-0.5">
    (includes editing)
  </div>
);

export default function UserTable({
  users,
  totalUsers,
  selectedIds,
  allVisibleSelected,
  editingQuotas,
  editingTags,
  onToggleSelect,
  onToggleSelectAll,
  onToggleActive,
  onResetPassword,
  onQuotaChange,
  onQuotaSave,
  onQuotaCancel,
  onTagsStart,
  onTagsChange,
  onTagsSave,
  onTagsCancel,
}: {
  users: UserWithQuotas[];
  totalUsers: number;
  selectedIds: Set<string>;
  allVisibleSelected: boolean;
  editingQuotas: Record<string, Partial<Record<GenerationType, QuotaEdit>>>;
  editingTags: Record<string, string>;
  onToggleSelect: (userId: string) => void;
  onToggleSelectAll: () => void;
  onToggleActive: (userId: string, currentActive: boolean) => void;
  onResetPassword: (userId: string, email: string) => void;
  onQuotaChange: (
    userId: string,
    type: GenerationType,
    field: 'type' | 'limit',
    value: QuotaType | number,
    quota: UserWithQuotas['quotas'][number] | null,
  ) => void;
  onQuotaSave: (userId: string, type: GenerationType) => void;
  onQuotaCancel: (userId: string, type: GenerationType) => void;
  onTagsStart: (userId: string, tags: string[]) => void;
  onTagsChange: (userId: string, value: string) => void;
  onTagsSave: (userId: string) => void;
  onTagsCancel: (userId: string) => void;
}) {
  return (
    <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 overflow-hidden">
      {users.length === 0 ? (
        <div className="p-12 text-center">
          <p className="text-gray-500 dark:text-gray-400">
            {totalUsers === 0
              ? 'No users yet. Click "+ Add Users" to invite people.'
              : 'No users match the current filters.'}
          </p>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50 dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700">
              <tr>
                <th className="px-3 py-3 text-left">
                  <input
                    type="checkbox"
                    checked={allVisibleSelected}
                    onChange={onToggleSelectAll}
                    className={CHECKBOX}
                    aria-label="Select all users"
                  />
                </th>
                <th className={`${TH} text-left`}>User</th>
                <th className={`${TH} text-left`}>Status</th>
                <th className={`${TH} text-center`}>
                  Image Quota
                  {EDITABLE_HINT}
                </th>
                <th className={`${TH} text-center`}>
                  Video Quota
                  {EDITABLE_HINT}
                </th>
                <th className={`${TH} text-center`}>Speech Quota</th>
                <th className={`${TH} text-center`}>Text Quota</th>
                <th className={`${TH} text-left`}>Tags</th>
                <th className={`${TH} text-right`}>Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
              {users.map((usr) => {
                const isSelected = selectedIds.has(usr.id);

                return (
                  <tr
                    key={usr.id}
                    className={`transition-colors ${
                      isSelected ? 'bg-blue-50 dark:bg-blue-900/20' : 'hover:bg-gray-50 dark:hover:bg-gray-800/50'
                    }`}
                  >
                    <td className="px-3 py-4">
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => onToggleSelect(usr.id)}
                        className={CHECKBOX}
                        aria-label={`Select ${usr.email}`}
                      />
                    </td>

                    <td className="px-4 py-4">
                      <p className="text-sm font-medium text-gray-900 dark:text-white">{usr.email}</p>
                      <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                        Created: {formatDate(usr.createdAt)}
                        {usr.lastLoginAt && <> &middot; Last login: {formatDate(usr.lastLoginAt)}</>}
                      </p>
                    </td>

                    <td className="px-4 py-4">
                      <div className="flex flex-col gap-1">
                        <span
                          className={`inline-block px-2 py-0.5 text-xs font-semibold rounded w-fit ${
                            usr.isActive
                              ? 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300'
                              : 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300'
                          }`}
                        >
                          {usr.isActive ? 'Active' : 'Inactive'}
                        </span>
                        {usr.isShared && (
                          <span className="inline-block px-2 py-0.5 text-xs font-semibold bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-300 rounded w-fit">
                            Shared
                          </span>
                        )}
                      </div>
                    </td>

                    {GENERATION_TYPES.map((type) => {
                      const quota = usr.quotas.find((q) => q.generationType === type) ?? null;
                      return (
                        <td key={type} className="px-4 py-4">
                          <QuotaCell
                            type={type}
                            quota={quota}
                            edit={editingQuotas[usr.id]?.[type]}
                            onChange={(field, value) => onQuotaChange(usr.id, type, field, value, quota)}
                            onSave={() => onQuotaSave(usr.id, type)}
                            onCancel={() => onQuotaCancel(usr.id, type)}
                          />
                        </td>
                      );
                    })}

                    <td className="px-4 py-4">
                      <TagsCell
                        tags={usr.tags || []}
                        editingValue={editingTags[usr.id]}
                        onStartEdit={() => onTagsStart(usr.id, usr.tags || [])}
                        onChange={(value) => onTagsChange(usr.id, value)}
                        onSave={() => onTagsSave(usr.id)}
                        onCancel={() => onTagsCancel(usr.id)}
                      />
                    </td>

                    <td className="px-4 py-4">
                      <div className="flex items-center justify-end gap-2">
                        <button
                          onClick={() => onToggleActive(usr.id, usr.isActive)}
                          className="px-3 py-1 text-xs font-medium rounded bg-blue-100 text-blue-700 hover:bg-blue-200 dark:bg-blue-900/30 dark:text-blue-300 dark:hover:bg-blue-900/50"
                        >
                          {usr.isActive ? 'Deactivate' : 'Activate'}
                        </button>
                        <button
                          onClick={() => onResetPassword(usr.id, usr.email)}
                          className="px-3 py-1 text-xs font-medium rounded bg-yellow-100 text-yellow-700 hover:bg-yellow-200 dark:bg-yellow-900/30 dark:text-yellow-300 dark:hover:bg-yellow-900/50"
                        >
                          Reset PWD
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
