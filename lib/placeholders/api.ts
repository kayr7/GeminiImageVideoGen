/**
 * API client for the user's saved placeholder values (`/api/placeholders`).
 */

import { apiFetch } from '@/lib/utils/apiClient';
import { parseApiResponse } from '@/lib/utils/apiError';
import type {
  CreatePlaceholderRequest,
  Placeholder,
  UpdatePlaceholderRequest,
  UpsertPlaceholderRequest,
} from '@/types/placeholders';

const jsonInit = (method: string, body: unknown): RequestInit => ({
  method,
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(body),
});

export const placeholderAPI = {
  async list(): Promise<Placeholder[]> {
    const data = await parseApiResponse<{ placeholders?: Placeholder[] }>(
      await apiFetch('/api/placeholders'),
      'Failed to load placeholders',
    );
    return data?.placeholders || [];
  },

  async create(request: CreatePlaceholderRequest): Promise<Placeholder> {
    const data = await parseApiResponse<{ placeholder: Placeholder }>(
      await apiFetch('/api/placeholders', jsonInit('POST', request)),
      'Failed to create placeholder',
    );
    return data.placeholder;
  },

  async update(id: string, request: UpdatePlaceholderRequest): Promise<Placeholder> {
    const data = await parseApiResponse<{ placeholder: Placeholder }>(
      await apiFetch(`/api/placeholders/${encodeURIComponent(id)}`, jsonInit('PUT', request)),
      'Failed to update placeholder',
    );
    return data.placeholder;
  },

  /** Create or update the placeholder with this name. */
  async upsertByName(name: string, request: UpsertPlaceholderRequest): Promise<Placeholder> {
    const data = await parseApiResponse<{ placeholder: Placeholder }>(
      await apiFetch(
        `/api/placeholders/by-name/${encodeURIComponent(name)}`,
        jsonInit('PUT', request),
      ),
      'Failed to save placeholder',
    );
    return data.placeholder;
  },

  async delete(id: string): Promise<void> {
    await parseApiResponse<{ placeholderId: string }>(
      await apiFetch(`/api/placeholders/${encodeURIComponent(id)}`, { method: 'DELETE' }),
      'Failed to delete placeholder',
    );
  },
};

/** Client-side check mirroring the backend name rule. Returns an error message or null. */
export function validatePlaceholderName(name: string): string | null {
  if (!name) {
    return 'Please enter a name.';
  }
  if (name.length > 64) {
    return 'Names can be at most 64 characters long.';
  }
  if (!/^[A-Za-z0-9_]+$/.test(name)) {
    return `Use only letters, digits and underscores (no spaces), e.g. CONTEXT — then write it as {{CONTEXT}} in a prompt.`;
  }
  return null;
}
