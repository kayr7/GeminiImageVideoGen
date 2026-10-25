// Gemini API Types
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

// Rate Limiting Types
// Storage Interface
// Authentication Types
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
    default_duration?: number;
    default_resolution?: string;
    /** Video: false hides the negative prompt; 'prompt' mode appends it as "Avoid: ...". */
    supports_negative_prompt?: boolean;
    negative_prompt_mode?: 'prompt' | 'field';
    /** Image (generateContent) response modalities, e.g. ["IMAGE"] or ["TEXT", "IMAGE"]. */
    response_modalities?: string[];
    video_reference_images?: {
      enabled: boolean;
      max: number;
      supports_start_frame: boolean;
      supports_end_frame: boolean;
      supports_reference_images?: boolean;
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

