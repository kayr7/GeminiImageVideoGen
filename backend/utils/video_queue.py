"""Video job queue system for tracking video generation jobs."""

import json
import uuid
from datetime import datetime, timedelta
from typing import Any, Dict, Iterable, List, Optional

from utils import media_inputs
from utils.database import get_connection, initialize_database


# API field name -> column. Video bytes are intentionally NOT persisted here:
# the finished video lives in the media store and jobs only reference its mediaId.
_UPDATABLE_COLUMNS = {
    "status": "status",
    "prompt": "prompt",
    "model": "model",
    "mode": "mode",
    "error": "error",
    "mediaId": "media_id",
    "operationId": "operation_id",
}


# Explicit column list: legacy rows may hold huge video_url/video_data blobs that are never read.
_JOB_COLUMNS = (
    "id, job_id, operation_id, user_id, prompt, model, mode, status, progress, error, "
    "details, media_id, ip_address, created_at, updated_at, completed_at"
)


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
            "mediaId": row["media_id"],
            "ipAddress": row["ip_address"],
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
                    status, progress, error, details,
                    media_id, ip_address, created_at, updated_at, completed_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    internal_id,
                    external_job_id,
                    operation_id,
                    data.get("userId", "anonymous"),
                    data.get("prompt", ""),
                    data.get("model", "gemini-omni-1.1-flash"),
                    data.get("mode", "text"),
                    data.get("status", "pending"),
                    int(data.get("progress", 0)),
                    data.get("error"),
                    details_json,
                    data.get("mediaId"),
                    data.get("ipAddress"),
                    now,
                    now,
                    None,
                ),
            )
            conn.commit()

            row = conn.execute(
                f"SELECT {_JOB_COLUMNS} FROM video_jobs WHERE id = ?",
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
            elif key in _UPDATABLE_COLUMNS:
                fields.append(f"{_UPDATABLE_COLUMNS[key]} = ?")
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

        # Input images are only needed until the job is finished: drop them from the row.
        if "details" not in updates and updates.get("status") in ("completed", "failed"):
            current = self.get_job(internal_id)
            if current and media_inputs.has_inline_inputs(current.get("details")):
                fields.append("details = ?")
                values.append(json.dumps(media_inputs.strip_inline_inputs(current["details"])))

        values.append(internal_id)

        query = f"UPDATE video_jobs SET {', '.join(fields)} WHERE id = ?"

        with get_connection() as conn:
            conn.execute(query, values)
            conn.commit()
            row = conn.execute(
                f"SELECT {_JOB_COLUMNS} FROM video_jobs WHERE id = ?",
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
                f"SELECT {_JOB_COLUMNS} FROM video_jobs WHERE id = ?",
                (internal_id,),
            ).fetchone()

        return self._row_to_job(row) if row else None

    def list_jobs(self, user_id: str) -> List[Dict[str, Any]]:
        """List all jobs for a user, newest first (timestamps as ISO strings)."""
        with get_connection() as conn:
            rows = conn.execute(
                f"SELECT {_JOB_COLUMNS} FROM video_jobs WHERE user_id = ? ORDER BY datetime(created_at) DESC",
                (user_id,),
            ).fetchall()

        jobs = [self._row_to_job(row) for row in rows]

        for job in jobs:
            job["createdAt"] = job["createdAt"].isoformat()
            job["updatedAt"] = job["updatedAt"].isoformat()
            if "completedAt" in job:
                job["completedAt"] = job["completedAt"].isoformat()

        return jobs

    def fail_unresumable_jobs(
        self,
        known_models: Iterable[str],
        max_age: timedelta = timedelta(hours=1),
    ) -> int:
        """Mark unfinished jobs that can never complete as failed (run at startup).

        A job is unresumable when its model is no longer in the registry (e.g. the
        retired Veo models), when it has no remote interaction id to poll, or when
        it has been unfinished for longer than ``max_age``.
        """
        known = set(known_models)
        cutoff = datetime.now() - max_age
        with get_connection() as conn:
            rows = conn.execute(
                "SELECT id, model, operation_id, created_at FROM video_jobs "
                "WHERE status IN ('processing', 'pending')"
            ).fetchall()

        failed = 0
        for row in rows:
            try:
                created = datetime.fromisoformat(row["created_at"])
            except (TypeError, ValueError):
                created = datetime.min
            if row["model"] not in known:
                reason = (
                    f"Video model '{row['model']}' is no longer available; "
                    "the job could not be completed. Please start a new video."
                )
            elif not row["operation_id"]:
                reason = "The job was interrupted by a server restart. Please start a new video."
            elif created < cutoff:
                reason = "The job did not finish in time and was abandoned. Please start a new video."
            else:
                continue
            self.update_job(row["id"], {"status": "failed", "error": reason})
            failed += 1
        return failed

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

