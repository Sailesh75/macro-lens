"""Tests for identify_foods_from_text — the typing/voice entry point's
version of identify_foods. Resilience (retry-on-503) is already covered by
test_vision_resilience.py via the shared _generate_with_retry helper; these
tests cover what's specific here: parsing amount/unit out of the model's
JSON response.
"""

import json
from types import SimpleNamespace

from app.pipeline.vision import identify_foods_from_text


class _FakeModels:
    def __init__(self, response):
        self._response = response

    def generate_content(self, **kwargs):
        return self._response


class _FakeClient:
    def __init__(self, response):
        self.models = _FakeModels(response)


def _fake_settings():
    return SimpleNamespace(gemini_api_key="fake-key", gemini_model="fake-model")


def test_identify_foods_from_text_parses_stated_quantity(monkeypatch):
    fake_response = SimpleNamespace(
        text=json.dumps(
            [
                {"name": "banana", "confidence": 0.95, "amount": 2, "unit": "medium"},
                {"name": "white rice", "confidence": 0.9, "amount": None, "unit": None},
            ]
        )
    )
    monkeypatch.setattr("app.pipeline.vision.get_settings", _fake_settings)
    monkeypatch.setattr("app.pipeline.vision.genai.Client", lambda api_key: _FakeClient(fake_response))

    items = identify_foods_from_text("2 medium bananas and some rice")

    assert len(items) == 2
    assert items[0].name == "banana"
    assert items[0].amount == 2
    assert items[0].unit == "medium"
    # No quantity mentioned for rice — must stay None, never invented.
    assert items[1].amount is None
    assert items[1].unit is None


def test_identify_foods_from_text_passes_retry_hint_through(monkeypatch):
    """Same retry-cycle mechanism as photo mode — the graph's check_matches
    loop re-calls this with a refined hint when a match couldn't be found.
    """
    captured = {}

    def fake_generate_content(**kwargs):
        captured["prompt"] = kwargs["contents"][0]
        return SimpleNamespace(text=json.dumps([{"name": "dumplings", "confidence": 0.8, "amount": None, "unit": None}]))

    monkeypatch.setattr("app.pipeline.vision.get_settings", _fake_settings)
    fake_client = SimpleNamespace(models=SimpleNamespace(generate_content=fake_generate_content))
    monkeypatch.setattr("app.pipeline.vision.genai.Client", lambda api_key: fake_client)

    identify_foods_from_text("momos", retry_hint="Try a more generic name for: momos")

    assert "Try a more generic name for: momos" in captured["prompt"]
