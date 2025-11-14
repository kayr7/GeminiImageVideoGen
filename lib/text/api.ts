/**
 * API client for text generation endpoints
 */

import { apiFetch } from '@/lib/utils/apiClient';
import type {
  PromptTemplate,
  SystemPrompt,
  TextGeneration,
  ChatSession,
  ChatMessage,
  CreateTemplateRequest,
  UpdateTemplateRequest,
  CreateSystemPromptRequest,
  UpdateSystemPromptRequest,
  TextGenerationRequest,
  CreateChatSessionRequest,
  UpdateChatSessionRequest,
  SendMessageRequest,
  APIResponse,
} from '@/types/text-generation';

// Template API
export const templateAPI = {
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

  async get(id: string): Promise<PromptTemplate> {
    const response = await apiFetch(`/api/text/templates/${id}`);
    const data: APIResponse<{ template: PromptTemplate }> = await response.json();
    if (!response.ok || !data.success) {
      throw new Error(data.error?.message || 'Failed to fetch template');
    }
    return data.data!.template;
  },

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

// System Prompt API
export const systemPromptAPI = {
  async list(mediaType?: string): Promise<SystemPrompt[]> {
    const url = mediaType
      ? `/api/text/system-prompts?media_type=${mediaType}`
      : `/api/text/system-prompts`;
    const response = await apiFetch(url);
    const data: APIResponse<{ systemPrompts: SystemPrompt[] }> = await response.json();
    if (!response.ok || !data.success) {
      throw new Error(data.error?.message || 'Failed to fetch system prompts');
    }
    return data.data?.systemPrompts || [];
  },

  async get(id: string): Promise<SystemPrompt> {
    const response = await apiFetch(`/api/text/system-prompts/${id}`);
    const data: APIResponse<{ systemPrompt: SystemPrompt }> = await response.json();
    if (!response.ok || !data.success) {
      throw new Error(data.error?.message || 'Failed to fetch system prompt');
    }
    return data.data!.systemPrompt;
  },

  async create(request: CreateSystemPromptRequest): Promise<SystemPrompt> {
    const response = await apiFetch(`/api/text/system-prompts`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(request),
    });
    const data: APIResponse<{ systemPrompt: SystemPrompt }> = await response.json();
    if (!response.ok || !data.success) {
      throw new Error(data.error?.message || 'Failed to create system prompt');
    }
    return data.data!.systemPrompt;
  },

  async update(id: string, request: UpdateSystemPromptRequest): Promise<SystemPrompt> {
    const response = await apiFetch(`/api/text/system-prompts/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(request),
    });
    const data: APIResponse<{ systemPrompt: SystemPrompt }> = await response.json();
    if (!response.ok || !data.success) {
      throw new Error(data.error?.message || 'Failed to update system prompt');
    }
    return data.data!.systemPrompt;
  },

  async delete(id: string): Promise<void> {
    const response = await apiFetch(`/api/text/system-prompts/${id}`, {
      method: 'DELETE',
    });
    const data: APIResponse<{ promptId: string }> = await response.json();
    if (!response.ok || !data.success) {
      throw new Error(data.error?.message || 'Failed to delete system prompt');
    }
  },
};

// Text Generation API
export const textGenerationAPI = {
  async generate(request: TextGenerationRequest): Promise<TextGeneration> {
    const response = await apiFetch(`/api/text/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(request),
    });
    const data: APIResponse<{ generation: TextGeneration }> = await response.json();
    if (!response.ok || !data.success) {
      throw new Error(data.error?.message || 'Failed to generate text');
    }
    return data.data!.generation;
  },

  async getHistory(): Promise<TextGeneration[]> {
    const response = await apiFetch(`/api/text/history`);
    const data: APIResponse<{ generations: TextGeneration[] }> = await response.json();
    if (!response.ok || !data.success) {
      throw new Error(data.error?.message || 'Failed to fetch history');
    }
    return data.data?.generations || [];
  },

  async get(id: string): Promise<TextGeneration> {
    const response = await apiFetch(`/api/text/history/${id}`);
    const data: APIResponse<{ generation: TextGeneration }> = await response.json();
    if (!response.ok || !data.success) {
      throw new Error(data.error?.message || 'Failed to fetch generation');
    }
    return data.data!.generation;
  },

  async delete(id: string): Promise<void> {
    const response = await apiFetch(`/api/text/history/${id}`, {
      method: 'DELETE',
    });
    const data: APIResponse<{ generationId: string }> = await response.json();
    if (!response.ok || !data.success) {
      throw new Error(data.error?.message || 'Failed to delete generation');
    }
  },
};

// Chat Session API
export const chatAPI = {
  async listSessions(): Promise<ChatSession[]> {
    const response = await apiFetch(`/api/text/chat/sessions`);
    const data: APIResponse<{ sessions: ChatSession[] }> = await response.json();
    if (!response.ok || !data.success) {
      throw new Error(data.error?.message || 'Failed to fetch chat sessions');
    }
    return data.data?.sessions || [];
  },

  async getSession(id: string): Promise<ChatSession> {
    const response = await apiFetch(`/api/text/chat/sessions/${id}`);
    const data: APIResponse<{ session: ChatSession }> = await response.json();
    if (!response.ok || !data.success) {
      throw new Error(data.error?.message || 'Failed to fetch chat session');
    }
    return data.data!.session;
  },

  async createSession(request: CreateChatSessionRequest): Promise<ChatSession> {
    const response = await apiFetch(`/api/text/chat/sessions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(request),
    });
    const data: APIResponse<{ session: ChatSession }> = await response.json();
    if (!response.ok || !data.success) {
      throw new Error(data.error?.message || 'Failed to create chat session');
    }
    return data.data!.session;
  },

  async updateSession(id: string, request: UpdateChatSessionRequest): Promise<ChatSession> {
    const response = await apiFetch(`/api/text/chat/sessions/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(request),
    });
    const data: APIResponse<{ session: ChatSession }> = await response.json();
    if (!response.ok || !data.success) {
      throw new Error(data.error?.message || 'Failed to update chat session');
    }
    return data.data!.session;
  },

  async deleteSession(id: string): Promise<void> {
    const response = await apiFetch(`/api/text/chat/sessions/${id}`, {
      method: 'DELETE',
    });
    const data: APIResponse<{ sessionId: string }> = await response.json();
    if (!response.ok || !data.success) {
      throw new Error(data.error?.message || 'Failed to delete chat session');
    }
  },

  async getMessages(sessionId: string): Promise<ChatMessage[]> {
    const response = await apiFetch(`/api/text/chat/sessions/${sessionId}/messages`);
    const data: APIResponse<{ messages: ChatMessage[] }> = await response.json();
    if (!response.ok || !data.success) {
      throw new Error(data.error?.message || 'Failed to fetch messages');
    }
    return data.data?.messages || [];
  },

  async sendMessage(sessionId: string, request: SendMessageRequest): Promise<ChatMessage> {
    const response = await apiFetch(`/api/text/chat/sessions/${sessionId}/messages`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(request),
    });
    const data: APIResponse<{ message: ChatMessage }> = await response.json();
    if (!response.ok || !data.success) {
      throw new Error(data.error?.message || 'Failed to send message');
    }
    return data.data!.message;
  },
};

