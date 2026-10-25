'use client';

import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { useAuth } from '@/lib/context/AuthContext';
import { apiFetch, resolveApiUrl } from '@/lib/utils/apiClient';
import { formatDateTime } from '@/lib/utils/files';

type MediaType = 'image' | 'video' | 'audio';
type TypeFilter = 'all' | MediaType;

interface MediaDetails {
  mode: string | null;
  negativePrompt: string | null;
  firstFrame: string | null;
  lastFrame: string | null;
  referenceImages: string[];
  sourceImages: string[];
}

interface MediaItem {
  id: string;
  type: MediaType;
  prompt: string;
  model: string;
  createdAt: string;
  fileSize: number;
  mimeType: string;
  url: string;
  thumbnailUrl: string;
  details: MediaDetails;
  ipAddress: string | null;
  userEmail: string | null;
  userId: string | null;
}

interface MediaListResponse {
  success: boolean;
  data?: { media?: Array<Record<string, unknown>>; total?: number; pages?: number };
  error?: { message?: string };
}

const PAGE_SIZE = 24;
const PROMPT_TRUNCATE_LENGTH = 100;

const FILTERS: Array<{ value: TypeFilter; label: string }> = [
  { value: 'all', label: 'All' },
  { value: 'image', label: 'Images' },
  { value: 'video', label: 'Videos' },
  { value: 'audio', label: 'Audio' },
];

const isNonEmptyString = (value: unknown): value is string => typeof value === 'string' && value.trim().length > 0;

const toUrl = (value: unknown): string => (isNonEmptyString(value) ? resolveApiUrl(value) : '');

const toUrlArray = (value: unknown): string[] =>
  Array.isArray(value) ? value.filter(isNonEmptyString).map((v) => resolveApiUrl(v)) : [];

const parseItem = (raw: Record<string, unknown>): MediaItem | null => {
  if (!isNonEmptyString(raw.id)) {
    return null;
  }
  const id = raw.id;
  const d = (raw.details ?? {}) as Record<string, unknown>;
  const type: MediaType = raw.type === 'video' || raw.type === 'audio' ? raw.type : 'image';
  return {
    id,
    type,
    prompt: isNonEmptyString(raw.prompt) ? raw.prompt : 'Untitled generation',
    model: isNonEmptyString(raw.model) ? raw.model : 'Unknown model',
    createdAt: typeof raw.createdAt === 'string' ? raw.createdAt : '',
    fileSize: typeof raw.fileSize === 'number' ? raw.fileSize : 0,
    mimeType: isNonEmptyString(raw.mimeType) ? raw.mimeType : '',
    url: toUrl(raw.url) || resolveApiUrl(`/api/media/${id}`),
    thumbnailUrl: toUrl(raw.thumbnailUrl),
    details: {
      mode: isNonEmptyString(d.mode) ? d.mode : null,
      negativePrompt: isNonEmptyString(d.negativePrompt) ? d.negativePrompt : null,
      firstFrame: toUrl(d.firstFrame) || null,
      lastFrame: toUrl(d.lastFrame) || null,
      referenceImages: toUrlArray(d.referenceImages),
      sourceImages: toUrlArray(d.sourceImages),
    },
    ipAddress: isNonEmptyString(raw.ipAddress) ? raw.ipAddress : null,
    userEmail: isNonEmptyString(raw.userEmail) ? raw.userEmail : null,
    userId: isNonEmptyString(raw.userId) ? raw.userId : null,
  };
};

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

/** Lazy image with skeleton until loaded and a fallback on error. */
const LazyImage = ({ src, alt, className }: { src: string; alt: string; className: string }) => {
  const [status, setStatus] = useState<'loading' | 'loaded' | 'error'>(src ? 'loading' : 'error');

  if (status === 'error') {
    return (
      <div className={`${className} flex items-center justify-center text-2xl text-gray-400`} role="img" aria-label={alt}>
        🖼️
      </div>
    );
  }

  return (
    <>
      {status === 'loading' && <div className="absolute inset-0 animate-pulse bg-gray-200 dark:bg-gray-700" aria-hidden="true" />}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={src}
        alt={alt}
        loading="lazy"
        decoding="async"
        onLoad={() => setStatus('loaded')}
        onError={() => setStatus('error')}
        className={`${className} ${status === 'loaded' ? 'opacity-100' : 'opacity-0'} transition-opacity`}
      />
    </>
  );
};

