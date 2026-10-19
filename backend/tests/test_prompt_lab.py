"""Prompt Lab: public gating, SSE contract, limits, concurrency (fake async upstream)."""
import asyncio
import json
import time
from types import SimpleNamespace as NS

import httpx
import pytest
from fastapi.testclient import TestClient

import main
import utils.prompt_lab as lab
from routers import prompt_lab as router_mod
from utils import database


class FakeUpstream:
    def __init__(self):
        self.calls = []
        self.count_calls = []
        self.count_result = 10
        self.delay = 0.0
        self.fail_after = None  # raise after N chunks
        self.current = 0
        self.max_current = 0

    def _chunk(self, text, thought=False, usage=None):
        part = NS(text=text, thought=thought)
        return NS(candidates=[NS(content=NS(parts=[part]))], usage_metadata=usage)

    async def generate_content_stream(self, model, contents, config):
        self.calls.append(NS(model=model, contents=contents, config=config))
        self.current += 1
        self.max_current = max(self.max_current, self.current)

        async def gen():
            try:
                if self.delay:
                    await asyncio.sleep(self.delay)
                yield self._chunk("thinking...", thought=True)
                yield self._chunk("Hello ")
                if self.fail_after is not None:
                    raise RuntimeError("boom secret")
                usage = NS(prompt_token_count=7, thoughts_token_count=3,
                           candidates_token_count=5, total_token_count=15)
                yield self._chunk("world", usage=usage)
            finally:
                self.current -= 1

        return gen()

    async def count_tokens(self, model, contents, config=None):
        self.count_calls.append(contents)
        return NS(total_tokens=self.count_result)

    @property
    def aio(self):
        return NS(models=self)


@pytest.fixture
def fake(monkeypatch):
    f = FakeUpstream()
    monkeypatch.setattr(router_mod, "get_client", lambda: f)
    return f


def enable(minutes=None, **kw):
    s = lab.get_settings()
    s.update(enabled=True, expiresAt=lab.now_plus(minutes) if minutes else None, **kw)
    lab.save_settings(s)


def body(**over):
    b = {"model": "gemini-2.5-flash", "messages": [{"role": "user", "text": "hi"}],
         "thinking": {"budget": -1}}
    b.update(over)
    return b


def parse_sse(text):
    events = []
    for block in text.split("\n\n"):
        if block.startswith(":") or not block.strip():
            continue
        name, data = block.split("\n", 1)
        events.append((name[len("event: "):], json.loads(data[len("data: "):])))
    return events


def gen(client, b=None, cid="c1", headers=None):
    h = {"X-Client-Id": cid} if cid else {}
    h.update(headers or {})
    return client.post("/api/prompt-lab/generate", json=b or body(), headers=h)


def test_disabled_then_admin_enables(client, admin_headers, fake):
    r = client.get("/api/prompt-lab/config")
    assert r.json()["data"]["enabled"] is False and r.json()["data"]["models"] == []
    assert gen(client).status_code == 403

    r = client.put("/api/admin/prompt-lab", json={"enabled": True, "durationMinutes": 30},
                   headers=admin_headers)
    assert r.status_code == 200, r.text
    d = r.json()["data"]
    assert d["settings"]["enabled"] and d["settings"]["expiresAt"].endswith("Z")
    assert len(d["availableModels"]) == 5 and d["stats"]["activeRequests"] == 0

    cfg = client.get("/api/prompt-lab/config").json()["data"]
    assert cfg["enabled"] and cfg["maxInputTokens"] == 10000
    assert [m["id"] for m in cfg["models"]] == [
        "gemini-3.8-flash", "gemini-3.6-flash", "gemini-3.5-flash-lite", "gemini-2.5-flash"]
    assert cfg["defaultModel"] == "gemini-3.8-flash"
    m38 = cfg["models"][0]
    assert m38["supportsTemperature"] is False
    assert m38["thinking"]["kind"] == "level" and m38["thinking"]["canDisable"] is False
    assert [p["level"] for p in m38["thinking"]["presets"]] == ["low", "medium", "high"]
    assert m38["thinking"]["default"] == {"level": "medium"}
    m25 = cfg["models"][3]
    assert m25["supportsTemperature"] is True and m25["thinking"]["kind"] == "budget"
    assert m25["thinking"]["presets"][0] == {"label": "Off", "budget": 0}
    assert m25["thinking"]["presets"][-1]["budget"] == -1
    assert gen(client).status_code == 200

    r = client.put("/api/admin/prompt-lab", json={"enabled": False}, headers=admin_headers)
    assert r.json()["data"]["settings"]["expiresAt"] is None
    assert gen(client).status_code == 403
    assert client.get("/api/admin/prompt-lab", headers=admin_headers).status_code == 200


