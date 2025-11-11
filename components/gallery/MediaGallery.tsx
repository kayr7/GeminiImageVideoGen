'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';

import LoadingSpinner from '@/components/shared/LoadingSpinner';
import { useAuth } from '@/lib/context/AuthContext';

const API_URL = process.env.NEXT_PUBLIC_API_URL || '/HdMImageVideo';

const normaliseBaseUrl = (base: string): string => {
  if (!base) {
    return '';
  }
  return base.endsWith('/') ? base.slice(0, -1) : base;
};

const API_BASE = normaliseBaseUrl(API_URL);

interface MediaDetails {
  mode?: string;
  negativePrompt?: string | null;
  firstFrame?: string | null;
  lastFrame?: string | null;
  referenceImages?: string[] | null;
  sourceImages?: string[] | null;
}

interface MediaItem {
  id: string;
  type: 'image' | 'video';
  prompt: string;
  model: string;
  createdAt: string;
  fileSize: number;
  mimeType: string;
  url: string;
  details?: MediaDetails | null;
}

interface MediaListResponse {
  success: boolean;
  data?: {
    media?: Array<Record<string, unknown>>;
    total?: number;
  };
  error?: { message?: string };
}

const formatDate = (value: string): string => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }
  return date.toLocaleString();
};

const resolveMediaUrl = (rawUrl: string): string => {
  if (!rawUrl) {
    return '';
  }
  if (/^https?:/i.test(rawUrl)) {
    return rawUrl;
  }
  const prefixed = rawUrl.startsWith('/') ? rawUrl : `/${rawUrl}`;
  return `${API_BASE}${prefixed}`;
};

const extractStringArray = (value: unknown): string[] => {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.filter((item): item is string => typeof item === 'string' && item.trim().length > 0);
};

const isNonEmptyString = (value: unknown): value is string => typeof value === 'string' && value.trim().length > 0;

