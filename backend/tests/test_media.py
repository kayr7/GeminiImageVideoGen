import base64

from tests.conftest import PNG
from utils.media_storage import get_media_storage


def _save(user, mime="image/png"):
    return str(get_media_storage().save_media(
        media_type="image",
        base64_data=base64.b64encode(PNG).decode(),
        metadata={"prompt": "p", "model": "m", "userId": user.id, "mimeType": mime},
    ))


def test_requires_auth(client, user_a):
    mid = _save(user_a[0])
    assert client.get(f"/api/media/{mid}").status_code == 401


def test_owner_can_fetch(client, user_a):
    user, h = user_a
    mid = _save(user)
    r = client.get(f"/api/media/{mid}", headers=h)
    assert r.status_code == 200
    assert r.content == PNG
    assert r.headers["content-type"] == "image/png"


def test_owner_thumbnail(client, user_a):
    user, h = user_a
    mid = _save(user)
    r = client.get(f"/api/media/{mid}/thumbnail", headers=h)
    assert r.status_code == 200 and r.headers["content-type"] == "image/jpeg"


def test_other_user_forbidden_403(client, user_a, user_b):
    mid = _save(user_a[0])
    _, hb = user_b
    assert client.get(f"/api/media/{mid}", headers=hb).status_code == 403
    assert client.get(f"/api/media/{mid}/thumbnail", headers=hb).status_code == 403
    assert client.delete(f"/api/media/{mid}", headers=hb).status_code == 403
    # still there for the owner
    assert client.get(f"/api/media/{mid}", headers=user_a[1]).status_code == 200


def test_missing_media_404(client, user_a):
    assert client.get("/api/media/does-not-exist", headers=user_a[1]).status_code == 404


def test_list_only_own(client, user_a, user_b):
    ma = _save(user_a[0])
    _save(user_b[0])
    r = client.get("/api/media/list", headers=user_a[1]).json()["data"]
    assert [m["id"] for m in r["media"]] == [ma]
    assert r["total"] == 1


def test_owner_can_delete(client, user_a):
    user, h = user_a
    mid = _save(user)
    assert client.delete(f"/api/media/{mid}", headers=h).status_code == 200
    assert client.get(f"/api/media/{mid}", headers=h).status_code == 404
