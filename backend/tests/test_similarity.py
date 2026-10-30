import pytest

from utils import embeddings


@pytest.fixture
def fake_embed(monkeypatch):
    vectors = {"a": [1.0, 0.0], "b": [1.0, 0.0], "c": [0.0, 1.0]}

    async def _embed(texts):
        return [vectors[t] for t in texts]

    monkeypatch.setattr(embeddings, "embed", _embed)


def test_admin_gets_similarity(client, admin_headers, fake_embed):
    r = client.post("/api/admin/similarity", json={"textA": "a", "textB": "b"}, headers=admin_headers)
    assert r.status_code == 200
    assert r.json()["data"]["similarity"] == 1.0
    r = client.post("/api/admin/similarity", json={"textA": "a", "textB": "c"}, headers=admin_headers)
    assert r.json()["data"]["similarity"] == 0.0


def test_non_admin_rejected(client, user_a, fake_embed):
    body = {"textA": "a", "textB": "b"}
    assert client.post("/api/admin/similarity", json=body).status_code == 401
    assert client.post("/api/admin/similarity", json=body, headers=user_a[1]).status_code == 403


def test_validation_and_backend_down(client, admin_headers, monkeypatch):
    post = lambda b: client.post("/api/admin/similarity", json=b, headers=admin_headers)
    assert post({"textA": "  ", "textB": "b"}).status_code == 422
    assert post({"textA": "x" * 2001, "textB": "b"}).status_code == 422

    async def _down(texts):
        raise embeddings.EmbeddingError("Embedding service (Ollama) is unreachable")

    monkeypatch.setattr(embeddings, "embed", _down)
    assert post({"textA": "a", "textB": "b"}).status_code == 503
