import { RateLimitStorage } from '@/types';

/**
 * In-memory storage for rate limiting
 * Suitable for single-instance deployments
 */
export class MemoryStorage implements RateLimitStorage {
  private store: Map<string, { value: number; expiry: number }> = new Map();
  private cleanupInterval: NodeJS.Timeout;

  constructor() {
    // Clean up expired keys every minute
    this.cleanupInterval = setInterval(() => this.cleanup(), 60000);
  }

  async get(key: string): Promise<number | null> {
    const item = this.store.get(key);
    if (!item) return null;

    // Check if expired
    if (Date.now() > item.expiry) {
      this.store.delete(key);
      return null;
    }

    return item.value;
  }

  async set(key: string, value: number, ttl: number): Promise<void> {
    const expiry = Date.now() + ttl * 1000;
    this.store.set(key, { value, expiry });
  }

  async increment(key: string): Promise<number> {
    const current = await this.get(key);
    const newValue = (current || 0) + 1;
    
    // If key exists, maintain its expiry; otherwise set default 1 hour
    const existingItem = this.store.get(key);
    const expiry = existingItem ? existingItem.expiry : Date.now() + 3600000;
    
    this.store.set(key, { value: newValue, expiry });
    return newValue;
  }

  async delete(key: string): Promise<void> {
    this.store.delete(key);
  }

  async clear(): Promise<void> {
    this.store.clear();
  }

  private cleanup(): void {
    const now = Date.now();
    for (const [key, item] of this.store.entries()) {
      if (now > item.expiry) {
        this.store.delete(key);
      }
    }
  }

  destroy(): void {
    clearInterval(this.cleanupInterval);
    this.store.clear();
  }
}

/**
 * Redis storage for rate limiting
 * Suitable for multi-instance production deployments
 * Note: Requires Redis connection
 */
export class RedisStorage implements RateLimitStorage {
  private client: any; // Would use actual Redis client type

  constructor(_redisUrl: string) {
    // In a real implementation, initialize Redis client here
    // For now, this is a placeholder
    throw new Error('Redis storage not yet implemented. Use memory storage.');
  }

  async get(_key: string): Promise<number | null> {
    // Implementation would use Redis GET
    throw new Error('Not implemented');
  }

  async set(_key: string, _value: number, _ttl: number): Promise<void> {
    // Implementation would use Redis SETEX
    throw new Error('Not implemented');
  }

  async increment(_key: string): Promise<number> {
    // Implementation would use Redis INCR
    throw new Error('Not implemented');
  }

  async delete(_key: string): Promise<void> {
    // Implementation would use Redis DEL
    throw new Error('Not implemented');
  }

  async clear(): Promise<void> {
    // Implementation would use Redis FLUSHDB (careful!)
    throw new Error('Not implemented');
  }
}

// Singleton instance
let storageInstance: RateLimitStorage | null = null;

export function getStorage(type: 'memory' | 'redis', redisUrl?: string): RateLimitStorage {
  if (!storageInstance) {
    if (type === 'redis') {
      if (!redisUrl) {
        throw new Error('Redis URL required for Redis storage');
      }
      storageInstance = new RedisStorage(redisUrl);
    } else {
      storageInstance = new MemoryStorage();
    }
  }
  return storageInstance;
}

