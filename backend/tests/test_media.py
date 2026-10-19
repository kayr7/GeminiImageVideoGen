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


# ---------------------------------------------------------------------------
# Signed URLs, slim list, inputs, thumbnails
# ---------------------------------------------------------------------------
import base64 as _b64
import json
import time


from utils import media_urls
from utils.database import get_connection

DATA_URL = "data:image/png;base64," + _b64.b64encode(PNG).decode()


def _save_with_details(user, details, media_type="image"):
    return str(get_media_storage().save_media(
        media_type=media_type,
        base64_data=_b64.b64encode(PNG).decode(),
        metadata={"prompt": "p", "model": "m", "userId": user.id, "mimeType": "image/png",
                  "details": details, "ipAddress": "1.2.3.4"},
    ))


def _legacy_row(user, details):
    """Insert a row the way old versions did: inline data URLs in details."""
    mid = _save(user)
    with get_connection() as conn:
        conn.execute("UPDATE media SET details = ? WHERE id = ?", (json.dumps(details), mid))
        conn.commit()
    return mid


def _link_admin(user):
    from utils.user_manager import UserManager
    admin = UserManager.get_user_by_email("admin@test.de")
    with get_connection() as conn:
        conn.execute(
            "INSERT INTO user_admins (user_id, admin_id, created_at) VALUES (?, ?, '2026-01-01T00:00:00')",
            (user.id, admin.id),
        )
        conn.commit()


def _listing(client, headers, **params):
    r = client.get("/api/media/list", headers=headers, params=params)
    assert r.status_code == 200, r.text
    return r.json()["data"]


def test_list_shape_and_no_base64_for_user_and_admin(client, user_a, admin_headers):
    user, h = user_a
    _link_admin(user)
    mid = _legacy_row(user, {
        "mode": "animate", "negativePrompt": "blurry",
        "referenceImages": [DATA_URL, DATA_URL], "sourceImages": [DATA_URL],
        "firstFrame": DATA_URL, "lastFrame": None,
    })
    keys = {"id", "type", "prompt", "model", "createdAt", "fileSize", "mimeType", "userId",
            "userEmail", "ipAddress", "url", "thumbnailUrl", "details"}
    detail_keys = {"mode", "negativePrompt", "firstFrame", "lastFrame", "referenceImages", "sourceImages"}

    for headers, is_admin in ((h, False), (admin_headers, True)):
        data = _listing(client, headers)
        assert set(data) == {"media", "total", "page", "limit", "pages"}
        item = next(m for m in data["media"] if m["id"] == mid)
        assert set(item) == keys and set(item["details"]) == detail_keys
        assert "base64" not in json.dumps(data)
        assert item["userEmail"] == (user.email if is_admin else None)
        assert item["ipAddress"] == ("1.2.3.4" if is_admin else None) or item["ipAddress"] is None
        d = item["details"]
        assert d["mode"] == "animate" and d["negativePrompt"] == "blurry"
        assert len(d["referenceImages"]) == 2 and len(d["sourceImages"]) == 1
        assert d["firstFrame"].startswith(f"/api/media/{mid}/inputs/firstFrame/0?exp=")
        assert d["lastFrame"] is None
        assert item["url"].startswith(f"/api/media/{mid}?exp=")
        assert item["thumbnailUrl"].startswith(f"/api/media/{mid}/thumbnail?exp=")


def test_admin_sees_managed_users_only(client, admin_headers, user_a, user_b):
    _link_admin(user_a[0])
    ma, mb = _save(user_a[0]), _save(user_b[0])
    ids = [m["id"] for m in _listing(client, admin_headers)["media"]]
    assert ma in ids and mb not in ids


def test_list_pagination_and_type_filter(client, user_a):
    user, h = user_a
    for _ in range(3):
        _save(user)
    data = _listing(client, h, limit=2, page=2)
    assert data["total"] == 3 and data["pages"] == 2 and len(data["media"]) == 1
    assert _listing(client, h, type="video")["total"] == 0


def test_signed_url_works_without_bearer(client, user_a):
    mid = _save(user_a[0])
    item = _listing(client, user_a[1])["media"][0]
    r = client.get(item["url"])
    assert r.status_code == 200 and r.content == PNG
    assert r.headers["cache-control"] == "private, max-age=86400"
    r = client.get(item["thumbnailUrl"])
    assert r.status_code == 200 and r.headers["content-type"] == "image/jpeg"
    assert mid in item["url"]


def test_tampered_expired_and_foreign_sigs_rejected(client, user_a, monkeypatch):
    ma, mb = _save(user_a[0]), _save(user_a[0])
    exp = media_urls.current_expiry()
    sig_a = media_urls._sign(ma, exp)
    assert client.get(f"/api/media/{ma}?exp={exp}&sig={sig_a}").status_code == 200
    # sig for A does not authorise B (original, thumbnail, inputs)
    assert client.get(f"/api/media/{mb}?exp={exp}&sig={sig_a}").status_code == 401
    assert client.get(f"/api/media/{mb}/thumbnail?exp={exp}&sig={sig_a}").status_code == 401
    assert client.get(f"/api/media/{mb}/inputs/firstFrame/0?exp={exp}&sig={sig_a}").status_code == 401
    # tampered sig / exp, garbage exp, missing params
    assert client.get(f"/api/media/{ma}?exp={exp}&sig={'0' * 32}").status_code == 401
    assert client.get(f"/api/media/{ma}?exp={exp + 1}&sig={sig_a}").status_code == 401
    assert client.get(f"/api/media/{ma}?exp=abc&sig={sig_a}").status_code == 401
    assert client.get(f"/api/media/{ma}?sig={sig_a}").status_code == 401
    # expired
    old = int(time.time()) - 10
    assert client.get(f"/api/media/{ma}?exp={old}&sig={media_urls._sign(ma, old)}").status_code == 401
    # a bad sig must not block a valid bearer
    assert client.get(f"/api/media/{ma}?exp={exp}&sig={'0' * 32}", headers=user_a[1]).status_code == 200


