"""Video job queue system for tracking video generation jobs."""

import json
import uuid
from datetime import datetime
from typing import Any, Dict, List, Optional

from utils.database import get_connection, initialize_database


class VideoQueue:
    """Persist video generation job state in SQLite."""

    def __init__(self):
        initialize_database()

    def _row_to_job(self, row) -> Dict[str, Any]:
        details: Optional[Dict[str, Any]] = None
        if row["details"]:
            try:
                details = json.loads(row["details"])
            except json.JSONDecodeError:
                details = None

        job = {
            "id": row["id"],
            "jobId": row["job_id"] or row["id"],
            "operationId": row["operation_id"],
            "userId": row["user_id"],
            "prompt": row["prompt"] or "",
            "model": row["model"] or "",
            "mode": row["mode"],
            "status": row["status"],
            "progress": row["progress"],
            "error": row["error"],
            "details": details,
            "videoUrl": row["video_url"],
            "videoData": row["video_data"],
            "mediaId": row["media_id"],
            "createdAt": datetime.fromisoformat(row["created_at"]),
            "updatedAt": datetime.fromisoformat(row["updated_at"]),
        }

        if row["completed_at"]:
            job["completedAt"] = datetime.fromisoformat(row["completed_at"])

        return job

    def create_job(self, data: Dict[str, Any]) -> Dict[str, Any]:
        """Create and persist a new job."""
        internal_id = data.get("id") or data.get("jobId") or str(uuid.uuid4())
        external_job_id = data.get("jobId") or internal_id
        operation_id = data.get("operationId")
        if not operation_id and data.get("jobId") and data["jobId"] != internal_id:
            operation_id = data["jobId"]

        now = datetime.now().isoformat()
        details_json = json.dumps(data.get("details")) if data.get("details") is not None else None

        with get_connection() as conn:
            conn.execute(
                """
                INSERT OR REPLACE INTO video_jobs (
                    id, job_id, operation_id, user_id, prompt, model, mode,
                    status, progress, error, details, video_url, video_data,
                    media_id, created_at, updated_at, completed_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    internal_id,
                    external_job_id,
                    operation_id,
                    data.get("userId", "anonymous"),
                    data.get("prompt", ""),
                    data.get("model", "veo-3.1-fast-generate-preview"),
                    data.get("mode", "text"),
                    data.get("status", "pending"),
                    int(data.get("progress", 0)),
                    data.get("error"),
                    details_json,
                    data.get("videoUrl"),
                    data.get("videoData"),
                    data.get("mediaId"),
                    now,
                    now,
                    None,
                ),
            )
            conn.commit()

            row = conn.execute(
                "SELECT * FROM video_jobs WHERE id = ?",
                (internal_id,),
            ).fetchone()

        return self._row_to_job(row)

    def update_job(self, job_id: str, updates: Dict[str, Any]) -> Optional[Dict[str, Any]]:
        """Update persisted job metadata."""
        internal_id = self._resolve_job_id(job_id)
        if not internal_id:
            return None

        fields: List[str] = []
        values: List[Any] = []

        for key, value in updates.items():
            if key == "details":
                fields.append("details = ?")
                values.append(json.dumps(value) if value is not None else None)
            elif key in {"status", "prompt", "model", "mode", "error", "videoUrl", "videoData", "mediaId"}:
                column = {
                    "status": "status",
                    "prompt": "prompt",
                    "model": "model",
                    "mode": "mode",
                    "error": "error",
                    "videoUrl": "video_url",
                    "videoData": "video_data",
                    "mediaId": "media_id",
                }[key]
                fields.append(f"{column} = ?")
                values.append(value)
            elif key == "progress":
                fields.append("progress = ?")
                values.append(int(value))

        if not fields:
            return self.get_job(internal_id)

        fields.append("updated_at = ?")
        values.append(datetime.now().isoformat())

        if updates.get("status") == "completed":
            fields.append("completed_at = ?")
            values.append(datetime.now().isoformat())
        elif "completedAt" in updates and updates["completedAt"] is None:
            fields.append("completed_at = ?")
            values.append(None)

        values.append(internal_id)

        query = f"UPDATE video_jobs SET {', '.join(fields)} WHERE id = ?"

        with get_connection() as conn:
            conn.execute(query, values)
            conn.commit()
            row = conn.execute(
                "SELECT * FROM video_jobs WHERE id = ?",
                (internal_id,),
            ).fetchone()

        return self._row_to_job(row) if row else None

    def get_job(self, job_id: str) -> Optional[Dict[str, Any]]:
        """Get a job by ID or external reference."""
        internal_id = self._resolve_job_id(job_id)
        if not internal_id:
            return None

        with get_connection() as conn:
            row = conn.execute(
                "SELECT * FROM video_jobs WHERE id = ?",
                (internal_id,),
            ).fetchone()

        return self._row_to_job(row) if row else None

    def list_jobs(self, user_id: str) -> List[Dict[str, Any]]:
        """List all jobs for a user ordered by creation time."""
        with get_connection() as conn:
            rows = conn.execute(
                "SELECT * FROM video_jobs WHERE user_id = ? ORDER BY datetime(created_at) DESC",
                (user_id,),
            ).fetchall()

        jobs = [self._row_to_job(row) for row in rows]

        # Convert datetimes to ISO strings for API responses
        for job in jobs:
            job["createdAt"] = job["createdAt"].isoformat()
            job["updatedAt"] = job["updatedAt"].isoformat()
            if "completedAt" in job:
                job["completedAt"] = job["completedAt"].isoformat()

        return jobs

    def _resolve_job_id(self, job_id: str) -> Optional[str]:
        """Resolve external identifiers (operation name) to the stored job ID."""
        with get_connection() as conn:
            row = conn.execute(
                "SELECT id FROM video_jobs WHERE id = ? OR job_id = ? OR operation_id = ?",
                (job_id, job_id, job_id),
            ).fetchone()

        return row["id"] if row else None


# Singleton instance
_queue_instance = None


def get_video_queue() -> VideoQueue:
    """Get the singleton video queue instance"""
    global _queue_instance
    if _queue_instance is None:
        _queue_instance = VideoQueue()
    return _queue_instance

