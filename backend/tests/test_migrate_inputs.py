import base64
import importlib.util
import json
from pathlib import Path

from tests.conftest import PNG
from utils import database, media_storage
from utils.database import get_connection

SCRIPT = Path(__file__).resolve().parent.parent / "scripts" / "migrate_media_inputs.py"
DATA_URL = "data:image/png;base64," + base64.b64encode(PNG).decode()


def _load():
    spec = importlib.util.spec_from_file_location("migrate_media_inputs", SCRIPT)
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


def _seed(client, user):
    mid = str(media_storage.get_media_storage().save_media(
        "image", base64.b64encode(PNG).decode(), {"prompt": "p", "model": "m", "userId": user.id}))
    legacy = {"mode": "edit", "negativePrompt": "n", "sourceImages": [DATA_URL, DATA_URL], "firstFrame": DATA_URL, "lastFrame": None}
    with get_connection() as conn:
        conn.execute("UPDATE media SET details = ? WHERE id = ?", (json.dumps(legacy), mid))
        conn.execute(
            "INSERT INTO video_jobs (id, user_id, status, details, video_data, video_url, created_at, updated_at) "
            "VALUES ('j1', ?, 'completed', ?, 'AAAA', 'data:video/mp4;base64,AAAA', 'x', 'x')"
            .replace("'x', 'x'", "'2026-01-01T00:00:00', '2026-01-01T00:00:00'"),
            (user.id, json.dumps(legacy)))
        conn.execute(
            "INSERT INTO video_jobs (id, user_id, status, details, created_at, updated_at) "
            "VALUES ('j2', ?, 'processing', ?, '2026-01-01T00:00:00', '2026-01-01T00:00:00')",
            (user.id, json.dumps(legacy)))
        conn.commit()
    return mid


def test_migration_rewrites_details_and_is_idempotent(client, user_a, capsys):
    mid = _seed(client, user_a[0])
    data_dir, media_dir = database.DB_DIR, media_storage.STORAGE_ROOT
    mod = _load()
    args = ["--data-dir", str(data_dir), "--media-dir", str(media_dir)]

    assert mod.main(args + ["--dry-run"]) == 0
    with get_connection() as conn:
        assert "data:" in conn.execute("SELECT details FROM media WHERE id = ?", (mid,)).fetchone()[0]

    assert mod.main(args + ["--vacuum"]) == 0
    with get_connection() as conn:
        raw = conn.execute("SELECT details FROM media WHERE id = ?", (mid,)).fetchone()[0]
        job = conn.execute("SELECT details, video_data, video_url FROM video_jobs WHERE id = 'j1'").fetchone()
        processing = conn.execute("SELECT details FROM video_jobs WHERE id = 'j2'").fetchone()[0]
    details = json.loads(raw)
    assert "data:" not in raw and details["mode"] == "edit" and details["negativePrompt"] == "n"
    assert len(details["inputs"]["sourceImages"]) == 2 and "lastFrame" not in details["inputs"]
    assert (media_dir / "inputs" / "originals" / details["inputs"]["firstFrame"]).read_bytes() == PNG
    assert job["video_data"] is None and job["video_url"] is None and "data:" not in job["details"]
    assert "data:" in processing  # running jobs still need their inputs

    # idempotent
    assert mod.main(args) == 0
    with get_connection() as conn:
        assert conn.execute("SELECT details FROM media WHERE id = ?", (mid,)).fetchone()[0] == raw
    assert "before" in capsys.readouterr().out


def test_migration_refuses_live_paths(tmp_path):
    mod = _load()
    live = mod.LIVE_DATA_DIR
    # Do not touch the real live dir: pretend our temp dir is the live one.
    (tmp_path / "app.db").write_bytes(b"")
    mod.LIVE_DATA_DIR = tmp_path.resolve()
    assert mod.main(["--data-dir", str(tmp_path), "--media-dir", str(tmp_path / "m")]) == 3
    assert live != mod.LIVE_DATA_DIR
