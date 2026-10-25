import base64

import utils.media_storage as media_storage
from tests.conftest import ADMIN_EMAIL, PNG, USER_PASSWORD
from utils.database import get_connection
from utils.media_storage import get_media_storage
from utils.quota_manager import QuotaManager
from utils.user_manager import UserManager
from utils.video_queue import get_video_queue


def _admin_id():
    return UserManager.get_user_by_email(ADMIN_EMAIL).id


def _managed_user(make_user, email="victim@test.de"):
    user, headers = make_user(email)
    UserManager.create_admin_relationship(_admin_id(), user.id)
    UserManager.set_user_tags(user.id, ["t1"])
    return user, headers


def _save(user):
    return str(
        get_media_storage().save_media(
            media_type="image",
            base64_data=base64.b64encode(PNG).decode(),
            metadata={"prompt": "p", "model": "m", "userId": user.id, "mimeType": "image/png"},
        )
    )


def _files_for(mid):
    storage = get_media_storage()
    meta = storage.get_media_metadata(mid)
    return storage.file_path_for(meta["type"], meta["filename"]), media_storage.THUMBNAILS_DIR / f"{mid}.jpg"


def _count(table, user_id):
    with get_connection() as conn:
        return conn.execute(f"SELECT COUNT(*) FROM {table} WHERE user_id = ?", (user_id,)).fetchone()[0]


def test_delete_with_media(client, admin_headers, make_user):
    user, uh = _managed_user(make_user)
    mid = _save(user)
    file_path, thumb = _files_for(mid)
    thumb.write_bytes(b"x")
    get_video_queue().create_job({"userId": user.id, "prompt": "p", "status": "done"})
    assert file_path.exists()

    r = client.delete(f"/api/admin/users/{user.id}", headers=admin_headers)
    assert r.status_code == 200, r.text
    assert r.json()["data"] == {
        "userId": user.id, "email": user.email, "deletedMedia": 1, "keptMedia": 0,
    }
    assert not file_path.exists() and not thumb.exists()
    assert UserManager.get_user_by_id(user.id) is None
    for table in ("media", "video_jobs", "user_quotas", "user_sessions", "user_tags", "user_admins"):
        assert _count(table, user.id) == 0, table
    assert QuotaManager.get_all_quotas(user.id) == []
    assert client.get("/api/media/list", headers=uh).status_code == 401


def test_delete_keep_media(client, admin_headers, make_user):
    user, _ = _managed_user(make_user)
    mid = _save(user)
    file_path, _ = _files_for(mid)

    r = client.delete(f"/api/admin/users/{user.id}?deleteMedia=false", headers=admin_headers)
    assert r.status_code == 200
    assert r.json()["data"]["keptMedia"] == 1 and r.json()["data"]["deletedMedia"] == 0
    assert file_path.exists()

    r = client.get("/api/media/list", headers=admin_headers)
    assert r.status_code == 200
    items = r.json()["data"]["media"]
    assert [m["id"] for m in items] == [mid]
    assert items[0]["userEmail"] == "deleted user"
    # admin can still fetch the file
    assert client.get(f"/api/media/{mid}", headers=admin_headers).status_code == 200


def test_kept_media_hidden_from_regular_users(client, admin_headers, make_user):
    user, _ = _managed_user(make_user)
    mid = _save(user)
    client.delete(f"/api/admin/users/{user.id}?deleteMedia=false", headers=admin_headers)
    _, other = make_user("other@test.de")
    assert client.get("/api/media/list", headers=other).json()["data"]["media"] == []
    assert client.get(f"/api/media/{mid}", headers=other).status_code == 403


def test_rules(client, admin_headers, make_user):
    admin_id = _admin_id()
    assert client.delete("/api/admin/users/nope", headers=admin_headers).status_code == 404
    # self
    r = client.delete(f"/api/admin/users/{admin_id}", headers=admin_headers)
    assert r.status_code == 400
    # unmanaged user
    stranger, _ = make_user("stranger@test.de")
    assert client.delete(f"/api/admin/users/{stranger.id}", headers=admin_headers).status_code == 403
    assert UserManager.get_user_by_id(stranger.id) is not None
    # other admin account
    other_admin = UserManager.create_user("admin2@test.de", USER_PASSWORD, is_admin=True)
    UserManager.create_admin_relationship(admin_id, other_admin.id)
    r = client.delete(f"/api/admin/users/{other_admin.id}", headers=admin_headers)
    assert r.status_code == 400 and r.json()["detail"] == "Remove admin rights before deleting"


