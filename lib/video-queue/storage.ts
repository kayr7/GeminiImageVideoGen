/**
 * Video Job Queue Storage
 * Stores video generation jobs with status tracking
 */

import fs from 'fs';
import path from 'path';

export interface VideoJob {
  id: string;
  userId: string;
  prompt: string;
  model: string;
  mode: 'text' | 'animate';
  status: 'queued' | 'processing' | 'completed' | 'failed';
  progress: number;
  videoUrl?: string;
  videoData?: string;
  mediaId?: string; // ID for retrieving video from media storage
  error?: string;
  createdAt: Date;
  updatedAt: Date;
  completedAt?: Date;
  sourceImage?: string;
}

class VideoJobStorage {
  private jobs: Map<string, VideoJob> = new Map();
  private storageDir: string;
  private storageFile: string;

  constructor() {
    // Use a temporary directory for job storage
    this.storageDir = path.join(process.cwd(), '.video-jobs');
    this.storageFile = path.join(this.storageDir, 'jobs.json');
    this.loadJobs();
  }

  /**
   * Load jobs from disk
   */
  private loadJobs() {
    try {
      if (!fs.existsSync(this.storageDir)) {
        fs.mkdirSync(this.storageDir, { recursive: true });
      }

      if (fs.existsSync(this.storageFile)) {
        const data = fs.readFileSync(this.storageFile, 'utf-8');
        const jobsArray = JSON.parse(data);
        
        // Convert to Map and parse dates
        jobsArray.forEach((job: any) => {
          job.createdAt = new Date(job.createdAt);
          job.updatedAt = new Date(job.updatedAt);
          if (job.completedAt) {
            job.completedAt = new Date(job.completedAt);
          }
          this.jobs.set(job.id, job);
        });

        console.log(`Loaded ${this.jobs.size} video jobs from storage`);
      }
    } catch (error) {
      console.error('Error loading video jobs:', error);
    }
  }

  /**
   * Save jobs to disk
   */
  private saveJobs() {
    try {
      const jobsArray = Array.from(this.jobs.values());
      fs.writeFileSync(this.storageFile, JSON.stringify(jobsArray, null, 2));
    } catch (error) {
      console.error('Error saving video jobs:', error);
    }
  }

  /**
   * Create a new job
   */
  createJob(jobData: Omit<VideoJob, 'id' | 'status' | 'progress' | 'createdAt' | 'updatedAt'>): VideoJob {
    const job: VideoJob = {
      ...jobData,
      id: `job_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      status: 'queued',
      progress: 0,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    this.jobs.set(job.id, job);
    this.saveJobs();
    return job;
  }

  /**
   * Get a job by ID
   */
  getJob(id: string): VideoJob | undefined {
    return this.jobs.get(id);
  }

  /**
   * Get all jobs for a user
   */
  getUserJobs(userId: string, limit: number = 50): VideoJob[] {
    return Array.from(this.jobs.values())
      .filter(job => job.userId === userId)
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
      .slice(0, limit);
  }

  /**
   * Update a job
   */
  updateJob(id: string, updates: Partial<VideoJob>): VideoJob | undefined {
    const job = this.jobs.get(id);
    if (!job) return undefined;

    const updatedJob = {
      ...job,
      ...updates,
      updatedAt: new Date(),
    };

    if (updates.status === 'completed' || updates.status === 'failed') {
      updatedJob.completedAt = new Date();
    }

    this.jobs.set(id, updatedJob);
    this.saveJobs();
    return updatedJob;
  }

  /**
   * Delete old completed jobs (older than 2 days)
   */
  cleanup() {
    const twoDaysAgo = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000);
    let deletedCount = 0;

    for (const [id, job] of this.jobs.entries()) {
      if (
        (job.status === 'completed' || job.status === 'failed') &&
        job.completedAt &&
        job.completedAt < twoDaysAgo
      ) {
        this.jobs.delete(id);
        deletedCount++;
      }
    }

    if (deletedCount > 0) {
      this.saveJobs();
      console.log(`Cleaned up ${deletedCount} old video jobs`);
    }
  }

  /**
   * Get jobs that need polling (processing jobs)
   */
  getActiveJobs(): VideoJob[] {
    return Array.from(this.jobs.values())
      .filter(job => job.status === 'processing');
  }
}

// Singleton instance
let storageInstance: VideoJobStorage | null = null;

export function getVideoJobStorage(): VideoJobStorage {
  if (!storageInstance) {
    storageInstance = new VideoJobStorage();
    
    // Run cleanup every hour
    setInterval(() => {
      storageInstance?.cleanup();
    }, 60 * 60 * 1000);
  }
  return storageInstance;
}