def test_expired_is_disabled(client, fake):
    enable()
    s = lab.get_settings()
    s["expiresAt"] = "2000-01-01T00:00:00Z"
    lab.save_settings(s)
    assert client.get("/api/prompt-lab/config").json()["data"]["enabled"] is False
    assert gen(client).status_code == 403


def test_admin_auth(client, user_a):
    assert client.put("/api/admin/prompt-lab", json={"enabled": True}).status_code == 401
    assert client.get("/api/admin/prompt-lab").status_code == 401
    r = client.put("/api/admin/prompt-lab", json={"enabled": True}, headers=user_a[1])
    assert r.status_code == 403


def test_admin_validation(client, admin_headers):
    put = lambda b: client.put("/api/admin/prompt-lab", json=b, headers=admin_headers)
    assert put({"allowedModels": ["nope"]}).status_code == 400
    assert put({"allowedModels": ["gemini-2.5-pro"]}).status_code == 400  # removed model
    assert put({"allowedModels": ["gemini-4-argon"], "defaultModel": "gemini-2.5-flash"}).status_code == 400
    assert put({"maxOutputTokens": 10}).status_code == 422
    r = put({"allowedModels": ["gemini-4-argon"]})
    assert r.json()["data"]["settings"]["defaultModel"] == "gemini-4-argon"


def test_sse_order_and_headers(client, fake):
    enable()
    r = gen(client)
    assert r.headers["content-type"].startswith("text/event-stream")
    assert r.headers["cache-control"] == "no-cache" and r.headers["x-accel-buffering"] == "no"
    ev = parse_sse(r.text)
    assert [e[0] for e in ev] == ["thought", "answer", "answer", "usage", "done"]
    usage = ev[3][1]
    assert usage["promptTokens"] == 7 and usage["thoughtsTokens"] == 3
    assert usage["outputTokens"] == 5 and usage["totalTokens"] == 15
    assert usage["model"] == "gemini-2.5-flash" and usage["thinkingBudget"] == -1
    assert usage["thinkingLevel"] is None
    assert "firstTokenMs" in usage and "latencyMs" in usage
    cfg = fake.calls[0].config
    assert cfg.thinking_config.include_thoughts is True
    assert cfg.max_output_tokens == 2048


def test_include_thoughts_false_and_budget_zero(client, fake):
    enable()
    gen(client, body(includeThoughts=False, thinking={"budget": 1024}))
    assert fake.calls[0].config.thinking_config.include_thoughts is False
    gen(client, body(thinking={"budget": 0}))
    tc = fake.calls[1].config.thinking_config
    assert tc.thinking_budget == 0 and tc.include_thoughts is False


def test_budget_validation(client, fake):
    enable(allowedModels=["gemini-2.5-flash", "gemini-4-argon"])
    assert gen(client, body(thinking={"budget": 0})).status_code == 200
    assert gen(client, body(thinking={"budget": 99999})).status_code == 400
    assert gen(client, body(thinking={"budget": -5})).status_code == 400
    assert gen(client, body(thinking={"budget": 1024})).status_code == 200
    r = gen(client, body(model="gemini-1.5-pro"))
    assert r.status_code == 400 and isinstance(r.json()["detail"], str)
    assert fake.calls and len(fake.calls) == 2


def test_level_validation_and_kind_mismatch(client, fake):
    enable(allowedModels=["gemini-3.8-flash", "gemini-3.6-flash", "gemini-2.5-flash"])
    lvl = lambda m, t: gen(client, body(model=m, thinking=t)).status_code
    assert lvl("gemini-3.8-flash", {"level": "minimal"}) == 400
    assert lvl("gemini-3.8-flash", {"level": "bogus"}) == 400
    assert lvl("gemini-3.8-flash", {"budget": 1024}) == 400
    assert lvl("gemini-3.8-flash", {}) == 400
    assert lvl("gemini-3.8-flash", {"level": "low", "budget": 0}) == 400
    assert lvl("gemini-2.5-flash", {"level": "low"}) == 400
    assert lvl("gemini-3.6-flash", {"level": "minimal"}) == 200
    assert lvl("gemini-3.8-flash", {"level": "high"}) == 200
    tc = fake.calls[-1].config.thinking_config
    assert str(tc.thinking_level.value) == "HIGH" and tc.thinking_budget is None
    assert tc.include_thoughts is True


