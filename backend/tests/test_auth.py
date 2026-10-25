import pytest

from tests.conftest import ADMIN_EMAIL, ADMIN_PASSWORD


def test_login_success(client):
    r = client.post("/api/auth/login", json={"username": ADMIN_EMAIL, "password": ADMIN_PASSWORD})
    assert r.status_code == 200
    data = r.json()["data"]
    assert data["token"]
    assert data["user"]["username"] == ADMIN_EMAIL
    assert "admin" in data["user"]["roles"]
    assert "models" in data["config"]


def test_login_wrong_password(client):
    r = client.post("/api/auth/login", json={"username": ADMIN_EMAIL, "password": "nope"})
    assert r.status_code == 401


def test_login_unknown_user(client):
    r = client.post("/api/auth/login", json={"username": "ghost@test.de", "password": "x"})
    assert r.status_code == 401


def test_me_requires_token(client):
    assert client.get("/api/auth/me").status_code == 401
    assert client.get("/api/auth/me", headers={"Authorization": "Bearer bogus"}).status_code == 401


def test_me_with_token(client, user_a):
    user, headers = user_a
    r = client.get("/api/auth/me", headers=headers)
    assert r.status_code == 200
    assert r.json()["data"]["user"]["email"] == "a@test.de"
    assert r.json()["data"]["user"]["isAdmin"] is False


def test_logout_invalidates_token(client, user_a):
    _, headers = user_a
    assert client.post("/api/auth/logout", headers=headers).status_code == 200
    assert client.get("/api/auth/me", headers=headers).status_code == 401


def test_logout_requires_token(client):
    assert client.post("/api/auth/logout").status_code == 401


def test_session_invalidate_makes_token_unusable(client, user_a):
    from utils.session import session_manager

    _, headers = user_a
    token = headers["Authorization"].split(" ", 1)[1]
    session_manager.invalidate(token)
    assert client.get("/api/auth/me", headers=headers).status_code == 401


@pytest.mark.parametrize("path", ["/api/admin/models", "/api/admin/users"])
def test_non_admin_forbidden(client, user_a, path):
    _, headers = user_a
    assert client.get(path, headers=headers).status_code == 403


@pytest.mark.parametrize("path", ["/api/admin/models", "/api/admin/users"])
def test_admin_endpoints_require_auth(client, path):
    assert client.get(path).status_code == 401


def test_admin_can_list_models(client, admin_headers):
    r = client.get("/api/admin/models", headers=admin_headers)
    assert r.status_code == 200
    assert {"registry", "settings", "effective"} <= set(r.json()["data"])
