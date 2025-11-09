import { GoogleGenerativeAI } from '@google/generative-ai';
import { CONSTANTS } from '../utils/constants';
import { ApiError } from '../utils/errors';

export class GeminiClient {
  private client: GoogleGenerativeAI;
  private apiKey: string;

  constructor(apiKey: string) {
    if (!apiKey) {
      throw new ApiError('Gemini API key is required', 500, CONSTANTS.ERROR_CODES.INVALID_API_KEY);
    }
    
    this.apiKey = apiKey;
    this.client = new GoogleGenerativeAI(apiKey);
  }

  /**
   * Get a generative model by name
   */
  getModel(modelName: string) {
    return this.client.getGenerativeModel({ model: modelName });
  }

  /**
   * Validate API key by making a simple request
   */
  async validateApiKey(): Promise<boolean> {
    try {
      const model = this.getModel('gemini-pro');
      await model.generateContent('test');
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Handle Gemini API errors and convert to our error format
   */
  handleGeminiError(error: unknown): never {
    if (error instanceof Error) {
      const message = error.message.toLowerCase();

      // API key errors
      if (message.includes('api key') || message.includes('unauthorized')) {
        throw new ApiError(
          'Invalid or missing API key',
          401,
          CONSTANTS.ERROR_CODES.INVALID_API_KEY
        );
      }

      // Content policy violations
      if (message.includes('content') && message.includes('policy')) {
        throw new ApiError(
          'Content violates safety policies',
          400,
          CONSTANTS.ERROR_CODES.CONTENT_POLICY_VIOLATION
        );
      }

      // Rate limiting from Gemini side
      if (message.includes('quota') || message.includes('rate limit')) {
        throw new ApiError(
          'Gemini API rate limit exceeded. Please try again later.',
          429,
          CONSTANTS.ERROR_CODES.RATE_LIMIT_EXCEEDED
        );
      }

      // Network errors
      if (message.includes('network') || message.includes('fetch')) {
        throw new ApiError(
          'Network error communicating with Gemini API',
          503,
          CONSTANTS.ERROR_CODES.NETWORK_ERROR
        );
      }

      // Generic API error
      throw new ApiError(
        error.message || 'Error communicating with Gemini API',
        500,
        CONSTANTS.ERROR_CODES.API_ERROR
      );
    }

    throw new ApiError(
      'Unknown error occurred',
      500,
      CONSTANTS.ERROR_CODES.API_ERROR
    );
  }
}

// Singleton instance
let clientInstance: GeminiClient | null = null;

export function getGeminiClient(): GeminiClient {
  if (!clientInstance) {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      throw new ApiError(
        'GEMINI_API_KEY environment variable is not set',
        500,
        CONSTANTS.ERROR_CODES.INVALID_API_KEY
      );
    }
    clientInstance = new GeminiClient(apiKey);
  }
  return clientInstance;
}

