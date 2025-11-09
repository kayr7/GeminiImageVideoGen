import { MemoryStorage } from '@/lib/rate-limit/storage';

describe('MemoryStorage', () => {
  let storage: MemoryStorage;

  beforeEach(() => {
    storage = new MemoryStorage();
  });

  afterEach(() => {
    storage.destroy();
  });

  describe('get/set', () => {
    it('should store and retrieve values', async () => {
      await storage.set('key1', 42, 3600);
      const value = await storage.get('key1');
      expect(value).toBe(42);
    });

    it('should return null for non-existent keys', async () => {
      const value = await storage.get('nonexistent');
      expect(value).toBeNull();
    });

    it('should expire values after TTL', async () => {
      await storage.set('key1', 42, 0); // 0 second TTL
      
      // Wait a moment
      await new Promise(resolve => setTimeout(resolve, 100));
      
      const value = await storage.get('key1');
      expect(value).toBeNull();
    });
  });

  describe('increment', () => {
    it('should increment non-existent keys from 0', async () => {
      const value = await storage.increment('counter');
      expect(value).toBe(1);
    });

    it('should increment existing values', async () => {
      await storage.set('counter', 5, 3600);
      const value = await storage.increment('counter');
      expect(value).toBe(6);
    });

    it('should increment multiple times', async () => {
      await storage.increment('counter');
      await storage.increment('counter');
      const value = await storage.increment('counter');
      expect(value).toBe(3);
    });
  });

  describe('delete', () => {
    it('should delete keys', async () => {
      await storage.set('key1', 42, 3600);
      await storage.delete('key1');
      const value = await storage.get('key1');
      expect(value).toBeNull();
    });
  });

  describe('clear', () => {
    it('should clear all keys', async () => {
      await storage.set('key1', 1, 3600);
      await storage.set('key2', 2, 3600);
      await storage.clear();
      
      const value1 = await storage.get('key1');
      const value2 = await storage.get('key2');
      
      expect(value1).toBeNull();
      expect(value2).toBeNull();
    });
  });
});

