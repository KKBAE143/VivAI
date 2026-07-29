"""Privacy consent is actually enforced.

`require_consent` existed in `core/deps.py` and was wired to nothing, so the
consent the signup form collected gated no endpoint at all. These tests assert
the gate behaves, and — more importantly — that it is still attached to every
endpoint that starts recording or processing a student. The second half is the
part that rots silently: a new session endpoint added without the dependency
reopens the hole and nothing else would notice.
"""
from __future__ import annotations

import pytest
from fastapi import HTTPException

from core.deps import require_consent
from main import app


# --------------------------------------------------------------------------- #
# The gate
# --------------------------------------------------------------------------- #
def test_consent_on_record_passes():
    user = {"id": "u1", "profile": {"consent_accepted_at": "2026-07-01T00:00:00Z"}}
    assert require_consent(user) is user


@pytest.mark.parametrize(
    "profile",
    [
        {},
        {"consent_accepted_at": None},
        None,
    ],
    ids=["no field", "explicit null", "no profile at all"],
)
def test_missing_consent_is_refused(profile):
    with pytest.raises(HTTPException) as exc:
        require_consent({"id": "u1", "profile": profile})
    assert exc.value.status_code == 403


def test_the_refusal_is_machine_readable():
    """The frontend branches on this code to show the consent prompt instead of
    treating the 403 as a dead end — a Google sign-in account legitimately has
    no consent on record, because it never passes through the signup form."""
    with pytest.raises(HTTPException) as exc:
        require_consent({"id": "u1", "profile": {}})
    assert exc.value.detail["error"] == "consent_required"
    assert "Privacy Policy" in exc.value.detail["message"]


# --------------------------------------------------------------------------- #
# The wiring
# --------------------------------------------------------------------------- #
GATED = [
    ("POST", "/api/viva/sessions"),
    ("POST", "/api/presentation/sessions"),
    ("POST", "/api/advanced/team-viva/sessions"),
    ("POST", "/api/advanced/code-aware/upload"),
    ("POST", "/api/advanced/code-aware/prepare-viva"),
    ("POST", "/api/advanced/code-aware/session"),
    ("POST", "/api/advanced/sentiment/session"),
    ("POST", "/api/readiness/pitch"),
]


def _routes():
    """Every APIRoute the app serves, prefixes applied.

    `include_router` leaves a wrapper in `app.routes` on this FastAPI version;
    the real routes hang off `original_router` with the prefix already applied.
    """
    found = []

    def walk(routes) -> None:
        for route in routes:
            if hasattr(route, "dependant") and hasattr(route, "methods"):
                found.append(route)
            inner = getattr(route, "original_router", None)
            if inner is not None:
                walk(inner.routes)

    walk(app.routes)
    return found


def _find(method: str, path: str):
    for route in _routes():
        if route.path == path and method in route.methods:
            return route
    raise AssertionError(f"{method} {path} is not mounted")


def _dependency_calls(dependant) -> set:
    calls = set()
    stack = list(dependant.dependencies)
    while stack:
        dep = stack.pop()
        if dep.call is not None:
            calls.add(dep.call)
        stack.extend(dep.dependencies)
    return calls


@pytest.mark.parametrize("method,path", GATED, ids=[f"{m} {p}" for m, p in GATED])
def test_session_endpoints_require_consent(method: str, path: str):
    route = _find(method, path)
    assert require_consent in _dependency_calls(route.dependant), (
        f"{method} {path} starts processing a student without checking consent"
    )


def test_reading_your_own_data_is_not_gated():
    """Consent gates what we start recording, not what you may read back. A user
    who has withdrawn consent must still reach their reports and the deletion
    endpoint, or the right to erasure becomes unreachable."""
    for method, path in [
        ("GET", "/api/viva/sessions"),
        ("GET", "/api/readiness"),
        ("POST", "/api/privacy/delete-my-data"),
        ("POST", "/api/privacy/consent"),
    ]:
        route = _find(method, path)
        assert require_consent not in _dependency_calls(route.dependant), f"{method} {path}"
