import base64
import json
import uuid
from datetime import datetime, timedelta
from types import SimpleNamespace as NS

import pytest

import utils.gemini as gemini
import utils.media_storage as ms
from tests.conftest import PNG
from utils.database import get_connection
from utils.quota_manager import QuotaManager
from utils.video_queue import get_video_queue

OMNI = "gemini-omni-1.1-flash"
IMG = "data:image/png;base64," + base64.b64encode(PNG).decode()
VIDEO_B64 = base64.b64encode(b"fakemp4").decode()


class FakeInteractions:
    """Stand-in for client.interactions: create() starts, get() returns ``self.result``."""

    def __init__(self):
        self.created = []
        self.gets = 0
        self.result = "completed"  # or "failed" / "empty" / "in_progress" / an Exception
        self.create_error = None

    def create(self, **kwargs):
        if self.create_error:
            raise self.create_error
        self.created.append(kwargs)
        return NS(id="v1_" + uuid.uuid4().hex, status="in_progress", output_video=None)

    def get(self, interaction_id, timeout=None):
        self.gets += 1
        if isinstance(self.result, Exception):
            raise self.result
        if self.result == "completed":
            return NS(id=interaction_id, status="completed", errors=None, output_text="",
                      output_video=NS(data=VIDEO_B64, uri=None, mime_type="video/mp4"))
        if self.result == "empty":
            return NS(id=interaction_id, status="completed", errors=None,
                      output_text="I can't make that.", output_video=None)
        if self.result == "failed":
            return NS(id=interaction_id, status="failed", output_video=None,
                      errors=[NS(code="invalid_request", message="Prompt violates policy")])
        return NS(id=interaction_id, status=self.result, output_video=None, errors=None)


@pytest.fixture
def fake_video(fake_gemini, monkeypatch):
    import routers.video

    interactions = FakeInteractions()
    fake_gemini.interactions = interactions
    monkeypatch.setattr(gemini, "_video_client_for_key", lambda key: fake_gemini)
    monkeypatch.setattr(routers.video, "get_video_client", lambda: fake_gemini)
    monkeypatch.setattr(routers.video, "extract_frames", lambda b: (base64.b64encode(PNG).decode(), None))
    return interactions


def _start(client, headers, prompt="hi", **extra):
    r = client.post("/api/video/generate", json={"prompt": prompt, "model": "", **extra}, headers=headers)
    assert r.status_code == 200, r.text
    data = r.json()["data"]
    assert data["status"] == "processing"
    return data["jobId"]


def _status(client, headers, jid):
    return client.get("/api/video/status", params={"jobId": jid}, headers=headers)


def test_unauthenticated_is_401(client, user_a, fake_video):
    _, h = user_a
    jid = _start(client, h)
    assert client.get("/api/video/status", params={"jobId": jid}).status_code == 401
    assert client.get("/api/video/jobs").status_code == 401
    assert client.get(f"/api/video/jobs/{jid}").status_code == 401


def test_other_user_gets_404(client, user_a, user_b, fake_video):
    _, ha = user_a
    _, hb = user_b
    jid = _start(client, ha)
    assert _status(client, hb, jid).status_code == 404
    assert client.get(f"/api/video/jobs/{jid}", headers=hb).status_code == 404


def test_start_builds_background_interaction(client, user_a, fake_video):
    _, h = user_a
    jid = _start(client, h, prompt="a cat", negativePrompt="dogs",
                 aspectRatio="9:16", resolution="360p", durationSeconds="4")
    call = fake_video.created[-1]
    assert call["model"] == OMNI
    assert call["background"] is True and call["store"] is True
    assert call["response_format"] == {
        "type": "video", "aspect_ratio": "9:16", "resolution": "360p", "duration": "4s",
    }
    assert call["input"].startswith("a cat") and "Avoid: dogs" in call["input"]
    job = get_video_queue().get_job(jid)
    assert job["status"] == "processing" and job["operationId"].startswith("v1_")
    assert job["id"] == jid != job["operationId"]


def test_defaults_when_options_omitted(client, user_a, fake_video):
    _, h = user_a
    _start(client, h)
    rf = fake_video.created[-1]["response_format"]
    assert rf == {"type": "video", "aspect_ratio": "16:9", "resolution": "720p", "duration": "8s"}


