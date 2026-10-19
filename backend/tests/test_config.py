import pytest

from utils.config import resolve_model_choice


def test_config_endpoint_has_models(client):
    r = client.get("/api/config")
    assert r.status_code == 200
    models = r.json()["data"]["models"]
    for category in ("image", "video", "speech"):
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