def test_level_usage_event_and_temperature(client, fake):
    enable(allowedModels=["gemini-3.8-flash", "gemini-2.5-flash"])
    r = gen(client, body(model="gemini-3.8-flash", thinking={"level": "low"}, temperature=0.5))
    usage = [e for e in parse_sse(r.text) if e[0] == "usage"][0][1]
    assert usage["thinkingLevel"] == "low" and usage["thinkingBudget"] is None
    assert fake.calls[-1].config.temperature is None
    gen(client, body(temperature=0.5))
    assert fake.calls[-1].config.temperature == 0.5


def test_stale_stored_settings_fall_back():
    enable(allowedModels=["gemini-2.5-pro"], defaultModel="gemini-2.5-pro")
    s = lab.get_settings()
    assert s["allowedModels"] == lab.DEFAULT_SETTINGS["allowedModels"]
    assert s["defaultModel"] == "gemini-3.8-flash"
    enable(allowedModels=["gemini-2.5-pro", "gemini-3.6-flash"], defaultModel="gemini-2.5-pro")
    s = lab.get_settings()
    assert s["allowedModels"] == ["gemini-3.6-flash"] and s["defaultModel"] == "gemini-3.6-flash"


def test_message_validation(client, fake):
    enable()
    assert gen(client, body(messages=[])).status_code == 400
    assert gen(client, body(messages=[{"role": "model", "text": "x"}])).status_code == 400
    assert gen(client, body(messages=[{"role": "user", "text": "  "}])).status_code == 400
    assert gen(client, body(temperature=3)).status_code == 400
    assert gen(client, cid="x" * 65).status_code == 400


def test_history_off_uses_last_message_only(client, fake):
    enable(allowHistory=False)
    msgs = [{"role": "user", "text": "a"}, {"role": "model", "text": "b"},
            {"role": "user", "text": "c"}]
    gen(client, body(messages=msgs))
    sent = fake.calls[0].contents
    assert len(sent) == 1 and sent[0].parts[0].text == "c"


def test_history_on_sends_all_and_system(client, fake):
    enable()
    msgs = [{"role": "user", "text": "a"}, {"role": "model", "text": "b"},
            {"role": "user", "text": "c"}]
    gen(client, body(messages=msgs, systemInstruction="be brief", temperature=0.5))
    assert [c.role for c in fake.calls[0].contents] == ["user", "model", "user"]
    assert fake.calls[0].config.system_instruction == "be brief"
    assert fake.calls[0].config.temperature == 0.5


def test_token_limit(client, fake, admin_headers):
    enable()
    gen(client)
    assert fake.count_calls == []  # short input: no API call
    fake.count_result = 12345
    big = "word " * 8000  # estimate ~10k tokens > 70% of limit
    r = gen(client, body(messages=[{"role": "user", "text": big}], systemInstruction="sys"))
    assert r.status_code == 413
    assert "12,345 tokens" in r.json()["detail"] and "10,000" in r.json()["detail"]
    assert len(fake.count_calls) == 1 and fake.count_calls[0][0].parts[0].text == "sys"
    fake.count_result = 10001
    assert gen(client, body(messages=[{"role": "user", "text": big}])).status_code == 413
    fake.count_result = 9000
    assert gen(client, body(messages=[{"role": "user", "text": big}])).status_code == 200
    huge = "x" * 200_001
    n = len(fake.count_calls)
    assert gen(client, body(messages=[{"role": "user", "text": huge}])).status_code == 413
    assert len(fake.count_calls) == n
    d = client.get("/api/admin/prompt-lab", headers=admin_headers).json()["data"]
    assert d["stats"]["today"]["rejected"] == 3


def test_rate_limit_per_client(client, fake):
    enable()
    for _ in range(12):
        assert gen(client, cid="same").status_code == 200
    r = gen(client, cid="same")
    assert r.status_code == 429 and int(r.headers["Retry-After"]) >= 1
    assert gen(client, cid="other").status_code == 200


def test_rate_limit_anonymous_per_ip(client, fake):
    enable()
    for _ in range(30):
        assert gen(client, cid=None).status_code == 200
    assert gen(client, cid=None).status_code == 429


def test_midstream_error(client, fake, admin_headers):
    enable()
    fake.fail_after = 1
    r = gen(client)
    ev = parse_sse(r.text)
    names = [e[0] for e in ev]
    assert names[-2:] == ["error", "done"] and "usage" not in names
    assert "boom" not in r.text
    d = client.get("/api/admin/prompt-lab", headers=admin_headers).json()["data"]
    assert d["stats"]["today"]["errors"] == 1 and d["stats"]["today"]["requests"] == 1
    assert lab.concurrency.active == 0


