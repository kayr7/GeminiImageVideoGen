import base64

import pytest

from utils.gemini import (
    DEFAULT_IMAGE_MIME, decode_data_url, split_data_url, to_base64, get_client,
)


def test_split_data_url_with_header():
    assert split_data_url("data:image/webp;base64,AAAA") == ("AAAA", "image/webp")


def test_split_data_url_plain_base64_uses_default():
    assert split_data_url("AAAA") == ("AAAA", DEFAULT_IMAGE_MIME)
    assert split_data_url("AAAA", "video/mp4") == ("AAAA", "video/mp4")


def test_split_data_url_missing_mime_falls_back():
    assert split_data_url("data:;base64,AAAA") == ("AAAA", DEFAULT_IMAGE_MIME)
    assert split_data_url("foo,AAAA") == ("AAAA", DEFAULT_IMAGE_MIME)


def test_decode_data_url():
    raw = b"hello"
    b64 = base64.b64encode(raw).decode()
    assert decode_data_url(f"data:text/plain;base64,{b64}") == (raw, "text/plain")
    assert decode_data_url(b64) == (raw, DEFAULT_IMAGE_MIME)


def test_to_base64():
    assert to_base64(b"hello") == base64.b64encode(b"hello").decode()
    assert to_base64("already") == "already"


def test_get_client_requires_key(monkeypatch):
    from fastapi import HTTPException
    monkeypatch.delenv("GEMINI_API_KEY")
    with pytest.raises(HTTPException) as exc:
        get_client()
    assert exc.value.status_code == 500
