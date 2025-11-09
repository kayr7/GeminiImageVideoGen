import { ApiError, ValidationError, RateLimitError, NetworkError, handleApiError, retryWithBackoff } from '@/lib/utils/errors';
import { CONSTANTS } from '@/lib/utils/constants';

describe('Error Utils', () => {
  describe('ApiError', () => {
    it('should create API error with default values', () => {
      const error = new ApiError('Test error');
      expect(error.message).toBe('Test error');
      expect(error.statusCode).toBe(500);
      expect(error.code).toBe(CONSTANTS.ERROR_CODES.API_ERROR);
    });

    it('should create API error with custom values', () => {
      const error = new ApiError('Custom error', 404, 'NOT_FOUND');
      expect(error.statusCode).toBe(404);
      expect(error.code).toBe('NOT_FOUND');
    });
  });

  describe('ValidationError', () => {
    it('should create validation error', () => {
      const error = new ValidationError('Invalid input', { field: 'email' });
      expect(error.statusCode).toBe(400);
      expect(error.code).toBe(CONSTANTS.ERROR_CODES.VALIDATION_ERROR);
      expect(error.details).toEqual({ field: 'email' });
    });
  });

  describe('RateLimitError', () => {
    it('should create rate limit error', () => {
      const error = new RateLimitError('Too many requests', 60);
      expect(error.statusCode).toBe(429);
      expect(error.code).toBe(CONSTANTS.ERROR_CODES.RATE_LIMIT_EXCEEDED);
      expect(error.retryAfter).toBe(60);
    });
  });

  describe('NetworkError', () => {
    it('should create network error', () => {
      const error = new NetworkError('Connection failed');
      expect(error.statusCode).toBe(503);
      expect(error.code).toBe(CONSTANTS.ERROR_CODES.NETWORK_ERROR);
    });
  });

  describe('handleApiError', () => {
    it('should handle ApiError', () => {
      const error = new ApiError('Test error', 400, 'BAD_REQUEST');
      const result = handleApiError(error);
      
      expect(result.message).toBe('Test error');
      expect(result.statusCode).toBe(400);
      expect(result.code).toBe('BAD_REQUEST');
    });

    it('should handle generic Error', () => {
      const error = new Error('Generic error');
      const result = handleApiError(error);
      
      expect(result.message).toBe('Generic error');
      expect(result.statusCode).toBe(500);
    });

    it('should handle unknown errors', () => {
      const result = handleApiError('string error');
      
      expect(result.message).toBe('An unexpected error occurred');
      expect(result.statusCode).toBe(500);
    });
  });

  describe('retryWithBackoff', () => {
    it('should succeed on first attempt', async () => {
      const fn = jest.fn().mockResolvedValue('success');
      const result = await retryWithBackoff(fn, 3, 100);
      
      expect(result).toBe('success');
      expect(fn).toHaveBeenCalledTimes(1);
    });

    it('should retry on network errors', async () => {
      const fn = jest.fn()
        .mockRejectedValueOnce(new Error('network error'))
        .mockResolvedValue('success');
      
      const result = await retryWithBackoff(fn, 3, 100);
      
      expect(result).toBe('success');
      expect(fn).toHaveBeenCalledTimes(2);
    });

    it('should not retry validation errors', async () => {
      const fn = jest.fn().mockRejectedValue(new ValidationError('Invalid'));
      
      await expect(retryWithBackoff(fn, 3, 100)).rejects.toThrow(ValidationError);
      expect(fn).toHaveBeenCalledTimes(1);
    });

    it('should not retry rate limit errors', async () => {
      const fn = jest.fn().mockRejectedValue(new RateLimitError('Rate limited', 60));
      
      await expect(retryWithBackoff(fn, 3, 100)).rejects.toThrow(RateLimitError);
      expect(fn).toHaveBeenCalledTimes(1);
    });

    it('should throw after max attempts', async () => {
      const fn = jest.fn().mockRejectedValue(new Error('network error'));
      
      await expect(retryWithBackoff(fn, 3, 10)).rejects.toThrow('network error');
      expect(fn).toHaveBeenCalledTimes(3);
    });
  });
});

