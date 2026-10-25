/**
 * API client for text generation endpoints
 */

import { apiFetch } from '@/lib/utils/apiClient';
import { parseApiResponse } from '@/lib/utils/apiError';
import type {
  SystemPrompt,
  TextGeneration,
  ChatSession,
  ChatMessage,
  CreateSystemPromptRequest,
  UpdateSystemPromptRequest,
  TextGenerationRequest,
  CreateChatSessionRequest,
  UpdateChatSessionRequest,
  SendMessageRequest,
} from '@/types/text-generation';

// Template API (shared with the image/video generators)
export { templateAPI } from '@/lib/templates/api';

const jsonInit = (method: string, body: unknown): RequestInit => ({
  method,
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(body),
});

const id = (value: string) => encodeURIComponent(value);

// System Prompt API
export const systemPromptAPI = {
  async list(mediaType?: string): Promise<SystemPrompt[]> {
    const url = mediaType
      ? `/api/text/system-prompts?media_type=${encodeURIComponent(mediaType)}`
      : `/api/text/system-prompts`;
    const data = await parseApiResponse<{ systemPrompts?: SystemPrompt[] }>(
      await apiFetch(url),
      'Failed to fetch system prompts',
    );
    return data?.systemPrompts || [];
  },

  async get(promptId: string): Promise<SystemPrompt> {
    const data = await parseApiResponse<{ systemPrompt: SystemPrompt }>(
      await apiFetch(`/api/text/system-prompts/${id(promptId)}`),
      'Failed to fetch system prompt',
    );
    return data.systemPrompt;
  },

  async create(request: CreateSystemPromptRequest): Promise<SystemPrompt> {
    const data = await parseApiResponse<{ systemPrompt: SystemPrompt }>(
      await apiFetch(`/api/text/system-prompts`, jsonInit('POST', request)),
      'Failed to create system prompt',
    );
    return data.systemPrompt;
  },

  async update(promptId: string, request: UpdateSystemPromptRequest): Promise<SystemPrompt> {
    const data = await parseApiResponse<{ systemPrompt: SystemPrompt }>(
      await apiFetch(`/api/text/system-prompts/${id(promptId)}`, jsonInit('PUT', request)),
      'Failed to update system prompt',
    );
    return data.systemPrompt;
  },

  async delete(promptId: string): Promise<void> {
    await parseApiResponse<{ promptId: string }>(
      await apiFetch(`/api/text/system-prompts/${id(promptId)}`, { method: 'DELETE' }),
      'Failed to delete system prompt',
    );
  },
};

// Text Generation API
export const textGenerationAPI = {
  async generate(request: TextGenerationRequest): Promise<TextGeneration> {
    const data = await parseApiResponse<{ generation: TextGeneration }>(
      await apiFetch(`/api/text/generate`, jsonInit('POST', request)),
      'Failed to generate text',
    );
    return data.generation;
  },

  async getHistory(): Promise<TextGeneration[]> {
    const data = await parseApiResponse<{ generations?: TextGeneration[] }>(
      await apiFetch(`/api/text/history`),
      'Failed to fetch history',
    );
    return data?.generations || [];
  },

  async get(generationId: string): Promise<TextGeneration> {
    const data = await parseApiResponse<{ generation: TextGeneration }>(
      await apiFetch(`/api/text/history/${id(generationId)}`),
      'Failed to fetch generation',
    );
    return data.generation;
  },

  async delete(generationId: string): Promise<void> {
    await parseApiResponse<{ generationId: string }>(
      await apiFetch(`/api/text/history/${id(generationId)}`, { method: 'DELETE' }),
      'Failed to delete generation',
    );
  },
};

// Chat Session API
export const chatAPI = {
  async listSessions(): Promise<ChatSession[]> {
    const data = await parseApiResponse<{ sessions?: ChatSession[] }>(
      await apiFetch(`/api/text/chat/sessions`),
      'Failed to fetch chat sessions',
    );
    return data?.sessions || [];
  },

  async getSession(sessionId: string): Promise<ChatSession> {
    const data = await parseApiResponse<{ session: ChatSession }>(
      await apiFetch(`/api/text/chat/sessions/${id(sessionId)}`),
      'Failed to fetch chat session',
    );
    return data.session;
  },

  async createSession(request: CreateChatSessionRequest): Promise<ChatSession> {
    const data = await parseApiResponse<{ session: ChatSession }>(
      await apiFetch(`/api/text/chat/sessions`, jsonInit('POST', request)),
      'Failed to create chat session',
    );
    return data.session;
  },

  async updateSession(sessionId: string, request: UpdateChatSessionRequest): Promise<ChatSession> {
    const data = await parseApiResponse<{ session: ChatSession }>(
      await apiFetch(`/api/text/chat/sessions/${id(sessionId)}`, jsonInit('PUT', request)),
      'Failed to update chat session',
    );
    return data.session;
  },

  async deleteSession(sessionId: string): Promise<void> {
    await parseApiResponse<{ sessionId: string }>(
      await apiFetch(`/api/text/chat/sessions/${id(sessionId)}`, { method: 'DELETE' }),
      'Failed to delete chat session',
    );
  },

  async getMessages(sessionId: string): Promise<ChatMessage[]> {
    const data = await parseApiResponse<{ messages?: ChatMessage[] }>(
      await apiFetch(`/api/text/chat/sessions/${id(sessionId)}/messages`),
      'Failed to fetch messages',
    );
    return data?.messages || [];
  },

  async sendMessage(sessionId: string, request: SendMessageRequest): Promise<ChatMessage> {
    const data = await parseApiResponse<{ message: ChatMessage }>(
      await apiFetch(`/api/text/chat/sessions/${id(sessionId)}/messages`, jsonInit('POST', request)),
      'Failed to send message',
    );
    return data.message;
  },
};
