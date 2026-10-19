import uuid

import pytest
from google.genai import types

import utils.media_storage as ms
from utils.quota_manager import QuotaManager


@pytest.fixture
def fake_video(fake_gemini):
    calls = {"get": 0}

    class Ops:
        def get(self, op):
            calls["get"] += 1
            return types.GenerateVideosOperation(
                name=op.name, done=True,
                response=types.GenerateVideosResponse(generated_videos=[
                    types.GeneratedVideo(video=types.Video(video_bytes=b"fakemp4", mime_type="video/mp4"))
                ]),
            )

    class Models:
        def generate_videos(self, **kw):
            return types.GenerateVideosOperation(name="models/veo/operations/" + uuid.uuid4().hex, done=False)

    fake_gemini.operations = Ops()
    fake_gemini.models.generate_videos = Models().generate_videos
    fake_gemini.video_calls = calls
    return fake_gemini


def _start(client, headers, prompt="hi"):
    r = client.post("/api/video/generate", json={"prompt": prompt, "model": ""}, headers=headers)
    assert r.status_code == 200, r.text
    return r.json()["data"]["jobId"]


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
    assert client.get("/api/video/status", params={"jobId": jid}, headers=hb).status_code == 404
    assert client.get(f"/api/video/jobs/{jid}", headers=hb).status_code == 404


def test_owner_completes_and_double_poll_charges_once(client, user_a, fake_video):
    user, ha = user_a
    jid = _start(client, ha)

    r1 = client.get("/api/video/status", params={"jobId": jid}, headers=ha).json()["data"]
    assert r1["status"] == "completed" and r1["videoData"] and r1["mediaId"]

    r2 = client.get("/api/video/status", params={"jobId": jid}, headers=ha).json()["data"]
    assert r2["status"] == "completed"
    assert r2["mediaId"] == r1["mediaId"]
    assert r2["videoData"] == r1["videoData"]

    assert fake_video.video_calls["get"] == 1
    assert QuotaManager.get_quota(user.id, "video").quota_used == 1
    assert ms.get_media_storage().count_user_media(user.id, media_type="video") == 1


def test_jobs_lists_only_own_without_video_data(client, user_a, user_b, fake_video):
    _, ha = user_a
    _, hb = user_b
    ja = _start(client, ha, "a")
    jb = _start(client, hb, "b")
    client.get("/api/video/status", params={"jobId": ja}, headers=ha)  # complete A's job

    la = client.get("/api/video/jobs", headers=ha).json()["data"]["jobs"]
    lb = client.get("/api/video/jobs", headers=hb).json()["data"]["jobs"]
    assert [j["jobId"] for j in la] == [ja]
    assert [j["jobId"] for j in lb] == [jb]
    for key in ("videoData", "videoUrl", "details"):
        assert key not in la[0]

    one = client.get(f"/api/video/jobs/{ja}", headers=ha).json()["data"]
    assert one["id"] == ja and one["videoUrl"].startswith("data:video/mp4")
