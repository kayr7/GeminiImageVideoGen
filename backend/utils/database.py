"""SQLite database utilities for backend storage."""

from __future__ import annotations

import sqlite3
import threading
from contextlib import contextmanager
from pathlib import Path
from typing import Iterator, Iterable

DB_DIR = Path(__file__).parent.parent / ".data"
DB_FILE = DB_DIR / "app.db"

MIGRATIONS: list[tuple[int, Iterable[str]]] = [
    (
        1,
        (
            """
            CREATE TABLE IF NOT EXISTS media (
                id TEXT PRIMARY KEY,
                type TEXT NOT NULL CHECK (type IN ('image', 'video')),
                filename TEXT NOT NULL,
                prompt TEXT,
                model TEXT,
                user_id TEXT NOT NULL,
                created_at TEXT NOT NULL,
                file_size INTEGER NOT NULL,
                mime_type TEXT NOT NULL,
                details TEXT
            )
            """,
            "CREATE INDEX IF NOT EXISTS idx_media_user_created_at ON media(user_id, created_at DESC)",
            "CREATE INDEX IF NOT EXISTS idx_media_type_created_at ON media(type, created_at DESC)",
            """
            CREATE TABLE IF NOT EXISTS video_jobs (
                id TEXT PRIMARY KEY,
                job_id TEXT,
                operation_id TEXT,
                user_id TEXT NOT NULL,
                prompt TEXT,
                model TEXT,
                mode TEXT,
                status TEXT,
                progress INTEGER DEFAULT 0,
                error TEXT,
                details TEXT,
                video_url TEXT,
                video_data TEXT,
                media_id TEXT,
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL,
                completed_at TEXT
            )
            """,
            "CREATE INDEX IF NOT EXISTS idx_video_jobs_user_created_at ON video_jobs(user_id, created_at DESC)",
            "CREATE INDEX IF NOT EXISTS idx_video_jobs_jobid ON video_jobs(job_id)",
            "CREATE INDEX IF NOT EXISTS idx_video_jobs_operationid ON video_jobs(operation_id)",
        ),
    ),
    (
        2,
        (
            # Add IP address tracking for abuse prevention
            "ALTER TABLE media ADD COLUMN ip_address TEXT",
            "CREATE INDEX IF NOT EXISTS idx_media_ip_address ON media(ip_address, created_at DESC)",
            # Add IP address tracking for video jobs as well
            "ALTER TABLE video_jobs ADD COLUMN ip_address TEXT",
            "CREATE INDEX IF NOT EXISTS idx_video_jobs_ip_address ON video_jobs(ip_address, created_at DESC)",
        ),
    ),
    (
        3,
        (
            # User management system
            """
            CREATE TABLE IF NOT EXISTS users (
                id TEXT PRIMARY KEY,
                email TEXT UNIQUE NOT NULL,
                password_hash TEXT,
                is_active INTEGER DEFAULT 1,
                is_admin INTEGER DEFAULT 0,
                require_password_reset INTEGER DEFAULT 1,
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL,
                last_login_at TEXT
            )
            """,
            "CREATE INDEX IF NOT EXISTS idx_users_email ON users(email)",
            "CREATE INDEX IF NOT EXISTS idx_users_active ON users(is_active)",
            "CREATE INDEX IF NOT EXISTS idx_users_admin ON users(is_admin)",
            # Many-to-many relationship between users and admins
            """
            CREATE TABLE IF NOT EXISTS user_admins (
                id TEXT PRIMARY KEY,
                user_id TEXT NOT NULL,
                admin_id TEXT NOT NULL,
                created_at TEXT NOT NULL,
                FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
                FOREIGN KEY (admin_id) REFERENCES users(id) ON DELETE CASCADE,
                UNIQUE(user_id, admin_id)
            )
            """,
            "CREATE INDEX IF NOT EXISTS idx_user_admins_user ON user_admins(user_id)",
            "CREATE INDEX IF NOT EXISTS idx_user_admins_admin ON user_admins(admin_id)",
            # User quotas
            """
            CREATE TABLE IF NOT EXISTS user_quotas (
                id TEXT PRIMARY KEY,
                user_id TEXT NOT NULL,
                generation_type TEXT NOT NULL CHECK (generation_type IN ('image', 'video', 'edit')),
                quota_type TEXT NOT NULL CHECK (quota_type IN ('daily', 'weekly', 'limited', 'unlimited')),
                quota_limit INTEGER,
                quota_used INTEGER DEFAULT 0,
                quota_reset_at TEXT,
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL,
                FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
            )
            """,
            "CREATE INDEX IF NOT EXISTS idx_user_quotas_user_id ON user_quotas(user_id)",
            "CREATE INDEX IF NOT EXISTS idx_user_quotas_type ON user_quotas(user_id, generation_type)",
            "CREATE INDEX IF NOT EXISTS idx_user_quotas_reset ON user_quotas(quota_reset_at)",
            # User sessions (database-backed)
            """
            CREATE TABLE IF NOT EXISTS user_sessions (
                token TEXT PRIMARY KEY,
                user_id TEXT NOT NULL,
                created_at TEXT NOT NULL,
                expires_at TEXT NOT NULL,
                last_activity_at TEXT NOT NULL,
                FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
            )
            """,
            "CREATE INDEX IF NOT EXISTS idx_user_sessions_user_id ON user_sessions(user_id)",
            "CREATE INDEX IF NOT EXISTS idx_user_sessions_expires ON user_sessions(expires_at)",
        ),
    ),
    (
        4,
        (
            # Update quota_type constraint to support 'limited' quota type
            # SQLite doesn't support ALTER TABLE for CHECK constraints, so we recreate the table
            """
            CREATE TABLE IF NOT EXISTS user_quotas_new (
                id TEXT PRIMARY KEY,
                user_id TEXT NOT NULL,
                generation_type TEXT NOT NULL CHECK (generation_type IN ('image', 'video', 'edit')),
                quota_type TEXT NOT NULL CHECK (quota_type IN ('daily', 'weekly', 'limited', 'unlimited')),
                quota_limit INTEGER,
                quota_used INTEGER DEFAULT 0,
                quota_reset_at TEXT,
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL,
                FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
            )
            """,
            # Copy data from old table
            """
            INSERT INTO user_quotas_new (id, user_id, generation_type, quota_type, quota_limit, quota_used, quota_reset_at, created_at, updated_at)
            SELECT id, user_id, generation_type, quota_type, quota_limit, quota_used, quota_reset_at, created_at, updated_at
            FROM user_quotas
            """,
            # Drop old table
            "DROP TABLE user_quotas",
            # Rename new table
            "ALTER TABLE user_quotas_new RENAME TO user_quotas",
            # Recreate indexes
            "CREATE INDEX IF NOT EXISTS idx_user_quotas_user_id ON user_quotas(user_id)",
            "CREATE INDEX IF NOT EXISTS idx_user_quotas_type ON user_quotas(user_id, generation_type)",
            "CREATE INDEX IF NOT EXISTS idx_user_quotas_reset ON user_quotas(quota_reset_at)",
        ),
    ),
    (
        5,
        (
            # Simplify to only image and video quotas (edit counts towards image/video)
            # Remove 'edit' generation type, only allow 'image' and 'video'
            """
            CREATE TABLE IF NOT EXISTS user_quotas_new (
                id TEXT PRIMARY KEY,
                user_id TEXT NOT NULL,
                generation_type TEXT NOT NULL CHECK (generation_type IN ('image', 'video')),
                quota_type TEXT NOT NULL CHECK (quota_type IN ('daily', 'weekly', 'limited', 'unlimited')),
                quota_limit INTEGER,
                quota_used INTEGER DEFAULT 0,
                quota_reset_at TEXT,
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL,
                FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
            )
            """,
            # Copy only image and video quotas (drop edit quotas)
            """
            INSERT INTO user_quotas_new (id, user_id, generation_type, quota_type, quota_limit, quota_used, quota_reset_at, created_at, updated_at)
            SELECT id, user_id, generation_type, quota_type, quota_limit, quota_used, quota_reset_at, created_at, updated_at
            FROM user_quotas
            WHERE generation_type IN ('image', 'video')
            """,
            # Drop old table
            "DROP TABLE user_quotas",
            # Rename new table
            "ALTER TABLE user_quotas_new RENAME TO user_quotas",
            # Recreate indexes
            "CREATE INDEX IF NOT EXISTS idx_user_quotas_user_id ON user_quotas(user_id)",
            "CREATE INDEX IF NOT EXISTS idx_user_quotas_type ON user_quotas(user_id, generation_type)",
            "CREATE INDEX IF NOT EXISTS idx_user_quotas_reset ON user_quotas(quota_reset_at)",
        ),
    ),
    (
        6,
        (
            # User tagging system for organizing users into groups
            """
            CREATE TABLE IF NOT EXISTS user_tags (
                id TEXT PRIMARY KEY,
                user_id TEXT NOT NULL,
                tag TEXT NOT NULL,
                created_at TEXT NOT NULL,
                FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
                UNIQUE(user_id, tag)
            )
            """,
            "CREATE INDEX IF NOT EXISTS idx_user_tags_user_id ON user_tags(user_id)",
            "CREATE INDEX IF NOT EXISTS idx_user_tags_tag ON user_tags(tag)",
        ),
    ),
    (
        7,
        (
            # Text generation system: prompt templates, system prompts, and chat sessions
            # Prompt templates (user-specific, media-type-specific)
            """
            CREATE TABLE IF NOT EXISTS prompt_templates (
                id TEXT PRIMARY KEY,
                user_id TEXT NOT NULL,
                name TEXT NOT NULL,
                media_type TEXT NOT NULL CHECK (media_type IN ('text', 'image', 'video')),
                template_text TEXT NOT NULL,
                variables TEXT,
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL,
                FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
                UNIQUE(user_id, name, media_type)
            )
            """,
            "CREATE INDEX IF NOT EXISTS idx_prompt_templates_user_id ON prompt_templates(user_id)",
            "CREATE INDEX IF NOT EXISTS idx_prompt_templates_media_type ON prompt_templates(user_id, media_type)",
            # System prompts (user-specific, media-type-specific)
            """
            CREATE TABLE IF NOT EXISTS system_prompts (
                id TEXT PRIMARY KEY,
                user_id TEXT NOT NULL,
                name TEXT NOT NULL,
                media_type TEXT NOT NULL CHECK (media_type IN ('text', 'image', 'video')),
                prompt_text TEXT NOT NULL,
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL,
                FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
                UNIQUE(user_id, name, media_type)
            )
            """,
            "CREATE INDEX IF NOT EXISTS idx_system_prompts_user_id ON system_prompts(user_id)",
            "CREATE INDEX IF NOT EXISTS idx_system_prompts_media_type ON system_prompts(user_id, media_type)",
            # Text generation history
            """
            CREATE TABLE IF NOT EXISTS text_generations (
                id TEXT PRIMARY KEY,
                user_id TEXT NOT NULL,
                mode TEXT NOT NULL CHECK (mode IN ('chat', 'single')),
                system_prompt TEXT,
                system_prompt_id TEXT,
                user_message TEXT,
                template_id TEXT,
                filled_message TEXT,
                variable_values TEXT,
                model_response TEXT,
                model TEXT,
                ip_address TEXT,
                created_at TEXT NOT NULL,
                FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
                FOREIGN KEY (system_prompt_id) REFERENCES system_prompts(id) ON DELETE SET NULL,
                FOREIGN KEY (template_id) REFERENCES prompt_templates(id) ON DELETE SET NULL
            )
            """,
            "CREATE INDEX IF NOT EXISTS idx_text_generations_user_id ON text_generations(user_id, created_at DESC)",
            "CREATE INDEX IF NOT EXISTS idx_text_generations_mode ON text_generations(mode)",
            # Chat sessions
            """
            CREATE TABLE IF NOT EXISTS chat_sessions (
                id TEXT PRIMARY KEY,
                user_id TEXT NOT NULL,
                name TEXT,
                system_prompt TEXT,
                system_prompt_id TEXT,
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL,
                FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
                FOREIGN KEY (system_prompt_id) REFERENCES system_prompts(id) ON DELETE SET NULL
            )
            """,
            "CREATE INDEX IF NOT EXISTS idx_chat_sessions_user_id ON chat_sessions(user_id, updated_at DESC)",
            # Chat messages
            """
            CREATE TABLE IF NOT EXISTS chat_messages (
                id TEXT PRIMARY KEY,
                session_id TEXT NOT NULL,
                role TEXT NOT NULL CHECK (role IN ('user', 'model')),
                content TEXT NOT NULL,
                created_at TEXT NOT NULL,
                FOREIGN KEY (session_id) REFERENCES chat_sessions(id) ON DELETE CASCADE
            )
            """,
            "CREATE INDEX IF NOT EXISTS idx_chat_messages_session_id ON chat_messages(session_id, created_at ASC)",
            # Add 'text' generation type to quotas
            """
            CREATE TABLE IF NOT EXISTS user_quotas_new (
                id TEXT PRIMARY KEY,
                user_id TEXT NOT NULL,
                generation_type TEXT NOT NULL CHECK (generation_type IN ('image', 'video', 'text')),
                quota_type TEXT NOT NULL CHECK (quota_type IN ('daily', 'weekly', 'limited', 'unlimited')),
                quota_limit INTEGER,
                quota_used INTEGER DEFAULT 0,
                quota_reset_at TEXT,
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL,
                FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
            )
            """,
            # Copy existing quotas
            """
            INSERT INTO user_quotas_new (id, user_id, generation_type, quota_type, quota_limit, quota_used, quota_reset_at, created_at, updated_at)
            SELECT id, user_id, generation_type, quota_type, quota_limit, quota_used, quota_reset_at, created_at, updated_at
            FROM user_quotas
            """,
            # Drop old table
            "DROP TABLE user_quotas",
            # Rename new table
            "ALTER TABLE user_quotas_new RENAME TO user_quotas",
            # Recreate indexes
            "CREATE INDEX IF NOT EXISTS idx_user_quotas_user_id ON user_quotas(user_id)",
            "CREATE INDEX IF NOT EXISTS idx_user_quotas_type ON user_quotas(user_id, generation_type)",
            "CREATE INDEX IF NOT EXISTS idx_user_quotas_reset ON user_quotas(quota_reset_at)",
        ),
    ),
]

