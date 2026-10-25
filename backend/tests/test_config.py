import pytest

from utils.config import resolve_model_choice


def test_config_endpoint_has_models(client):
    r = client.get("/api/config")
    assert r.status_code == 200
    models = r.json()["data"]["models"]
    for category in ("image", "video", "speech", "text"):
        assert models[category]["enabled"], category
        assert all("id" in m for m in models[category]["enabled"])


def test_resolve_default_and_explicit():
    default = resolve_model_choice("image", None)
    assert default["id"]
    assert resolve_model_choice("image", "  ")["id"] == default["id"]
    assert resolve_model_choice("image", default["id"])["id"] == default["id"]


def test_resolve_unknown_model_raises():
    with pytest.raises(LookupError):
        resolve_model_choice("image", "no-such-model")


def test_resolve_unknown_category_raises():
    with pytest.raises(LookupError):
        resolve_model_choice("nonexistent", None)


def test_text_models_registered():
    assert resolve_model_choice("text", None)["id"] == "gemini-3.8-flash"


def test_stale_admin_overrides_fall_back_to_first_valid_model():
    from utils.admin_config import store_admin_model_settings
    from utils.config import get_model_configuration

    store_admin_model_settings("image", {
        "enabled": ["imagen-4.0-generate-001"],
        "disabled": ["gemini-nano-banana-2.1"],
        "default": "imagen-4.0-generate-001",
    })
    cfg = get_model_configuration()["image"]
    ids = [m["id"] for m in cfg["enabled"]]
    assert "imagen-4.0-generate-001" not in ids
    assert cfg["default"] in ids
    assert resolve_model_choice("image", None)["id"] == ids[0]

    store_admin_model_settings("video", {
        "enabled": ["gemini-omni-1.1-flash", "veo-3.1-fast-generate-preview"],
        "default": "veo-3.1-fast-generate-preview",
    })
    cfg = get_model_configuration()["video"]
    assert [m["id"] for m in cfg["enabled"]] == ["gemini-omni-1.1-flash"]
    assert cfg["default"] == "gemini-omni-1.1-flash"

    # Only retired ids stored: the list is ignored and the registry is used.
    store_admin_model_settings("video", {
        "enabled": ["veo-3.1-generate-preview"], "default": "veo-3.1-generate-preview",
    })
    assert resolve_model_choice("video", None)["id"] == "gemini-omni-1.1-flash"
    with pytest.raises(LookupError):
        resolve_model_choice("video", "veo-3.1-fast-generate-preview")


def test_blank_model_resolves_to_configured_default(monkeypatch):
    from utils.admin_config import store_admin_model_settings

    store_admin_model_settings("image", {"default": "gemini-3-pro-image"})
    assert resolve_model_choice("image", "")["id"] == "gemini-3-pro-image"
    assert resolve_model_choice("image", None)["id"] == "gemini-3-pro-image"
    # an explicit choice still wins
    assert resolve_model_choice("image", "gemini-2.5-flash-image")["id"] == "gemini-2.5-flash-image"

    store_admin_model_settings("image", {})
    monkeypatch.setenv("DEFAULT_IMAGE_MODEL", "gemini-3.1-flash-lite-image")
    assert resolve_model_choice("image", None)["id"] == "gemini-3.1-flash-lite-image"
    # a disabled default falls back to the first enabled model
    monkeypatch.setenv("DISABLED_IMAGE_MODELS", "gemini-3.1-flash-lite-image")
    assert resolve_model_choice("image", None)["id"] == "gemini-nano-banana-2.1"


def test_video_registry_is_omni_only():
    from utils.config import get_model_registry

    (omni,) = get_model_registry()["video"]
    caps = omni["capabilities"]
    assert omni["id"] == "gemini-omni-1.1-flash"
    assert caps["aspect_ratios"] == ["16:9", "9:16"]
    assert caps["resolutions"] == ["360p", "720p", "1080p", "4k"]
    assert caps["video_reference_images"]["supports_reference_images"] is True
    assert caps["default_duration"] in caps["durations"]
    assert omni["pricePerVideo"] == round(omni["price"] * caps["default_duration"], 2)


def test_text_endpoint_rejects_unknown_model(client, make_user, fake_gemini):
    _, h = make_user("t@test.de", quotas={"text": ("limited", 5)})
    r = client.post("/api/text/generate", headers=h,
                    json={"userMessage": "hi", "model": "gemini-2.0-flash-exp"})
    assert r.status_code == 400


def test_speech_wav_passthrough_and_pcm_wrap():
    import io, wave
    from routers.speech import _ensure_wav

    buf = io.BytesIO()
    with wave.open(buf, "wb") as wf:
        wf.setnchannels(1); wf.setsampwidth(2); wf.setframerate(24000); wf.writeframes(b"\0\0")
    wav = buf.getvalue()
    assert _ensure_wav(wav, "audio/wav") == wav
    wrapped = _ensure_wav(b"\x01\x00\x02\x00", "audio/L16;codec=pcm;rate=24000")
    assert wrapped[:4] == b"RIFF" and wrapped != b"\x01\x00\x02\x00"
