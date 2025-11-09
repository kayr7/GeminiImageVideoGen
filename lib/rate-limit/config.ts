import { RateLimitConfig } from '@/types';
import { CONSTANTS } from '../utils/constants';

export function getRateLimitConfig(): RateLimitConfig {
  return {
    image: {
      hourly: parseInt(
        process.env.IMAGE_MAX_PER_HOUR ||
          String(CONSTANTS.DEFAULT_RATE_LIMITS.IMAGE.HOURLY)
      ),
      daily: parseInt(
        process.env.IMAGE_MAX_PER_DAY ||
          String(CONSTANTS.DEFAULT_RATE_LIMITS.IMAGE.DAILY)
      ),
    },
    video: {
      hourly: parseInt(
        process.env.VIDEO_MAX_PER_HOUR ||
          String(CONSTANTS.DEFAULT_RATE_LIMITS.VIDEO.HOURLY)
      ),
      daily: parseInt(
        process.env.VIDEO_MAX_PER_DAY ||
          String(CONSTANTS.DEFAULT_RATE_LIMITS.VIDEO.DAILY)
      ),
    },
    music: {
      hourly: parseInt(
        process.env.MUSIC_MAX_PER_HOUR ||
          String(CONSTANTS.DEFAULT_RATE_LIMITS.MUSIC.HOURLY)
      ),
      daily: parseInt(
        process.env.MUSIC_MAX_PER_DAY ||
          String(CONSTANTS.DEFAULT_RATE_LIMITS.MUSIC.DAILY)
      ),
    },
    storage: (process.env.RATE_LIMIT_STORAGE as 'memory' | 'redis') || 'memory',
    redisUrl: process.env.REDIS_URL,
  };
}

export const rateLimitConfig = getRateLimitConfig();