const RefThumb = ({ src, label, alt }: { src: string; label: string; alt: string }) => (
  <div className="w-20">
    <div className="relative w-20 h-20 rounded-lg overflow-hidden border border-gray-200 dark:border-gray-700 bg-gray-100 dark:bg-gray-800">
      <LazyImage src={src} alt={alt} className="absolute inset-0 w-full h-full object-cover" />
    </div>
    <p className="text-[10px] text-center text-gray-500 dark:text-gray-400 mt-1">{label}</p>
  </div>
);

interface CardProps {
  item: MediaItem;
  isAdmin: boolean;
  onOpen: (item: MediaItem) => void;
  onDelete: (id: string) => void;
}

const MediaCard = memo(function MediaCard({ item, isAdmin, onOpen, onDelete }: CardProps) {
  const { details } = item;
  const hasRefs =
    details.referenceImages.length > 0 || details.sourceImages.length > 0 || details.firstFrame || details.lastFrame;

  return (
    <article className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl overflow-hidden shadow-sm flex flex-col">
      <div className="relative aspect-[4/3] bg-gray-100 dark:bg-gray-800">
        {item.type === 'audio' ? (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 p-4">
            <span className="text-4xl" aria-hidden="true">🎵</span>
            <audio controls preload="none" src={item.url} className="w-full" />
          </div>
        ) : (
          <button
            type="button"
            onClick={() => onOpen(item)}
            className="absolute inset-0 w-full h-full group cursor-pointer"
            aria-label={`Open ${item.type}: ${item.prompt}`}
          >
            <LazyImage src={item.thumbnailUrl} alt={item.prompt} className="absolute inset-0 w-full h-full object-contain bg-black" />
            {item.type === 'video' && (
              <span className="absolute inset-0 flex items-center justify-center pointer-events-none">
                <span className="w-14 h-14 rounded-full bg-black/60 text-white text-2xl flex items-center justify-center">▶</span>
              </span>
            )}
            <span className="absolute inset-0 bg-black/0 group-hover:bg-black/10 transition-colors" />
          </button>
        )}
        <span className="absolute top-3 left-3 inline-flex items-center rounded-full bg-blue-600/90 text-white text-xs font-semibold px-3 py-1 uppercase tracking-wide pointer-events-none">
          {item.type}
        </span>
      </div>

      <div className="flex-1 p-5 space-y-4">
        <div>
          <TruncatedPrompt prompt={item.prompt} />
          {item.createdAt && (
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">Generated {formatDateTime(item.createdAt)}</p>
          )}
        </div>

        <div className="text-sm text-gray-700 dark:text-gray-300 space-y-1">
          <p>
            <span className="font-medium">Model:</span> {item.model}
          </p>
          {details.mode && (
            <p>
              <span className="font-medium">Mode:</span> {details.mode}
            </p>
          )}
          {details.negativePrompt && (
            <div className="text-sm">
              <span className="font-medium">Negative prompt:</span>{' '}
              {details.negativePrompt.length > 80 ? (
                <>
                  {details.negativePrompt.slice(0, 80)}...
                  <span className="text-xs text-gray-500 dark:text-gray-400"> (truncated)</span>
                </>
              ) : (
                details.negativePrompt
              )}
            </div>
          )}
        </div>

        {hasRefs && (
          <div className="space-y-3">
            <h3 className="text-sm font-semibold text-gray-900 dark:text-white">Reference imagery</h3>
            <div className="flex flex-wrap gap-3">
              {details.firstFrame && <RefThumb src={details.firstFrame} alt="First frame" label="First" />}
              {details.lastFrame && <RefThumb src={details.lastFrame} alt="Last frame" label="Last" />}
              {details.referenceImages.map((src, i) => (
                <RefThumb key={`ref-${i}`} src={src} alt={`Reference ${i + 1}`} label={`Ref ${i + 1}`} />
              ))}
              {details.sourceImages.map((src, i) => (
                <RefThumb key={`src-${i}`} src={src} alt={`Source ${i + 1}`} label={`Source ${i + 1}`} />
              ))}
            </div>
          </div>
        )}
      </div>

      {isAdmin && (
        <div className="border-t border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 px-5 py-3">
          <div className="flex items-center justify-between gap-4">
            <div className="text-xs text-gray-600 dark:text-gray-400 space-y-1 min-w-0 break-words">
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
              onClick={() => onDelete(item.id)}
              className="text-sm font-medium text-red-600 hover:text-red-500"
            >
              Delete
            </button>
          </div>
        </div>
      )}
    </article>
  );
});

