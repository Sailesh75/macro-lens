"""Tests for get_optional_user_id — the guest-access auth dependency.
No header at all means "anonymous guest" (returns None), but a header that
IS present and bad must still raise 401, not be silently downgraded to guest.
"""

from types import SimpleNamespace

import pytest
from fastapi import HTTPException

from app.auth import get_optional_user_id


def test_no_header_returns_none_for_guest_access():
    assert get_optional_user_id("") is None


def test_present_but_invalid_header_still_raises_401(monkeypatch):
    def boom(token):
        raise RuntimeError("invalid token")

    monkeypatch.setattr("app.auth.get_supabase", lambda: SimpleNamespace(auth=SimpleNamespace(get_user=boom)))

    with pytest.raises(HTTPException) as exc_info:
        get_optional_user_id("Bearer some-bad-token")
    assert exc_info.value.status_code == 401


def test_present_and_valid_header_returns_the_real_user_id(monkeypatch):
    fake_user = SimpleNamespace(id="user-123")
    fake_response = SimpleNamespace(user=fake_user)
    monkeypatch.setattr(
        "app.auth.get_supabase",
        lambda: SimpleNamespace(auth=SimpleNamespace(get_user=lambda token: fake_response)),
    )

    assert get_optional_user_id("Bearer a-real-token") == "user-123"
