// Gemini API Types
export interface ImageGenerationParams {
  prompt: string;
  model?: string; // Model ID (e.g., 'imagen-4.0-generate-001', 'gemini-2.5-flash-image')
  aspectRatio?: string;
  negativePrompt?: string;
  referenceImage?: string; // Single image (deprecated, use referenceImages)
  referenceImages?: string[]; // Multiple reference images for composition/style transfer
  numberOfImages?: number;
}

export interface ImageResponse {
  imageUrl?: string;
  imageData?: string;
  prompt: string;
  model: string;
  generatedAt: Date;
  mediaId?: string; // ID for retrieving saved image from disk
}

export interface VideoGenerationParams {
  prompt: string;
  model?: string; // Model ID (e.g., 'veo-3.1-generate-preview', 'veo-3.1-fast-generate-preview')
  duration?: number;
  aspectRatio?: string;
  sourceImage?: string; // Single image (deprecated, use sourceImages)
  sourceImages?: string[]; // Multiple reference images for video generation
}

export interface VideoResponse {
  videoUrl?: string;
  videoData?: string;
  jobId?: string;
  status: 'completed' | 'processing' | 'failed';
  progress?: number;
  estimatedCompletion?: Date;
  mediaId?: string; // ID for retrieving saved video from disk
}

export interface MusicGenerationParams {
  description: string;
  duration?: number;
  style?: string;
}

export interface MusicResponse {
  audioUrl?: string;
  audioData?: string;
  duration: number;
  generatedAt: Date;
}

export interface SpeechGenerationParams {
  text: string;
  model?: string;
  voice: string;
  language?: string;
}

export interface SpeechResponse {
  audioUrl?: string;
  audioData?: string;
  text: string;
  voice: string;
  language?: string;
  model: string;
  generatedAt: Date;
  mediaId?: string;
}

// API Response Types
export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: ErrorResponse;
}

export interface ErrorResponse {
  message: string;
  code: string;
  statusCode: number;
  details?: unknown;
}

export interface ValidationResult {
  valid: boolean;
  errors?: string[];
}

// Rate Limiting Types
export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  resetAt: Date;
  retryAfter?: number;
}

export interface RateLimitConfig {
  image: {
    hourly: number;
    daily: number;
  };
  video: {
    hourly: number;
    daily: number;
  };
  music: {
    hourly: number;
    daily: number;
  };
  speech: {
    hourly: number;
    daily: number;
  };
  storage: 'memory' | 'redis';
  redisUrl?: string;
}

export interface UsageStats {
  image: { current: number; limit: number };
  video: { current: number; limit: number };
  music: { current: number; limit: number };
  speech: { current: number; limit: number };
}

// Storage Interface
export interface RateLimitStorage {
  get(key: string): Promise<number | null>;
  set(key: string, value: number, ttl: number): Promise<void>;
  increment(key: string): Promise<number>;
  delete(key: string): Promise<void>;
  clear(): Promise<void>;
}

// Authentication Types
export interface LoginRequest {
  username: string;
  password: string;
}

export interface LoginUser {
  username: string;
  displayName?: string;
  roles: string[];
}

export interface ModelInfo {
  id: string;
  name: string;
  category: string;
  description?: string;
  price?: number;
  priceUnit?: string;
  pricePerVideo?: number;
  tier?: string;
  capabilities?: {
    reference_images?: { enabled: boolean; max: number };
    sample_count?: { min: number; max: number };
    resolutions?: string[];
    aspect_ratios?: string[];
    durations?: number[];
    video_reference_images?: {
      enabled: boolean;
      max: number;
      supports_start_frame: boolean;
      supports_end_frame: boolean;
    };
    voices?: string[];
  };
}

export interface ModelQuotaConfig {
  daily?: number | null;
  monthly?: number | null;
}

export interface ModelAvailability {
  enabled: ModelInfo[];
  disabled: ModelInfo[];
  default?: string;
  quotas: Record<string, ModelQuotaConfig>;
}

export interface FeatureFlags {
  imageGeneration: boolean;
  videoGeneration: boolean;
  musicGeneration: boolean;
  speechGeneration: boolean;
}

export interface LoginConfig {
  models: Record<string, ModelAvailability>;
  features: FeatureFlags;
}

export interface AdminCategorySettings {
  enabled?: string[];
  disabled?: string[];
  default?: string | null;
  quotas?: Record<string, ModelQuotaConfig>;
}

export interface AdminModelConfigResponse {
  success: boolean;
  data: {
    registry: Record<string, ModelInfo[]>;
    settings: Record<string, AdminCategorySettings>;
    effective: Record<string, ModelAvailability>;
  };
}

export interface LoginResponseData {
  token: string;
  user: LoginUser;
  config: LoginConfig;
  requirePasswordSetup?: boolean;
}

export interface LoginResponse {
  success: boolean;
  data: LoginResponseData;
}

// User Management Types
export interface User {
  id: string;
  email: string;
  isActive: boolean;
  isAdmin: boolean;
  requirePasswordReset: boolean;
  createdAt: string;
  updatedAt: string;
  lastLoginAt?: string | null;
  isShared?: boolean | null;
  sharedWith?: string[] | null;
  tags?: string[] | null;
}

export interface Quota {
  generationType: string;
  quotaType: string;
  quotaLimit: number | null;
  quotaUsed: number;
  quotaRemaining: number | null;
  quotaResetAt?: string | null;
}

export interface BulkCreateUsersRequest {
  emails: string[];
  defaultQuotas?: Record<string, { type: string; limit?: number }>;
  defaultTags?: string[];
}

export interface UpdateUserTagsRequest {
  tags: string[];
}