def test_owner_completes_and_double_poll_charges_once(client, user_a, fake_video):
    user, ha = user_a
    jid = _start(client, ha)

    r1 = _status(client, ha, jid).json()["data"]
    assert r1["status"] == "completed" and r1["videoData"] == VIDEO_B64 and r1["mediaId"]

    r2 = _status(client, ha, jid).json()["data"]
    assert r2["status"] == "completed"
    assert r2["mediaId"] == r1["mediaId"]
    assert r2["videoData"] == r1["videoData"]

    assert fake_video.gets == 1
    assert QuotaManager.get_quota(user.id, "video").quota_used == 1
    storage = ms.get_media_storage()
    assert storage.count_user_media(user.id, media_type="video") == 1
    with get_connection() as conn:
        details = json.loads(conn.execute("SELECT details FROM media WHERE id = ?", (r1["mediaId"],)).fetchone()[0])
    assert details["mode"] == "text-to-video"
    assert details["resolution"] == "720p" and details["aspectRatio"] == "16:9"
    assert (ms.THUMBNAILS_DIR).exists() and any(ms.THUMBNAILS_DIR.iterdir())


def test_in_progress_stays_processing(client, user_a, fake_video):
    user, h = user_a
    fake_video.result = "in_progress"
    jid = _start(client, h)
    assert _status(client, h, jid).json()["data"]["status"] == "processing"
    assert QuotaManager.get_quota(user.id, "video").quota_used == 0


def test_failed_interaction_marks_job_failed(client, user_a, fake_video):
    user, h = user_a
    fake_video.result = "failed"
    jid = _start(client, h)
    d = _status(client, h, jid).json()["data"]
    assert d["status"] == "failed" and "Prompt violates policy" in d["error"]
    assert get_video_queue().get_job(jid)["status"] == "failed"
    assert QuotaManager.get_quota(user.id, "video").quota_used == 0
    # settled: no further calls to Google
    _status(client, h, jid)
    assert fake_video.gets == 1


def test_completed_without_video_fails(client, user_a, fake_video):
    user, h = user_a
    fake_video.result = "empty"
    jid = _start(client, h)
    d = _status(client, h, jid).json()["data"]
    assert d["status"] == "failed"
    assert "No video was returned" in d["error"] and "I can't make that." in d["error"]
    assert QuotaManager.get_quota(user.id, "video").quota_used == 0


def test_transient_poll_error_keeps_processing(client, user_a, fake_video):
    _, h = user_a
    jid = _start(client, h)
    fake_video.result = RuntimeError("network down")
    assert _status(client, h, jid).status_code == 502
    assert get_video_queue().get_job(jid)["status"] == "processing"
    fake_video.result = "completed"
    assert _status(client, h, jid).json()["data"]["status"] == "completed"


def test_create_rejection_maps_to_400(client, user_a, fake_video):
    user, h = user_a

    class BadRequest(Exception):
        status_code = 400
        body = {"error": {"message": "Requested video duration exceeds the maximum", "code": "invalid_request"}}

    fake_video.create_error = BadRequest("400")
    r = client.post("/api/video/generate", headers=h, json={"prompt": "x"})
    assert r.status_code == 400 and "duration exceeds" in r.json()["detail"]
    assert client.get("/api/video/jobs", headers=h).json()["data"]["jobs"] == []


@pytest.mark.parametrize("extra", [
    {"model": "veo-3.1-fast-generate-preview"},
    {"model": "nope"},
    {"aspectRatio": "1:1"},
    {"resolution": "999p"},
    {"durationSeconds": 2},
    {"durationSeconds": "11"},
    {"durationSeconds": "abc"},
    {"referenceImages": [IMG, IMG, IMG, IMG]},
    {"firstFrame": "data:image/png;base64,@@not-base64@@"},
])
def test_invalid_requests_400(client, user_a, fake_video, extra):
    _, h = user_a
    r = client.post("/api/video/generate", headers=h, json={"prompt": "x", **extra})
    assert r.status_code in (400, 422), r.text
    assert fake_video.created == []


def test_frames_and_references_become_image_inputs(client, user_a, fake_video):
    _, h = user_a
    jid = _start(client, h, prompt="morph", firstFrame=IMG, lastFrame=IMG, referenceImages=[IMG])
    items = fake_video.created[-1]["input"]
    assert [i["type"] for i in items] == ["image", "image", "image", "text"]
    assert items[0]["mime_type"] == "image/png" and items[0]["data"] == IMG.split(",", 1)[1]
    text = items[-1]["text"]
    assert text.startswith("morph")
    assert "image 1 is the first frame" in text and "image 2 is the last frame" in text
    assert "image 3 is a reference" in text
    assert get_video_queue().get_job(jid)["mode"] == "first-last-frame"


