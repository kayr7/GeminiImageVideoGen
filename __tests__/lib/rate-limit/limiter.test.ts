import { RateLimiter } from '@/lib/rate-limit/limiter';
import { MemoryStorage } from '@/lib/rate-limit/storage';
import { RateLimitConfig } from '@/types';

describe('RateLimiter', () => {
  let storage: MemoryStorage;
  let limiter: RateLimiter;
  let config: RateLimitConfig;

  beforeEach(() => {
    storage = new MemoryStorage();
    config = {
      image: { hourly: 5, daily: 10 },
      video: { hourly: 2, daily: 5 },
      music: { hourly: 3, daily: 8 },
      storage: 'memory',
    };
    limiter = new RateLimiter(storage, config);
  });

  afterEach(async () => {
    await storage.clear();
  });

  describe('checkLimit', () => {
    it('should allow requests within limits', async () => {
      const result = await limiter.checkLimit('user1', 'image');
      expect(result.allowed).toBe(true);
      expect(result.remaining).toBe(5);
    });

    it('should enforce hourly limits', async () => {
      // Make max requests
      for (let i = 0; i < config.image.hourly; i++) {
        await limiter.incrementUsage('user1', 'image');
      }

      const result = await limiter.checkLimit('user1', 'image');
      expect(result.allowed).toBe(false);
      expect(result.retryAfter).toBeGreaterThan(0);
    });

    it('should track usage per user', async () => {
      await limiter.incrementUsage('user1', 'image');
      await limiter.incrementUsage('user2', 'image');

      const result1 = await limiter.checkLimit('user1', 'image');
      const result2 = await limiter.checkLimit('user2', 'image');

      expect(result1.remaining).toBe(4);
      expect(result2.remaining).toBe(4);
    });

    it('should track usage per resource', async () => {
      await limiter.incrementUsage('user1', 'image');
      await limiter.incrementUsage('user1', 'video');

      const imageResult = await limiter.checkLimit('user1', 'image');
      const videoResult = await limiter.checkLimit('user1', 'video');

      expect(imageResult.remaining).toBe(4);
      expect(videoResult.remaining).toBe(1);
    });
  });

  describe('incrementUsage', () => {
    it('should increment usage counter', async () => {
      await limiter.incrementUsage('user1', 'image');
      const result = await limiter.checkLimit('user1', 'image');
      expect(result.remaining).toBe(4);
    });

    it('should increment multiple times', async () => {
      await limiter.incrementUsage('user1', 'image');
      await limiter.incrementUsage('user1', 'image');
      await limiter.incrementUsage('user1', 'image');
      
      const result = await limiter.checkLimit('user1', 'image');
      expect(result.remaining).toBe(2);
    });
  });

  describe('getUsageStats', () => {
    it('should return usage statistics', async () => {
      await limiter.incrementUsage('user1', 'image');
      await limiter.incrementUsage('user1', 'video');

      const stats = await limiter.getUsageStats('user1');

      expect(stats.image.current).toBe(1);
      expect(stats.image.limit).toBe(config.image.hourly);
      expect(stats.video.current).toBe(1);
      expect(stats.video.limit).toBe(config.video.hourly);
      expect(stats.music.current).toBe(0);
    });
  });

  describe('enforceLimit', () => {
    it('should allow and increment on success', async () => {
      await limiter.enforceLimit('user1', 'image');
      const result = await limiter.checkLimit('user1', 'image');
      expect(result.remaining).toBe(4);
    });

    it('should throw error when limit exceeded', async () => {
      // Fill up the quota
      for (let i = 0; i < config.image.hourly; i++) {
        await limiter.incrementUsage('user1', 'image');
      }

      await expect(limiter.enforceLimit('user1', 'image')).rejects.toThrow('Rate limit exceeded');
    });
  });
});

