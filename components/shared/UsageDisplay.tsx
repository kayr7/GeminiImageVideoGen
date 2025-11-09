'use client';

import { useEffect, useState } from 'react';

// Use relative URL that goes through nginx proxy
const API_URL = process.env.NEXT_PUBLIC_API_URL || '/HdMImageVideo';

interface BackendUsageResponse {
  success: boolean;
  data: {
    status: string;
    apiKeyConfigured: boolean;
    quotaRemaining: string;
    rateLimit: {
      image: string;
      video: string;
      music: string;
    };
  };
}

export default function UsageDisplay() {
  const [usage, setUsage] = useState<BackendUsageResponse | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchUsage();
    // Refresh usage every 30 seconds
    const interval = setInterval(fetchUsage, 30000);
    return () => clearInterval(interval);
  }, []);

  const fetchUsage = async () => {
    try {
      const response = await fetch(`${API_URL}/api/usage/status`);
      if (response.ok) {
        const data = await response.json();
        setUsage(data);
      }
    } catch (error) {
      console.error('Failed to fetch usage:', error);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center space-x-2 text-sm text-gray-500">
        <div className="animate-spin h-4 w-4 border-2 border-gray-300 border-t-blue-600 rounded-full" />
        <span>Loading status...</span>
      </div>
    );
  }

  if (!usage || !usage.success || !usage.data) return null;

  const { data } = usage;

  return (
    <div className="flex items-center space-x-4 text-sm">
      <div className="flex items-center space-x-2">
        <span className="text-gray-600 dark:text-gray-400">Status:</span>
        <span className={data.apiKeyConfigured ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}>
          {data.apiKeyConfigured ? '✓ Connected' : '✗ No API Key'}
        </span>
        <span className="text-gray-400">•</span>
        <span className="text-gray-600 dark:text-gray-400">Limits:</span>
        <span className="text-gray-700 dark:text-gray-300">
          {data.rateLimit.image} images
        </span>
        <span className="text-gray-400">•</span>
        <span className="text-gray-700 dark:text-gray-300">
          {data.rateLimit.video} videos
        </span>
      </div>
    </div>
  );
}
