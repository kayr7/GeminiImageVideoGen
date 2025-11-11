'use client';

import { useEffect, useState } from 'react';
import { apiFetch } from '@/lib/utils/apiClient';

interface QuotaInfo {
  generationType: string;
  quotaType: string;
  quotaLimit: number | null;
  quotaUsed: number;
  quotaRemaining: number | null;
  quotaResetAt: string | null;
}

interface QuotaDisplayProps {
  generationType: 'image' | 'video' | 'edit';
  className?: string;
}

export default function QuotaDisplay({ generationType, className = '' }: QuotaDisplayProps) {
  const [quota, setQuota] = useState<QuotaInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchQuota = async () => {
      try {
        setLoading(true);
        setError(null);

        const response = await apiFetch('/api/auth/me');
        if (!response.ok) {
          throw new Error('Failed to fetch quota information');
        }

        const data = await response.json();
        if (data.success && data.data?.quotas) {
          const quotaData = data.data.quotas[generationType];
          if (quotaData) {
            setQuota(quotaData);
          }
        }
      } catch (err) {
        console.error('Failed to fetch quota:', err);
        setError(err instanceof Error ? err.message : 'Failed to load quota');
      } finally {
        setLoading(false);
      }
    };

    fetchQuota();
  }, [generationType]);

  if (loading) {
    return (
      <div className={`p-3 bg-gray-50 dark:bg-gray-800 rounded-lg animate-pulse ${className}`}>
        <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-1/2"></div>
      </div>
    );
  }

  if (error) {
    return (
      <div className={`p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg ${className}`}>
        <p className="text-xs text-red-700 dark:text-red-300">
          ⚠️ Unable to load quota information
        </p>
      </div>
    );
  }

  if (!quota) {
    return null;
  }

  // Unlimited quota
  if (quota.quotaType === 'unlimited' || quota.quotaLimit === null) {
    return (
      <div className={`p-3 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg ${className}`}>
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs font-medium text-green-900 dark:text-green-100">
              {generationType === 'image' ? '🖼️ Image' : generationType === 'video' ? '🎬 Video' : '✏️ Edit'} Quota
            </p>
            <p className="text-sm font-bold text-green-700 dark:text-green-300 mt-0.5">
              Unlimited
            </p>
          </div>
          <div className="text-2xl">♾️</div>
        </div>
      </div>
    );
  }

  // Calculate percentage
  const usedPercentage = quota.quotaLimit ? (quota.quotaUsed / quota.quotaLimit) * 100 : 0;
  const isLow = usedPercentage >= 80;
  const isCritical = usedPercentage >= 95;

  // Format reset time
  const formatResetTime = (resetAt: string | null) => {
    if (!resetAt) return null;
    
    try {
      const resetDate = new Date(resetAt);
      const now = new Date();
      const diffMs = resetDate.getTime() - now.getTime();
      const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
      const diffMinutes = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));

      if (diffHours < 0) return 'Resetting soon...';
      if (diffHours < 1) return `Resets in ${diffMinutes}m`;
      if (diffHours < 24) return `Resets in ${diffHours}h`;
      
      const diffDays = Math.floor(diffHours / 24);
      return `Resets in ${diffDays}d`;
    } catch {
      return null;
    }
  };

  const resetTimeStr = formatResetTime(quota.quotaResetAt);

  // Color scheme based on usage
  const colorScheme = isCritical
    ? {
        bg: 'bg-red-50 dark:bg-red-900/20',
        border: 'border-red-200 dark:border-red-800',
        text: 'text-red-900 dark:text-red-100',
        barBg: 'bg-red-200 dark:bg-red-900',
        barFill: 'bg-red-600 dark:bg-red-500',
        used: 'text-red-700 dark:text-red-300',
      }
    : isLow
    ? {
        bg: 'bg-yellow-50 dark:bg-yellow-900/20',
        border: 'border-yellow-200 dark:border-yellow-800',
        text: 'text-yellow-900 dark:text-yellow-100',
        barBg: 'bg-yellow-200 dark:bg-yellow-900',
        barFill: 'bg-yellow-600 dark:bg-yellow-500',
        used: 'text-yellow-700 dark:text-yellow-300',
      }
    : {
        bg: 'bg-blue-50 dark:bg-blue-900/20',
        border: 'border-blue-200 dark:border-blue-800',
        text: 'text-blue-900 dark:text-blue-100',
        barBg: 'bg-blue-200 dark:bg-blue-900',
        barFill: 'bg-blue-600 dark:bg-blue-500',
        used: 'text-blue-700 dark:text-blue-300',
      };

  const icon = generationType === 'image' ? '🖼️' : generationType === 'video' ? '🎬' : '✏️';
  const typeLabel = generationType === 'image' ? 'Image' : generationType === 'video' ? 'Video' : 'Edit';
  const quotaTypeLabel = quota.quotaType === 'daily' ? 'Daily' : quota.quotaType === 'weekly' ? 'Weekly' : '';

  return (
    <div className={`p-3 ${colorScheme.bg} border ${colorScheme.border} rounded-lg ${className}`}>
      <div className="space-y-2">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <p className={`text-xs font-medium ${colorScheme.text}`}>
              {icon} {typeLabel} Quota {quotaTypeLabel && `(${quotaTypeLabel})`}
            </p>
            <p className={`text-sm font-bold ${colorScheme.used} mt-0.5`}>
              {quota.quotaUsed} / {quota.quotaLimit} used
              {quota.quotaRemaining !== null && ` • ${quota.quotaRemaining} remaining`}
            </p>
          </div>
          {isCritical && <span className="text-xl">⚠️</span>}
          {isLow && !isCritical && <span className="text-xl">⏰</span>}
        </div>

        {/* Progress Bar */}
        <div className={`w-full h-2 ${colorScheme.barBg} rounded-full overflow-hidden`}>
          <div
            className={`h-full ${colorScheme.barFill} transition-all duration-300`}
            style={{ width: `${Math.min(usedPercentage, 100)}%` }}
          />
        </div>

        {/* Footer */}
        {resetTimeStr && (
          <p className={`text-xs ${colorScheme.used}`}>
            {resetTimeStr}
          </p>
        )}

        {/* Warning Message */}
        {isCritical && (
          <p className="text-xs text-red-700 dark:text-red-300 font-medium">
            ⚠️ Quota almost exhausted! Contact your admin if you need more.
          </p>
        )}
      </div>
    </div>
  );
}

