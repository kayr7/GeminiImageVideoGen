import sqlite3

import pytest

import utils.database as database
import utils.placeholder_manager as pm
from tests.conftest import ADMIN_EMAIL
from utils.database import get_connection
from utils.user_manager import UserManager

URL = "/api/placeholders"


def _create(client, headers, name="CONTEXT", value="We are ACME GmbH", **extra):
    return client.post(URL, json={"name": name, "value": value, **extra}, headers=headers)


def _list(client, headers):
    r = client.get(URL, headers=headers)
    assert r.status_code == 200, r.text
    return r.json()["data"]["placeholders"]


def test_crud_happy_path(client, user_a):
    user, h = user_a
    r = _create(client, h, name="  CONTEXT ", value="  We are ACME GmbH, a Stuttgart bakery\n",
                description="Company intro")
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["success"] is True
    p = body["data"]["placeholder"]
    assert set(p) == {"id", "userId", "name", "value", "description", "createdAt", "updatedAt"}
    assert p["userId"] == user.id
    assert p["name"] == "CONTEXT"
    assert p["value"] == "We are ACME GmbH, a Stuttgart bakery"
    assert p["description"] == "Company intro"
    assert p["createdAt"].endswith("Z") and p["createdAt"] == p["updatedAt"]

    assert _list(client, h) == [p]

    r = client.put(f"{URL}/{p['id']}", json={"value": "New value"}, headers=h)
    assert r.status_code == 200, r.text
    q = r.json()["data"]["placeholder"]
    assert q["value"] == "New value" and q["name"] == "CONTEXT"
    assert q["description"] == "Company intro"
    assert q["createdAt"] == p["createdAt"] and q["updatedAt"] >= p["updatedAt"]

    r = client.put(f"{URL}/{p['id']}", json={"name": "AUDIENCE", "description": None}, headers=h)
    assert r.status_code == 200, r.text
    q = r.json()["data"]["placeholder"]
    assert q["name"] == "AUDIENCE" and q["description"] is None and q["value"] == "New value"

    r = client.put(f"{URL}/{p['id']}", json={}, headers=h)
    assert r.status_code == 200 and r.json()["data"]["placeholder"]["name"] == "AUDIENCE"

    r = client.delete(f"{URL}/{p['id']}", headers=h)
    assert r.status_code == 200
    assert r.json() == {"success": True, "data": {"placeholderId": p["id"]}}
    assert _list(client, h) == []
    assert client.delete(f"{URL}/{p['id']}", headers=h).status_code == 404


def test_list_sorted_case_insensitive(client, user_a):
    _, h = user_a
    for name in ("beta", "Alpha", "GAMMA", "alpha2", "_x"):
        assert _create(client, h, name=name).status_code == 200
    assert [p["name"] for p in _list(client, h)] == ["_x", "Alpha", "alpha2", "beta", "GAMMA"]


def test_duplicate_name_conflict(client, user_a):
    _, h = user_a
    assert _create(client, h).status_code == 200
    r = _create(client, h, name=" CONTEXT ")
    assert r.status_code == 409 and "detail" in r.json()
    # Case-sensitive: a different case is a different placeholder.
    assert _create(client, h, name="context").status_code == 200


def test_rename_clash_conflict(client, user_a):
    _, h = user_a
    _create(client, h, name="A")
    b = _create(client, h, name="B").json()["data"]["placeholder"]
    r = client.put(f"{URL}/{b['id']}", json={"name": "A"}, headers=h)
    assert r.status_code == 409
    # Renaming to its own name is fine.
    r = client.put(f"{URL}/{b['id']}", json={"name": "B", "value": "v2"}, headers=h)
    assert r.status_code == 200 and r.json()["data"]["placeholder"]["value"] == "v2"


def test_upsert_by_name(client, user_a):
    _, h = user_a
    r = client.put(f"{URL}/by-name/CONTEXT", json={"value": "first"}, headers=h)
    assert r.status_code == 200, r.text
    p = r.json()["data"]["placeholder"]
    assert p["name"] == "CONTEXT" and p["value"] == "first" and p["description"] is None

    r = client.put(f"{URL}/by-name/CONTEXT", json={"value": "second", "description": "d"}, headers=h)
    q = r.json()["data"]["placeholder"]
    assert r.status_code == 200 and q["id"] == p["id"]
    assert q["value"] == "second" and q["description"] == "d"

    # Omitted description stays unchanged.
    r = client.put(f"{URL}/by-name/CONTEXT", json={"value": "third"}, headers=h)
    q = r.json()["data"]["placeholder"]
    assert q["value"] == "third" and q["description"] == "d"
    assert len(_list(client, h)) == 1

    # A placeholder literally named "by-name" is impossible (hyphen), but an id-route
    # PUT with a by-name-like id must not hit the upsert route.
    assert client.put(f"{URL}/by-name", json={"value": "x"}, headers=h).status_code == 404

    for bad in ("bad-name", "has%20space", "x" * 65):
        r = client.put(f"{URL}/by-name/{bad}", json={"value": "x"}, headers=h)
        assert r.status_code == 422, bad
    r = client.put(f"{URL}/by-name/OK", json={"value": "   "}, headers=h)
    assert r.status_code == 422


@pytest.mark.parametrize("name", ["has space", "bad-name", "{{X}}", "x" * 65, "", "   ", "ümlaut", None])
def test_invalid_names(client, user_a, name):
    _, h = user_a
    assert _create(client, h, name=name).status_code in (400, 422)
    ok = _create(client, h, name="OK_1").json()["data"]["placeholder"]
    if name is not None:
        r = client.put(f"{URL}/{ok['id']}", json={"name": name}, headers=h)
        assert r.status_code in (400, 422)
    client.delete(f"{URL}/{ok['id']}", headers=h)


