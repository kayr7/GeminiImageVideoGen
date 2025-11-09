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
  storage: 'memory' | 'redis';
  redisUrl?: string;
}

export interface UsageStats {
  image: { current: number; limit: number };
  video: { current: number; limit: number };
  music: { current: number; limit: number };
}

// Storage Interface
export interface RateLimitStorage {
  get(key: string): Promise<number | null>;
  set(key: string, value: number, ttl: number): Promise<void>;
  increment(key: string): Promise<number>;
  delete(key: string): Promise<void>;
  clear(): Promise<void>;
}

