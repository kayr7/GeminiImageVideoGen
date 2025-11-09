import fs from 'fs';
import path from 'path';
import crypto from 'crypto';

// Storage directories
const STORAGE_ROOT = path.join(process.cwd(), '.media-storage');
const VIDEOS_DIR = path.join(STORAGE_ROOT, 'videos');
const IMAGES_DIR = path.join(STORAGE_ROOT, 'images');
const METADATA_FILE = path.join(STORAGE_ROOT, 'metadata.json');

// Retention period (30 days)
const RETENTION_DAYS = 30;

export interface MediaMetadata {
  id: string;
  type: 'image' | 'video';
  filename: string;
  prompt: string;
  model: string;
  userId: string;
  createdAt: Date;
  fileSize: number;
  mimeType: string;
}

class MediaStorage {
  private metadata: MediaMetadata[] = [];

  constructor() {
    this.ensureDirectories();
    this.loadMetadata();
    this.startCleanupTimer();
  }

  private ensureDirectories() {
    [STORAGE_ROOT, VIDEOS_DIR, IMAGES_DIR].forEach(dir => {
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
    });
  }

  private loadMetadata() {
    if (fs.existsSync(METADATA_FILE)) {
      try {
        const data = fs.readFileSync(METADATA_FILE, 'utf8');
        this.metadata = JSON.parse(data).map((item: any) => ({
          ...item,
          createdAt: new Date(item.createdAt),
        }));
      } catch (error) {
        console.error('Error loading media metadata:', error);
        this.metadata = [];
      }
    }
  }

  private saveMetadata() {
    try {
      fs.writeFileSync(METADATA_FILE, JSON.stringify(this.metadata, null, 2), 'utf8');
    } catch (error) {
      console.error('Error saving media metadata:', error);
    }
  }

  private startCleanupTimer() {
    // Clean up old files every 24 hours
    const interval = 24 * 60 * 60 * 1000;
    setInterval(() => this.cleanupOldFiles(), interval);
    // Also run cleanup on startup
    setTimeout(() => this.cleanupOldFiles(), 5000);
  }

  private cleanupOldFiles() {
    const now = new Date();
    const cutoffDate = new Date(now.getTime() - RETENTION_DAYS * 24 * 60 * 60 * 1000);
    
    const itemsToRemove: string[] = [];
    
    this.metadata.forEach(item => {
      if (item.createdAt.getTime() < cutoffDate.getTime()) {
        const filePath = this.getFilePath(item.type, item.filename);
        try {
          if (fs.existsSync(filePath)) {
            fs.unlinkSync(filePath);
          }
          itemsToRemove.push(item.id);
        } catch (error) {
          console.error(`Error deleting old file ${item.filename}:`, error);
        }
      }
    });

    if (itemsToRemove.length > 0) {
      this.metadata = this.metadata.filter(item => !itemsToRemove.includes(item.id));
      this.saveMetadata();
      console.log(`Cleaned up ${itemsToRemove.length} old media files`);
    }
  }

  private getFilePath(type: 'image' | 'video', filename: string): string {
    return type === 'video' 
      ? path.join(VIDEOS_DIR, filename)
      : path.join(IMAGES_DIR, filename);
  }

  /**
   * Save media to disk and return the media ID
   */
  saveMedia(
    type: 'image' | 'video',
    base64Data: string,
    metadata: {
      prompt: string;
      model: string;
      userId: string;
      mimeType?: string;
    }
  ): string {
    // Generate unique ID and filename
    const id = crypto.randomUUID();
    const extension = this.getExtensionFromMimeType(metadata.mimeType || (type === 'video' ? 'video/mp4' : 'image/png'));
    const filename = `${id}.${extension}`;
    const filePath = this.getFilePath(type, filename);

    // Convert base64 to buffer and save
    const buffer = Buffer.from(base64Data, 'base64');
    fs.writeFileSync(filePath, buffer);

    // Save metadata
    const mediaMetadata: MediaMetadata = {
      id,
      type,
      filename,
      prompt: metadata.prompt,
      model: metadata.model,
      userId: metadata.userId,
      createdAt: new Date(),
      fileSize: buffer.length,
      mimeType: metadata.mimeType || (type === 'video' ? 'video/mp4' : 'image/png'),
    };

    this.metadata.push(mediaMetadata);
    this.saveMetadata();

    console.log(`Saved ${type} to disk: ${filename} (${(buffer.length / 1024 / 1024).toFixed(2)} MB)`);

    return id;
  }

