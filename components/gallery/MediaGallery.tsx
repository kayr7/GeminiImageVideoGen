'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';

import LoadingSpinner from '@/components/shared/LoadingSpinner';
import { useAuth } from '@/lib/context/AuthContext';
import { apiFetch, resolveApiUrl } from '@/lib/utils/apiClient';

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
  ipAddress?: string | null;
  userEmail?: string | null;
  userId?: string | null;
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

const URL_SCHEME_PATTERN = /^[a-z][a-z0-9+.-]*:/i;

const resolveMediaUrl = (rawUrl: string): string => {
  if (!rawUrl) {
    return '';
  }
  if (URL_SCHEME_PATTERN.test(rawUrl)) {
    return rawUrl;
  }
  const prefixed = rawUrl.startsWith('/') ? rawUrl : `/${rawUrl}`;
  return resolveApiUrl(prefixed);
};

const extractStringArray = (value: unknown): string[] => {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.filter((item): item is string => typeof item === 'string' && item.trim().length > 0);
};

const isNonEmptyString = (value: unknown): value is string => typeof value === 'string' && value.trim().length > 0;

const PROMPT_TRUNCATE_LENGTH = 100;

const TruncatedPrompt = ({ prompt }: { prompt: string }) => {
  const [isExpanded, setIsExpanded] = useState(false);
  const shouldTruncate = prompt.length > PROMPT_TRUNCATE_LENGTH;
  
  if (!shouldTruncate) {
    return <h2 className="text-lg font-semibold text-gray-900 dark:text-white break-words">{prompt}</h2>;
  }
  
  return (
    <div>
      <h2 className="text-lg font-semibold text-gray-900 dark:text-white break-words">
        {isExpanded ? prompt : `${prompt.slice(0, PROMPT_TRUNCATE_LENGTH)}...`}
      </h2>
      <button
        type="button"
        onClick={() => setIsExpanded(!isExpanded)}
        className="text-xs text-blue-600 hover:text-blue-800 dark:text-blue-400 dark:hover:text-blue-300 font-medium mt-1"
      >
        {isExpanded ? '▲ Show less' : '▼ Show more'}
      </button>
    </div>
  );
};

