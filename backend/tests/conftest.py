"""Shared fixtures: isolated DB/media/admin-config, fake Gemini client, auth helpers.

Nothing here may touch backend/.data, backend/.media-storage or
backend/data/admin-config.json.
"""
import base64
import os
import sys
from pathlib import Path
from types import SimpleNamespace as NS

# Must be set before `main` is imported (it calls load_dotenv, which never overrides).
os.environ["GEMINI_API_KEY"] = "test-key"
os.environ["APP_USERNAME"] = "admin@test.de"
os.environ["APP_PASSWORD"] = "Passw0rd!Passw0rd"
# Import-time path overrides: even if something imported early, it can't hit real data.
import tempfile as _tempfile
_IMPORT_TMP = _tempfile.mkdtemp(prefix="gemini-tests-")
os.environ["DATA_DIR"] = os.path.join(_IMPORT_TMP, "data")
os.environ["MEDIA_STORAGE_DIR"] = os.path.join(_IMPORT_TMP, "media")
for _k in ("ADMIN_USERNAME", "ADMIN_PASSWORD", "LOGIN_USERNAME", "LOGIN_PASSWORD"):
    os.environ.pop(_k, None)

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

import pytest
from fastapi.testclient import TestClient

import main
import utils.admin_config as admin_config
import utils.database as database
import utils.gemini as gemini
import utils.media_storage as media_storage
import utils.prompt_lab as prompt_lab_utils
import utils.rate_limiter as rate_limiter
from utils.quota_manager import QuotaManager
from utils.user_manager import UserManager

ADMIN_EMAIL = os.environ["APP_USERNAME"]
ADMIN_PASSWORD = os.environ["APP_PASSWORD"]
USER_PASSWORD = "UserPassw0rd!"

# 1x1 PNG
PNG = base64.b64decode(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg=="
)


@pytest.fixture(autouse=True)
def isolated_env(tmp_path, monkeypatch):
    """Point DB, media storage, admin config at tmp dirs; reset singletons/limiter."""
    db_dir = tmp_path / "db"
    monkeypatch.setattr(database, "DB_DIR", db_dir)
    monkeypatch.setattr(database, "DB_FILE", db_dir / "app.db")
    monkeypatch.setattr(database, "_db_initialized", False)

    root = tmp_path / "media"
    monkeypatch.setattr(media_storage, "STORAGE_ROOT", root)
    monkeypatch.setattr(media_storage, "VIDEOS_DIR", root / "videos")
    monkeypatch.setattr(media_storage, "IMAGES_DIR", root / "images")
    monkeypatch.setattr(media_storage, "AUDIO_DIR", root / "audio")
    monkeypatch.setattr(media_storage, "THUMBNAILS_DIR", root / "thumbnails")
    monkeypatch.setattr(media_storage, "_storage_instance", None)
    # Never fall back to a real secret/db location; signed URLs use a test secret.
    monkeypatch.setenv("MEDIA_URL_SECRET", "test-secret")

    monkeypatch.setattr(admin_config, "_CONFIG_PATH", tmp_path / "admin-config.json")
    monkeypatch.setenv("ADMIN_CONFIG_PATH", str(tmp_path / "admin-config.json"))

    rate_limiter._rate_limits.clear()
    prompt_lab_utils.reset_state()
    yield
    prompt_lab_utils.reset_state()
    rate_limiter._rate_limits.clear()


@pytest.fixture
def client():
    # Context manager runs lifespan: init DB + create env admin.
    with TestClient(main.app) as c:
        yield c


def _headers(token):
    return {"Authorization": f"Bearer {token}"}


@pytest.fixture
def admin_headers(client):
    r = client.post(
        "/api/auth/login", json={"username": ADMIN_EMAIL, "password": ADMIN_PASSWORD}
    )
    assert r.status_code == 200, r.text
    return _headers(r.json()["data"]["token"])


@pytest.fixture
def make_user(client):
    """Create a normal user with quotas and return (User, auth headers)."""

    def _make(email="user@test.de", quotas=None):
        user = UserManager.create_user(email, USER_PASSWORD)
        for gen_type, (qtype, limit) in (quotas or {}).items():
            QuotaManager.create_quota(user.id, gen_type, qtype, limit)
        for gen_type in ("image", "video"):
            if not (quotas and gen_type in quotas):
                QuotaManager.create_quota(user.id, gen_type, "limited", 10)
        r = client.post(
            "/api/auth/login", json={"username": email, "password": USER_PASSWORD}
        )
        assert r.status_code == 200 and r.json()["data"]["token"], r.text
        return user, _headers(r.json()["data"]["token"])

    return _make


@pytest.fixture
def user_a(make_user):
    return make_user("a@test.de")


@pytest.fixture
def user_b(make_user):
    return make_user("b@test.de")


class FakeModels:
    def __init__(self, calls):
        self.calls = calls

    def generate_content(self, model, contents, config):
        self.calls["generate_content"] = NS(model=model, contents=contents, config=config)
        part = NS(inline_data=NS(data=PNG, mime_type="image/jpeg"))
        return NS(candidates=[NS(finish_reason="STOP", content=NS(parts=[part]))])


@pytest.fixture
def fake_gemini(monkeypatch):
    """Fake client patched everywhere get_client is used. `.calls` records requests."""
    calls = {}
    fake = NS(models=FakeModels(calls), calls=calls)
    monkeypatch.setattr(gemini, "_client_for_key", lambda key: fake)
    monkeypatch.setattr(gemini, "get_client", lambda: fake)
    import routers.image, routers.video, routers.speech, routers.text_generation
    for mod in (routers.image, routers.video, routers.speech, routers.text_generation):
        if hasattr(mod, "get_client"):
            monkeypatch.setattr(mod, "get_client", lambda: fake)
    return fake