export default function MediaGallery() {
  const { token, user } = useAuth();
  const [mediaItems, setMediaItems] = useState<MediaItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const isAdmin = useMemo(() => user?.roles?.includes('admin') ?? false, [user?.roles]);

  const loadMedia = useCallback(async () => {
    setLoading(true);
    setError(null);
    setActionError(null);

    try {
      const response = await fetch(`${API_BASE}/api/media/list?limit=200`);
      const payload = (await response.json()) as MediaListResponse;

      if (!response.ok || !payload.success || !payload.data?.media) {
        const message = payload.error?.message || 'Failed to load media history';
        throw new Error(message);
      }

      const parsed = payload.data.media.reduce<MediaItem[]>((acc, item) => {
          const id = typeof item.id === 'string' ? item.id : '';
          if (!id) {
            return acc;
          }

          const createdAtRaw = typeof item.createdAt === 'string' ? item.createdAt : String(item.createdAt ?? '');
          const createdAt = createdAtRaw ? new Date(createdAtRaw).toISOString() : new Date().toISOString();

          const detailsRaw = (item.details ?? null) as Record<string, unknown> | null;
          const details: MediaDetails | null = detailsRaw
            ? {
                mode: isNonEmptyString(detailsRaw.mode) ? detailsRaw.mode : undefined,
                negativePrompt: isNonEmptyString(detailsRaw.negativePrompt) ? detailsRaw.negativePrompt : null,
                firstFrame: isNonEmptyString(detailsRaw.firstFrame) ? detailsRaw.firstFrame : null,
                lastFrame: isNonEmptyString(detailsRaw.lastFrame) ? detailsRaw.lastFrame : null,
                referenceImages: extractStringArray(detailsRaw.referenceImages),
                sourceImages: extractStringArray(detailsRaw.sourceImages),
              }
            : null;

          acc.push({
            id,
            type: item.type === 'video' ? 'video' : 'image',
            prompt: isNonEmptyString(item.prompt) ? item.prompt : 'Untitled generation',
            model: isNonEmptyString(item.model) ? item.model : 'Unknown model',
            createdAt,
            fileSize: typeof item.fileSize === 'number' ? item.fileSize : 0,
            mimeType: isNonEmptyString(item.mimeType) ? item.mimeType : '',
            url: resolveMediaUrl(isNonEmptyString(item.url) ? item.url : `/api/media/${id}`),
            details,
          });

          return acc;
        }, [])
        .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

      setMediaItems(parsed);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to load gallery');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadMedia();
  }, [loadMedia]);

  const handleDelete = useCallback(
    async (id: string) => {
      if (!isAdmin || !token) {
        return;
      }

      const confirmed = typeof window !== 'undefined' ? window.confirm('Delete this media item? This cannot be undone.') : true;
      if (!confirmed) {
        return;
      }

      try {
        setActionError(null);
        const response = await fetch(`${API_BASE}/api/media/${id}`, {
          method: 'DELETE',
          headers: {
            Authorization: `Bearer ${token}`,
          },
        });

        const payload = (await response.json()) as MediaListResponse;
        if (!response.ok || !payload.success) {
          const message = payload.error?.message || 'Failed to delete media item';
          throw new Error(message);
        }

        setMediaItems((items) => items.filter((item) => item.id !== id));
      } catch (err) {
        setActionError(err instanceof Error ? err.message : 'Unable to delete media item');
      }
    },
    [isAdmin, token]
  );

  if (loading) {
    return <LoadingSpinner message="Loading your gallery..." />;
  }

  return (
    <div className="space-y-6">
      <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-700 p-6 shadow-sm">
        <h1 className="text-3xl font-bold mb-2 text-gray-900 dark:text-white">Media Gallery</h1>
        <p className="text-sm text-gray-600 dark:text-gray-300">
          Browse every image and video generated in this workspace. Each entry includes the original prompt, model selection, and
          any reference images that were supplied during generation.
        </p>
      </div>

      {error && (
        <div className="border border-red-200 bg-red-50 text-red-700 rounded-lg p-4 text-sm">{error}</div>
      )}

      {actionError && (
        <div className="border border-yellow-200 bg-yellow-50 text-yellow-800 rounded-lg p-4 text-sm">{actionError}</div>
      )}

      {mediaItems.length === 0 && !error ? (
        <div className="border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 rounded-xl p-8 text-center text-gray-600 dark:text-gray-300">
          No media has been generated yet. Create an image or video to see it appear here automatically.
        </div>
      ) : (
        <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-3">
          {mediaItems.map((item) => {
            const referenceImages = item.details?.referenceImages ?? [];
            const sourceImages = item.details?.sourceImages ?? [];
            const firstFrame = item.details?.firstFrame;
            const lastFrame = item.details?.lastFrame;

            return (
              <article
                key={item.id}
                className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl overflow-hidden shadow-sm flex flex-col"
              >
                <div className="relative bg-gray-50 dark:bg-gray-800">
                  {item.type === 'image' ? (
                    <img src={item.url} alt={item.prompt} className="w-full object-contain max-h-72 bg-black" loading="lazy" />
                  ) : (
                    <video
                      controls
                      preload="metadata"
                      className="w-full max-h-72 bg-black"
                      src={item.url}
                    />
                  )}
                  <span className="absolute top-3 left-3 inline-flex items-center rounded-full bg-blue-600/90 text-white text-xs font-semibold px-3 py-1 uppercase tracking-wide">
                    {item.type}
                  </span>
                </div>

                <div className="flex-1 p-5 space-y-4">
                  <div>
                    <h2 className="text-lg font-semibold text-gray-900 dark:text-white break-words">{item.prompt}</h2>
                    <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">Generated {formatDate(item.createdAt)}</p>
                  </div>

                  <div className="text-sm text-gray-700 dark:text-gray-300 space-y-1">
                    <p>
                      <span className="font-medium">Model:</span> {item.model}
                    </p>
                    {item.details?.mode && (
                      <p>
                        <span className="font-medium">Mode:</span> {item.details.mode}
                      </p>
                    )}
                    {isNonEmptyString(item.details?.negativePrompt) && (
                      <p>
                        <span className="font-medium">Negative prompt:</span> {item.details?.negativePrompt}
                      </p>
                    )}
                  </div>

                  {(referenceImages.length > 0 || sourceImages.length > 0 || firstFrame || lastFrame) && (
                    <div className="space-y-3">
                      <h3 className="text-sm font-semibold text-gray-900 dark:text-white">Reference imagery</h3>
                      <div className="flex flex-wrap gap-3">
                        {firstFrame && (
                          <div className="w-20 h-20 rounded-lg overflow-hidden border border-gray-200 dark:border-gray-700">
                            <img src={firstFrame} alt="First frame" className="w-full h-full object-cover" loading="lazy" />
                            <p className="text-[10px] text-center text-gray-500 dark:text-gray-400 mt-1">First</p>
                          </div>
                        )}
                        {lastFrame && (
                          <div className="w-20 h-20 rounded-lg overflow-hidden border border-gray-200 dark:border-gray-700">
                            <img src={lastFrame} alt="Last frame" className="w-full h-full object-cover" loading="lazy" />
                            <p className="text-[10px] text-center text-gray-500 dark:text-gray-400 mt-1">Last</p>
                          </div>
                        )}
                        {referenceImages.map((src, index) => (
                          <div
                            key={`reference-${item.id}-${index}`}
                            className="w-20 h-20 rounded-lg overflow-hidden border border-gray-200 dark:border-gray-700"
                          >
                            <img src={src} alt={`Reference ${index + 1}`} className="w-full h-full object-cover" loading="lazy" />
                            <p className="text-[10px] text-center text-gray-500 dark:text-gray-400 mt-1">Ref {index + 1}</p>
                          </div>
                        ))}
                        {sourceImages.map((src, index) => (
                          <div
                            key={`source-${item.id}-${index}`}
                            className="w-20 h-20 rounded-lg overflow-hidden border border-gray-200 dark:border-gray-700"
                          >
                            <img src={src} alt={`Source ${index + 1}`} className="w-full h-full object-cover" loading="lazy" />
                            <p className="text-[10px] text-center text-gray-500 dark:text-gray-400 mt-1">Source {index + 1}</p>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>

                {isAdmin && (
                  <div className="border-t border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 px-5 py-3 flex justify-end">
                    <button
                      type="button"
                      onClick={() => {
                        void handleDelete(item.id);
                      }}
                      className="text-sm font-medium text-red-600 hover:text-red-500"
                    >
                      Delete
                    </button>
                  </div>
                )}
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
}
