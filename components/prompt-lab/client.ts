import { resolveApiUrl } from '@/lib/utils/apiClient';
import { readSse } from './sse';
import type { GenerateRequest, UsageInfo } from './types';

export class PromptLabError extends Error {
  status: number;
  retryAfter: number | null;
  constructor(message: string, status: number, retryAfter: number | null = null) {
    super(message);
    this.status = status;
    this.retryAfter = retryAfter;
  }
}

export interface StreamHandlers {
  onThought: (text: string) => void;
  onAnswer: (text: string) => void;
  onUsage: (usage: UsageInfo) => void;
}

export function getClientId(): string {
  const KEY = 'promptLabClientId';
  try {
    const existing = window.localStorage.getItem(KEY);
    if (existing) return existing;
    const id =
      typeof crypto !== 'undefined' && 'randomUUID' in crypto
        ? crypto.randomUUID()
        : `${Date.now().toString(16)}-${Math.random().toString(16).slice(2)}`;
    window.localStorage.setItem(KEY, id);
    return id;
  } catch {
    return `anon-${Math.random().toString(16).slice(2)}`;
  }
}

const detailToString = (detail: unknown): string => {
  if (typeof detail === 'string') return detail;
  if (Array.isArray(detail)) {
    return detail.map((d) => (typeof d === 'object' && d && 'msg' in d ? String((d as { msg: unknown }).msg) : String(d))).join('; ');
  }
  return '';
};

export function friendlyHttpError(status: number, detail: string, retryAfter: number | null): string {
  if (status === 429) {
    return `Too many requests, try again in ${retryAfter ?? 'a few'} s`;
  }
  if (status === 503) return 'The server is busy, try again in a moment';
  if (status === 413 || status === 400 || status === 403) {
    return detail || (status === 403 ? 'Prompt Lab is not active right now' : 'Invalid request');
  }
  return detail || `Request failed (${status})`;
}

/** POSTs a generate request and dispatches streamed events. Resolves when done. */
export async function streamGenerate(
  request: GenerateRequest,
  handlers: StreamHandlers,
  signal?: AbortSignal
): Promise<void> {
  let response: Response;
  try {
    response = await fetch(resolveApiUrl('/api/prompt-lab/generate'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Client-Id': getClientId() },
      body: JSON.stringify(request),
      signal,
    });
  } catch (err) {
    if ((err as { name?: string })?.name === 'AbortError') throw err;
    throw new PromptLabError('Could not reach the server. Check your connection and try again.', 0);
  }

  if (!response.ok) {
    let detail = '';
    try {
      const body = await response.json();
      detail = detailToString(body?.detail ?? body?.message);
    } catch {
      /* ignore */
    }
    const ra = parseInt(response.headers?.get?.('Retry-After') ?? '', 10);
    const retryAfter = Number.isFinite(ra) ? ra : null;
    throw new PromptLabError(friendlyHttpError(response.status, detail, retryAfter), response.status, retryAfter);
  }

  if (!response.body) {
    throw new PromptLabError('Streaming is not supported by this browser.', 0);
  }

  try {
    for await (const evt of readSse(response.body.getReader())) {
      const data = (evt.data ?? {}) as Record<string, unknown>;
      switch (evt.event) {
        case 'thought':
          handlers.onThought(String(data.text ?? ''));
          break;
        case 'answer':
          handlers.onAnswer(String(data.text ?? ''));
          break;
        case 'usage':
          handlers.onUsage(data as unknown as UsageInfo);
          break;
        case 'error':
          throw new PromptLabError(String(data.message ?? 'Generation failed'), 200);
        case 'done':
          return;
        default:
          break;
      }
    }
  } catch (err) {
    if (err instanceof PromptLabError || (err as { name?: string })?.name === 'AbortError') throw err;
    throw new PromptLabError('The connection was interrupted. Please try again.', 0);
  }
}
