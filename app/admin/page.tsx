'use client';

import { useEffect, useState } from 'react';
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

export default function AdminPage() {
  const router = useRouter();
  const { user, initialising, token } = useAuth();
  const [loading, setLoading] = useState(true);
  const [users, setUsers] = useState<UserWithQuotas[]>([]);
  const [error, setError] = useState<string | null>(null);

  // Bulk creation state
  const [showBulkCreate, setShowBulkCreate] = useState(false);
  const [bulkEmails, setBulkEmails] = useState('');
  const [defaultQuotaType, setDefaultQuotaType] = useState<'limited' | 'unlimited'>('limited');
  const [imageQuotaLimit, setImageQuotaLimit] = useState('100');
  const [videoQuotaLimit, setVideoQuotaLimit] = useState('50');
  const [textQuotaLimit, setTextQuotaLimit] = useState('200');
  const [bulkTags, setBulkTags] = useState('');
  const [bulkCreateLoading, setBulkCreateLoading] = useState(false);

  // Inline editing state
  const [editingQuotas, setEditingQuotas] = useState<Record<string, Record<string, any>>>({});
  
  // Tag management state
  const [allTags, setAllTags] = useState<string[]>([]);
  const [editingTags, setEditingTags] = useState<Record<string, string>>({});

  const isAdmin = user?.roles?.includes('admin') ?? false;

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
        // Load quotas for each user
        const usersWithQuotas = await Promise.all(
          data.data.users.map(async (user: User) => {
            try {
              const quotaResponse = await apiFetch(`/api/admin/quotas/${user.id}`);
              if (quotaResponse.ok) {
                const quotaData = await quotaResponse.json();
                return {
                  ...user,
                  quotas: quotaData.success ? quotaData.data.quotas : [],
                };
              }
            } catch (err) {
              console.error(`Failed to load quotas for ${user.email}:`, err);
            }
            return { ...user, quotas: [] };
          })
        );
        setUsers(usersWithQuotas);
      }
      } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load users');
      } finally {
        setLoading(false);
      }
    };

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
        defaultQuotas.image = {
          type: defaultQuotaType,
          limit: parseInt(imageQuotaLimit) || 100,
        };
        defaultQuotas.video = {
          type: defaultQuotaType,
          limit: parseInt(videoQuotaLimit) || 50,
        };
        defaultQuotas.text = {
          type: defaultQuotaType,
          limit: parseInt(textQuotaLimit) || 200,
        };
      } else {
        defaultQuotas.image = { type: 'unlimited', limit: null };
        defaultQuotas.video = { type: 'unlimited', limit: null };
        defaultQuotas.text = { type: 'unlimited', limit: null };
      }

      // Parse tags
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

      await loadUsers();
      await loadAllTags(); // Refresh tags list
      setShowBulkCreate(false);
      setBulkEmails('');
      setImageQuotaLimit('100');
      setVideoQuotaLimit('50');
      setBulkTags('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create users');
    } finally {
      setBulkCreateLoading(false);
    }
  };

  const handleToggleActive = async (userId: string, currentActive: boolean) => {
    try {
      const response = await apiFetch(`/api/admin/users/${userId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isActive: !currentActive }),
      });

      if (!response.ok) {
        throw new Error('Failed to update user');
      }

      await loadUsers();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update user');
    }
  };

  const handleResetPassword = async (userId: string, userEmail: string) => {
    if (!confirm(`Reset password for ${userEmail}? They will need to set a new password on next login.`)) {
      return;
    }

    try {
      const response = await apiFetch(`/api/admin/users/${userId}/reset-password`, {
        method: 'POST',
      });

      if (!response.ok) {
        throw new Error('Failed to reset password');
      }

      alert('Password reset. User will set a new password on next login.');
      await loadUsers();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to reset password');
    }
  };

  const startEditingTags = (userId: string, currentTags: string[]) => {
    setEditingTags({
      ...editingTags,
      [userId]: currentTags.join(', '),
    });
  };

  const cancelEditingTags = (userId: string) => {
    const newEditing = { ...editingTags };
    delete newEditing[userId];
    setEditingTags(newEditing);
  };

  const handleSaveTags = async (userId: string) => {
    try {
      const tagsString = editingTags[userId] || '';
      const tags = tagsString
        .split(',')
        .map((tag) => tag.trim())
        .filter((tag) => tag.length > 0);

      const response = await apiFetch(`/api/admin/users/${userId}/tags`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tags }),
      });

      if (!response.ok) {
        throw new Error('Failed to update tags');
      }

      await loadUsers();
      await loadAllTags(); // Refresh tags list
      cancelEditingTags(userId);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update tags');
    }
  };

  const handleSaveQuota = async (userId: string, generationType: string) => {
    try {
      const quotaUpdate = editingQuotas[userId]?.[generationType];
      if (!quotaUpdate || !quotaUpdate.hasChanges) return;

      const quotas: Record<string, any> = {
        [generationType]: {
          type: quotaUpdate.type,
          limit: quotaUpdate.limit,
        },
      };

      const response = await apiFetch(`/api/admin/quotas/${userId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ quotas }),
      });

      if (!response.ok) {
        throw new Error('Failed to update quota');
      }

      // Clear editing state
      const newEditing = { ...editingQuotas };
      if (newEditing[userId]) {
        delete newEditing[userId][generationType];
        if (Object.keys(newEditing[userId]).length === 0) {
          delete newEditing[userId];
        }
      }
      setEditingQuotas(newEditing);

      // Reload users
      await loadUsers();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update quota');
    }
  };

  const updateQuotaValue = (userId: string, generationType: string, field: 'type' | 'limit', value: any, originalQuota: Quota | null) => {
    const defaultLimit = generationType === 'text' ? 200 : generationType === 'image' ? 100 : 50;
    const currentEdit = editingQuotas[userId]?.[generationType] || {
      type: originalQuota?.quotaType ?? 'limited',
      limit: originalQuota?.quotaLimit ?? defaultLimit,
      hasChanges: false,
    };

    const newValue = {
      ...currentEdit,
      [field]: value,
      hasChanges: true,
    };

    setEditingQuotas({
      ...editingQuotas,
      [userId]: {
        ...(editingQuotas[userId] || {}),
        [generationType]: newValue,
      },
    });
  };

  const cancelQuotaEdit = (userId: string, generationType: string) => {
    const newEditing = { ...editingQuotas };
    if (newEditing[userId]) {
      delete newEditing[userId][generationType];
      if (Object.keys(newEditing[userId]).length === 0) {
        delete newEditing[userId];
      }
    }
    setEditingQuotas(newEditing);
  };

  const getQuotaByType = (quotas: Quota[], type: string): Quota | null => {
    return quotas.find((q) => q.generationType === type) || null;
  };

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

  if (!isAdmin) {
    return null;
  }

    return (
    <div className="max-w-full mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white">User Management</h1>
          <p className="text-sm text-gray-600 dark:text-gray-300 mt-1">
            Manage users and quotas in a single view
          </p>
        </div>
        <Button onClick={() => setShowBulkCreate(true)}>+ Add Users</Button>
      </div>

      {error && (
        <div className="p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg text-red-700 dark:text-red-300">
          {error}
          <button onClick={() => setError(null)} className="ml-4 underline">
            Dismiss
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
                  <Input
                    label="Image Quota (includes image editing)"
                    type="number"
                    value={imageQuotaLimit}
                    onChange={(e) => setImageQuotaLimit(e.target.value)}
                    min="0"
                  />
                  <Input
                    label="Video Quota (includes video editing)"
                    type="number"
                    value={videoQuotaLimit}
                    onChange={(e) => setVideoQuotaLimit(e.target.value)}
                    min="0"
                  />
                  <Input
                    label="Text Quota"
                    type="number"
                    value={textQuotaLimit}
                    onChange={(e) => setTextQuotaLimit(e.target.value)}
                    min="0"
                  />
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
                            const currentTags = bulkTags
                              .split(',')
                              .map((t) => t.trim())
                              .filter((t) => t.length > 0);
                            if (!currentTags.includes(tag)) {
                              setBulkTags(currentTags.concat(tag).join(', '));
                            }
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
                  onClick={() => {
                    setShowBulkCreate(false);
                    setBulkEmails('');
                    setBulkTags('');
                    setError(null);
                  }}
                  className="bg-gray-500 hover:bg-gray-600"
                >
                  Cancel
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Users Table */}
      <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 overflow-hidden">
        {users.length === 0 ? (
          <div className="p-12 text-center">
            <p className="text-gray-500 dark:text-gray-400">
              No users yet. Click &quot;+ Add Users&quot; to invite people.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50 dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700">
                <tr>
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
                {users.map((usr) => {
                  const imageQuota = getQuotaByType(usr.quotas, 'image');
                  const videoQuota = getQuotaByType(usr.quotas, 'video');
                  const textQuota = getQuotaByType(usr.quotas, 'text');

        return (
                    <tr
                      key={usr.id}
                      className="hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors"
                    >
                      {/* User Info */}
                      <td className="px-4 py-4">
              <div>
                          <p className="text-sm font-medium text-gray-900 dark:text-white">{usr.email}</p>
                          <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                            Created: {new Date(usr.createdAt).toLocaleDateString()}
                            {usr.lastLoginAt && (
                              <> • Last login: {new Date(usr.lastLoginAt).toLocaleDateString()}</>
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

                      {/* Image Quota */}
                      <td className="px-4 py-4">
                        {renderQuotaCell(usr.id, 'image', imageQuota)}
                      </td>

                      {/* Video Quota */}
                      <td className="px-4 py-4">
                        {renderQuotaCell(usr.id, 'video', videoQuota)}
                      </td>

                      {/* Text Quota */}
                      <td className="px-4 py-4">
                        {renderQuotaCell(usr.id, 'text', textQuota)}
                      </td>

                      {/* Tags */}
                      <td className="px-4 py-4">
                        {renderTagsCell(usr.id, usr.tags || [])}
                      </td>

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

  function renderQuotaCell(userId: string, type: string, quota: Quota | null) {
    // Handle missing quota - allow creating a new one
    const editData = editingQuotas[userId]?.[type];
    
    if (!quota) {
      const currentType = editData?.type ?? 'limited';
      const currentLimit = editData?.limit ?? (type === 'text' ? 200 : type === 'image' ? 100 : 50);
      const hasChanges = editData?.hasChanges ?? false;

      return (
        <div className="flex flex-col items-center gap-1.5 py-1">
          {/* No quota yet - show creation interface */}
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
              onChange={(e) => updateQuotaValue(userId, type, 'limit', e.target.value === '' ? 0 : parseInt(e.target.value), null)}
              min="0"
            />
          )}

          {/* Save button - always show for missing quotas once user makes changes */}
          {hasChanges && (
            <div className="flex gap-1">
              <button
                onClick={() => handleSaveQuota(userId, type)}
                className="px-2 py-1 text-xs bg-green-600 text-white rounded hover:bg-green-700 transition-colors"
                title="Create quota"
              >
                ✓ Create
              </button>
              <button
                onClick={() => cancelQuotaEdit(userId, type)}
                className="px-2 py-1 text-xs bg-gray-500 text-white rounded hover:bg-gray-600 transition-colors"
                title="Cancel"
              >
                ✕
              </button>
            </div>
          )}
        </div>
      );
    }

    const currentType = editData?.type ?? quota.quotaType;
    const currentLimit = editData?.limit ?? quota.quotaLimit;
    const hasChanges = editData?.hasChanges ?? false;

    // Always show editable inputs
    const isUnlimited = currentType === 'unlimited';
    const usedPercentage = quota.quotaLimit && !isUnlimited ? (quota.quotaUsed / quota.quotaLimit) * 100 : 0;
    const isLow = usedPercentage >= 80;

    return (
      <div className="flex flex-col items-center gap-1.5 py-1">
        {/* Usage Display */}
        {!isUnlimited ? (
          <>
            <div className="text-xs font-medium text-gray-900 dark:text-white">
              {quota.quotaUsed} / {currentLimit ?? 0}
                      </div>
            <div className="w-20 h-1.5 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
              <div
                className={`h-full transition-all ${
                  isLow ? 'bg-red-600' : 'bg-blue-600'
                }`}
                style={{ width: `${Math.min(usedPercentage, 100)}%` }}
              />
            </div>
          </>
        ) : (
          <div className="text-sm font-semibold text-green-600 dark:text-green-400">∞</div>
        )}

        {/* Editable Controls */}
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
            onChange={(e) => updateQuotaValue(userId, type, 'limit', e.target.value === '' ? 0 : parseInt(e.target.value), quota)}
            min="0"
          />
        )}

        {/* Save/Cancel buttons - only show when there are changes */}
        {hasChanges && (
          <div className="flex gap-1">
            <button
              onClick={() => handleSaveQuota(userId, type)}
              className="px-2 py-1 text-xs bg-green-600 text-white rounded hover:bg-green-700 transition-colors"
              title="Save changes"
            >
              ✓ Save
            </button>
            <button
              onClick={() => cancelQuotaEdit(userId, type)}
              className="px-2 py-1 text-xs bg-gray-500 text-white rounded hover:bg-gray-600 transition-colors"
              title="Cancel changes"
            >
              ✕
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
            onChange={(e) =>
              setEditingTags({ ...editingTags, [userId]: e.target.value })
            }
            placeholder="tag1, tag2, tag3"
          />
          <div className="flex gap-1">
            <button
              onClick={() => handleSaveTags(userId)}
              className="px-2 py-1 text-xs bg-green-600 text-white rounded hover:bg-green-700 transition-colors flex-1"
              title="Save tags"
            >
              ✓ Save
            </button>
            <button
              onClick={() => cancelEditingTags(userId)}
              className="px-2 py-1 text-xs bg-gray-500 text-white rounded hover:bg-gray-600 transition-colors flex-1"
              title="Cancel"
            >
              ✕
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
