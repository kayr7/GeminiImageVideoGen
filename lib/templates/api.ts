/**
 * API client for template management (all media types: text, image, video)
 */

import { apiFetch } from '@/lib/utils/apiClient';
import type {
  PromptTemplate,
  CreateTemplateRequest,
  UpdateTemplateRequest,
  APIResponse,
} from '@/types/text-generation';

export const templateAPI = {
  /**
   * List all templates, optionally filtered by media type
   * @param mediaType Filter by 'text', 'image', or 'video'
   */
  async list(mediaType?: string): Promise<PromptTemplate[]> {
    const url = mediaType
      ? `/api/text/templates?media_type=${mediaType}`
      : `/api/text/templates`;
    const response = await apiFetch(url);
    const data: APIResponse<{ templates: PromptTemplate[] }> = await response.json();
    if (!response.ok || !data.success) {
      throw new Error(data.error?.message || 'Failed to fetch templates');
    }
    return data.data?.templates || [];
  },

  /**
   * Get a specific template by ID
   */
  async get(id: string): Promise<PromptTemplate> {
    const response = await apiFetch(`/api/text/templates/${id}`);
    const data: APIResponse<{ template: PromptTemplate }> = await response.json();
    if (!response.ok || !data.success) {
      throw new Error(data.error?.message || 'Failed to fetch template');
    }
    return data.data!.template;
  },

  /**
   * Create a new template
   */
  async create(request: CreateTemplateRequest): Promise<PromptTemplate> {
    const response = await apiFetch(`/api/text/templates`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(request),
    });
    const data: APIResponse<{ template: PromptTemplate }> = await response.json();
    if (!response.ok || !data.success) {
      throw new Error(data.error?.message || 'Failed to create template');
    }
    return data.data!.template;
  },

  /**
   * Update an existing template
   */
  async update(id: string, request: UpdateTemplateRequest): Promise<PromptTemplate> {
    const response = await apiFetch(`/api/text/templates/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(request),
    });
    const data: APIResponse<{ template: PromptTemplate }> = await response.json();
    if (!response.ok || !data.success) {
      throw new Error(data.error?.message || 'Failed to update template');
    }
    return data.data!.template;
  },

  /**
   * Delete a template
   */
  async delete(id: string): Promise<void> {
    const response = await apiFetch(`/api/text/templates/${id}`, {
      method: 'DELETE',
    });
    const data: APIResponse<{ templateId: string }> = await response.json();
    if (!response.ok || !data.success) {
      throw new Error(data.error?.message || 'Failed to delete template');
    }
  },
};