export default function MediaGallery() {
  const { token, user } = useAuth();
  const [mediaItems, setMediaItems] = useState<MediaItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [blobUrls, setBlobUrls] = useState<Record<string, string>>({});
  const [thumbnailUrls, setThumbnailUrls] = useState<Record<string, string>>({});
  const [loadingFullSize, setLoadingFullSize] = useState<Record<string, boolean>>({});
  const [displayCount, setDisplayCount] = useState(30); // Start with 30 items
  const [loadingMore, setLoadingMore] = useState(false);

  const isAdmin = useMemo(() => user?.roles?.includes('admin') ?? false, [user?.roles]);
  const displayedItems = useMemo(() => mediaItems.slice(0, displayCount), [mediaItems, displayCount]);

  // Create blob URLs for media with authentication
  const createBlobUrl = useCallback(async (mediaId: string): Promise<string | null> => {
    try {
      const response = await apiFetch(`/api/media/${mediaId}`);
      if (!response.ok) {
        console.error(`Failed to fetch media ${mediaId}:`, response.status);
        return null;
      }
      const blob = await response.blob();
      const blobUrl = URL.createObjectURL(blob);
      return blobUrl;
    } catch (err) {
      console.error(`Error creating blob URL for ${mediaId}:`, err);
      return null;
    }
  }, []);

  // Create thumbnail blob URLs for media with authentication
  const createThumbnailUrl = useCallback(async (mediaId: string): Promise<string | null> => {
    try {
      const response = await apiFetch(`/api/media/${mediaId}/thumbnail`);
      if (!response.ok) {
        console.error(`Failed to fetch thumbnail ${mediaId}:`, response.status);
        return null;
      }
      const blob = await response.blob();
      const blobUrl = URL.createObjectURL(blob);
      return blobUrl;
    } catch (err) {
      console.error(`Error creating thumbnail URL for ${mediaId}:`, err);
      return null;
    }
  }, []);

  // Clean up blob URLs on unmount
  useEffect(() => {
    return () => {
      Object.values(blobUrls).forEach((url) => URL.revokeObjectURL(url));
      Object.values(thumbnailUrls).forEach((url) => URL.revokeObjectURL(url));
    };
  }, [blobUrls, thumbnailUrls]);

  // Load full-size media on-demand when user clicks
  const loadFullSizeMedia = useCallback(async (mediaId: string) => {
    // If already loaded, return it
    if (blobUrls[mediaId]) {
      return blobUrls[mediaId];
    }

    // If currently loading, don't start another request
    if (loadingFullSize[mediaId]) {
      return null;
    }

    // Mark as loading
    setLoadingFullSize(prev => ({ ...prev, [mediaId]: true }));

    try {
      const blobUrl = await createBlobUrl(mediaId);
      if (blobUrl) {
        setBlobUrls(prev => ({ ...prev, [mediaId]: blobUrl }));
        return blobUrl;
      }
    } finally {
      setLoadingFullSize(prev => ({ ...prev, [mediaId]: false }));
    }

    return null;
  }, [blobUrls, loadingFullSize, createBlobUrl]);

  // Load more thumbnails when user clicks "Load More"
  const loadMoreThumbnails = useCallback(async () => {
    if (loadingMore) return;
    
    setLoadingMore(true);
    try {
      const currentCount = displayCount;
      const newCount = Math.min(currentCount + 30, mediaItems.length);
      const itemsToLoad = mediaItems.slice(currentCount, newCount);

      const newThumbnailUrls: Record<string, string> = {};
      
      await Promise.all(
        itemsToLoad.map(async (item) => {
          // Skip if already loaded
          if (thumbnailUrls[item.id]) {
            return;
          }
          
          const thumbnailUrl = await createThumbnailUrl(item.id);
          if (thumbnailUrl) {
            newThumbnailUrls[item.id] = thumbnailUrl;
          }
        })
      );
      
      setThumbnailUrls(prev => ({ ...prev, ...newThumbnailUrls }));
      setDisplayCount(newCount);
    } finally {
      setLoadingMore(false);
    }
  }, [displayCount, mediaItems, thumbnailUrls, createThumbnailUrl, loadingMore]);

  const loadMedia = useCallback(async () => {
    setLoading(true);
    setError(null);
    setActionError(null);

    try {
      const response = await apiFetch('/api/media/list?limit=200');
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
            ipAddress: isNonEmptyString(item.ipAddress) ? item.ipAddress : null,
            userEmail: isNonEmptyString(item.userEmail) ? item.userEmail : null,
            userId: isNonEmptyString(item.userId) ? item.userId : null,
          });

          return acc;
        }, [])
        .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

      setMediaItems(parsed);

      // Only create thumbnail URLs for the first batch (much faster!)
      // Full-size media will be loaded on-demand when user clicks
      // Additional thumbnails loaded as user scrolls
      const initialBatch = parsed.slice(0, 30);
      const newThumbnailUrls: Record<string, string> = {};
      
      await Promise.all(
        initialBatch.map(async (item) => {
          const thumbnailUrl = await createThumbnailUrl(item.id);
          if (thumbnailUrl) {
            newThumbnailUrls[item.id] = thumbnailUrl;
          }
        })
      );
      
      setThumbnailUrls(newThumbnailUrls);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to load gallery');
    } finally {
      setLoading(false);
    }
  }, [createBlobUrl, createThumbnailUrl]);

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
      const response = await apiFetch(`/api/media/${id}`, {
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
        <div className="mt-3 p-3 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg">
          <p className="text-xs text-blue-700 dark:text-blue-300">
            <span className="font-semibold">Privacy Notice:</span> IP addresses are logged for abuse prevention only and are visible to administrators. This data helps identify and prevent misuse of the service.
          </p>
        </div>
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
        <>
          <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-3">
            {displayedItems.map((item) => {
            const referenceImages = item.details?.referenceImages ?? [];
            const sourceImages = item.details?.sourceImages ?? [];
            const firstFrame = item.details?.firstFrame;
            const lastFrame = item.details?.lastFrame;

            return (
              <article
                key={item.id}
                className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl overflow-hidden shadow-sm flex flex-col"
              >
                <div className="relative bg-gray-50 dark:bg-gray-800 cursor-pointer group" onClick={async () => {
                  // Load full-size media on-demand
                  const fullUrl = await loadFullSizeMedia(item.id);
                  window.open(fullUrl || item.url, '_blank');
                }}>
                  {item.type === 'image' ? (
                    <div className="relative">
                      <img 
                        src={thumbnailUrls[item.id] || blobUrls[item.id] || item.url} 
                        alt={item.prompt} 
                        className="w-full object-contain max-h-72 bg-black" 
                        loading="lazy" 
                      />
                      <div className="absolute inset-0 bg-black/0 group-hover:bg-black/10 transition-colors flex items-center justify-center">
                        <span className="opacity-0 group-hover:opacity-100 transition-opacity bg-white dark:bg-gray-800 text-gray-900 dark:text-white px-4 py-2 rounded-lg shadow-lg text-sm font-medium">
                          Click to view full size
                        </span>
                      </div>
                    </div>
                  ) : (
                    <div className="relative">
                      <video
                        preload="metadata"
                        className="w-full max-h-72 bg-black pointer-events-none"
                        src={thumbnailUrls[item.id] || blobUrls[item.id] || item.url}
                        muted
                      />
                      <div className="absolute inset-0 bg-black/0 group-hover:bg-black/10 transition-colors flex items-center justify-center">
                        <span className="opacity-0 group-hover:opacity-100 transition-opacity bg-white dark:bg-gray-800 text-gray-900 dark:text-white px-4 py-2 rounded-lg shadow-lg text-sm font-medium">
                          Click to view full video
                        </span>
                      </div>
                    </div>
                  )}
                  <span className="absolute top-3 left-3 inline-flex items-center rounded-full bg-blue-600/90 text-white text-xs font-semibold px-3 py-1 uppercase tracking-wide">
                    {item.type}
                  </span>
                </div>

                <div className="flex-1 p-5 space-y-4">
                  <div>
                    <TruncatedPrompt prompt={item.prompt} />
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
                      <div className="text-sm">
                        <span className="font-medium">Negative prompt:</span>{' '}
                        {item.details.negativePrompt.length > 80 ? (
                          <>
                            {item.details.negativePrompt.slice(0, 80)}...
                            <span className="text-xs text-gray-500 dark:text-gray-400"> (truncated)</span>
                          </>
                        ) : (
                          item.details.negativePrompt
                        )}
                      </div>
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
                  <div className="border-t border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 px-5 py-3">
                    <div className="flex items-center justify-between gap-4">
                      <div className="text-xs text-gray-600 dark:text-gray-400 space-y-1">
                        {item.userEmail && (
                          <div>
                            <span className="font-medium">User:</span> {item.userEmail}
                          </div>
                        )}
                        {item.ipAddress ? (
                          <div>
                            <span className="font-medium">IP:</span> {item.ipAddress}
                          </div>
                        ) : (
                          <div className="text-gray-400 dark:text-gray-500">No IP recorded</div>
                        )}
                      </div>
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
                  </div>
                )}
              </article>
            );
          })}
        </div>

        {displayCount < mediaItems.length && (
          <div className="flex flex-col items-center gap-3 py-8">
            <div className="text-sm text-gray-600 dark:text-gray-400">
              Showing {displayCount} of {mediaItems.length} items
            </div>
            <button
              type="button"
              onClick={() => void loadMoreThumbnails()}
              disabled={loadingMore}
              className="bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed text-white font-medium px-8 py-3 rounded-lg shadow-sm transition-colors"
            >
              {loadingMore ? 'Loading...' : `Load More (${mediaItems.length - displayCount} remaining)`}
            </button>
          </div>
        )}
      </>
      )}
    </div>
  );
}