def test_stats_no_prompt_text(client, fake, admin_headers):
    enable()
    gen(client, body(messages=[{"role": "user", "text": "SECRET-PROMPT-XYZ"}]))
    gen(client, body(messages=[{"role": "user", "text": "SECRET-PROMPT-XYZ"}]))
    r = client.get("/api/admin/prompt-lab", headers=admin_headers)
    today = r.json()["data"]["stats"]["today"]
    assert today["requests"] == 2 and today["promptTokens"] == 14
    assert today["thoughtsTokens"] == 6 and today["outputTokens"] == 10
    assert "SECRET-PROMPT-XYZ" not in r.text
    with database.get_connection() as conn:
        dump = " ".join(str(tuple(row)) for row in conn.execute("SELECT * FROM prompt_lab_usage"))
    assert "SECRET" not in dump and "testclient" not in dump


async def _burst(n, delay, monkeypatch, cap=None):
    f = FakeUpstream()
    f.delay = delay
    monkeypatch.setattr(router_mod, "get_client", lambda: f)
    monkeypatch.setenv("PROMPT_LAB_CLIENT_RPM", "1000")
    monkeypatch.setenv("PROMPT_LAB_IP_RPM", "100000")
    if cap:
        monkeypatch.setenv("PROMPT_LAB_MAX_CONCURRENCY", str(cap))
    database.initialize_database()
    enable()
    transport = httpx.ASGITransport(app=main.app)
    async with httpx.AsyncClient(transport=transport, base_url="http://t") as c:
        t0 = time.monotonic()
        rs = await asyncio.gather(*[
            c.post("/api/prompt-lab/generate", json=body(), headers={"X-Client-Id": f"id{i}"})
            for i in range(n)
        ])
        return f, rs, time.monotonic() - t0


def test_load_100_concurrent(monkeypatch):
    f, rs, elapsed = asyncio.run(_burst(100, 0.5, monkeypatch))
    print(f"\nLOAD: 100 requests in {elapsed:.2f}s, max upstream concurrency {f.max_current}")
    assert all(r.status_code == 200 for r in rs)
    assert all(parse_sse(r.text)[-1][0] == "done" for r in rs)
    assert f.max_current == 100
    assert elapsed < 3


def test_concurrency_cap(monkeypatch):
    f, rs, elapsed = asyncio.run(_burst(30, 0.2, monkeypatch, cap=10))
    assert all(r.status_code == 200 for r in rs)
    assert f.max_current == 10
    assert lab.concurrency.active == 0


def test_busy_returns_503(monkeypatch):
    monkeypatch.setattr(lab, "SEMAPHORE_WAIT_SECONDS", 0.2)
    f, rs, _ = asyncio.run(_burst(3, 1.0, monkeypatch, cap=1))
    assert sorted(r.status_code for r in rs) == [200, 503, 503]
    assert "Retry-After" in next(r for r in rs if r.status_code == 503).headers


def test_slot_released_when_client_disconnects_before_streaming(monkeypatch, fake):
    """A client that vanishes before the body is streamed must not leak a concurrency slot."""
    monkeypatch.setenv("PROMPT_LAB_MAX_CONCURRENCY", "1")
    database.initialize_database()
    enable()
    payload = json.dumps(body()).encode()

    async def run_once():
        messages = [
            {"type": "http.request", "body": payload, "more_body": False},
            {"type": "http.disconnect"},
        ]

        async def receive():
            return messages.pop(0) if messages else {"type": "http.disconnect"}

        async def send(message):
            if message["type"] == "http.response.start":
                raise OSError("client gone")  # write fails before any body is sent

        scope = {
            "type": "http", "asgi": {"version": "3.0"}, "http_version": "1.1",
            "method": "POST", "scheme": "http", "path": "/api/prompt-lab/generate",
            "raw_path": b"/api/prompt-lab/generate", "root_path": "", "query_string": b"",
            "headers": [(b"content-type", b"application/json"), (b"x-client-id", b"gone"),
                        (b"content-length", str(len(payload)).encode())],
            "client": ("127.0.0.1", 1), "server": ("t", 80),
        }
        try:
            await main.app(scope, receive, send)
        except Exception:  # noqa: BLE001 - the simulated broken connection
            pass
        return lab.concurrency.active

    assert asyncio.run(run_once()) == 0
    # With a cap of 1, a leaked slot would make this next request wait and 503.
    with TestClient(main.app) as c:
        assert gen(c).status_code == 200
