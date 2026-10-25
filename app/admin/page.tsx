'use client';

import { useEffect, useMemo, useState, useCallback } from 'react';
import { useRequireAuth } from '@/lib/hooks/useRequireAuth';
import { apiFetch } from '@/lib/utils/apiClient';
import Button from '@/components/ui/Button';
import BatchActionBar from '@/components/admin/BatchActionBar';
import BatchQuotaModal from '@/components/admin/BatchQuotaModal';
import BatchTagsModal, { type TagMode } from '@/components/admin/BatchTagsModal';
import DeleteUsersModal, { type DeleteSummary, type DeleteTarget } from '@/components/admin/DeleteUsersModal';
import BulkCreateModal from '@/components/admin/BulkCreateModal';
import UserFilters, { type StatusFilter } from '@/components/admin/UserFilters';
import PromptLabPanel from '@/components/admin/PromptLabPanel';
import UserTable from '@/components/admin/UserTable';
import {
  DEFAULT_LIMITS,
  GENERATION_TYPES,
  parseTags,
  type GenerationType,
  type Quota,
  type QuotaEdit,
  type QuotaSetting,
  type QuotaType,
  type User,
  type UserWithQuotas,
} from '@/components/admin/shared';

export default function AdminPage() {
  const { initialising, isAdmin, ready, user: currentUser } = useRequireAuth('/admin', { admin: true });
  const [loading, setLoading] = useState(true);
  const [users, setUsers] = useState<UserWithQuotas[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // Selection state
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  // Search / filter state
  const [searchQuery, setSearchQuery] = useState('');
  const [filterStatus, setFilterStatus] = useState<StatusFilter>('all');
  const [filterTag, setFilterTag] = useState('');

  // Modals
  const [showBulkCreate, setShowBulkCreate] = useState(false);
  const [showBatchQuotas, setShowBatchQuotas] = useState(false);
  const [showBatchTags, setShowBatchTags] = useState(false);
  const [deleteTargets, setDeleteTargets] = useState<{ users: DeleteTarget[]; bulk: boolean } | null>(null);
  const [batchActionLoading, setBatchActionLoading] = useState(false);

  // Inline editing state
  const [editingQuotas, setEditingQuotas] = useState<
    Record<string, Partial<Record<GenerationType, QuotaEdit>>>
  >({});

  // Tag management state
  const [allTags, setAllTags] = useState<string[]>([]);
  const [editingTags, setEditingTags] = useState<Record<string, string>>({});

  // -- Filtered users --------------------------------------------------------

  const filteredUsers = useMemo(() => {
    return users.filter((u) => {
      if (searchQuery && !u.email.toLowerCase().includes(searchQuery.toLowerCase())) return false;
      if (filterStatus === 'active' && !u.isActive) return false;
      if (filterStatus === 'inactive' && u.isActive) return false;
      if (filterTag && !(u.tags || []).includes(filterTag)) return false;
      return true;
    });
  }, [users, searchQuery, filterStatus, filterTag]);

  const filteredIds = useMemo(() => new Set(filteredUsers.map((u) => u.id)), [filteredUsers]);

  // Only count selected users that are visible in the current filter
  const visibleSelectedIds = useMemo(
    () => new Set([...selectedIds].filter((id) => filteredIds.has(id))),
    [selectedIds, filteredIds],
  );

  const allVisibleSelected =
    filteredUsers.length > 0 && filteredUsers.every((u) => selectedIds.has(u.id));

  // -- Data loading ----------------------------------------------------------

  useEffect(() => {
    if (ready) {
      loadUsers();
      loadAllTags();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready]);

  const loadAllTags = async () => {
    try {
      const response = await apiFetch('/api/admin/users/tags/all');
      if (response.ok) {
        const data = await response.json();
        if (data.success && data.data?.tags) {
          setAllTags(data.data.tags);
        }
      }
    } catch (err) {
      console.error('Failed to load tags:', err);
    }
  };

  const loadUsers = async (silent = false) => {
    try {
      if (!silent) setLoading(true);
      setError(null);

      const response = await apiFetch('/api/admin/users');
      if (!response.ok) {
        throw new Error('Failed to load users');
      }

      const data = await response.json();
      if (data.success && data.data?.users) {
        const usersWithQuotas = await Promise.all(
          data.data.users.map(async (u: User) => {
            try {
              const quotaResponse = await apiFetch(`/api/admin/quotas/${u.id}`);
              if (quotaResponse.ok) {
                const quotaData = await quotaResponse.json();
                return { ...u, quotas: quotaData.success ? quotaData.data.quotas : [] };
              }
            } catch (err) {
              console.error(`Failed to load quotas for ${u.email}:`, err);
            }
            return { ...u, quotas: [] };
          }),
        );
        setUsers(usersWithQuotas);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load users');
    } finally {
      setLoading(false);
    }
  };

  // -- Helpers ---------------------------------------------------------------

  const flash = useCallback((msg: string) => {
    setSuccessMessage(msg);
    setTimeout(() => setSuccessMessage(null), 3000);
  }, []);

  // Rebuild allTags from current users state
  const refreshLocalTags = useCallback((updatedUsers: UserWithQuotas[]) => {
    const tagSet = new Set<string>();
    updatedUsers.forEach((u) => (u.tags || []).forEach((t) => tagSet.add(t)));
    setAllTags(Array.from(tagSet).sort());
  }, []);

  // -- Selection helpers -----------------------------------------------------

  const toggleSelect = (userId: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(userId)) next.delete(userId);
      else next.add(userId);
      return next;
    });
  };

  const toggleSelectAll = () => {
    if (allVisibleSelected) {
      // Deselect all visible
      setSelectedIds((prev) => {
        const next = new Set(prev);
        filteredUsers.forEach((u) => next.delete(u.id));
        return next;
      });
    } else {
      // Select all visible
      setSelectedIds((prev) => {
        const next = new Set(prev);
        filteredUsers.forEach((u) => next.add(u.id));
        return next;
      });
    }
  };

  const clearSelection = () => setSelectedIds(new Set());

  // -- Single-user handlers (optimistic) ------------------------------------

  const handleToggleActive = async (userId: string, currentActive: boolean) => {
    setUsers((prev) => prev.map((u) => (u.id === userId ? { ...u, isActive: !currentActive } : u)));
    try {
      const response = await apiFetch(`/api/admin/users/${userId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isActive: !currentActive }),
      });
      if (!response.ok) {
        setUsers((prev) => prev.map((u) => (u.id === userId ? { ...u, isActive: currentActive } : u)));
        throw new Error('Failed to update user');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update user');
    }
  };

  const handleResetPassword = async (userId: string, userEmail: string) => {
    if (!confirm(`Reset password for ${userEmail}? They will need to set a new password on next login.`)) return;
    try {
      const response = await apiFetch(`/api/admin/users/${userId}/reset-password`, { method: 'POST' });
      if (!response.ok) throw new Error('Failed to reset password');
      setUsers((prev) =>
        prev.map((u) => (u.id === userId ? { ...u, requirePasswordReset: true } : u)),
      );
      flash(`Password reset for ${userEmail}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to reset password');
    }
  };

  // -- Inline quota editing --------------------------------------------------

  const updateQuotaValue = (
    userId: string,
    generationType: GenerationType,
    field: 'type' | 'limit',
    value: QuotaType | number,
    originalQuota: Quota | null,
  ) => {
    const defaultLimit = DEFAULT_LIMITS[generationType] ?? 100;
    const currentEdit: QuotaEdit = editingQuotas[userId]?.[generationType] || {
      type: (originalQuota?.quotaType as QuotaType | undefined) ?? 'limited',
      limit: originalQuota?.quotaLimit ?? defaultLimit,
      hasChanges: false,
    };

    setEditingQuotas((prev) => ({
      ...prev,
      [userId]: {
        ...(prev[userId] || {}),
        [generationType]: { ...currentEdit, [field]: value, hasChanges: true },
      },
    }));
  };

  const cancelQuotaEdit = (userId: string, generationType: GenerationType) => {
    setEditingQuotas((prev) => {
      const rest = { ...(prev[userId] ?? {}) };
      delete rest[generationType];
      const next = { ...prev };
      if (Object.keys(rest).length === 0) delete next[userId];
      else next[userId] = rest;
      return next;
    });
  };

  const handleSaveQuota = async (userId: string, generationType: GenerationType) => {
    const quotaUpdate = editingQuotas[userId]?.[generationType];
    if (!quotaUpdate || !quotaUpdate.hasChanges) return;

    try {
      const response = await apiFetch(`/api/admin/quotas/${userId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          quotas: { [generationType]: { type: quotaUpdate.type, limit: quotaUpdate.limit } },
        }),
      });

      if (!response.ok) throw new Error('Failed to update quota');

      // Optimistic local update
      setUsers((prev) =>
        prev.map((u) => {
          if (u.id !== userId) return u;
          const existing = u.quotas.find((q) => q.generationType === generationType);
          const updatedQuota: Quota = existing
            ? {
                ...existing,
                quotaType: quotaUpdate.type,
                quotaLimit: quotaUpdate.type === 'unlimited' ? null : quotaUpdate.limit,
                quotaRemaining:
                  quotaUpdate.type === 'unlimited'
                    ? null
                    : Math.max(0, (quotaUpdate.limit ?? 0) - existing.quotaUsed),
              }
            : {
                generationType,
                quotaType: quotaUpdate.type,
                quotaLimit: quotaUpdate.type === 'unlimited' ? null : quotaUpdate.limit,
                quotaUsed: 0,
                quotaRemaining: quotaUpdate.type === 'unlimited' ? null : quotaUpdate.limit,
                quotaResetAt: null,
              };

          const newQuotas = existing
            ? u.quotas.map((q) => (q.generationType === generationType ? updatedQuota : q))
            : [...u.quotas, updatedQuota];
          return { ...u, quotas: newQuotas };
        }),
      );

      cancelQuotaEdit(userId, generationType);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update quota');
    }
  };

  // -- Inline tag editing ----------------------------------------------------

  const startEditingTags = (userId: string, currentTags: string[]) => {
    setEditingTags((prev) => ({ ...prev, [userId]: currentTags.join(', ') }));
  };

  const cancelEditingTags = (userId: string) => {
    setEditingTags((prev) => {
      const next = { ...prev };
      delete next[userId];
      return next;
    });
  };

  const handleSaveTags = async (userId: string) => {
    const tags = parseTags(editingTags[userId] || '');

    try {
      const response = await apiFetch(`/api/admin/users/${userId}/tags`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tags }),
      });
      if (!response.ok) throw new Error('Failed to update tags');

      const updatedUsers = users.map((u) => (u.id === userId ? { ...u, tags } : u));
      setUsers(updatedUsers);
      refreshLocalTags(updatedUsers);
      cancelEditingTags(userId);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update tags');
    }
  };

  // -- Batch actions ---------------------------------------------------------

  const handleBatchToggleActive = async (activate: boolean) => {
    const ids = [...visibleSelectedIds];
    if (ids.length === 0) return;

    const label = activate ? 'activate' : 'deactivate';
    if (!confirm(`${activate ? 'Activate' : 'Deactivate'} ${ids.length} user(s)?`)) return;

    // Optimistic update
    const previousStates = new Map(ids.map((id) => [id, users.find((u) => u.id === id)?.isActive]));
    setUsers((prev) => prev.map((u) => (ids.includes(u.id) ? { ...u, isActive: activate } : u)));

    const results = await Promise.allSettled(
      ids.map((id) =>
        apiFetch(`/api/admin/users/${id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ isActive: activate }),
        }).then((r) => {
          if (!r.ok) throw new Error();
        }),
      ),
    );

    const failedIds = new Set<string>();
    results.forEach((result, idx) => {
      if (result.status === 'rejected') failedIds.add(ids[idx]);
    });

    if (failedIds.size > 0) {
      setUsers((prev) =>
        prev.map((u) =>
          failedIds.has(u.id) ? { ...u, isActive: previousStates.get(u.id) ?? u.isActive } : u,
        ),
      );
      setError(`Failed to ${label} ${failedIds.size} of ${ids.length} user(s)`);
    } else {
      flash(`${ids.length} user(s) ${activate ? 'activated' : 'deactivated'}`);
    }

    clearSelection();
  };

  const handleBatchResetPasswords = async () => {
    const ids = [...visibleSelectedIds];
    if (ids.length === 0) return;
    if (!confirm(`Reset passwords for ${ids.length} user(s)? They will all need to set new passwords.`))
      return;

    const results = await Promise.allSettled(
      ids.map((id) => apiFetch(`/api/admin/users/${id}/reset-password`, { method: 'POST' }).then((r) => {
          if (!r.ok) throw new Error();
        })),
    );

    const succeeded = results.filter((r) => r.status === 'fulfilled').length;
    const failed = results.length - succeeded;

    if (succeeded > 0) {
      setUsers((prev) =>
        prev.map((u) => (ids.includes(u.id) ? { ...u, requirePasswordReset: true } : u)),
      );
    }

    if (failed > 0) {
      setError(`Password reset failed for ${failed} of ${ids.length} user(s)`);
    } else {
      flash(`Password reset for ${ids.length} user(s)`);
    }
    clearSelection();
  };

  const handleBatchSetQuotas = async (quotas: Record<GenerationType, QuotaSetting>) => {
    const ids = [...visibleSelectedIds];
    if (ids.length === 0) return;

    setBatchActionLoading(true);
    try {
      const results = await Promise.allSettled(
        ids.map((id) =>
          apiFetch(`/api/admin/quotas/${id}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ quotas }),
          }).then((r) => {
            if (!r.ok) throw new Error();
          }),
        ),
      );

      const succeeded = results.filter((r) => r.status === 'fulfilled').length;
      const failed = results.length - succeeded;

      // Optimistic update for succeeded users
      if (succeeded > 0) {
        const succeededIds = new Set(
          ids.filter((_, idx) => results[idx].status === 'fulfilled'),
        );
        setUsers((prev) =>
          prev.map((u) => {
            if (!succeededIds.has(u.id)) return u;
            const newQuotas = GENERATION_TYPES.map((type) => {
              const existing = u.quotas.find((q) => q.generationType === type);
              const q = quotas[type];
              return {
                generationType: type,
                quotaType: q.type,
                quotaLimit: q.type === 'unlimited' ? null : q.limit,
                quotaUsed: existing?.quotaUsed ?? 0,
                quotaRemaining:
                  q.type === 'unlimited' ? null : Math.max(0, (q.limit ?? 0) - (existing?.quotaUsed ?? 0)),
                quotaResetAt: existing?.quotaResetAt ?? null,
              };
            });
            return { ...u, quotas: newQuotas };
          }),
        );
      }

      if (failed > 0) {
        setError(`Quota update failed for ${failed} of ${ids.length} user(s)`);
      } else {
        flash(`Quotas updated for ${ids.length} user(s)`);
      }

      setShowBatchQuotas(false);
      clearSelection();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update quotas');
    } finally {
      setBatchActionLoading(false);
    }
  };

  const handleBatchSetTags = async (newTags: string[], batchTagMode: TagMode) => {
    const ids = [...visibleSelectedIds];
    if (ids.length === 0) return;

    setBatchActionLoading(true);
    try {
      const results = await Promise.allSettled(
        ids.map((id) => {
          const currentUser = users.find((u) => u.id === id);
          const existingTags = currentUser?.tags || [];
          const finalTags =
            batchTagMode === 'replace'
              ? newTags
              : [...new Set([...existingTags, ...newTags])];

          return apiFetch(`/api/admin/users/${id}/tags`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ tags: finalTags }),
          }).then(async (r) => {
            if (!r.ok) throw new Error();
            return { id, tags: finalTags };
          });
        }),
      );

      let updatedUsers = [...users];
      let failed = 0;
      results.forEach((result) => {
        if (result.status === 'fulfilled') {
          const { id, tags } = result.value;
          updatedUsers = updatedUsers.map((u) => (u.id === id ? { ...u, tags } : u));
        } else {
          failed++;
        }
      });

      setUsers(updatedUsers);
      refreshLocalTags(updatedUsers);

      if (failed > 0) {
        setError(`Tag update failed for ${failed} of ${ids.length} user(s)`);
      } else {
        flash(`Tags updated for ${ids.length} user(s)`);
      }

      setShowBatchTags(false);
      clearSelection();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update tags');
    } finally {
      setBatchActionLoading(false);
    }
  };

  const openDelete = (targets: UserWithQuotas[], bulk: boolean) =>
    setDeleteTargets({
      bulk,
      users: targets.map((u) => ({ id: u.id, email: u.email, mediaCount: u.mediaCount ?? 0 })),
    });

  const handleBatchDelete = () => {
    // Admins and yourself are rejected by the backend; leave them out of the dialog.
    const targets = users.filter(
      (u) => visibleSelectedIds.has(u.id) && !u.isAdmin && u.email !== currentUser?.username,
    );
    if (targets.length === 0) {
      setError('Admin accounts and your own account cannot be deleted.');
      return;
    }
    openDelete(targets, true);
  };

  const handleDeleted = async (summary: DeleteSummary) => {
    clearSelection();
    await loadUsers(true); // silent: keep the modal (with its summary) mounted
    await loadAllTags();
    if (summary.failed.length === 0) {
      flash(`Deleted ${summary.deleted.length} user(s) and ${summary.deletedMedia} media item(s)`);
    }
  };

  const handleBulkCreated = async (count: number) => {
    // Reload is necessary here since new users are created server-side
    await loadUsers();
    await loadAllTags();
    setShowBulkCreate(false);
    flash(`Created ${count} user(s)`);
  };

  // -- Render ----------------------------------------------------------------

  if (initialising || loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <div className="text-center">
          <div className="inline-block h-8 w-8 animate-spin rounded-full border-4 border-solid border-blue-600 border-r-transparent mb-4"></div>
          <p className="text-gray-600 dark:text-gray-300">Loading admin dashboard...</p>
        </div>
      </div>
    );
  }

  if (!isAdmin) return null;

  return (
    <div className="max-w-full mx-auto space-y-4">
      <PromptLabPanel />
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white">User Management</h1>
          <p className="text-sm text-gray-600 dark:text-gray-300 mt-1">
            {users.length} user{users.length !== 1 ? 's' : ''} total
          </p>
        </div>
        <Button onClick={() => setShowBulkCreate(true)}>+ Add Users</Button>
      </div>

      {error && (
        <div className="p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg text-red-700 dark:text-red-300 text-sm flex items-center justify-between">
          <span>{error}</span>
          <button onClick={() => setError(null)} className="ml-4 underline text-xs">
            Dismiss
          </button>
        </div>
      )}
      {successMessage && (
        <div className="p-3 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg text-green-700 dark:text-green-300 text-sm">
          {successMessage}
        </div>
      )}

      <UserFilters
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
        status={filterStatus}
        onStatusChange={setFilterStatus}
        tag={filterTag}
        onTagChange={setFilterTag}
        allTags={allTags}
      />

      {visibleSelectedIds.size > 0 && (
        <BatchActionBar
          count={visibleSelectedIds.size}
          onActivate={() => handleBatchToggleActive(true)}
          onDeactivate={() => handleBatchToggleActive(false)}
          onSetQuotas={() => setShowBatchQuotas(true)}
          onSetTags={() => setShowBatchTags(true)}
          onResetPasswords={handleBatchResetPasswords}
          onDelete={handleBatchDelete}
          onClear={clearSelection}
        />
      )}

      {showBulkCreate && (
        <BulkCreateModal
          allTags={allTags}
          onCreated={handleBulkCreated}
          onCancel={() => setShowBulkCreate(false)}
          onError={setError}
        />
      )}

      {deleteTargets && (
        <DeleteUsersModal
          users={deleteTargets.users}
          bulk={deleteTargets.bulk}
          onDeleted={handleDeleted}
          onClose={() => setDeleteTargets(null)}
        />
      )}

      {showBatchQuotas && (
        <BatchQuotaModal
          selectedCount={visibleSelectedIds.size}
          loading={batchActionLoading}
          onApply={handleBatchSetQuotas}
          onCancel={() => setShowBatchQuotas(false)}
        />
      )}

      {showBatchTags && (
        <BatchTagsModal
          selectedCount={visibleSelectedIds.size}
          allTags={allTags}
          loading={batchActionLoading}
          onApply={handleBatchSetTags}
          onCancel={() => setShowBatchTags(false)}
        />
      )}

      <UserTable
        users={filteredUsers}
        totalUsers={users.length}
        selectedIds={selectedIds}
        allVisibleSelected={allVisibleSelected}
        editingQuotas={editingQuotas}
        editingTags={editingTags}
        onToggleSelect={toggleSelect}
        onToggleSelectAll={toggleSelectAll}
        onToggleActive={handleToggleActive}
        onResetPassword={handleResetPassword}
        onDelete={(u) => openDelete([u], false)}
        currentEmail={currentUser?.username}
        onQuotaChange={updateQuotaValue}
        onQuotaSave={handleSaveQuota}
        onQuotaCancel={cancelQuotaEdit}
        onTagsStart={startEditingTags}
        onTagsChange={(userId, value) => setEditingTags((prev) => ({ ...prev, [userId]: value }))}
        onTagsSave={handleSaveTags}
        onTagsCancel={cancelEditingTags}
      />
    </div>
  );
}
