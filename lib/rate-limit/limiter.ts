import { RateLimitResult, RateLimitConfig, UsageStats } from '@/types';
import { RateLimitStorage } from '@/types';
import { RateLimitError } from '../utils/errors';

export class RateLimiter {
  constructor(
    private storage: RateLimitStorage,
    private config: RateLimitConfig
  ) {}

  /**
   * Check if a request is allowed based on rate limits
   */
  async checkLimit(
    userId: string,
    resource: 'image' | 'video' | 'music' | 'speech'
  ): Promise<RateLimitResult> {
    const now = new Date();
    const hourKey = this.getHourKey(userId, resource, now);
    const dayKey = this.getDayKey(userId, resource, now);

    // Get current usage
    const hourlyUsage = (await this.storage.get(hourKey)) || 0;
    const dailyUsage = (await this.storage.get(dayKey)) || 0;

    // Get limits
    const limits = this.config[resource];

    // Check hourly limit
    if (hourlyUsage >= limits.hourly) {
      const resetAt = this.getNextHour(now);
      const retryAfter = Math.ceil((resetAt.getTime() - now.getTime()) / 1000);
      
      return {
        allowed: false,
        remaining: 0,
        resetAt,
        retryAfter,
      };
    }

    // Check daily limit
    if (dailyUsage >= limits.daily) {
      const resetAt = this.getNextDay(now);
      const retryAfter = Math.ceil((resetAt.getTime() - now.getTime()) / 1000);
      
      return {
        allowed: false,
        remaining: 0,
        resetAt,
        retryAfter,
      };
    }

    // Calculate remaining quota (use the more restrictive one)
    const hourlyRemaining = limits.hourly - hourlyUsage;
    const dailyRemaining = limits.daily - dailyUsage;
    const remaining = Math.min(hourlyRemaining, dailyRemaining);

    return {
      allowed: true,
      remaining,
      resetAt: this.getNextHour(now),
    };
  }

  /**
   * Increment usage counter for a resource
   */
  async incrementUsage(
    userId: string,
    resource: 'image' | 'video' | 'music' | 'speech'
  ): Promise<void> {
    const now = new Date();
    const hourKey = this.getHourKey(userId, resource, now);
    const dayKey = this.getDayKey(userId, resource, now);

    // Increment both counters
    await this.storage.increment(hourKey);
    await this.storage.increment(dayKey);

    // Set TTL if not already set
    const hourTTL = this.getSecondsUntilNextHour(now);
    const dayTTL = this.getSecondsUntilNextDay(now);

    await this.storage.set(hourKey, await this.storage.get(hourKey) || 0, hourTTL);
    await this.storage.set(dayKey, await this.storage.get(dayKey) || 0, dayTTL);
  }

  /**
   * Get current usage statistics
   */
  async getUsageStats(userId: string): Promise<UsageStats> {
    const now = new Date();

    const imageHourly = (await this.storage.get(this.getHourKey(userId, 'image', now))) || 0;
    const videoHourly = (await this.storage.get(this.getHourKey(userId, 'video', now))) || 0;
    const musicHourly = (await this.storage.get(this.getHourKey(userId, 'music', now))) || 0;
    const speechHourly = (await this.storage.get(this.getHourKey(userId, 'speech', now))) || 0;

    return {
      image: {
        current: imageHourly,
        limit: this.config.image.hourly,
      },
      video: {
        current: videoHourly,
        limit: this.config.video.hourly,
      },
      music: {
        current: musicHourly,
        limit: this.config.music.hourly,
      },
      speech: {
        current: speechHourly,
        limit: this.config.speech.hourly,
      },
    };
  }

  /**
   * Check and enforce rate limit in one operation
   */
  async enforceLimit(
    userId: string,
    resource: 'image' | 'video' | 'music' | 'speech'
  ): Promise<void> {
    const result = await this.checkLimit(userId, resource);

    if (!result.allowed) {
      throw new RateLimitError(
        `Rate limit exceeded for ${resource} generation. Try again in ${result.retryAfter} seconds.`,
        result.retryAfter || 0
      );
    }

    await this.incrementUsage(userId, resource);
  }

  // Helper methods for key generation
  private getHourKey(userId: string, resource: string, date: Date): string {
    const hour = `${date.getFullYear()}-${date.getMonth() + 1}-${date.getDate()}-${date.getHours()}`;
    return `ratelimit:${userId}:${resource}:hour:${hour}`;
  }

  private getDayKey(userId: string, resource: string, date: Date): string {
    const day = `${date.getFullYear()}-${date.getMonth() + 1}-${date.getDate()}`;
    return `ratelimit:${userId}:${resource}:day:${day}`;
  }

  private getNextHour(date: Date): Date {
    const next = new Date(date);
    next.setHours(next.getHours() + 1, 0, 0, 0);
    return next;
  }

  private getNextDay(date: Date): Date {
    const next = new Date(date);
    next.setDate(next.getDate() + 1);
    next.setHours(0, 0, 0, 0);
    return next;
  }

  private getSecondsUntilNextHour(date: Date): number {
    const next = this.getNextHour(date);
    return Math.ceil((next.getTime() - date.getTime()) / 1000);
  }

  private getSecondsUntilNextDay(date: Date): number {
    const next = this.getNextDay(date);
    return Math.ceil((next.getTime() - date.getTime()) / 1000);
  }
}

// Singleton instance
let limiterInstance: RateLimiter | null = null;

export function getRateLimiter(storage: RateLimitStorage, config: RateLimitConfig): RateLimiter {
  if (!limiterInstance) {
    limiterInstance = new RateLimiter(storage, config);
  }
  return limiterInstance;
}

