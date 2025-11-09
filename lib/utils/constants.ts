export const CONSTANTS = {
  // Prompt constraints
  MAX_PROMPT_LENGTH: 2000,
  MIN_PROMPT_LENGTH: 3,
  
  // File upload constraints
  MAX_FILE_SIZE: 10 * 1024 * 1024, // 10MB
  SUPPORTED_IMAGE_TYPES: ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'],
  
  // Generation options
  ASPECT_RATIOS: [
    { value: '1:1', label: 'Square (1:1)' },
    { value: '16:9', label: 'Landscape (16:9)' },
    { value: '9:16', label: 'Portrait (9:16)' },
    { value: '4:3', label: 'Standard (4:3)' },
    { value: '3:4', label: 'Portrait (3:4)' },
  ],
  
  VIDEO_DURATIONS: [
    { value: 5, label: '5 seconds' },
    { value: 10, label: '10 seconds' },
    { value: 15, label: '15 seconds' },
    { value: 30, label: '30 seconds' },
  ],
  
  MUSIC_DURATIONS: [
    { value: 10, label: '10 seconds' },
    { value: 30, label: '30 seconds' },
    { value: 60, label: '1 minute' },
    { value: 120, label: '2 minutes' },
    { value: 300, label: '5 minutes' },
  ],
  
  // API configuration
  API_TIMEOUT: 120000, // 120 seconds
  RETRY_ATTEMPTS: 3,
  RETRY_DELAY: 1000, // 1 second
  
  // Model names with pricing information
  // Pricing from: https://ai.google.dev/gemini-api/docs/pricing
  MODELS: {
    IMAGE: {
      IMAGEN_4: {
        id: 'imagen-4.0-generate-001',
        name: 'Imagen 4.0',
        description: 'Highest quality image generation',
        price: 0.04,
        priceUnit: 'per image',
        tier: 'paid',
      },
      IMAGEN_3: {
        id: 'imagen-3.0-generate-002',
        name: 'Imagen 3.0',
        description: 'High quality image generation',
        price: 0.02,
        priceUnit: 'per image',
        tier: 'paid',
      },
      NANO_BANANA: {
        id: 'gemini-2.5-flash-image',
        name: 'Nano Banana (Gemini 2.5 Flash)',
        description: 'Fast, conversational image generation',
        price: 0.0387, // $30 per 1M tokens, ~1290 tokens per image = $0.0387
        priceUnit: 'per image',
        tier: 'paid',
      },
    },
    VIDEO: {
      VEO_3_1: {
        id: 'veo-3.1-generate-preview',
        name: 'Veo 3.1',
        description: 'High quality 8s video with audio',
        price: 0.40,
        priceUnit: 'per second',
        pricePerVideo: 3.20, // 8 seconds
        tier: 'paid',
      },
      VEO_3_1_FAST: {
        id: 'veo-3.1-fast-generate-preview',
        name: 'Veo 3.1 Fast',
        description: 'Fast 8s video with audio',
        price: 0.15,
        priceUnit: 'per second',
        pricePerVideo: 1.20, // 8 seconds
        tier: 'paid',
      },
      VEO_3: {
        id: 'veo-3.0-generate-001',
        name: 'Veo 3.0 (Stable)',
        description: 'Stable 8s video with audio',
        price: 0.40,
        priceUnit: 'per second',
        pricePerVideo: 3.20, // 8 seconds
        tier: 'paid',
      },
      VEO_3_FAST: {
        id: 'veo-3.0-fast-generate-001',
        name: 'Veo 3.0 Fast (Stable)',
        description: 'Fast stable 8s video with audio',
        price: 0.15,
        priceUnit: 'per second',
        pricePerVideo: 1.20, // 8 seconds
        tier: 'paid',
      },
      VEO_2: {
        id: 'veo-2.0-generate-001',
        name: 'Veo 2.0',
        description: '5-8s video (no audio)',
        price: 0.35,
        priceUnit: 'per second',
        pricePerVideo: 2.80, // 8 seconds estimate
        tier: 'paid',
      },
    },
    MUSIC: {
      DEFAULT: 'musiclm-001',
    },
  },
  
  // Default rate limits
  DEFAULT_RATE_LIMITS: {
    IMAGE: {
      HOURLY: 50,
      DAILY: 200,
    },
    VIDEO: {
      HOURLY: 3,
      DAILY: 10,
    },
    MUSIC: {
      HOURLY: 10,
      DAILY: 50,
    },
  },
  
  // Error codes
  ERROR_CODES: {
    VALIDATION_ERROR: 'VALIDATION_ERROR',
    RATE_LIMIT_EXCEEDED: 'RATE_LIMIT_EXCEEDED',
    API_ERROR: 'API_ERROR',
    NETWORK_ERROR: 'NETWORK_ERROR',
    INVALID_API_KEY: 'INVALID_API_KEY',
    CONTENT_POLICY_VIOLATION: 'CONTENT_POLICY_VIOLATION',
    FILE_TOO_LARGE: 'FILE_TOO_LARGE',
    INVALID_FILE_TYPE: 'INVALID_FILE_TYPE',
  },
} as const;

