"""WS0 foundation tests: language normalization + catch-all error middleware."""
from __future__ import annotations

import json

from core.languages import SUPPORTED_LANGUAGES, normalize_language


def test_normalize_language_canonicalizes_case():
    assert normalize_language("telugu") == "Telugu"
    assert normalize_language("  ENGLISH ") == "English"
    assert normalize_language("Tanglish") == "Tanglish"


def test_normalize_language_falls_back_to_english():
    assert normalize_language(None) == "English"
    assert normalize_language("") == "English"
    assert normalize_language("Klingon") == "English"


def test_all_supported_languages_round_trip():
    for lang in SUPPORTED_LANGUAGES:
        assert normalize_language(lang) == lang
        assert normalize_language(lang.upper()) == lang


def test_catch_all_middleware_returns_json_500():
    """A route that raises must yield a JSON 500 (not a bare crash) so that the
    outer CORS middleware can attach headers the browser will accept."""
    from starlette.applications import Starlette
    from starlette.middleware.cors import CORSMiddleware
    from starlette.responses import PlainTextResponse
    from starlette.routing import Route
    from starlette.testclient import TestClient

    from core.errors import CatchAllErrorMiddleware

    async def boom(request):
        raise RuntimeError("kaboom")

    async def ok(request):
        return PlainTextResponse("ok")

    app = Starlette(routes=[Route("/boom", boom), Route("/ok", ok)])
    # Match backend/main.py's order: catch-all first (inner), CORS last
    # (outer). The outer wrapper must decorate the JSON 500 as it returns.
    app.add_middleware(CatchAllErrorMiddleware)
    app.add_middleware(
        CORSMiddleware,
        allow_origins=["http://localhost:3000"],
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    client = TestClient(app, raise_server_exceptions=False)

    assert client.get("/ok").text == "ok"

    res = client.get("/boom", headers={"Origin": "http://localhost:3000"})
    assert res.status_code == 500
    assert res.headers["access-control-allow-origin"] == "http://localhost:3000"
    body = json.loads(res.text)
    assert "Internal server error" in body["detail"]
    assert "RuntimeError" in body["detail"]
    assert body["request_id"]
