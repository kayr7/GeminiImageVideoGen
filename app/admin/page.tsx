'use client';

import { useEffect, useMemo, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/context/AuthContext';
import { apiFetch } from '@/lib/utils/apiClient';
import Button from '@/components/ui/Button';
import Input from '@/components/ui/Input';
import Textarea from '@/components/ui/Textarea';
import Select from '@/components/ui/Select';

interface User {
  id: string;
  email: string;
  isActive: boolean;
  isAdmin: boolean;
  requirePasswordReset: boolean;
  createdAt: string;
  lastLoginAt: string | null;
  isShared: boolean;
  sharedWith: string[] | null;
  tags?: string[] | null;
}

interface Quota {
  generationType: string;
  quotaType: string;
  quotaLimit: number | null;
  quotaUsed: number;
  quotaRemaining: number | null;
  quotaResetAt: string | null;
}

interface UserWithQuotas extends User {
  quotas: Quota[];
}

const GENERATION_TYPES = ['image', 'video', 'speech', 'text'] as const;

const DEFAULT_LIMITS: Record<string, number> = {
  image: 100,
  video: 50,
  speech: 100,
  text: 200,
};

export default function AdminPage() {
  const router = useRouter();
  const { user, initialising, token } = useAuth();
  const [loading, setLoading] = useState(true);
  const [users, setUsers] = useState<UserWithQuotas[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // Selection state
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  // Search / filter state
  const [searchQuery, setSearchQuery] = useState('');
  const [filterStatus, setFilterStatus] = useState<'all' | 'active' | 'inactive'>('all');
  const [filterTag, setFilterTag] = useState('');

  // Bulk creation state
  const [showBulkCreate, setShowBulkCreate] = useState(false);
  const [bulkEmails, setBulkEmails] = useState('');
  const [defaultQuotaType, setDefaultQuotaType] = useState<'limited' | 'unlimited'>('limited');
  const [imageQuotaLimit, setImageQuotaLimit] = useState('100');
  const [videoQuotaLimit, setVideoQuotaLimit] = useState('50');
  const [speechQuotaLimit, setSpeechQuotaLimit] = useState('100');
  const [textQuotaLimit, setTextQuotaLimit] = useState('200');
  const [bulkTags, setBulkTags] = useState('');
  const [bulkCreateLoading, setBulkCreateLoading] = useState(false);

  // Batch action modals
  const [showBatchQuotas, setShowBatchQuotas] = useState(false);
  const [showBatchTags, setShowBatchTags] = useState(false);
  const [batchQuotaType, setBatchQuotaType] = useState<'limited' | 'unlimited'>('limited');
  const [batchImageLimit, setBatchImageLimit] = useState('100');
  const [batchVideoLimit, setBatchVideoLimit] = useState('50');
  const [batchSpeechLimit, setBatchSpeechLimit] = useState('100');
  const [batchTextLimit, setBatchTextLimit] = useState('200');
  const [batchTagsInput, setBatchTagsInput] = useState('');
  const [batchTagMode, setBatchTagMode] = useState<'replace' | 'add'>('add');
  const [batchActionLoading, setBatchActionLoading] = useState(false);

  // Inline editing state
  const [editingQuotas, setEditingQuotas] = useState<Record<string, Record<string, any>>>({});

  // Tag management state
  const [allTags, setAllTags] = useState<string[]>([]);
  const [editingTags, setEditingTags] = useState<Record<string, string>>({});

  const isAdmin = user?.roles?.includes('admin') ?? false;

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
    if (!initialising && !token) {
      router.push('/login?redirect=/admin');
      return;
    }

    if (!initialising && !isAdmin) {
      router.push('/');
      return;
    }

    if (!initialising && isAdmin && token) {
      loadUsers();
      loadAllTags();
    }
  }, [initialising, isAdmin, token, router]);

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

  const loadUsers = async () => {
    try {
      setLoading(true);
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

  const getQuotaByType = (quotas: Quota[], type: string): Quota | null =>
    quotas.find((q) => q.generationType === type) || null;

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
    generationType: string,
    field: 'type' | 'limit',
    value: any,
    originalQuota: Quota | null,
  ) => {
    const defaultLimit = DEFAULT_LIMITS[generationType] ?? 100;
    const currentEdit = editingQuotas[userId]?.[generationType] || {
      type: originalQuota?.quotaType ?? 'limited',
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

  const cancelQuotaEdit = (userId: string, generationType: string) => {
    setEditingQuotas((prev) => {
      const next = { ...prev };
      if (next[userId]) {
        delete next[userId][generationType];
        if (Object.keys(next[userId]).length === 0) delete next[userId];
      }
      return next;
    });
  };

  const handleSaveQuota = async (userId: string, generationType: string) => {
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
    const tags = (editingTags[userId] || '')
      .split(',')
      .map((t) => t.trim())
      .filter((t) => t.length > 0);

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
      ids.map((id) => apiFetch(`/api/admin/users/${id}/reset-password`, { method: 'POST' }).then((r) => { if (!r.ok) throw new Error(); })),
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

  const handleBatchSetQuotas = async () => {
    const ids = [...visibleSelectedIds];
    if (ids.length === 0) return;

    setBatchActionLoading(true);
    try {
      const quotas: Record<string, any> = {};
      for (const type of GENERATION_TYPES) {
        if (batchQuotaType === 'unlimited') {
          quotas[type] = { type: 'unlimited', limit: null };
        } else {
          const limits: Record<string, string> = {
            image: batchImageLimit,
            video: batchVideoLimit,
            speech: batchSpeechLimit,
            text: batchTextLimit,
          };
          quotas[type] = { type: 'limited', limit: parseInt(limits[type]) || DEFAULT_LIMITS[type] };
        }
      }

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

  const handleBatchSetTags = async () => {
    const ids = [...visibleSelectedIds];
    if (ids.length === 0) return;

    setBatchActionLoading(true);
    try {
      const newTags = batchTagsInput
        .split(',')
        .map((t) => t.trim())
        .filter((t) => t.length > 0);

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

  // -- Bulk create -----------------------------------------------------------

  const handleBulkCreate = async () => {
    try {
      setBulkCreateLoading(true);
      setError(null);

      const emails = bulkEmails
        .split('\n')
        .map((email) => email.trim())
        .filter((email) => email.length > 0);

      if (emails.length === 0) {
        setError('Please enter at least one email address');
        return;
      }

      const defaultQuotas: Record<string, any> = {};
      if (defaultQuotaType !== 'unlimited') {
        defaultQuotas.image = { type: defaultQuotaType, limit: parseInt(imageQuotaLimit) || 100 };
        defaultQuotas.video = { type: defaultQuotaType, limit: parseInt(videoQuotaLimit) || 50 };
        defaultQuotas.speech = { type: defaultQuotaType, limit: parseInt(speechQuotaLimit) || 100 };
        defaultQuotas.text = { type: defaultQuotaType, limit: parseInt(textQuotaLimit) || 200 };
      } else {
        defaultQuotas.image = { type: 'unlimited', limit: null };
        defaultQuotas.video = { type: 'unlimited', limit: null };
        defaultQuotas.speech = { type: 'unlimited', limit: null };
        defaultQuotas.text = { type: 'unlimited', limit: null };
      }

      const defaultTags = bulkTags
        .split(',')
        .map((tag) => tag.trim())
        .filter((tag) => tag.length > 0);

      const response = await apiFetch('/api/admin/users/bulk-create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          emails,
          defaultQuotas,
          defaultTags: defaultTags.length > 0 ? defaultTags : undefined,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.detail || 'Failed to create users');
      }

      // Reload is necessary here since new users are created server-side
      await loadUsers();
      await loadAllTags();
      setShowBulkCreate(false);
      setBulkEmails('');
      setImageQuotaLimit('100');
      setVideoQuotaLimit('50');
      setSpeechQuotaLimit('100');
      setBulkTags('');
      flash(`Created ${emails.length} user(s)`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create users');
    } finally {
      setBulkCreateLoading(false);
    }
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
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white">User Management</h1>
          <p className="text-sm text-gray-600 dark:text-gray-300 mt-1">
            {users.length} user{users.length !== 1 ? 's' : ''} total
          </p>
        </div>
        <Button onClick={() => setShowBulkCreate(true)}>+ Add Users</Button>
      </div>

      {/* Messages */}
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

      {/* Search & filter bar */}
      <div className="flex flex-wrap items-end gap-3">
        <div className="flex-1 min-w-[200px]">
          <Input
            label="Search"
            placeholder="Filter by email..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>
        <div className="w-36">
          <Select
            label="Status"
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value as any)}
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
              value={filterTag}
              onChange={(e) => setFilterTag(e.target.value)}
              options={[{ value: '', label: 'All tags' }, ...allTags.map((t) => ({ value: t, label: t }))]}
            />
          </div>
        )}
        {(searchQuery || filterStatus !== 'all' || filterTag) && (
          <button
            onClick={() => {
              setSearchQuery('');
              setFilterStatus('all');
              setFilterTag('');
            }}
            className="text-xs text-blue-600 dark:text-blue-400 hover:underline pb-2"
          >
            Clear filters
          </button>
        )}
      </div>

      {/* Batch action toolbar */}
      {visibleSelectedIds.size > 0 && (
        <div className="sticky top-0 z-30 bg-blue-600 dark:bg-blue-700 text-white rounded-xl px-4 py-3 flex flex-wrap items-center gap-3 shadow-lg">
          <span className="text-sm font-semibold">
            {visibleSelectedIds.size} selected
          </span>
          <div className="h-5 w-px bg-blue-400" />
          <button
            onClick={() => handleBatchToggleActive(true)}
            className="px-3 py-1.5 text-xs font-medium rounded-lg bg-green-500 hover:bg-green-400 transition-colors"
          >
            Activate
          </button>
          <button
            onClick={() => handleBatchToggleActive(false)}
            className="px-3 py-1.5 text-xs font-medium rounded-lg bg-red-500 hover:bg-red-400 transition-colors"
          >
            Deactivate
          </button>
          <button
            onClick={() => setShowBatchQuotas(true)}
            className="px-3 py-1.5 text-xs font-medium rounded-lg bg-blue-500 hover:bg-blue-400 transition-colors"
          >
            Set Quotas
          </button>
          <button
            onClick={() => setShowBatchTags(true)}
            className="px-3 py-1.5 text-xs font-medium rounded-lg bg-purple-500 hover:bg-purple-400 transition-colors"
          >
            Set Tags
          </button>
          <button
            onClick={handleBatchResetPasswords}
            className="px-3 py-1.5 text-xs font-medium rounded-lg bg-yellow-500 hover:bg-yellow-400 text-yellow-900 transition-colors"
          >
            Reset Passwords
          </button>
          <div className="flex-1" />
          <button
            onClick={clearSelection}
            className="px-3 py-1.5 text-xs font-medium rounded-lg bg-white/20 hover:bg-white/30 transition-colors"
          >
            Clear
          </button>
        </div>
      )}

      {/* Bulk Create Modal */}
      {showBulkCreate && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <div className="bg-white dark:bg-gray-900 rounded-xl shadow-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto p-6">
            <h2 className="text-2xl font-bold mb-4 text-gray-900 dark:text-white">Add New Users</h2>
            <div className="space-y-4">
              <Textarea
                label="Email Addresses (one per line)"
                value={bulkEmails}
                onChange={(e) => setBulkEmails(e.target.value)}
                placeholder="alice@example.com&#10;bob@example.com&#10;charlie@example.com"
                rows={6}
              />
              <Select
                label="Default Quota Type"
                value={defaultQuotaType}
                onChange={(e) => setDefaultQuotaType(e.target.value as any)}
                options={[
                  { value: 'limited', label: 'Limited (total usage quota)' },
                  { value: 'unlimited', label: 'Unlimited (no restrictions)' },
                ]}
              />
              {defaultQuotaType !== 'unlimited' && (
                <div className="grid grid-cols-3 gap-4">
                  <Input label="Image Quota" type="number" value={imageQuotaLimit} onChange={(e) => setImageQuotaLimit(e.target.value)} min="0" />
                  <Input label="Video Quota" type="number" value={videoQuotaLimit} onChange={(e) => setVideoQuotaLimit(e.target.value)} min="0" />
                  <Input label="Speech Quota" type="number" value={speechQuotaLimit} onChange={(e) => setSpeechQuotaLimit(e.target.value)} min="0" />
                  <Input label="Text Quota" type="number" value={textQuotaLimit} onChange={(e) => setTextQuotaLimit(e.target.value)} min="0" />
                </div>
              )}
              <div>
                <Input
                  label="Tags (comma-separated, optional)"
                  value={bulkTags}
                  onChange={(e) => setBulkTags(e.target.value)}
                  placeholder="course, team-a, premium"
                />
                {allTags.length > 0 && (
                  <div className="mt-2">
                    <p className="text-xs text-gray-500 dark:text-gray-400 mb-1">Existing tags:</p>
                    <div className="flex flex-wrap gap-1">
                      {allTags.map((tag) => (
                        <button
                          key={tag}
                          type="button"
                          onClick={() => {
                            const currentTags = bulkTags.split(',').map((t) => t.trim()).filter((t) => t.length > 0);
                            if (!currentTags.includes(tag)) setBulkTags(currentTags.concat(tag).join(', '));
                          }}
                          className="px-2 py-0.5 text-xs bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded hover:bg-gray-300 dark:hover:bg-gray-600 transition-colors"
                        >
                          {tag}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
              <div className="flex gap-3 pt-4">
                <Button onClick={handleBulkCreate} isLoading={bulkCreateLoading} disabled={bulkCreateLoading}>
                  Create Users
                </Button>
                <Button
                  onClick={() => { setShowBulkCreate(false); setBulkEmails(''); setBulkTags(''); setError(null); }}
                  className="bg-gray-500 hover:bg-gray-600"
                >
                  Cancel
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Batch Quotas Modal */}
      {showBatchQuotas && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <div className="bg-white dark:bg-gray-900 rounded-xl shadow-2xl max-w-lg w-full p-6">
            <h2 className="text-xl font-bold mb-1 text-gray-900 dark:text-white">Set Quotas</h2>
            <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
              Apply to {visibleSelectedIds.size} selected user(s). This replaces their current quotas.
            </p>
            <div className="space-y-4">
              <Select
                label="Quota Type"
                value={batchQuotaType}
                onChange={(e) => setBatchQuotaType(e.target.value as any)}
                options={[
                  { value: 'limited', label: 'Limited' },
                  { value: 'unlimited', label: 'Unlimited' },
                ]}
              />
              {batchQuotaType !== 'unlimited' && (
                <div className="grid grid-cols-2 gap-3">
                  <Input label="Image" type="number" value={batchImageLimit} onChange={(e) => setBatchImageLimit(e.target.value)} min="0" />
                  <Input label="Video" type="number" value={batchVideoLimit} onChange={(e) => setBatchVideoLimit(e.target.value)} min="0" />
                  <Input label="Speech" type="number" value={batchSpeechLimit} onChange={(e) => setBatchSpeechLimit(e.target.value)} min="0" />
                  <Input label="Text" type="number" value={batchTextLimit} onChange={(e) => setBatchTextLimit(e.target.value)} min="0" />
                </div>
              )}
              <div className="flex gap-3 pt-2">
                <Button onClick={handleBatchSetQuotas} isLoading={batchActionLoading} disabled={batchActionLoading}>
                  Apply Quotas
                </Button>
                <Button onClick={() => setShowBatchQuotas(false)} className="bg-gray-500 hover:bg-gray-600">
                  Cancel
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Batch Tags Modal */}
      {showBatchTags && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <div className="bg-white dark:bg-gray-900 rounded-xl shadow-2xl max-w-lg w-full p-6">
            <h2 className="text-xl font-bold mb-1 text-gray-900 dark:text-white">Set Tags</h2>
            <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
              Apply to {visibleSelectedIds.size} selected user(s)
            </p>
            <div className="space-y-4">
              <Select
                label="Mode"
                value={batchTagMode}
                onChange={(e) => setBatchTagMode(e.target.value as any)}
                options={[
                  { value: 'add', label: 'Add to existing tags' },
                  { value: 'replace', label: 'Replace all tags' },
                ]}
              />
              <div>
                <Input
                  label="Tags (comma-separated)"
                  value={batchTagsInput}
                  onChange={(e) => setBatchTagsInput(e.target.value)}
                  placeholder="course-a, premium"
                />
                {allTags.length > 0 && (
                  <div className="mt-2">
                    <p className="text-xs text-gray-500 dark:text-gray-400 mb-1">Quick add:</p>
                    <div className="flex flex-wrap gap-1">
                      {allTags.map((tag) => (
                        <button
                          key={tag}
                          type="button"
                          onClick={() => {
                            const current = batchTagsInput.split(',').map((t) => t.trim()).filter((t) => t.length > 0);
                            if (!current.includes(tag)) setBatchTagsInput(current.concat(tag).join(', '));
                          }}
                          className="px-2 py-0.5 text-xs bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded hover:bg-gray-300 dark:hover:bg-gray-600 transition-colors"
                        >
                          {tag}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
              <div className="flex gap-3 pt-2">
                <Button onClick={handleBatchSetTags} isLoading={batchActionLoading} disabled={batchActionLoading}>
                  Apply Tags
                </Button>
                <Button onClick={() => setShowBatchTags(false)} className="bg-gray-500 hover:bg-gray-600">
                  Cancel
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Users Table */}
      <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 overflow-hidden">
        {filteredUsers.length === 0 ? (
          <div className="p-12 text-center">
            <p className="text-gray-500 dark:text-gray-400">
              {users.length === 0
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
                      onChange={toggleSelectAll}
                      className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500 cursor-pointer"
                      aria-label="Select all users"
                    />
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wider">
                    User
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wider">
                    Status
                  </th>
                  <th className="px-4 py-3 text-center text-xs font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wider">
                    Image Quota
                    <div className="text-[10px] font-normal text-gray-500 dark:text-gray-400 normal-case mt-0.5">
                      (includes editing)
                    </div>
                  </th>
                  <th className="px-4 py-3 text-center text-xs font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wider">
                    Video Quota
                    <div className="text-[10px] font-normal text-gray-500 dark:text-gray-400 normal-case mt-0.5">
                      (includes editing)
                    </div>
                  </th>
                  <th className="px-4 py-3 text-center text-xs font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wider">
                    Speech Quota
                  </th>
                  <th className="px-4 py-3 text-center text-xs font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wider">
                    Text Quota
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wider">
                    Tags
                  </th>
                  <th className="px-4 py-3 text-right text-xs font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wider">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                {filteredUsers.map((usr) => {
                  const imageQuota = getQuotaByType(usr.quotas, 'image');
                  const videoQuota = getQuotaByType(usr.quotas, 'video');
                  const speechQuota = getQuotaByType(usr.quotas, 'speech');
                  const textQuota = getQuotaByType(usr.quotas, 'text');
                  const isSelected = selectedIds.has(usr.id);

                  return (
                    <tr
                      key={usr.id}
                      className={`transition-colors ${
                        isSelected
                          ? 'bg-blue-50 dark:bg-blue-900/20'
                          : 'hover:bg-gray-50 dark:hover:bg-gray-800/50'
                      }`}
                    >
                      {/* Checkbox */}
                      <td className="px-3 py-4">
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => toggleSelect(usr.id)}
                          className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500 cursor-pointer"
                          aria-label={`Select ${usr.email}`}
                        />
                      </td>

                      {/* User Info */}
                      <td className="px-4 py-4">
                        <div>
                          <p className="text-sm font-medium text-gray-900 dark:text-white">{usr.email}</p>
                          <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                            Created: {new Date(usr.createdAt).toLocaleDateString()}
                            {usr.lastLoginAt && (
                              <> &middot; Last login: {new Date(usr.lastLoginAt).toLocaleDateString()}</>
                            )}
                          </p>
                        </div>
                      </td>

                      {/* Status */}
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

                      {/* Quota Cells */}
                      <td className="px-4 py-4">{renderQuotaCell(usr.id, 'image', imageQuota)}</td>
                      <td className="px-4 py-4">{renderQuotaCell(usr.id, 'video', videoQuota)}</td>
                      <td className="px-4 py-4">{renderQuotaCell(usr.id, 'speech', speechQuota)}</td>
                      <td className="px-4 py-4">{renderQuotaCell(usr.id, 'text', textQuota)}</td>

                      {/* Tags */}
                      <td className="px-4 py-4">{renderTagsCell(usr.id, usr.tags || [])}</td>

                      {/* Actions */}
                      <td className="px-4 py-4">
                        <div className="flex items-center justify-end gap-2">
                          <button
                            onClick={() => handleToggleActive(usr.id, usr.isActive)}
                            className="px-3 py-1 text-xs font-medium rounded bg-blue-100 text-blue-700 hover:bg-blue-200 dark:bg-blue-900/30 dark:text-blue-300 dark:hover:bg-blue-900/50"
                          >
                            {usr.isActive ? 'Deactivate' : 'Activate'}
                          </button>
                          <button
                            onClick={() => handleResetPassword(usr.id, usr.email)}
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
    </div>
  );

  // -- Render helpers --------------------------------------------------------

  function renderQuotaCell(userId: string, type: string, quota: Quota | null) {
    const editData = editingQuotas[userId]?.[type];

    if (!quota) {
      const currentType = editData?.type ?? 'limited';
      const currentLimit = editData?.limit ?? DEFAULT_LIMITS[type];
      const hasChanges = editData?.hasChanges ?? false;

      return (
        <div className="flex flex-col items-center gap-1.5 py-1">
          <div className="text-xs text-gray-400 dark:text-gray-500 mb-1">Not set</div>
          <select
            aria-label={`${type} quota type`}
            className="text-xs px-2 py-1 rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 w-24 hover:border-blue-400 focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
            value={currentType}
            onChange={(e) => updateQuotaValue(userId, type, 'type', e.target.value, null)}
          >
            <option value="limited">Limited</option>
            <option value="unlimited">Unlimited</option>
          </select>
          {currentType !== 'unlimited' && (
            <input
              type="number"
              aria-label={`${type} quota limit`}
              className="text-xs px-2 py-1 rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 w-20 text-center hover:border-blue-400 focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
              value={currentLimit}
              onChange={(e) =>
                updateQuotaValue(userId, type, 'limit', e.target.value === '' ? 0 : parseInt(e.target.value), null)
              }
              min="0"
            />
          )}
          {hasChanges && (
            <div className="flex gap-1">
              <button
                onClick={() => handleSaveQuota(userId, type)}
                className="px-2 py-1 text-xs bg-green-600 text-white rounded hover:bg-green-700 transition-colors"
              >
                Create
              </button>
              <button
                onClick={() => cancelQuotaEdit(userId, type)}
                className="px-2 py-1 text-xs bg-gray-500 text-white rounded hover:bg-gray-600 transition-colors"
              >
                Cancel
              </button>
            </div>
          )}
        </div>
      );
    }

    const currentType = editData?.type ?? quota.quotaType;
    const currentLimit = editData?.limit ?? quota.quotaLimit;
    const hasChanges = editData?.hasChanges ?? false;
    const isUnlimited = currentType === 'unlimited';
    const usedPercentage = quota.quotaLimit && !isUnlimited ? (quota.quotaUsed / quota.quotaLimit) * 100 : 0;
    const isLow = usedPercentage >= 80;

    return (
      <div className="flex flex-col items-center gap-1.5 py-1">
        {!isUnlimited ? (
          <>
            <div className="text-xs font-medium text-gray-900 dark:text-white">
              {quota.quotaUsed} / {currentLimit ?? 0}
            </div>
            <div className="w-20 h-1.5 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
              <div
                className={`h-full transition-all ${isLow ? 'bg-red-600' : 'bg-blue-600'}`}
                style={{ width: `${Math.min(usedPercentage, 100)}%` }}
              />
            </div>
          </>
        ) : (
          <div className="text-sm font-semibold text-green-600 dark:text-green-400">Unlimited</div>
        )}
        <select
          aria-label={`${type} quota type`}
          className="text-xs px-2 py-1 rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 w-24 hover:border-blue-400 focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
          value={currentType}
          onChange={(e) => updateQuotaValue(userId, type, 'type', e.target.value, quota)}
        >
          <option value="limited">Limited</option>
          <option value="unlimited">Unlimited</option>
        </select>
        {currentType !== 'unlimited' && (
          <input
            type="number"
            aria-label={`${type} quota limit`}
            className="text-xs px-2 py-1 rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 w-20 text-center hover:border-blue-400 focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
            value={currentLimit !== null && currentLimit !== undefined ? currentLimit : ''}
            onChange={(e) =>
              updateQuotaValue(userId, type, 'limit', e.target.value === '' ? 0 : parseInt(e.target.value), quota)
            }
            min="0"
          />
        )}
        {hasChanges && (
          <div className="flex gap-1">
            <button
              onClick={() => handleSaveQuota(userId, type)}
              className="px-2 py-1 text-xs bg-green-600 text-white rounded hover:bg-green-700 transition-colors"
            >
              Save
            </button>
            <button
              onClick={() => cancelQuotaEdit(userId, type)}
              className="px-2 py-1 text-xs bg-gray-500 text-white rounded hover:bg-gray-600 transition-colors"
            >
              Cancel
            </button>
          </div>
        )}
      </div>
    );
  }

  function renderTagsCell(userId: string, tags: string[]) {
    const isEditing = userId in editingTags;

    if (isEditing) {
      return (
        <div className="flex flex-col gap-2">
          <input
            type="text"
            aria-label="Edit tags"
            className="text-xs px-2 py-1 rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 w-full hover:border-blue-400 focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
            value={editingTags[userId]}
            onChange={(e) => setEditingTags({ ...editingTags, [userId]: e.target.value })}
            placeholder="tag1, tag2, tag3"
          />
          <div className="flex gap-1">
            <button
              onClick={() => handleSaveTags(userId)}
              className="px-2 py-1 text-xs bg-green-600 text-white rounded hover:bg-green-700 transition-colors flex-1"
            >
              Save
            </button>
            <button
              onClick={() => cancelEditingTags(userId)}
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
        <button
          onClick={() => startEditingTags(userId, tags)}
          className="text-xs text-blue-600 dark:text-blue-400 hover:underline w-fit"
        >
          Edit
        </button>
      </div>
    );
  }
}
