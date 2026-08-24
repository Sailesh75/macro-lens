"""Tests for the two resilience fixes made after real USDA flakiness (see
learning.md): retry-with-backoff on transient failures, and graceful
degradation (return no match rather than crash) when a lookup still fails.
"""

import httpx
import pytest

from app.pipeline.usda import _get_with_retry, match_food


class _FakeResponse:
    def __init__(self, status_code: int):
        self.status_code = status_code
        self.request = httpx.Request("GET", "http://example.test")

    def json(self):
        return {"foods": []}


def test_get_with_retry_succeeds_after_transient_failures(monkeypatch):
    """Mirrors the real incident: the exact same request 404'd twice, then
    200'd — USDA's API occasionally serving its website's error shell
    instead of a real API response.
    """
    responses = iter([_FakeResponse(404), _FakeResponse(404), _FakeResponse(200)])
    calls = []

    def fake_get(url, params, timeout):
        calls.append(1)
        return next(responses)

    monkeypatch.setattr("app.pipeline.usda.httpx.get", fake_get)
    monkeypatch.setattr("app.pipeline.usda.time.sleep", lambda _: None)

    resp = _get_with_retry("http://example.test", {})
    assert resp.status_code == 200
    assert len(calls) == 3


def test_get_with_retry_raises_after_max_attempts(monkeypatch):
    monkeypatch.setattr("app.pipeline.usda.httpx.get", lambda url, params, timeout: _FakeResponse(404))
    monkeypatch.setattr("app.pipeline.usda.time.sleep", lambda _: None)

    with pytest.raises(httpx.HTTPStatusError):
        _get_with_retry("http://example.test", {}, max_attempts=3)


def test_match_food_returns_none_when_usda_fails(monkeypatch):
    """One item's USDA failure must not raise — /meals/identify depends on
    this so one bad match doesn't crash the whole request.
    """

    def boom(item_name):
        req = httpx.Request("GET", "http://example.test")
        raise httpx.HTTPStatusError("USDA API returned 404", request=req, response=httpx.Response(404, request=req))

    monkeypatch.setattr("app.pipeline.usda.search_food", boom)

    assert match_food("some food") is None


def test_match_food_returns_none_when_no_candidates(monkeypatch):
    monkeypatch.setattr("app.pipeline.usda.search_food", lambda name: [])
    assert match_food("nonexistent food") is None