_db_initialized = False
_db_lock = threading.Lock()


def initialize_database() -> None:
    """Ensure the SQLite database exists and all migrations are applied."""
    global _db_initialized

    if _db_initialized:
        return

    with _db_lock:
        if _db_initialized:
            return

        DB_DIR.mkdir(parents=True, exist_ok=True)

        conn = sqlite3.connect(DB_FILE)
        try:
            conn.execute("PRAGMA journal_mode=WAL")
            conn.execute("PRAGMA foreign_keys = ON")
            conn.execute(
                "CREATE TABLE IF NOT EXISTS schema_migrations (version INTEGER PRIMARY KEY)"
            )

            applied_versions = {
                row[0]
                for row in conn.execute(
                    "SELECT version FROM schema_migrations"
                ).fetchall()
            }

            for version, statements in MIGRATIONS:
                if version in applied_versions:
                    continue

                for statement in statements:
                    conn.execute(statement)

                conn.execute(
                    "INSERT INTO schema_migrations (version) VALUES (?)", (version,)
                )

            conn.commit()
        finally:
            conn.close()

        _db_initialized = True


@contextmanager
def get_connection() -> Iterator[sqlite3.Connection]:
    """Provide a context-managed SQLite connection with migrations applied."""
    initialize_database()
    conn = sqlite3.connect(DB_FILE)
    conn.row_factory = sqlite3.Row
    try:
        conn.execute("PRAGMA foreign_keys = ON")
        yield conn
    finally:
        conn.close()
