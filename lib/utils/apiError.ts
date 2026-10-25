/**
 * Helpers to turn backend error payloads into readable messages.
 *
 * The FastAPI backend answers errors as `{"detail": "..."}`; validation errors (422)
 * use `{"detail": [{"msg": "...", ...}]}`. Older endpoints use `{error: {message}}`.
 */

import type { APIResponse } from '@/types/text-generation';

export class ApiError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
  }
}

const cleanValidationMessage = (msg: string): string => msg.replace(/^Value error,\s*/i, '');

/** Extract the most specific error message from a backend error body. */
export function errorMessageFromBody(body: unknown, fallback: string): string {
  if (!body || typeof body !== 'object') {
    return fallback;
  }

  const payload = body as {
    detail?: unknown;
    error?: unknown;
    message?: unknown;
  };

  if (typeof payload.detail === 'string' && payload.detail.trim()) {
    return payload.detail;
  }

  if (Array.isArray(payload.detail)) {
    const messages = payload.detail
      .map((item) => {
        if (typeof item === 'string') return item;
        if (item && typeof item === 'object' && typeof (item as { msg?: unknown }).msg === 'string') {
          return cleanValidationMessage((item as { msg: string }).msg);
        }
        return null;
      })
      .filter((msg): msg is string => !!msg);
    if (messages.length > 0) {
      return messages.join('; ');
    }
  }

  if (typeof payload.error === 'string' && payload.error.trim()) {
    return payload.error;
  }

  if (payload.error && typeof payload.error === 'object') {
    const message = (payload.error as { message?: unknown }).message;
    if (typeof message === 'string' && message.trim()) {
      return message;
    }
  }

  if (typeof payload.message === 'string' && payload.message.trim()) {
    return payload.message;
  }

  return fallback;
}

/**
 * Parse a `{success, data}` response. Throws an ApiError carrying the backend's
 * message (or `fallback`) when the request failed.
 */
export async function parseApiResponse<T>(response: Response, fallback: string): Promise<T> {
  let body: unknown = null;
  try {
    body = await response.json();
  } catch {
    body = null;
  }

  const payload = body as APIResponse<T> | null;
  if (!response.ok || !payload || !payload.success) {
    throw new ApiError(errorMessageFromBody(body, fallback), response.status);
  }

  return payload.data as T;
}
