import base64


from tests.conftest import PNG
from utils.quota_manager import QuotaManager

NANO = "gemini-nano-banana-2.1"
IMAGEN = "imagen-4.0-generate-001"
REF = "data:image/webp;base64," + base64.b64encode(PNG).decode()


def _used(user, kind="image"):
    return QuotaManager.get_quota(user.id, kind).quota_used


def test_requires_auth(client, fake_gemini):
    assert client.post("/api/image/generate", json={"prompt": "cat"}).status_code == 401


def test_nano_banana_response_and_mime_passthrough(client, user_a, fake_gemini):
    user, h = user_a
    r = client.post(
        "/api/image/generate", headers=h,
        json={"prompt": "cat", "model": NANO, "referenceImages": [REF]},
    )
    assert r.status_code == 200, r.text
    d = r.json()["data"]
    assert {"imageUrl", "imageData", "prompt", "model", "generatedAt", "mediaId"} <= set(d)
    assert d["model"] == NANO
    assert d["imageData"] == base64.b64encode(PNG).decode()
    # output mime comes from the model response, not the reference
    assert d["imageUrl"].startswith("data:image/jpeg;base64,")
    # reference mime is passed through to Gemini
    sent = fake_gemini.calls["generate_content"]
    assert sent.model == NANO
    assert sent.contents[0] == "cat"
    assert sent.contents[1]["inline_data"]["mime_type"] == "image/webp"
    assert _used(user) == 1


def test_imagen_is_gone_and_negative_prompt_ignored(client, user_a, fake_gemini):
    _, h = user_a
    r = client.post("/api/image/generate", headers=h, json={"prompt": "cat", "model": IMAGEN})
    assert r.status_code == 400
    r = client.post(
        "/api/image/generate", headers=h,
        json={"prompt": "cat", "model": NANO, "negativePrompt": "blur"},
    )
    assert r.status_code == 200, r.text
    assert "generate_images" not in fake_gemini.calls


def test_unknown_model_400(client, user_a, fake_gemini):
    _, h = user_a
    r = client.post("/api/image/generate", headers=h, json={"prompt": "cat", "model": "nope"})
    assert r.status_code == 400


def test_quota_exhausted_429(client, make_user, fake_gemini):
    user, h = make_user("q@test.de", quotas={"image": ("limited", 1)})
    assert client.post("/api/image/generate", headers=h, json={"prompt": "a", "model": NANO}).status_code == 200
    r = client.post("/api/image/generate", headers=h, json={"prompt": "b", "model": NANO})
    assert r.status_code == 429
    assert _used(user) == 1


def test_failed_generation_does_not_charge_quota(client, user_a, fake_gemini, monkeypatch):
    user, h = user_a

    def boom(**kw):
        raise RuntimeError("upstream down")

    monkeypatch.setattr(fake_gemini.models, "generate_content", lambda model, contents, config: boom())
    r = client.post("/api/image/generate", headers=h, json={"prompt": "a", "model": NANO})
    assert r.status_code == 500
    assert _used(user) == 0


def test_edit_requires_source_images(client, user_a, fake_gemini):
    _, h = user_a
    r = client.post("/api/image/edit", headers=h, json={"prompt": "dog", "sourceImages": []})
    assert r.status_code == 400


def test_edit_success(client, user_a, fake_gemini):
    user, h = user_a
    r = client.post("/api/image/edit", headers=h, json={"prompt": "dog", "sourceImages": [REF]})
    assert r.status_code == 200, r.text
    assert _used(user) == 1


def test_usage_status_and_health(client):
    r = client.get("/api/usage/status")
    assert r.status_code == 200
    assert set(r.json()["data"]["rateLimit"]) >= {"image", "video"}
    assert client.get("/health").json()["status"] == "healthy"
