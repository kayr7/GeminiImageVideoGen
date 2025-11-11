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
}

interface Quota {
  generationType: string;
  quotaType: string;
  quotaLimit: number | null;
  quotaUsed: number;
  quotaRemaining: number | null;
  quotaResetAt: string | null;
}

interface Generation {
  id: string;
  type: string;
  prompt: string;
  model: string;
  createdAt: string;
  userId: string;
  userEmail: string;
  ipAddress: string;
}

export default function AdminPage() {
  const router = useRouter();
  const { user, initialising, token } = useAuth();
  const [loading, setLoading] = useState(true);
  const [users, setUsers] = useState<User[]>([]);
  const [selectedUser, setSelectedUser] = useState<User | null>(null);
  const [selectedUserQuotas, setSelectedUserQuotas] = useState<Quota[]>([]);
  const [selectedUserGenerations, setSelectedUserGenerations] = useState<Generation[]>([]);
  const [error, setError] = useState<string | null>(null);

  // Bulk creation state
  const [showBulkCreate, setShowBulkCreate] = useState(false);
  const [bulkEmails, setBulkEmails] = useState('');
  const [defaultQuotaType, setDefaultQuotaType] = useState<'daily' | 'weekly' | 'unlimited'>('daily');
  const [imageQuotaLimit, setImageQuotaLimit] = useState('50');
  const [videoQuotaLimit, setVideoQuotaLimit] = useState('10');
  const [editQuotaLimit, setEditQuotaLimit] = useState('30');
  const [bulkCreateLoading, setBulkCreateLoading] = useState(false);

  // Quota editing state
  const [editingQuotas, setEditingQuotas] = useState(false);
  const [quotaUpdates, setQuotaUpdates] = useState<Record<string, any>>({});

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
    }
  }, [initialising, isAdmin, token, router]);

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
        setUsers(data.data.users);
      }
      } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load users');
      } finally {
        setLoading(false);
      }
    };

  const handleSelectUser = async (user: User) => {
    setSelectedUser(user);
    await loadUserDetails(user.id);
  };

  const loadUserDetails = async (userId: string) => {
    try {
      // Load quotas
      const quotaResponse = await apiFetch(`/api/admin/quotas/${userId}`);
      if (quotaResponse.ok) {
        const quotaData = await quotaResponse.json();
        if (quotaData.success && quotaData.data?.quotas) {
          setSelectedUserQuotas(quotaData.data.quotas);
        }
      }

      // Load generations
      const genResponse = await apiFetch(`/api/admin/users/${userId}/generations?limit=10`);
      if (genResponse.ok) {
        const genData = await genResponse.json();
        if (genData.success && genData.data?.generations) {
          setSelectedUserGenerations(genData.data.generations);
        }
      }
    } catch (err) {
      console.error('Failed to load user details:', err);
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
          limit: parseInt(imageQuotaLimit) || 50,
        };
        defaultQuotas.video = {
          type: defaultQuotaType,
          limit: parseInt(videoQuotaLimit) || 10,
        };
        defaultQuotas.edit = {
          type: defaultQuotaType,
          limit: parseInt(editQuotaLimit) || 30,
        };
      } else {
        defaultQuotas.image = { type: 'unlimited', limit: null };
        defaultQuotas.video = { type: 'unlimited', limit: null };
        defaultQuotas.edit = { type: 'unlimited', limit: null };
      }

      const response = await apiFetch('/api/admin/users/bulk-create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ emails, defaultQuotas }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.detail || 'Failed to create users');
      }

      // Success - reload users
      await loadUsers();
      setShowBulkCreate(false);
      setBulkEmails('');
      setImageQuotaLimit('50');
      setVideoQuotaLimit('10');
      setEditQuotaLimit('30');
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
      if (selectedUser?.id === userId) {
        setSelectedUser({ ...selectedUser, isActive: !currentActive });
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update user');
    }
  };

  const handleResetPassword = async (userId: string) => {
    try {
      const response = await apiFetch(`/api/admin/users/${userId}/reset-password`, {
        method: 'POST',
      });

      if (!response.ok) {
        throw new Error('Failed to reset password');
      }

      alert('Password reset flag set. User will need to set a new password on next login.');
      await loadUsers();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to reset password');
    }
  };

  const handleUpdateQuotas = async () => {
    if (!selectedUser) return;

    try {
      const response = await apiFetch(`/api/admin/quotas/${selectedUser.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ quotas: quotaUpdates }),
      });

      if (!response.ok) {
        throw new Error('Failed to update quotas');
      }

      await loadUserDetails(selectedUser.id);
      setEditingQuotas(false);
      setQuotaUpdates({});
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update quotas');
    }
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
    <div className="max-w-7xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white">User Management</h1>
          <p className="text-sm text-gray-600 dark:text-gray-300 mt-1">
            Manage users you&apos;ve invited to the platform
          </p>
        </div>
        <Button onClick={() => setShowBulkCreate(true)}>
          + Add Users
        </Button>
      </div>

      {error && (
        <div className="p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg text-red-700 dark:text-red-300">
          {error}
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
                  { value: 'daily', label: 'Daily (resets at midnight UTC)' },
                  { value: 'weekly', label: 'Weekly (resets Monday)' },
                  { value: 'unlimited', label: 'Unlimited (no restrictions)' },
                ]}
              />

              {defaultQuotaType !== 'unlimited' && (
                <div className="grid grid-cols-3 gap-4">
                  <Input
                    label="Image Quota"
                    type="number"
                    value={imageQuotaLimit}
                    onChange={(e) => setImageQuotaLimit(e.target.value)}
                    min="1"
                  />
                  <Input
                    label="Video Quota"
                    type="number"
                    value={videoQuotaLimit}
                    onChange={(e) => setVideoQuotaLimit(e.target.value)}
                    min="1"
                  />
                  <Input
                    label="Edit Quota"
                    type="number"
                    value={editQuotaLimit}
                    onChange={(e) => setEditQuotaLimit(e.target.value)}
                    min="1"
                  />
                </div>
              )}

              <div className="flex gap-3 pt-4">
                <Button
                  onClick={handleBulkCreate}
                  isLoading={bulkCreateLoading}
                  disabled={bulkCreateLoading}
                >
                  Create Users
                </Button>
                <Button
                  onClick={() => {
                    setShowBulkCreate(false);
                    setBulkEmails('');
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

      <div className="grid md:grid-cols-3 gap-6">
        {/* User List */}
        <div className="md:col-span-1 bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-4">
          <h2 className="text-lg font-semibold mb-4 text-gray-900 dark:text-white">
            Your Users ({users.length})
          </h2>

          <div className="space-y-2 max-h-[600px] overflow-y-auto">
            {users.length === 0 ? (
              <p className="text-sm text-gray-500 dark:text-gray-400 text-center py-8">
                No users yet. Click &quot;+ Add Users&quot; to invite people.
              </p>
            ) : (
              users.map((usr) => (
                <button
                  key={usr.id}
                  onClick={() => handleSelectUser(usr)}
                  className={`w-full text-left p-3 rounded-lg transition-colors ${
                    selectedUser?.id === usr.id
                      ? 'bg-blue-50 dark:bg-blue-900/20 border-2 border-blue-500'
                      : 'bg-gray-50 dark:bg-gray-800 hover:bg-gray-100 dark:hover:bg-gray-700 border-2 border-transparent'
                  }`}
                >
                  <div className="flex items-start justify-between">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-900 dark:text-white truncate">
                        {usr.email}
                      </p>
                      <div className="flex items-center gap-2 mt-1">
                        <span
                          className={`inline-block px-2 py-0.5 text-xs font-semibold rounded ${
                            usr.isActive
                              ? 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300'
                              : 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300'
                          }`}
                        >
                          {usr.isActive ? 'Active' : 'Inactive'}
                        </span>
                        {usr.isShared && (
                          <span className="inline-block px-2 py-0.5 text-xs font-semibold bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-300 rounded">
                            Shared
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                </button>
              ))
            )}
          </div>
        </div>

        {/* User Details */}
        <div className="md:col-span-2 space-y-6">
          {selectedUser ? (
            <>
              {/* User Info Card */}
              <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-6">
                <div className="flex items-start justify-between mb-4">
              <div>
                    <h2 className="text-2xl font-bold text-gray-900 dark:text-white">
                      {selectedUser.email}
                    </h2>
                    <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                      Created: {new Date(selectedUser.createdAt).toLocaleDateString()}
                      {selectedUser.lastLoginAt && (
                        <> • Last login: {new Date(selectedUser.lastLoginAt).toLocaleDateString()}</>
                      )}
                    </p>
                  </div>
                  <div className="flex gap-2">
                    <Button
                      onClick={() => handleToggleActive(selectedUser.id, selectedUser.isActive)}
                      className={selectedUser.isActive ? 'bg-red-600 hover:bg-red-700' : 'bg-green-600 hover:bg-green-700'}
                    >
                      {selectedUser.isActive ? 'Deactivate' : 'Activate'}
                    </Button>
                    <Button
                      onClick={() => handleResetPassword(selectedUser.id)}
                      className="bg-yellow-600 hover:bg-yellow-700"
                    >
                      Reset Password
                    </Button>
                  </div>
                </div>

                {selectedUser.isShared && selectedUser.sharedWith && (
                  <div className="p-3 bg-purple-50 dark:bg-purple-900/20 border border-purple-200 dark:border-purple-800 rounded-lg">
                    <p className="text-sm text-purple-900 dark:text-purple-100 font-medium">
                      Shared with other admins:
                    </p>
                    <p className="text-xs text-purple-700 dark:text-purple-300 mt-1">
                      {selectedUser.sharedWith.join(', ')}
                    </p>
                  </div>
                )}
              </div>

              {/* Quotas Card */}
              <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-6">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-lg font-semibold text-gray-900 dark:text-white">Quotas</h3>
                  {!editingQuotas ? (
                    <Button onClick={() => setEditingQuotas(true)} className="text-sm">
                      Edit Quotas
                    </Button>
                  ) : (
                    <div className="flex gap-2">
                      <Button onClick={handleUpdateQuotas} className="text-sm">
                        Save
                      </Button>
              <Button
                        onClick={() => {
                          setEditingQuotas(false);
                          setQuotaUpdates({});
                        }}
                        className="text-sm bg-gray-500 hover:bg-gray-600"
                      >
                        Cancel
              </Button>
                    </div>
                  )}
            </div>

                <div className="space-y-3">
                  {selectedUserQuotas.length === 0 ? (
                    <p className="text-sm text-gray-500 dark:text-gray-400">No quotas set</p>
                  ) : (
                    selectedUserQuotas.map((quota) => (
                      <div key={quota.generationType} className="p-3 bg-gray-50 dark:bg-gray-800 rounded-lg">
                        <div className="flex items-center justify-between">
                      <div>
                            <p className="text-sm font-medium text-gray-900 dark:text-white capitalize">
                              {quota.generationType}
                            </p>
                            <p className="text-xs text-gray-600 dark:text-gray-400 mt-0.5">
                              {quota.quotaType === 'unlimited' ? (
                                'Unlimited'
                              ) : (
                                <>
                                  {quota.quotaUsed} / {quota.quotaLimit} used • {quota.quotaType}
                                  {quota.quotaResetAt && (
                                    <> • Resets {new Date(quota.quotaResetAt).toLocaleDateString()}</>
                                  )}
                                </>
                              )}
                            </p>
                      </div>
                          {editingQuotas && (
                            <div className="flex gap-2">
                              <select
                                className="text-xs px-2 py-1 rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700"
                                value={quotaUpdates[quota.generationType]?.type || quota.quotaType}
                                onChange={(e) =>
                                  setQuotaUpdates({
                                    ...quotaUpdates,
                                    [quota.generationType]: {
                                      ...quotaUpdates[quota.generationType],
                                      type: e.target.value,
                                    },
                                  })
                                }
                              >
                                <option value="daily">Daily</option>
                                <option value="weekly">Weekly</option>
                                <option value="unlimited">Unlimited</option>
                              </select>
                              {(quotaUpdates[quota.generationType]?.type || quota.quotaType) !== 'unlimited' && (
                        <input
                                  type="number"
                                  className="text-xs px-2 py-1 w-20 rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700"
                                  value={quotaUpdates[quota.generationType]?.limit ?? quota.quotaLimit}
                                  onChange={(e) =>
                                    setQuotaUpdates({
                                      ...quotaUpdates,
                                      [quota.generationType]: {
                                        ...quotaUpdates[quota.generationType],
                                        limit: parseInt(e.target.value) || 0,
                                      },
                                    })
                                  }
                                  min="1"
                                />
                              )}
                            </div>
                          )}
                    </div>
                      </div>
                    ))
                  )}
                </div>
              </div>

              {/* Recent Generations */}
              <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-6">
                <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
                  Recent Generations
                </h3>

                <div className="space-y-3">
                  {selectedUserGenerations.length === 0 ? (
                    <p className="text-sm text-gray-500 dark:text-gray-400">No generations yet</p>
                  ) : (
                    selectedUserGenerations.map((gen) => (
                      <div key={gen.id} className="p-3 bg-gray-50 dark:bg-gray-800 rounded-lg">
                        <div className="flex items-start justify-between">
                          <div className="flex-1">
                            <p className="text-sm font-medium text-gray-900 dark:text-white">
                              {gen.type === 'image' ? '🖼️' : '🎬'} {gen.model}
                            </p>
                            <p className="text-xs text-gray-600 dark:text-gray-400 mt-1 line-clamp-2">
                              {gen.prompt}
                            </p>
                            <div className="flex items-center gap-3 mt-2 text-xs text-gray-500 dark:text-gray-400">
                              <span>{new Date(gen.createdAt).toLocaleString()}</span>
                              <span>•</span>
                              <span>IP: {gen.ipAddress}</span>
                            </div>
                          </div>
                        </div>
                      </div>
                    ))
                  )}
                    </div>
                  </div>
            </>
          ) : (
            <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-12 text-center">
              <p className="text-gray-500 dark:text-gray-400">
                Select a user from the list to view details
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
