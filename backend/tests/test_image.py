import base64
from types import SimpleNamespace as NS

import pytest

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


def _respond_with(monkeypatch, fake_gemini, response):
    def generate_content(model, contents, config):
        fake_gemini.calls["generate_content"] = NS(model=model, contents=contents, config=config)
        return response

    monkeypatch.setattr(fake_gemini.models, "generate_content", generate_content)


def test_text_only_reply_is_422_with_model_text(client, user_a, fake_gemini, monkeypatch):
    user, h = user_a
    text_part = NS(text="Hallo! Wie kann ich helfen?", inline_data=None, thought=False)
    _respond_with(monkeypatch, fake_gemini, NS(
        prompt_feedback=None,
        candidates=[NS(finish_reason="STOP", content=NS(parts=[text_part]))],
    ))
    r = client.post("/api/image/generate", headers=h, json={"prompt": "hallo", "model": NANO})
    assert r.status_code == 422
    assert "Wie kann ich helfen?" in r.json()["detail"]
    assert _used(user) == 0


def test_image_other_without_parts_is_safety_422(client, user_a, fake_gemini, monkeypatch):
    user, h = user_a
    _respond_with(monkeypatch, fake_gemini, NS(
        prompt_feedback=None,
        candidates=[NS(finish_reason=NS(name="IMAGE_OTHER"), content=None)],
    ))
    r = client.post("/api/image/generate", headers=h, json={"prompt": "a celebrity", "model": NANO})
    assert r.status_code == 422
    detail = r.json()["detail"]
    assert "safety filter" in detail and "real people" in detail and "IMAGE_OTHER" in detail
    assert _used(user) == 0


def test_no_image_finish_reason_and_prompt_block(client, user_a, fake_gemini, monkeypatch):
    _, h = user_a
    _respond_with(monkeypatch, fake_gemini, NS(
        prompt_feedback=None, candidates=[NS(finish_reason="NO_IMAGE", content=NS(parts=[]))],
    ))
    r = client.post("/api/image/generate", headers=h, json={"prompt": "hallo", "model": NANO})
    assert r.status_code == 422 and "did not produce an image" in r.json()["detail"]

    _respond_with(monkeypatch, fake_gemini, NS(
        prompt_feedback=NS(block_reason="PROHIBITED_CONTENT"), candidates=[],
    ))
    r = client.post("/api/image/generate", headers=h, json={"prompt": "x", "model": NANO})
    assert r.status_code == 422 and "safety filter" in r.json()["detail"]


def test_no_image_in_image_only_mode_retries_once_with_text(client, user_a, fake_gemini, monkeypatch):
    user, h = user_a
    empty = NS(prompt_feedback=None, candidates=[NS(finish_reason="NO_IMAGE", content=NS(parts=[]))])
    image = NS(inline_data=NS(data=PNG, mime_type="image/png"), thought=False)
    full = NS(prompt_feedback=None, candidates=[NS(finish_reason="STOP", content=NS(parts=[image]))])
    sent = []

    def generate_content(model, contents, config):
        sent.append(config["response_modalities"])
        return empty if len(sent) == 1 else full

    monkeypatch.setattr(fake_gemini.models, "generate_content", generate_content)
    r = client.post("/api/image/generate", headers=h, json={"prompt": "Wie gestalte ich ein Logo?", "model": NANO})
    assert r.status_code == 200, r.text
    assert sent == [["IMAGE"], ["TEXT", "IMAGE"]]
    assert _used(user) == 1


def test_final_image_preferred_over_thought_image(client, user_a, fake_gemini, monkeypatch):
    _, h = user_a
    draft = NS(inline_data=NS(data=b"draft", mime_type="image/png"), thought=True)
    final = NS(inline_data=NS(data=PNG, mime_type="image/png"), thought=False)
    _respond_with(monkeypatch, fake_gemini, NS(
        prompt_feedback=None, candidates=[NS(finish_reason="STOP", content=NS(parts=[draft, final]))],
    ))
    r = client.post("/api/image/generate", headers=h, json={"prompt": "cat", "model": NANO})
    assert r.status_code == 200
    assert r.json()["data"]["imageData"] == base64.b64encode(PNG).decode()


@pytest.mark.parametrize("model, modalities", [
    ("gemini-nano-banana-2.1", ["IMAGE"]),
    ("gemini-3.1-flash-image", ["IMAGE"]),
    ("gemini-3.1-flash-lite-image", ["IMAGE"]),
    ("gemini-3-pro-image", ["IMAGE"]),
    ("gemini-2.5-flash-image", ["TEXT", "IMAGE"]),
])
def test_response_modalities_per_model(client, user_a, fake_gemini, model, modalities):
    _, h = user_a
    r = client.post("/api/image/generate", headers=h, json={"prompt": "cat", "model": model})
    assert r.status_code == 200, r.text
    assert fake_gemini.calls["generate_content"].config["response_modalities"] == modalities
    r = client.post("/api/image/edit", headers=h, json={"prompt": "dog", "model": model, "sourceImages": [REF]})
    assert r.status_code == 200, r.text
    assert fake_gemini.calls["generate_content"].config["response_modalities"] == modalities


def test_upstream_429_maps_to_429(client, user_a, fake_gemini, monkeypatch):
    from google.genai import errors

    user, h = user_a

    def boom(model, contents, config):
        raise errors.ClientError(429, {"error": {"code": 429, "message": "Resource exhausted", "status": "RESOURCE_EXHAUSTED"}})

    monkeypatch.setattr(fake_gemini.models, "generate_content", boom)
    r = client.post("/api/image/generate", headers=h, json={"prompt": "a", "model": NANO})
    assert r.status_code == 429
    assert _used(user) == 0
