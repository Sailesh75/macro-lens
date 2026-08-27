"""Tests for disambiguate_match — the LLM call that picks the best USDA
candidate for an identified food item (Phase 4). See learning.md for the bug
this exists to fix.
"""

import json
from types import SimpleNamespace

from app.pipeline.vision import disambiguate_match


class _FakeModels:
    def __init__(self, responses: list):
        self._responses = list(responses)

    def generate_content(self, **kwargs):
        return self._responses.pop(0)


class _FakeClient:
    def __init__(self, responses: list):
        self.models = _FakeModels(responses)


def _fake_settings():
    return SimpleNamespace(gemini_api_key="fake-key", gemini_model="fake-model")


def test_disambiguate_match_returns_chosen_index(monkeypatch):
    fake_response = SimpleNamespace(text=json.dumps({"best_index": 1}))
    monkeypatch.setattr("app.pipeline.vision.get_settings", _fake_settings)
    monkeypatch.setattr("app.pipeline.vision.genai.Client", lambda api_key: _FakeClient([fake_response]))

    result = disambiguate_match("steamed dumplings", ["mutton stew with dumplings", "steamed dumpling, plain"])
    assert result == 1


def test_disambiguate_match_returns_none_when_llm_says_no_good_match(monkeypatch):
    fake_response = SimpleNamespace(text=json.dumps({"best_index": None}))
    monkeypatch.setattr("app.pipeline.vision.get_settings", _fake_settings)
    monkeypatch.setattr("app.pipeline.vision.genai.Client", lambda api_key: _FakeClient([fake_response]))

    result = disambiguate_match("obscure food", ["unrelated A", "unrelated B"])
    assert result is None


def test_disambiguate_match_guards_against_out_of_range_index(monkeypatch):
    """A hallucinated index outside the candidate list should be treated as
    'no good match', not trusted blindly or allowed to crash with an
    IndexError later when the caller indexes into the candidate list.
    """
    fake_response = SimpleNamespace(text=json.dumps({"best_index": 99}))
    monkeypatch.setattr("app.pipeline.vision.get_settings", _fake_settings)
    monkeypatch.setattr("app.pipeline.vision.genai.Client", lambda api_key: _FakeClient([fake_response]))

    result = disambiguate_match("some food", ["candidate A", "candidate B"])
    assert result is None