const SkeletonCard = () => (
  <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl overflow-hidden">
    <div className="aspect-[4/3] animate-pulse bg-gray-200 dark:bg-gray-700" />
    <div className="p-5 space-y-3">
      <div className="h-5 w-3/4 animate-pulse rounded bg-gray-200 dark:bg-gray-700" />
      <div className="h-3 w-1/2 animate-pulse rounded bg-gray-200 dark:bg-gray-700" />
    </div>
  </div>
);

const Lightbox = ({ item, onClose }: { item: MediaItem; onClose: () => void }) => {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 bg-black/90 flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-label={item.prompt}
      onClick={onClose}
    >
      <button
        type="button"
        onClick={onClose}
        className="absolute top-4 right-4 text-white text-3xl leading-none px-3 py-1"
        aria-label="Close"
      >
        ×
      </button>
      <div className="max-w-full max-h-full flex flex-col items-center gap-3" onClick={(e) => e.stopPropagation()}>
        {item.type === 'video' ? (
          // eslint-disable-next-line jsx-a11y/media-has-caption
          <video
            controls
            autoPlay
            preload="none"
            poster={item.thumbnailUrl || undefined}
            src={item.url}
            className="max-w-full max-h-[85vh] bg-black"
          />
        ) : (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={item.url} alt={item.prompt} decoding="async" className="max-w-full max-h-[85vh] object-contain" />
        )}
        <p className="text-sm text-gray-200 max-w-3xl text-center break-words">{item.prompt}</p>
      </div>
    </div>
  );
};

