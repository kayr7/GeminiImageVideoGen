#!/usr/bin/env python
"""Move inline base64 input images out of the SQLite DB into files.

For every media row whose ``details`` still contains inline data URLs
(referenceImages, sourceImages, firstFrame, lastFrame) the images are written to
``<media-dir>/inputs/originals/{media_id}_{kind}_{index}.{ext}`` and ``details`` is
rewritten to the slim format ``{"mode":..., "inputs": {kind: [filenames]}}``.
Finished video jobs additionally get ``video_data``/``video_url`` (never read; videos live in the media store) cleared and inline images
removed from ``details``. Idempotent; safe to re-run.

Usage:
    python scripts/migrate_media_inputs.py --data-dir D --media-dir M [--dry-run] [--vacuum]

The live production paths (backend/.data, backend/.media-storage) are refused
unless --i-know-this-is-live is given. BACK UP THE DATABASE AND MEDIA FIRST.
"""

from __future__ import annotations

import argparse
import json
import sqlite3
import sys
import time
from pathlib import Path

BACKEND_DIR = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(BACKEND_DIR))

from utils import media_inputs  # noqa: E402  (pure helpers, no default-path side effects)

LIVE_DATA_DIR = (BACKEND_DIR / ".data").resolve()
LIVE_MEDIA_DIR = (BACKEND_DIR / ".media-storage").resolve()
BATCH = 25

INLINE_FILTER = " OR ".join(
    f"json_type(details, '$.{k}') IS NOT NULL" for k in media_inputs.INPUT_KINDS
)


def db_size(db_file: Path) -> int:
    return sum(p.stat().st_size for p in (db_file, Path(f"{db_file}-wal")) if p.exists())


def fmt(n: float) -> str:
    return f"{n / 1024 / 1024:,.1f} MB"


def migrate_media(conn: sqlite3.Connection, media_dir: Path, dry_run: bool) -> tuple[int, int]:
    ids = [
        r[0]
        for r in conn.execute(
            f"SELECT id FROM media WHERE details IS NOT NULL AND ({INLINE_FILTER})"
        )
    ]
    print(f"media rows with input keys in details: {len(ids)}")
    done = saved = 0
    for media_id in ids:
        raw = conn.execute("SELECT details FROM media WHERE id = ?", (media_id,)).fetchone()[0]
        try:
            details = json.loads(raw)
        except (TypeError, json.JSONDecodeError):
            print(f"  skip {media_id}: invalid JSON")
            continue
        if not isinstance(details, dict):
            continue

        if dry_run:
            slim = media_inputs.strip_inline_inputs(details)
        else:
            # Writes files first; the DB row is updated only afterwards (crash safe).
            slim = media_inputs.extract_inputs(media_id, details, media_dir)
            # extract_inputs leaves rows with only null-valued keys untouched: drop those too.
            slim = {k: v for k, v in slim.items() if k not in media_inputs.INPUT_KINDS}
        new = json.dumps(slim) if slim else None
        saved += len(raw) - len(new or "")
        done += 1
        if not dry_run:
            conn.execute("UPDATE media SET details = ? WHERE id = ?", (new, media_id))
            if done % BATCH == 0:
                conn.commit()
        if done % 100 == 0:
            print(f"  {done}/{len(ids)} rows ({fmt(saved)} removed from details)")
    if not dry_run:
        conn.commit()
    return done, saved


def migrate_jobs(conn: sqlite3.Connection, dry_run: bool) -> tuple[int, int]:
    if not conn.execute("SELECT 1 FROM sqlite_master WHERE name = 'video_jobs'").fetchone():
        return 0, 0
    rows = conn.execute(
        "SELECT id, COALESCE(length(video_data), 0) + COALESCE(length(video_url), 0) AS vd FROM video_jobs "
        "WHERE status IN ('completed', 'failed') AND (video_data IS NOT NULL OR video_url IS NOT NULL OR "
        f"(details IS NOT NULL AND ({INLINE_FILTER})))"
    ).fetchall()
    print(f"finished video jobs to slim: {len(rows)}")
    done = saved = 0
    for job_id, video_len in rows:
        raw = conn.execute("SELECT details FROM video_jobs WHERE id = ?", (job_id,)).fetchone()[0]
        new_details = raw
        if raw:
            try:
                new_details = json.dumps(media_inputs.strip_inline_inputs(json.loads(raw)))
            except json.JSONDecodeError:
                pass
        saved += (video_len or 0) + len(raw or "") - len(new_details or "")
        done += 1
        if not dry_run:
            conn.execute(
                "UPDATE video_jobs SET video_data = NULL, video_url = NULL, details = ? WHERE id = ?",
                (new_details, job_id),
            )
            if done % BATCH == 0:
                conn.commit()
    if not dry_run:
        conn.commit()
    return done, saved


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--data-dir", type=Path, required=True, help="directory containing app.db")
    ap.add_argument("--media-dir", type=Path, required=True, help="media storage root")
    ap.add_argument("--dry-run", action="store_true", help="report only, change nothing")
    ap.add_argument("--vacuum", action="store_true", help="VACUUM afterwards (needs free space ~ DB size)")
    ap.add_argument(
        "--i-know-this-is-live", action="store_true",
        help="allow the live backend/.data + .media-storage (back them up first!)",
    )
    args = ap.parse_args(argv)

    data_dir, media_dir = args.data_dir.resolve(), args.media_dir.resolve()
    db_file = data_dir / "app.db"
    if not db_file.is_file():
        print(f"error: {db_file} not found", file=sys.stderr)
        return 2

    if data_dir == LIVE_DATA_DIR or media_dir == LIVE_MEDIA_DIR:
        if not args.i_know_this_is_live:
            print(
                "REFUSING: this is the LIVE database/media location. Back up app.db and the media "
                "directory first, stop the app, then re-run with --i-know-this-is-live.",
                file=sys.stderr,
            )
            return 3
        print("WARNING: running against LIVE data. Make sure you have a BACKUP of app.db and the media dir.")

    print(f"db: {db_file}  media: {media_dir}  dry_run={args.dry_run}")
    before = db_size(db_file)
    t0 = time.perf_counter()
    conn = sqlite3.connect(db_file, timeout=120)
    try:
        conn.execute("PRAGMA journal_mode=WAL")
        m_rows, m_saved = migrate_media(conn, media_dir, args.dry_run)
        j_rows, j_saved = migrate_jobs(conn, args.dry_run)
        if args.vacuum and not args.dry_run:
            print("checkpointing WAL and running VACUUM ...")
            conn.execute("PRAGMA wal_checkpoint(TRUNCATE)")
            conn.execute("VACUUM")
        conn.execute("PRAGMA wal_checkpoint(TRUNCATE)")
    finally:
        conn.close()

    after = db_size(db_file)
    print(
        f"media rows: {m_rows} (-{fmt(m_saved)}), video jobs: {j_rows} (-{fmt(j_saved)}), "
        f"{time.perf_counter() - t0:.1f}s"
    )
    hint = "" if args.vacuum or args.dry_run else "  (freed pages are reused; use --vacuum to shrink the file)"
    print(f"DB size before: {fmt(before)}  after: {fmt(after)}{hint}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