  /**
   * Retrieve media from disk by ID
   */
  getMedia(id: string): { data: Buffer; metadata: MediaMetadata } | null {
    const metadata = this.metadata.find(item => item.id === id);
    if (!metadata) {
      return null;
    }

    const filePath = this.getFilePath(metadata.type, metadata.filename);
    if (!fs.existsSync(filePath)) {
      console.error(`Media file not found: ${filePath}`);
      return null;
    }

    const data = fs.readFileSync(filePath);
    return { data, metadata };
  }

  /**
   * Get media as base64 string
   */
  getMediaBase64(id: string): { base64: string; metadata: MediaMetadata } | null {
    const result = this.getMedia(id);
    if (!result) {
      return null;
    }

    return {
      base64: result.data.toString('base64'),
      metadata: result.metadata,
    };
  }

  /**
   * Get media metadata by ID
   */
  getMetadata(id: string): MediaMetadata | null {
    return this.metadata.find(item => item.id === id) || null;
  }

  /**
   * List all media for a user
   */
  listUserMedia(userId: string, type?: 'image' | 'video'): MediaMetadata[] {
    return this.metadata
      .filter(item => item.userId === userId && (!type || item.type === type))
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  }

  /**
   * Get recent media across all users (for admin/debugging)
   */
  listRecentMedia(limit: number = 50, type?: 'image' | 'video'): MediaMetadata[] {
    return this.metadata
      .filter(item => !type || item.type === type)
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
      .slice(0, limit);
  }

  /**
   * Delete media by ID
   */
  deleteMedia(id: string): boolean {
    const metadata = this.metadata.find(item => item.id === id);
    if (!metadata) {
      return false;
    }

    const filePath = this.getFilePath(metadata.type, metadata.filename);
    try {
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
      }
      this.metadata = this.metadata.filter(item => item.id !== id);
      this.saveMetadata();
      return true;
    } catch (error) {
      console.error(`Error deleting media ${id}:`, error);
      return false;
    }
  }

  private getExtensionFromMimeType(mimeType: string): string {
    const map: Record<string, string> = {
      'video/mp4': 'mp4',
      'video/webm': 'webm',
      'image/png': 'png',
      'image/jpeg': 'jpg',
      'image/jpg': 'jpg',
      'image/webp': 'webp',
      'image/gif': 'gif',
    };
    return map[mimeType] || (mimeType.startsWith('video/') ? 'mp4' : 'png');
  }

  /**
   * Get storage statistics
   */
  getStats(): {
    totalFiles: number;
    totalSize: number;
    images: number;
    videos: number;
    oldestFile: Date | null;
    newestFile: Date | null;
  } {
    const images = this.metadata.filter(item => item.type === 'image');
    const videos = this.metadata.filter(item => item.type === 'video');
    const totalSize = this.metadata.reduce((sum, item) => sum + item.fileSize, 0);

    const dates = this.metadata.map(item => item.createdAt.getTime());
    
    return {
      totalFiles: this.metadata.length,
      totalSize,
      images: images.length,
      videos: videos.length,
      oldestFile: dates.length > 0 ? new Date(Math.min(...dates)) : null,
      newestFile: dates.length > 0 ? new Date(Math.max(...dates)) : null,
    };
  }
}

// Singleton instance
let instance: MediaStorage;

export function getMediaStorage(): MediaStorage {
  if (!instance) {
    instance = new MediaStorage();
  }
  return instance;
}

