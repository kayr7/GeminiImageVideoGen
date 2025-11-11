const RETRYABLE_STATUSES = new Set([404, 502, 503, 504]);

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

const baseCandidates = dedupe(
  [
    process.env.NEXT_PUBLIC_API_URL,
    process.env.NEXT_PUBLIC_BASE_PATH,
    '/HdMImageVideo',
    '',
  ].map((value) => normaliseBaseUrl(value))
);

if (!baseCandidates.includes('')) {
  baseCandidates.push('');
}

let resolvedBase: string | null = null;

const shouldRetry = (status: number): boolean => RETRYABLE_STATUSES.has(status);

export const getApiBaseCandidates = (): readonly string[] => baseCandidates;

export const resolveApiUrl = (path: string): string => {
  const base = resolvedBase ?? baseCandidates[0] ?? '';
  return joinBaseWithPath(base, path);
};

export const apiFetch = async (path: string, init?: RequestInit): Promise<Response> => {
  const targetPath = path.startsWith('/') ? path : `/${path}`;
  let lastError: unknown;
  let lastResponse: Response | null = null;

  for (const base of baseCandidates) {
    const url = joinBaseWithPath(base, targetPath);

    try {
      const response = await fetch(url, init);
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
