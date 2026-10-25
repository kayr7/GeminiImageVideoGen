import { useState } from 'react';
import Button from '@/components/ui/Button';
import Input from '@/components/ui/Input';
import { apiFetch } from '@/lib/utils/apiClient';
import Modal from './Modal';

export interface DeleteTarget {
  id: string;
  email: string;
  mediaCount: number;
}

export interface DeleteSummary {
  deleted: string[];
  failed: { userId: string; reason: string }[];
  deletedMedia: number;
}

const BULK_CONFIRM_WORD = 'DELETE';

async function errorDetail(response: Response, fallback: string): Promise<string> {
  try {
    const body = await response.json();
    if (typeof body?.detail === 'string') return body.detail;
  } catch {
    // fall through
  }
  return fallback;
}

export default function DeleteUsersModal({
  users,
  bulk = false,
  onDeleted,
  onClose,
}: {
  users: DeleteTarget[];
  /** Bulk mode uses the bulk endpoint and requires typing DELETE instead of the email. */
  bulk?: boolean;
  /** Called once the request finished (also with partial failures) so the list can refresh. */
  onDeleted: (summary: DeleteSummary) => void;
  onClose: () => void;
}) {
  const [deleteMedia, setDeleteMedia] = useState(true);
  const [confirmText, setConfirmText] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [summary, setSummary] = useState<DeleteSummary | null>(null);

  const totalMedia = users.reduce((n, u) => n + u.mediaCount, 0);
  const expected = bulk ? BULK_CONFIRM_WORD : users[0]?.email ?? '';
  const confirmed = confirmText.trim() === expected;
  const emailOf = (id: string) => users.find((u) => u.id === id)?.email ?? id;

  const submit = async () => {
    if (!confirmed || busy) return;
    setBusy(true);
    setError(null);
    try {
      let result: DeleteSummary;
      if (bulk) {
        const response = await apiFetch('/api/admin/users/bulk-delete', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ userIds: users.map((u) => u.id), deleteMedia }),
        });
        if (!response.ok) throw new Error(await errorDetail(response, 'Failed to delete users'));
        result = (await response.json()).data as DeleteSummary;
      } else {
        const user = users[0];
        const response = await apiFetch(`/api/admin/users/${user.id}?deleteMedia=${deleteMedia}`, {
          method: 'DELETE',
        });
        if (!response.ok) throw new Error(await errorDetail(response, 'Failed to delete user'));
        const data = (await response.json()).data;
        result = { deleted: [user.id], failed: [], deletedMedia: data?.deletedMedia ?? 0 };
      }
      setSummary(result);
      onDeleted(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete');
    } finally {
      setBusy(false);
    }
  };

  if (summary) {
    return (
      <Modal title="Deletion finished">
        <div className="space-y-3 text-sm text-gray-800 dark:text-gray-200">
          <p>
            Deleted {summary.deleted.length} user{summary.deleted.length !== 1 ? 's' : ''} and{' '}
            {summary.deletedMedia} media item{summary.deletedMedia !== 1 ? 's' : ''}.
          </p>
          {summary.failed.length > 0 && (
            <div className="p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
              <p className="font-semibold text-red-700 dark:text-red-300 mb-1">
                {summary.failed.length} could not be deleted:
              </p>
              <ul className="list-disc pl-5 text-red-700 dark:text-red-300">
                {summary.failed.map((f) => (
                  <li key={f.userId}>
                    {emailOf(f.userId)}: {f.reason}
                  </li>
                ))}
              </ul>
            </div>
          )}
          <Button onClick={onClose}>Close</Button>
        </div>
      </Modal>
    );
  }

  const confirmLabel = `Type ${expected} to confirm`;
  const title = bulk ? `Delete ${users.length} users?` : `Delete user ${users[0]?.email}?`;

  return (
    <Modal title={title} subtitle="The user(s) will lose access immediately. This cannot be undone.">
      <div className="space-y-4">
        <p className="text-sm text-gray-700 dark:text-gray-300">
          {bulk ? `${users.length} users selected` : users[0]?.email} &middot; {totalMedia} generated
          item{totalMedia !== 1 ? 's' : ''}
        </p>
        <label className="flex items-start gap-2 text-sm text-gray-800 dark:text-gray-200">
          <input
            type="checkbox"
            checked={deleteMedia}
            onChange={(e) => setDeleteMedia(e.target.checked)}
            className="mt-0.5 h-4 w-4"
          />
          <span>
            Also delete their {totalMedia} generated images/videos/audio (cannot be undone)
          </span>
        </label>
        {!deleteMedia && (
          <p className="text-xs text-gray-500 dark:text-gray-400">
            Their media stays in the gallery and remains visible to all admins as &quot;deleted user&quot;.
          </p>
        )}
        <Input
          label={confirmLabel}
          aria-label={confirmLabel}
          value={confirmText}
          onChange={(e) => setConfirmText(e.target.value)}
          autoComplete="off"
        />
        {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}
        <div className="flex gap-3 pt-2">
          <Button
            onClick={submit}
            disabled={!confirmed || busy}
            isLoading={busy}
            className="bg-red-600 hover:bg-red-700"
          >
            {bulk ? 'Delete users' : 'Delete user'}
          </Button>
          <Button onClick={onClose} className="bg-gray-500 hover:bg-gray-600">
            Cancel
          </Button>
        </div>
      </div>
    </Modal>
  );
}