def test_name_max_length_ok(client, user_a):
    _, h = user_a
    assert _create(client, h, name="x" * 64).status_code == 200


def test_value_and_description_validation(client, user_a):
    _, h = user_a
    assert _create(client, h, value="x" * 20000).status_code == 200
    assert _create(client, h, name="B", value="x" * 20001).status_code == 422
    assert _create(client, h, name="C", value="").status_code == 422
    assert _create(client, h, name="D", value=" \n ").status_code == 422
    assert _create(client, h, name="E", description="d" * 501).status_code == 422
    r = _create(client, h, name="F", description="d" * 500)
    assert r.status_code == 200
    r = _create(client, h, name="G", description="  ")
    assert r.json()["data"]["placeholder"]["description"] is None
    pid = r.json()["data"]["placeholder"]["id"]
    assert client.put(f"{URL}/{pid}", json={"value": ""}, headers=h).status_code == 422
    assert client.put(f"{URL}/{pid}", json={"value": None}, headers=h).status_code == 422
    assert client.put(f"{URL}/{pid}", json={"name": None}, headers=h).status_code == 422


def test_limit(client, user_a, user_b, monkeypatch):
    monkeypatch.setattr(pm, "MAX_PLACEHOLDERS_PER_USER", 3)
    _, h = user_a
    for i in range(3):
        assert _create(client, h, name=f"P{i}").status_code == 200
    r = _create(client, h, name="P3")
    assert r.status_code == 400 and "limit" in r.json()["detail"].lower()
    r = client.put(f"{URL}/by-name/P3", json={"value": "x"}, headers=h)
    assert r.status_code == 400
    # Updating existing ones at the limit still works.
    assert client.put(f"{URL}/by-name/P0", json={"value": "x"}, headers=h).status_code == 200
    # Limit is per user.
    assert _create(client, user_b[1], name="P0").status_code == 200


def test_default_limit_is_100():
    assert pm.MAX_PLACEHOLDERS_PER_USER == 100


def test_isolation_between_users(client, user_a, user_b):
    _, ha = user_a
    _, hb = user_b
    p = _create(client, ha).json()["data"]["placeholder"]
    # Same name is fine for another user.
    assert _create(client, hb, value="B's context").status_code == 200

    assert [x["value"] for x in _list(client, ha)] == ["We are ACME GmbH"]
    assert [x["value"] for x in _list(client, hb)] == ["B's context"]

    assert client.put(f"{URL}/{p['id']}", json={"value": "hacked"}, headers=hb).status_code == 404
    assert client.delete(f"{URL}/{p['id']}", headers=hb).status_code == 404
    # by-name only ever touches the caller's own placeholder.
    client.put(f"{URL}/by-name/CONTEXT", json={"value": "B2"}, headers=hb)
    assert [x["value"] for x in _list(client, ha)] == ["We are ACME GmbH"]
    assert client.put(f"{URL}/does-not-exist", json={"value": "x"}, headers=ha).status_code == 404


def test_requires_auth(client):
    assert client.get(URL).status_code == 401
    assert client.post(URL, json={"name": "A", "value": "v"}).status_code == 401
    assert client.put(f"{URL}/x", json={"value": "v"}).status_code == 401
    assert client.put(f"{URL}/by-name/A", json={"value": "v"}).status_code == 401
    assert client.delete(f"{URL}/x").status_code == 401


def test_cascade_on_user_delete(client, admin_headers, user_a):
    user, h = user_a
    _create(client, h, name="A")
    _create(client, h, name="B")
    UserManager.create_admin_relationship(UserManager.get_user_by_email(ADMIN_EMAIL).id, user.id)

    def count():
        with get_connection() as conn:
            return conn.execute(
                "SELECT COUNT(*) FROM user_placeholders WHERE user_id = ?", (user.id,)
            ).fetchone()[0]

    assert count() == 2
    r = client.delete(f"/api/admin/users/{user.id}", headers=admin_headers)
    assert r.status_code == 200, r.text
    assert count() == 0


def test_migration_on_fresh_db(client):
    with sqlite3.connect(database.DB_FILE) as conn:
        versions = {r[0] for r in conn.execute("SELECT version FROM schema_migrations")}
        assert 11 in versions
        cols = [r[1] for r in conn.execute("PRAGMA table_info(user_placeholders)")]
        assert cols == ["id", "user_id", "name", "value", "description", "created_at", "updated_at"]
        fks = conn.execute("PRAGMA foreign_key_list(user_placeholders)").fetchall()
        assert any(fk[2] == "users" and fk[6] == "CASCADE" for fk in fks)
        indexes = {r[1] for r in conn.execute("PRAGMA index_list(user_placeholders)")}
        assert "idx_user_placeholders_user_id" in indexes


def test_manager_unique_race_maps_to_conflict(client, user_a):
    """Manager-level conflicts; the rename path relies on the UNIQUE constraint (IntegrityError)."""
    user, _ = user_a
    pm.PlaceholderManager.create_placeholder(user.id, "X", "v")
    with pytest.raises(pm.PlaceholderNameConflict):
        pm.PlaceholderManager.create_placeholder(user.id, "X", "v")
    other = pm.PlaceholderManager.create_placeholder(user.id, "Y", "v")
    with pytest.raises(pm.PlaceholderNameConflict):
        pm.PlaceholderManager.update_placeholder(other.id, user.id, name="X")