def test_media_urls_expiry_is_stable_within_day():
    from datetime import datetime, timezone
    t1 = datetime(2026, 3, 1, 0, 0, 1, tzinfo=timezone.utc).timestamp()
    t2 = datetime(2026, 3, 1, 23, 59, 59, tzinfo=timezone.utc).timestamp()
    t3 = datetime(2026, 3, 2, 0, 0, 1, tzinfo=timezone.utc).timestamp()
    assert media_urls.current_expiry(t1) == media_urls.current_expiry(t2)
    assert media_urls.current_expiry(t3) == media_urls.current_expiry(t1) + 86400
    assert datetime.fromtimestamp(media_urls.current_expiry(t1), tz=timezone.utc) == datetime(2026, 3, 3, tzinfo=timezone.utc)
    assert not media_urls.verify("x", "nope", "sig") and not media_urls.verify("x", None, None)


def test_secret_persisted_when_env_unset(monkeypatch, tmp_path):
    from utils import database
    monkeypatch.delenv("MEDIA_URL_SECRET", raising=False)
    monkeypatch.setattr(media_urls, "_cached", {})
    path = media_urls.sign_media_path("abc", "/x")
    secret_file = database.DB_DIR / "media_url_secret"
    assert secret_file.exists() and oct(secret_file.stat().st_mode & 0o777) == "0o600"
    monkeypatch.setattr(media_urls, "_cached", {})
    assert media_urls.sign_media_path("abc", "/x") == path


def test_inputs_endpoint_legacy_inline(client, user_a):
    mid = _legacy_row(user_a[0], {"referenceImages": [DATA_URL], "firstFrame": DATA_URL})
    item = _listing(client, user_a[1])["media"][0]
    for url in (item["details"]["referenceImages"][0], item["details"]["firstFrame"]):
        r = client.get(url)
        assert r.status_code == 200 and r.headers["content-type"] == "image/jpeg"
        assert r.content[:2] == b"\xff\xd8"
    # preview cached on disk
    from utils import media_storage
    assert (media_storage.STORAGE_ROOT / "inputs" / f"{mid}_firstFrame_0.jpg").exists()
    # out of range / unknown kind
    assert client.get(item["details"]["referenceImages"][0].replace("/0?", "/5?")).status_code == 404
    assert client.get(item["url"].replace(f"{mid}?", f"{mid}/inputs/bogus/0?")).status_code == 404


def test_new_rows_store_files_not_base64(client, user_a):
    from utils import media_storage
    user, h = user_a
    mid = _save_with_details(user, {
        "mode": "edit", "sourceImages": [DATA_URL, DATA_URL], "firstFrame": DATA_URL, "lastFrame": None,
    })
    with get_connection() as conn:
        raw = conn.execute("SELECT details FROM media WHERE id = ?", (mid,)).fetchone()[0]
    stored = json.loads(raw)
    assert "base64" not in raw and "data:" not in raw
    assert stored["mode"] == "edit"
    assert len(stored["inputs"]["sourceImages"]) == 2 and isinstance(stored["inputs"]["firstFrame"], str)
    originals = media_storage.STORAGE_ROOT / "inputs" / "originals"
    assert (originals / stored["inputs"]["sourceImages"][1]).read_bytes() == PNG

    item = _listing(client, h)["media"][0]
    d = item["details"]
    assert d["mode"] == "edit" and len(d["sourceImages"]) == 2 and d["firstFrame"] and d["lastFrame"] is None
    assert client.get(d["sourceImages"][1]).status_code == 200
    assert client.get(d["firstFrame"]).status_code == 200

    # deleting the media removes input files and previews
    assert client.delete(f"/api/media/{mid}", headers=h).status_code == 200
    assert not list(originals.glob(f"{mid}_*"))
    assert not list((media_storage.STORAGE_ROOT / "inputs").glob(f"{mid}_*.jpg"))


def test_thumbnail_and_original_do_not_read_file_via_get_media(client, user_a, monkeypatch):
    mid = _save(user_a[0])
    item = _listing(client, user_a[1])["media"][0]

    def boom(*a, **k):
        raise AssertionError("get_media must not be used")

    monkeypatch.setattr(type(get_media_storage()), "get_media", boom)
    # first call generates the thumbnail (reads the file by path), second serves the cache
    assert client.get(item["thumbnailUrl"]).status_code == 200
    from utils import media_storage
    assert (media_storage.THUMBNAILS_DIR / f"{mid}.jpg").exists()
    import PIL.Image

    def no_open(*a, **k):
        raise AssertionError("original must not be opened when a thumbnail is cached")

    monkeypatch.setattr(PIL.Image, "open", no_open)
    assert client.get(item["thumbnailUrl"]).status_code == 200
    assert client.get(item["url"]).content == PNG


def test_original_supports_range_requests(client, user_a):
    _save(user_a[0])
    item = _listing(client, user_a[1])["media"][0]
    r = client.get(item["url"], headers={"Range": "bytes=0-7"})
    assert r.status_code == 206 and r.content == PNG[:8]
    assert r.headers["content-range"] == f"bytes 0-7/{len(PNG)}"
