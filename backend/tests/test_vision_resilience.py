"""Tests for the Gemini retry fix made after a real 503 'high demand'
incident (see learning.md) — the SDK's own built-in retry already tries and
gives up fast, so our outer retry gives a real overload a longer chance to
clear.
"""

import json
from types import SimpleNamespace

import pytest
from google.genai import errors as genai_errors

from app.pipeline.vision import identify_foods


class _FakeModels:
    def __init__(self, responses: list):
        self._responses = list(responses)

    def generate_content(self, **kwargs):
        item = self._responses.pop(0)
        if isinstance(item, Exception):
            raise item
        return item


class _FakeClient:
    def __init__(self, responses: list):
        self.models = _FakeModels(responses)


def _fake_settings():
    return SimpleNamespace(gemini_api_key="fake-key", gemini_model="fake-model")


def test_identify_foods_retries_on_server_error(monkeypatch):
    """Mirrors a real incident: Gemini returned 503 'high demand' twice, then
    succeeded on the third attempt.
    """
    fake_response = SimpleNamespace(text=json.dumps([{"name": "banana", "confidence": 0.9}]))
    responses = [
        genai_errors.ServerError(503, {"error": {"message": "overloaded"}}),
        genai_errors.ServerError(503, {"error": {"message": "overloaded"}}),
        fake_response,
    ]

    monkeypatch.setattr("app.pipeline.vision.get_settings", _fake_settings)
    monkeypatch.setattr("app.pipeline.vision.genai.Client", lambda api_key: _FakeClient(responses))
    monkeypatch.setattr("app.pipeline.vision.time.sleep", lambda _: None)

    items = identify_foods(b"fake-image-bytes")
    assert len(items) == 1
    assert items[0].name == "banana"


def test_identify_foods_raises_after_exhausting_retries(monkeypatch):
    responses = [
        genai_errors.ServerError(503, {"error": {"message": "overloaded"}}),
        genai_errors.ServerError(503, {"error": {"message": "overloaded"}}),
        genai_errors.ServerError(503, {"error": {"message": "overloaded"}}),
    ]

    monkeypatch.setattr("app.pipeline.vision.get_settings", _fake_settings)
    monkeypatch.setattr("app.pipeline.vision.genai.Client", lambda api_key: _FakeClient(responses))
    monkeypatch.setattr("app.pipeline.vision.time.sleep", lambda _: None)

    with pytest.raises(genai_errors.ServerError):
        identify_foods(b"fake-image-bytes")