def test_env_admin_protected(client, admin_headers, make_user, monkeypatch):
    # A second admin tries to delete the env admin (managed by them, non-admin flag).
    env_user = UserManager.get_user_by_email(ADMIN_EMAIL)
    admin2 = UserManager.create_user("admin2@test.de", USER_PASSWORD, is_admin=True)
    UserManager.create_admin_relationship(admin2.id, env_user.id)
    token = client.post(
        "/api/auth/login", json={"username": "admin2@test.de", "password": USER_PASSWORD}
    ).json()["data"]["token"]
    h = {"Authorization": f"Bearer {token}"}
    r = client.delete(f"/api/admin/users/{env_user.id}", headers=h)
    assert r.status_code == 400
    # also if the account itself lacks the admin flag
    with get_connection() as conn:
        conn.execute("UPDATE users SET is_admin = 0 WHERE id = ?", (env_user.id,))
        conn.commit()
    r = client.delete(f"/api/admin/users/{env_user.id}", headers=h)
    assert r.status_code == 400 and "environment" in r.json()["detail"]
    assert UserManager.get_user_by_id(env_user.id) is not None


def test_non_admin_forbidden(client, user_a, user_b):
    r = client.delete(f"/api/admin/users/{user_b[0].id}", headers=user_a[1])
    assert r.status_code == 403
    r = client.post("/api/admin/users/bulk-delete", json={"userIds": [user_b[0].id]}, headers=user_a[1])
    assert r.status_code == 403
    assert UserManager.get_user_by_id(user_b[0].id) is not None


def test_bulk_delete_mixed(client, admin_headers, make_user):
    u1, _ = _managed_user(make_user, "u1@test.de")
    u2, _ = _managed_user(make_user, "u2@test.de")
    stranger, _ = make_user("stranger@test.de")
    _save(u1)
    _save(u1)
    _save(u2)
    r = client.post(
        "/api/admin/users/bulk-delete",
        json={"userIds": [u1.id, "nope", stranger.id, _admin_id(), u2.id]},
        headers=admin_headers,
    )
    assert r.status_code == 200, r.text
    data = r.json()["data"]
    assert data["deleted"] == [u1.id, u2.id]
    assert data["deletedMedia"] == 3
    reasons = {f["userId"]: f["reason"] for f in data["failed"]}
    assert set(reasons) == {"nope", stranger.id, _admin_id()}
    assert reasons["nope"] == "User not found"
    assert UserManager.get_user_by_id(stranger.id) is not None


def test_bulk_delete_keep_media_and_validation(client, admin_headers, make_user):
    u1, _ = _managed_user(make_user, "u1@test.de")
    _save(u1)
    r = client.post(
        "/api/admin/users/bulk-delete",
        json={"userIds": [u1.id], "deleteMedia": False},
        headers=admin_headers,
    )
    assert r.json()["data"]["deleted"] == [u1.id] and r.json()["data"]["deletedMedia"] == 0
    assert _count("media", u1.id) == 1
    assert client.post("/api/admin/users/bulk-delete", json={"userIds": []}, headers=admin_headers).status_code == 422


def test_deleted_user_cannot_login_and_can_be_recreated(client, admin_headers, make_user):
    user, _ = _managed_user(make_user, "again@test.de")
    assert client.delete(f"/api/admin/users/{user.id}", headers=admin_headers).status_code == 200
    r = client.post("/api/auth/login", json={"username": "again@test.de", "password": USER_PASSWORD})
    assert r.status_code in (401, 403) or not r.json().get("data", {}).get("token")

    r = client.post("/api/admin/users/bulk-create", json={"emails": ["again@test.de"]}, headers=admin_headers)
    assert r.status_code == 200 and r.json()["data"]["created"][0]["isNew"] is True
    assert UserManager.get_user_by_email("again@test.de").id != user.id


def test_list_includes_media_count(client, admin_headers, make_user):
    user, _ = _managed_user(make_user)
    _save(user)
    _save(user)
    users = client.get("/api/admin/users", headers=admin_headers).json()["data"]["users"]
    assert {u["id"]: u["mediaCount"] for u in users}[user.id] == 2
