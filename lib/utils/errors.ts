import { CONSTANTS } from './constants';
import { ErrorResponse } from '@/types';

export class ApiError extends Error {
  constructor(
    message: string,
    public statusCode: number = 500,
    public code: string = CONSTANTS.ERROR_CODES.API_ERROR
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

export class ValidationError extends ApiError {
  constructor(message: string, public details?: unknown) {
    super(message, 400, CONSTANTS.ERROR_CODES.VALIDATION_ERROR);
    this.name = 'ValidationError';
  }
}

export class RateLimitError extends ApiError {
  constructor(message: string, public retryAfter: number) {
    super(message, 429, CONSTANTS.ERROR_CODES.RATE_LIMIT_EXCEEDED);
    this.name = 'RateLimitError';
  }
}

export class NetworkError extends ApiError {
  constructor(message: string) {
    super(message, 503, CONSTANTS.ERROR_CODES.NETWORK_ERROR);
    this.name = 'NetworkError';
  }
}

export function handleApiError(error: unknown): ErrorResponse {
  // Handle custom API errors
  if (error instanceof ApiError) {
    return {
      message: error.message,
      code: error.code,
      statusCode: error.statusCode,
      details: 'details' in error ? error.details : undefined,
    };
  }

  // Handle generic errors
  if (error instanceof Error) {
    return {
      message: error.message,
      code: CONSTANTS.ERROR_CODES.API_ERROR,
      statusCode: 500,
    };
  }

  // Handle unknown errors
  return {
    message: 'An unexpected error occurred',
    code: CONSTANTS.ERROR_CODES.API_ERROR,
    statusCode: 500,
  };
}

export function isNetworkError(error: unknown): boolean {
  if (error instanceof Error) {
    return (
      error.message.includes('fetch') ||
      error.message.includes('network') ||
      error.message.includes('ECONNREFUSED') ||
      error.message.includes('timeout')
    );
  }
  return false;
}

export async function retryWithBackoff<T>(
  fn: () => Promise<T>,
  maxAttempts: number = CONSTANTS.RETRY_ATTEMPTS,
  delay: number = CONSTANTS.RETRY_DELAY
): Promise<T> {
  let lastError: unknown;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;

      // Don't retry on validation errors or rate limit errors
      if (error instanceof ValidationError || error instanceof RateLimitError) {
        throw error;
      }

      // Only retry on network errors
      if (!isNetworkError(error)) {
        throw error;
      }

      // If this was the last attempt, throw
      if (attempt === maxAttempts) {
        throw error;
      }

      // Wait with exponential backoff
      const waitTime = delay * Math.pow(2, attempt - 1);
      await new Promise((resolve) => setTimeout(resolve, waitTime));
    }
  }

  throw lastError;
}

