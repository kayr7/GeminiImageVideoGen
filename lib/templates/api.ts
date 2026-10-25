/**
 * API client for template management (all media types: text, image, video).
 * `lib/text/api.ts` re-exports `templateAPI` from here.
 */

import { apiFetch } from '@/lib/utils/apiClient';
import { parseApiResponse } from '@/lib/utils/apiError';
import type {
  PromptTemplate,
  CreateTemplateRequest,
  UpdateTemplateRequest,
} from '@/types/text-generation';

const jsonInit = (method: string, body: unknown): RequestInit => ({
  method,
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(body),
});

export const templateAPI = {
  /**
   * List all templates, optionally filtered by media type
   * @param mediaType Filter by 'text', 'image', or 'video'
   */
  async list(mediaType?: string): Promise<PromptTemplate[]> {
    const url = mediaType
      ? `/api/text/templates?media_type=${encodeURIComponent(mediaType)}`
      : `/api/text/templates`;
    const data = await parseApiResponse<{ templates?: PromptTemplate[] }>(
      await apiFetch(url),
      'Failed to fetch templates',
    );
    return data?.templates || [];
  },

  /** Get a specific template by ID */
  async get(id: string): Promise<PromptTemplate> {
    const data = await parseApiResponse<{ template: PromptTemplate }>(
      await apiFetch(`/api/text/templates/${encodeURIComponent(id)}`),
      'Failed to fetch template',
    );
    return data.template;
  },

  /** Create a new template */
  async create(request: CreateTemplateRequest): Promise<PromptTemplate> {
    const data = await parseApiResponse<{ template: PromptTemplate }>(
      await apiFetch(`/api/text/templates`, jsonInit('POST', request)),
      'Failed to create template',
    );
    return data.template;
  },

  /** Update an existing template */
  async update(id: string, request: UpdateTemplateRequest): Promise<PromptTemplate> {
    const data = await parseApiResponse<{ template: PromptTemplate }>(
      await apiFetch(`/api/text/templates/${encodeURIComponent(id)}`, jsonInit('PUT', request)),
      'Failed to update template',
    );
    return data.template;
  },

  /** Delete a template */
  async delete(id: string): Promise<void> {
    await parseApiResponse<{ templateId: string }>(
      await apiFetch(`/api/text/templates/${encodeURIComponent(id)}`, { method: 'DELETE' }),
      'Failed to delete template',
    );
  },
};
