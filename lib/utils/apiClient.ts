const RETRYABLE_STATUSES = new Set([502, 503, 504]);

const URL_SCHEME_PATTERN = /^[a-z][a-z0-9+.-]*:/i;

const hasUrlScheme = (value: string): boolean => URL_SCHEME_PATTERN.test(value);

const trimTrailingSlash = (value: string): string => {
  if (value === '/') {
    return '';
  }
  return value.endsWith('/') ? value.slice(0, -1) : value;
};

const normaliseBaseUrl = (value: string | undefined | null): string => {
  if (!value) {
    return '';
  }

  const trimmed = value.trim();
  if (!trimmed) {
    return '';
  }

  return trimTrailingSlash(trimmed);
};

const joinBaseWithPath = (base: string, path: string): string => {
  const normalisedBase = normaliseBaseUrl(base);
  const normalisedPath = path.startsWith('/') ? path : `/${path}`;

  if (!normalisedBase) {
    return normalisedPath;
  }

  if (normalisedBase.toLowerCase().endsWith('/api') && normalisedPath.startsWith('/api')) {
    return `${normalisedBase}${normalisedPath.slice(4)}`;
  }

  return `${normalisedBase}${normalisedPath}`;
};

const dedupe = (values: string[]): string[] => {
  const seen = new Set<string>();
  const result: string[] = [];

  for (const value of values) {
    if (seen.has(value)) {
      continue;
    }
    seen.add(value);
    result.push(value);
  }

  return result;
};

const envCandidates = dedupe(
  [process.env.NEXT_PUBLIC_API_URL, process.env.NEXT_PUBLIC_BASE_PATH]
    .map((value) => normaliseBaseUrl(value))
    .filter((value) => value.length > 0)
);

const baseCandidates = envCandidates.length > 0 ? envCandidates : [''];

let resolvedBase: string | null = null;

const shouldRetry = (status: number): boolean => RETRYABLE_STATUSES.has(status);

export const getApiBaseCandidates = (): readonly string[] => baseCandidates;

export const resolveApiUrl = (path: string): string => {
  if (hasUrlScheme(path)) {
    return path;
  }

  const base = resolvedBase ?? baseCandidates[0] ?? '';
  return joinBaseWithPath(base, path);
};

const STORAGE_KEY = 'gemini-auth-session';

const getAuthToken = (): string | null => {
  if (typeof window === 'undefined') {
    return null;
  }

  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return null;
    }

    const parsed = JSON.parse(raw);
    return parsed?.token || null;
  } catch (error) {
    return null;
  }
};

export const apiFetch = async (path: string, init?: RequestInit): Promise<Response> => {
  const targetPath = path.startsWith('/') ? path : `/${path}`;
  let lastError: unknown;
  let lastResponse: Response | null = null;

  // Get auth token and add to headers
  const token = getAuthToken();
  const headers = new Headers(init?.headers);
  
  if (token && !path.includes('/auth/login') && !path.includes('/auth/set-password')) {
    headers.set('Authorization', `Bearer ${token}`);
  }

  const enhancedInit = {
    ...init,
    headers,
  };

  for (const base of baseCandidates) {
    const url = joinBaseWithPath(base, targetPath);

    try {
      const response = await fetch(url, enhancedInit);
      if (response.ok) {
        resolvedBase = base;
        return response;
      }

      lastResponse = response;
      if (!shouldRetry(response.status)) {
        break;
      }
    } catch (error) {
      lastError = error;
    }
  }

  if (lastResponse) {
    return lastResponse;
  }

  throw lastError instanceof Error ? lastError : new Error('Failed to reach API endpoint');
};