def test_job_inputs_moved_to_files_on_completion(client, user_a, fake_video):
    user, ha = user_a
    r = client.post("/api/video/animate", json={"prompt": "go", "model": "", "sourceImages": [IMG, IMG]}, headers=ha)
    assert r.status_code == 200, r.text
    jid = r.json()["data"]["jobId"]
    items = fake_video.created[-1]["input"]
    assert [i["type"] for i in items] == ["image", "image", "text"]
    assert "image 1 is the first frame" in items[-1]["text"]
    with get_connection() as conn:
        assert "data:image" in conn.execute("SELECT details FROM video_jobs").fetchone()[0]

    mid = _status(client, ha, jid).json()["data"]["mediaId"]
    with get_connection() as conn:
        job_details = conn.execute("SELECT details FROM video_jobs").fetchone()[0]
        media_details = conn.execute("SELECT details FROM media WHERE id = ?", (mid,)).fetchone()[0]
    assert "data:image" not in job_details and "data:image" not in media_details
    assert json.loads(media_details)["mode"] == "animate"
    item = client.get("/api/media/list", headers=ha).json()["data"]["media"][0]
    assert len(item["details"]["sourceImages"]) == 2
    assert client.get(item["details"]["sourceImages"][0]).status_code == 200


def test_jobs_lists_only_own_without_video_data(client, user_a, user_b, fake_video):
    _, ha = user_a
    _, hb = user_b
    ja = _start(client, ha, "a")
    jb = _start(client, hb, "b")
    _status(client, ha, ja)  # complete A's job

    la = client.get("/api/video/jobs", headers=ha).json()["data"]["jobs"]
    lb = client.get("/api/video/jobs", headers=hb).json()["data"]["jobs"]
    assert [j["jobId"] for j in la] == [ja]
    assert [j["jobId"] for j in lb] == [jb]
    for key in ("videoData", "videoUrl", "details"):
        assert key not in la[0]

    one = client.get(f"/api/video/jobs/{ja}", headers=ha).json()["data"]
    assert one["id"] == ja and one["videoUrl"].startswith("data:video/mp4")


def _insert_job(job_id, model, operation_id, age, status="processing"):
    created = (datetime.now() - age).isoformat()
    with get_connection() as conn:
        conn.execute(
            "INSERT INTO video_jobs (id, job_id, operation_id, user_id, prompt, model, mode, status, "
            "progress, details, created_at, updated_at) VALUES (?, ?, ?, 'u', 'p', ?, 'text', ?, 0, ?, ?, ?)",
            (job_id, job_id, operation_id, model, status,
             json.dumps({"firstFrame": IMG}), created, created),
        )
        conn.commit()


def test_startup_recovery_fails_unresumable_jobs(client):
    from routers.video import recover_video_jobs

    _insert_job("models/veo-3.1/operations/x", "veo-3.1-fast-generate-preview", None, timedelta(days=300))
    _insert_job("old-omni", OMNI, "v1_old", timedelta(hours=3))
    _insert_job("no-op", OMNI, None, timedelta(minutes=1))
    _insert_job("fresh", OMNI, "v1_fresh", timedelta(minutes=5))
    _insert_job("done", "veo-3.1-generate-preview", None, timedelta(days=300), status="completed")

    assert recover_video_jobs() == 3
    queue = get_video_queue()
    veo = queue.get_job("models/veo-3.1/operations/x")
    assert veo["status"] == "failed" and "no longer available" in veo["error"]
    assert "data:image" not in json.dumps(veo["details"])
    assert queue.get_job("old-omni")["status"] == "failed"
    assert queue.get_job("no-op")["status"] == "failed"
    assert queue.get_job("fresh")["status"] == "processing"
    assert queue.get_job("done")["status"] == "completed"
    assert recover_video_jobs() == 0


def test_legacy_job_id_with_slashes_still_resolves(client, user_a, fake_video):
    user, h = user_a
    _insert_job("models/veo-3.1/operations/abc", "veo-3.1-fast-generate-preview", None, timedelta(days=1))
    with get_connection() as conn:
        conn.execute("UPDATE video_jobs SET user_id = ?", (user.id,))
        conn.commit()
    r = client.get("/api/video/jobs/models/veo-3.1/operations/abc", headers=h)
    assert r.status_code == 200
    d = _status(client, h, "models/veo-3.1/operations/abc").json()["data"]
    assert d["status"] == "failed" and fake_video.gets == 0
