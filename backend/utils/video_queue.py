"""
Video job queue system for tracking video generation jobs
"""
import os
import json
import uuid
from datetime import datetime
from pathlib import Path

# Storage configuration
STORAGE_DIR = Path(__file__).parent.parent / ".video-jobs"
JOBS_FILE = STORAGE_DIR / "jobs.json"

class VideoQueue:
    def __init__(self):
        self.jobs = {}
        self._ensure_directory()
        self._load_jobs()
    
    def _ensure_directory(self):
        """Create storage directory if it doesn't exist"""
        STORAGE_DIR.mkdir(parents=True, exist_ok=True)
    
    def _load_jobs(self):
        """Load jobs from disk"""
        if JOBS_FILE.exists():
            try:
                with open(JOBS_FILE, 'r') as f:
                    data = json.load(f)
                    self.jobs = {
                        job_id: {**job, "createdAt": datetime.fromisoformat(job["createdAt"]), "updatedAt": datetime.fromisoformat(job["updatedAt"])}
                        for job_id, job in data.items()
                    }
                print(f"Loaded {len(self.jobs)} video jobs from storage")
            except Exception as e:
                print(f"Error loading video jobs: {e}")
                self.jobs = {}
    
    def _save_jobs(self):
        """Save jobs to disk"""
        try:
            data = {
                job_id: {**job, "createdAt": job["createdAt"].isoformat(), "updatedAt": job["updatedAt"].isoformat()}
                for job_id, job in self.jobs.items()
            }
            with open(JOBS_FILE, 'w') as f:
                json.dump(data, f, indent=2)
        except Exception as e:
            print(f"Error saving video jobs: {e}")
    
    def create_job(self, data: dict) -> dict:
        """Create a new job"""
        job_id = str(uuid.uuid4())
        job = {
            "id": job_id,
            "userId": data.get("userId", "anonymous"),
            "prompt": data.get("prompt", ""),
            "model": data.get("model", "veo-3.1-fast-generate-preview"),
            "mode": data.get("mode", "text"),
            "status": data.get("status", "pending"),
            "progress": data.get("progress", 0),
            "createdAt": datetime.now(),
            "updatedAt": datetime.now()
        }
        
        self.jobs[job_id] = job
        self._save_jobs()
        
        return job
    
    def update_job(self, job_id: str, updates: dict) -> dict:
        """Update a job"""
        if job_id not in self.jobs:
            return None
        
        self.jobs[job_id].update(updates)
        self.jobs[job_id]["updatedAt"] = datetime.now()
        
        if updates.get("status") == "completed":
            self.jobs[job_id]["completedAt"] = datetime.now()
        
        self._save_jobs()
        
        return self.jobs[job_id]
    
    def get_job(self, job_id: str) -> dict:
        """Get a job by ID"""
        return self.jobs.get(job_id)
    
    def list_jobs(self, user_id: str) -> list:
        """List all jobs for a user"""
        user_jobs = [job.copy() for job in self.jobs.values() if job["userId"] == user_id]
        # Convert datetime objects to ISO format strings for JSON serialization
        for job in user_jobs:
            job["createdAt"] = job["createdAt"].isoformat()
            job["updatedAt"] = job["updatedAt"].isoformat()
            if "completedAt" in job:
                job["completedAt"] = job["completedAt"].isoformat()
        # Sort by creation date (newest first)
        user_jobs.sort(key=lambda x: x["createdAt"], reverse=True)
        return user_jobs

# Singleton instance
_queue_instance = None

def get_video_queue() -> VideoQueue:
    """Get the singleton video queue instance"""
    global _queue_instance
    if _queue_instance is None:
        _queue_instance = VideoQueue()
    return _queue_instance

