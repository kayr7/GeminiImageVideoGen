/**
 * TypeScript types for text generation functionality
 */

export interface PromptTemplate {
  id: string;
  userId: string;
  name: string;
  mediaType: 'text' | 'image' | 'video';
  templateText: string;
  variables: string[];
  createdAt: string;
  updatedAt: string;
}

export interface SystemPrompt {
  id: string;
  userId: string;
  name: string;
  mediaType: 'text' | 'image' | 'video';
  promptText: string;
  createdAt: string;
  updatedAt: string;
}

export interface TextGeneration {
  id: string;
  userId: string;
  mode: 'chat' | 'single';
  systemPrompt?: string;
  systemPromptId?: string;
  userMessage: string;
  templateId?: string;
  filledMessage: string;
  variableValues?: Record<string, string>;
  modelResponse: string;
  model: string;
  ipAddress?: string;
  createdAt: string;
}

export interface ChatSession {
  id: string;
  userId: string;
  name?: string;
  systemPrompt?: string;
  systemPromptId?: string;
  createdAt: string;
  updatedAt: string;
}

export interface ChatMessage {
  id: string;
  sessionId: string;
  role: 'user' | 'model';
  content: string;
  createdAt: string;
}

// API Request Types
export interface CreateTemplateRequest {
  name: string;
  mediaType: 'text' | 'image' | 'video';
  templateText: string;
  variables: string[];
}

export interface UpdateTemplateRequest {
  name?: string;
  templateText?: string;
  variables?: string[];
}

export interface CreateSystemPromptRequest {
  name: string;
  mediaType: 'text' | 'image' | 'video';
  promptText: string;
}

export interface UpdateSystemPromptRequest {
  name?: string;
  promptText?: string;
}

export interface TextGenerationRequest {
  userMessage: string;
  systemPrompt?: string;
  systemPromptId?: string;
  templateId?: string;
  variableValues?: Record<string, string>;
  model?: string;
}

export interface CreateChatSessionRequest {
  name?: string;
  systemPrompt?: string;
  systemPromptId?: string;
}

export interface UpdateChatSessionRequest {
  name?: string;
  systemPrompt?: string;
}

export interface SendMessageRequest {
  message: string;
  model?: string;
}

// API Response Types
export interface APIResponse<T> {
  success: boolean;
  data?: T;
  error?: {
    message: string;
    details?: string[];
  };
}

