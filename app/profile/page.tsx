'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/context/AuthContext';
import { apiFetch } from '@/lib/utils/apiClient';
import Button from '@/components/ui/Button';
import Input from '@/components/ui/Input';

interface UserInfo {
  user: {
    username: string;
    displayName?: string;
    roles: string[];
  };
  quotas: Record<string, QuotaInfo>;
}

interface QuotaInfo {
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
}

export default function ProfilePage() {
  const router = useRouter();
  const { token, initialising } = useAuth();
  const [loading, setLoading] = useState(true);
  const [userInfo, setUserInfo] = useState<UserInfo | null>(null);
  const [generations, setGenerations] = useState<Generation[]>([]);
  const [error, setError] = useState<string | null>(null);

  // Password change state
  const [showPasswordChange, setShowPasswordChange] = useState(false);
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [passwordChangeLoading, setPasswordChangeLoading] = useState(false);
  const [passwordChangeError, setPasswordChangeError] = useState<string | null>(null);
  const [passwordChangeSuccess, setPasswordChangeSuccess] = useState(false);

  useEffect(() => {
    if (!initialising && !token) {
      router.push('/login?redirect=/profile');
      return;
    }

    if (!initialising && token) {
      loadProfileData();
    }
  }, [initialising, token, router]);

  const loadProfileData = async () => {
    try {
      setLoading(true);
      setError(null);

      // Load user info and quotas
      const response = await apiFetch('/api/auth/me');
      if (!response.ok) {
        throw new Error('Failed to load profile');
      }

      const data = await response.json();
      if (data.success && data.data) {
        setUserInfo(data.data);
      }

      // Load recent generations
      const genResponse = await apiFetch('/api/media/list?limit=10');
      if (genResponse.ok) {
        const genData = await genResponse.json();
        if (genData.success && genData.data?.media) {
          setGenerations(genData.data.media);
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load profile');
    } finally {
      setLoading(false);
    }
  };

  const validatePassword = (pwd: string): string | null => {
    if (pwd.length < 8) {
      return 'Password must be at least 8 characters long';
    }
    if (!/[A-Z]/.test(pwd)) {
      return 'Password must contain at least one uppercase letter';
    }
    if (!/[a-z]/.test(pwd)) {
      return 'Password must contain at least one lowercase letter';
    }
    if (!/[0-9]/.test(pwd)) {
      return 'Password must contain at least one number';
    }
    return null;
  };

  const handlePasswordChange = async () => {
    setPasswordChangeError(null);
    setPasswordChangeSuccess(false);

    // Validate new password
    const validationError = validatePassword(newPassword);
    if (validationError) {
      setPasswordChangeError(validationError);
      return;
    }

    if (newPassword !== confirmPassword) {
      setPasswordChangeError('New passwords do not match');
      return;
    }

    try {
      setPasswordChangeLoading(true);

      const response = await apiFetch('/api/auth/change-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          currentPassword,
          newPassword,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.detail || 'Failed to change password');
      }

      // Success
      setPasswordChangeSuccess(true);
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');

      setTimeout(() => {
        setShowPasswordChange(false);
        setPasswordChangeSuccess(false);
      }, 2000);
    } catch (err) {
      setPasswordChangeError(err instanceof Error ? err.message : 'Failed to change password');
    } finally {
      setPasswordChangeLoading(false);
    }
  };


  if (initialising || loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <div className="text-center">
          <div className="inline-block h-8 w-8 animate-spin rounded-full border-4 border-solid border-blue-600 border-r-transparent mb-4"></div>
          <p className="text-gray-600 dark:text-gray-300">Loading profile...</p>
        </div>
      </div>
    );
  }

  if (!userInfo) {
    return (
      <div className="max-w-2xl mx-auto">
        <div className="p-6 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg text-red-700 dark:text-red-300">
          {error || 'Failed to load profile'}
        </div>
      </div>
    );
  }

  const isAdmin = userInfo.user.roles?.includes('admin') ?? false;

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-gray-900 dark:text-white">Profile</h1>
        <p className="text-sm text-gray-600 dark:text-gray-300 mt-1">
          Manage your account settings and view your usage
        </p>
      </div>

      {/* User Info Card */}
      <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-6">
        <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-4">
          Account Information
        </h2>

        <div className="space-y-3">
          <div>
            <p className="text-sm text-gray-500 dark:text-gray-400">Email</p>
            <p className="text-base font-medium text-gray-900 dark:text-white">
              {userInfo.user.username}
            </p>
          </div>

          {userInfo.user.displayName && (
            <div>
              <p className="text-sm text-gray-500 dark:text-gray-400">Display Name</p>
              <p className="text-base font-medium text-gray-900 dark:text-white">
                {userInfo.user.displayName}
              </p>
            </div>
          )}

          <div>
            <p className="text-sm text-gray-500 dark:text-gray-400">Role</p>
            <div className="mt-1">
              {isAdmin ? (
                <span className="inline-block px-3 py-1 text-sm font-semibold text-blue-700 bg-blue-100 dark:text-blue-300 dark:bg-blue-900 rounded">
                  Administrator
                </span>
              ) : (
                <span className="inline-block px-3 py-1 text-sm font-semibold text-gray-700 bg-gray-100 dark:text-gray-300 dark:bg-gray-800 rounded">
                  User
                </span>
              )}
            </div>
          </div>
        </div>

        <div className="mt-6">
          {!showPasswordChange ? (
            <Button onClick={() => setShowPasswordChange(true)}>Change Password</Button>
          ) : (
            <div className="space-y-4 p-4 bg-gray-50 dark:bg-gray-800 rounded-lg">
              <h3 className="text-sm font-semibold text-gray-900 dark:text-white">
                Change Password
              </h3>

              <Input
                label="Current Password"
                type="password"
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                placeholder="Enter current password"
              />

              <Input
                label="New Password"
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder="Enter new password"
              />

              <div className="text-xs text-gray-600 dark:text-gray-400 space-y-1 -mt-2">
                <p>Password must contain:</p>
                <ul className="list-disc list-inside space-y-0.5 ml-2">
                  <li className={newPassword.length >= 8 ? 'text-green-600' : ''}>
                    At least 8 characters
                  </li>
                  <li className={/[A-Z]/.test(newPassword) ? 'text-green-600' : ''}>
                    One uppercase letter
                  </li>
                  <li className={/[a-z]/.test(newPassword) ? 'text-green-600' : ''}>
                    One lowercase letter
                  </li>
                  <li className={/[0-9]/.test(newPassword) ? 'text-green-600' : ''}>One number</li>
                </ul>
              </div>

              <Input
                label="Confirm New Password"
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="Confirm new password"
              />

              {passwordChangeError && (
                <div className="p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded text-sm text-red-700 dark:text-red-300">
                  {passwordChangeError}
                </div>
              )}

              {passwordChangeSuccess && (
                <div className="p-3 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded text-sm text-green-700 dark:text-green-300">
                  ✓ Password changed successfully!
                </div>
              )}

              <div className="flex gap-2">
                <Button
                  onClick={handlePasswordChange}
                  isLoading={passwordChangeLoading}
                  disabled={passwordChangeLoading}
                >
                  Save New Password
                </Button>
                <Button
                  onClick={() => {
                    setShowPasswordChange(false);
                    setCurrentPassword('');
                    setNewPassword('');
                    setConfirmPassword('');
                    setPasswordChangeError(null);
                  }}
                  className="bg-gray-500 hover:bg-gray-600"
                >
                  Cancel
                </Button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Quotas Card */}
      <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-6">
        <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-4">
          Generation Quotas
        </h2>

        <div className="grid md:grid-cols-3 gap-4">
          {Object.entries(userInfo.quotas).map(([type, quota]) => {
            const usedPercentage = quota.quotaLimit
              ? (quota.quotaUsed / quota.quotaLimit) * 100
              : 0;
            const isLow = usedPercentage >= 80;
            const isCritical = usedPercentage >= 95;

            const colorScheme = isCritical
              ? 'bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800 text-red-900 dark:text-red-100'
              : isLow
              ? 'bg-yellow-50 dark:bg-yellow-900/20 border-yellow-200 dark:border-yellow-800 text-yellow-900 dark:text-yellow-100'
              : 'bg-blue-50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-800 text-blue-900 dark:text-blue-100';

            return (
              <div key={type} className={`p-4 border rounded-lg ${colorScheme}`}>
                <p className="text-sm font-semibold capitalize mb-2">{type}</p>

                {quota.quotaType === 'unlimited' || quota.quotaLimit === null ? (
                  <p className="text-2xl font-bold">∞</p>
                ) : (
                  <>
                    <p className="text-2xl font-bold">
                      {quota.quotaUsed} / {quota.quotaLimit}
                    </p>
                    <div className="w-full h-2 bg-gray-200 dark:bg-gray-700 rounded-full mt-2 overflow-hidden">
                      <div
                        className={`h-full transition-all ${
                          isCritical
                            ? 'bg-red-600'
                            : isLow
                            ? 'bg-yellow-600'
                            : 'bg-blue-600'
                        }`}
                        style={{ width: `${Math.min(usedPercentage, 100)}%` }}
                      />
                    </div>
                  </>
                )}
              </div>
            );
          })}
        </div>

        <div className="mt-4 p-3 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded">
          <p className="text-xs text-blue-900 dark:text-blue-100">
            💡 <span className="font-semibold">Need more quota?</span> Contact your administrator
            to request an increase.
          </p>
        </div>
      </div>

      {/* Recent Generations */}
      <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-6">
        <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-4">
          Recent Generations
        </h2>

        <div className="space-y-3">
          {generations.length === 0 ? (
            <p className="text-sm text-gray-500 dark:text-gray-400 py-8 text-center">
              No generations yet. Start creating!
            </p>
          ) : (
            generations.map((gen) => (
              <div key={gen.id} className="p-4 bg-gray-50 dark:bg-gray-800 rounded-lg">
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <span className="text-lg">
                        {gen.type === 'image' ? '🖼️' : '🎬'}
                      </span>
                      <p className="text-sm font-medium text-gray-900 dark:text-white">
                        {gen.model}
                      </p>
                      <span className="text-xs text-gray-500 dark:text-gray-400">
                        {new Date(gen.createdAt).toLocaleString()}
                      </span>
                    </div>
                    <p className="text-sm text-gray-600 dark:text-gray-400 mt-2 line-clamp-2">
                      {gen.prompt}
                    </p>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}