export default function MediaGallery() {
  const { token, user } = useAuth();
  const isAdmin = useMemo(() => user?.roles?.includes('admin') ?? false, [user?.roles]);

  const [items, setItems] = useState<MediaItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [typeFilter, setTypeFilter] = useState<TypeFilter>('all');
  const [textFilter, setTextFilter] = useState('');
  const [active, setActive] = useState<MediaItem | null>(null);

  const pageRef = useRef(0); // last page successfully loaded
  const inFlightRef = useRef(false);
  const generationRef = useRef(0); // bumps when the filter changes, invalidating older responses
  const hasMoreRef = useRef(false);
  const sentinelRef = useRef<HTMLDivElement | null>(null);

  const loadPage = useCallback(async (type: TypeFilter, reset: boolean) => {
    if (reset) {
      generationRef.current += 1;
      pageRef.current = 0;
      inFlightRef.current = false;
      setLoading(true);
      setError(null);
      setItems([]);
    } else if (inFlightRef.current || !hasMoreRef.current) {
      return;
    } else {
      setLoadingMore(true);
    }
    inFlightRef.current = true;
    const generation = generationRef.current;
    const page = pageRef.current + 1;

    try {
      const typeParam = type === 'all' ? '' : `&type=${type}`;
      const response = await apiFetch(`/api/media/list?page=${page}&limit=${PAGE_SIZE}${typeParam}`);
      const payload = (await response.json()) as MediaListResponse;
      if (generation !== generationRef.current) {
        return;
      }
      if (!response.ok || !payload.success || !payload.data?.media) {
        throw new Error(payload.error?.message || 'Failed to load media history');
      }

      const parsed = payload.data.media.map(parseItem).filter((i): i is MediaItem => i !== null);
      pageRef.current = page;
      const pages = payload.data.pages ?? Math.ceil((payload.data.total ?? 0) / PAGE_SIZE);
      const more = page < pages && parsed.length > 0;
      hasMoreRef.current = more;
      setHasMore(more);
      setItems((prev) => {
        const seen = new Set(prev.map((i) => i.id));
        return [...prev, ...parsed.filter((i) => !seen.has(i.id))];
      });
    } catch (err) {
      if (generation === generationRef.current) {
        hasMoreRef.current = false;
        setHasMore(false);
        setError(err instanceof Error ? err.message : 'Unable to load gallery');
      }
    } finally {
      if (generation === generationRef.current) {
        inFlightRef.current = false;
        setLoading(false);
        setLoadingMore(false);
      }
    }
  }, []);

  useEffect(() => {
    hasMoreRef.current = true; // allow the first request of this filter
    void loadPage(typeFilter, true);
  }, [typeFilter, loadPage]);

  const loadMore = useCallback(() => {
    void loadPage(typeFilter, false);
  }, [loadPage, typeFilter]);

  // Infinite scroll sentinel (guarded for environments without IntersectionObserver)
  useEffect(() => {
    const node = sentinelRef.current;
    if (!node || !hasMore || typeof IntersectionObserver === 'undefined') {
      return;
    }
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          loadMore();
        }
      },
      { rootMargin: '600px 0px' }
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [hasMore, loadMore, items.length]);

  const handleDelete = useCallback(
    async (id: string) => {
      if (!isAdmin || !token) {
        return;
      }
      if (typeof window !== 'undefined' && !window.confirm('Delete this media item? This cannot be undone.')) {
        return;
      }
      try {
        setActionError(null);
        const response = await apiFetch(`/api/media/${id}`, { method: 'DELETE' });
        const payload = (await response.json()) as MediaListResponse;
        if (!response.ok || !payload.success) {
          throw new Error(payload.error?.message || 'Failed to delete media item');
        }
        setItems((prev) => prev.filter((item) => item.id !== id));
      } catch (err) {
        setActionError(err instanceof Error ? err.message : 'Unable to delete media item');
      }
    },
    [isAdmin, token]
  );

  const handleOpen = useCallback((item: MediaItem) => setActive(item), []);
  const closeLightbox = useCallback(() => setActive(null), []);

  const visibleItems = useMemo(() => {
    const q = textFilter.trim().toLowerCase();
    if (!isAdmin || !q) {
      return items;
    }
    return items.filter((i) => i.prompt.toLowerCase().includes(q) || (i.userEmail ?? '').toLowerCase().includes(q));
  }, [items, isAdmin, textFilter]);

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

        <div className="mt-4 flex flex-wrap items-center gap-3">
          <div className="inline-flex rounded-lg border border-gray-300 dark:border-gray-600 overflow-hidden" role="group" aria-label="Filter by type">
            {FILTERS.map((f) => (
              <button
                key={f.value}
                type="button"
                onClick={() => setTypeFilter(f.value)}
                aria-pressed={typeFilter === f.value}
                className={`px-4 py-1.5 text-sm font-medium ${
                  typeFilter === f.value
                    ? 'bg-blue-600 text-white'
                    : 'bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700'
                }`}
              >
                {f.label}
              </button>
            ))}
          </div>
          {isAdmin && (
            <input
              type="search"
              value={textFilter}
              onChange={(e) => setTextFilter(e.target.value)}
              placeholder="Filter loaded items by student email or prompt"
              aria-label="Filter by student email or prompt"
              className="flex-1 min-w-[16rem] rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-white px-3 py-1.5 text-sm"
            />
          )}
        </div>
      </div>

      {error && <div className="border border-red-200 bg-red-50 text-red-700 rounded-lg p-4 text-sm">{error}</div>}
      {actionError && (
        <div className="border border-yellow-200 bg-yellow-50 text-yellow-800 rounded-lg p-4 text-sm">{actionError}</div>
      )}

      {loading ? (
        <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-3" aria-busy="true" aria-label="Loading gallery">
          {Array.from({ length: 6 }, (_, i) => (
            <SkeletonCard key={i} />
          ))}
        </div>
      ) : visibleItems.length === 0 && !error ? (
        <div className="border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 rounded-xl p-8 text-center text-gray-600 dark:text-gray-300">
          {items.length > 0
            ? 'No loaded items match your filter.'
            : 'No media has been generated yet. Create an image or video to see it appear here automatically.'}
        </div>
      ) : (
        <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-3">
          {visibleItems.map((item) => (
            <MediaCard key={item.id} item={item} isAdmin={isAdmin} onOpen={handleOpen} onDelete={handleDelete} />
          ))}
        </div>
      )}

      {!loading && hasMore && (
        <div className="flex flex-col items-center gap-3 py-8">
          <div ref={sentinelRef} className="h-px w-full" aria-hidden="true" />
          <div className="text-sm text-gray-600 dark:text-gray-400">Showing {items.length} items</div>
          <button
            type="button"
            onClick={loadMore}
            disabled={loadingMore}
            className="bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed text-white font-medium px-8 py-3 rounded-lg shadow-sm transition-colors"
          >
            {loadingMore ? 'Loading...' : 'Load More'}
          </button>
        </div>
      )}

      {active && <Lightbox item={active} onClose={closeLightbox} />}
    </div>
  );
}
