export const CONSTANTS = {
  // Prompt constraints
  MAX_PROMPT_LENGTH: 10000,
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
    SPEECH: {
      HOURLY: 50,
      DAILY: 200,
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

