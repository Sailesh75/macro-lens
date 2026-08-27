"""Tests for the LangGraph graph itself (app/graph.py) — specifically the
check_matches retry cycle, which is the actual reason this pipeline uses
LangGraph instead of a plain function (see plan §4 / learning.md).
"""

from app.graph import MAX_RETRIES, run_meal_graph
from app.schemas import IdentifiedItem, UsdaMatch

_MATCH = UsdaMatch(
    fdc_id="1", matched_description="matched food", calories_per_100g=100, protein_per_100g=5, carbs_per_100g=10, fat_per_100g=2
)


def test_no_retry_needed_when_everything_matches_first_try(monkeypatch):
    calls = {"identify": 0}

    def counting_identify(image_bytes, mime_type, retry_hint=None):
        calls["identify"] += 1
        return [IdentifiedItem(name="chicken", confidence=0.9)]

    monkeypatch.setattr("app.graph.identify_foods", counting_identify)
    monkeypatch.setattr("app.graph.match_food", lambda name: _MATCH)
    monkeypatch.setattr("app.graph.db.get_suggested_grams", lambda user_id, name: None)

    candidates = run_meal_graph(b"fake-bytes", "image/jpeg", "user-1")

    assert calls["identify"] == 1  # no retry triggered
    assert len(candidates) == 1
    assert candidates[0].usda is not None
    assert candidates[0].usda.fdc_id == "1"


def test_retries_and_eventually_succeeds(monkeypatch):
    """First pass: 'mystery food' doesn't match. Retry (with a refined
    prompt) identifies it as 'chicken breast' instead, which matches.
    """
    identify_calls = []

    def fake_identify(image_bytes, mime_type, retry_hint=None):
        identify_calls.append(retry_hint)
        if retry_hint is None:
            return [IdentifiedItem(name="mystery food", confidence=0.5)]
        return [IdentifiedItem(name="chicken breast", confidence=0.9)]

    def fake_match_food(name):
        return _MATCH if name == "chicken breast" else None

    monkeypatch.setattr("app.graph.identify_foods", fake_identify)
    monkeypatch.setattr("app.graph.match_food", fake_match_food)
    monkeypatch.setattr("app.graph.db.get_suggested_grams", lambda user_id, name: None)

    candidates = run_meal_graph(b"fake-bytes", "image/jpeg", "user-1")

    assert len(identify_calls) == 2  # one initial pass + one retry
    assert identify_calls[0] is None
    assert "mystery food" in identify_calls[1]
    assert candidates[0].name == "chicken breast"
    assert candidates[0].usda is not None


def test_gives_up_after_max_retries_without_looping_forever(monkeypatch):
    """A food that never matches, no matter how many times we re-describe
    it, must not loop forever — the graph should terminate with usda=None
    for that item rather than retry indefinitely.
    """
    identify_calls = {"count": 0}

    def fake_identify(image_bytes, mime_type, retry_hint=None):
        identify_calls["count"] += 1
        return [IdentifiedItem(name="unidentifiable blob", confidence=0.3)]

    monkeypatch.setattr("app.graph.identify_foods", fake_identify)
    monkeypatch.setattr("app.graph.match_food", lambda name: None)
    monkeypatch.setattr("app.graph.db.get_suggested_grams", lambda user_id, name: None)

    candidates = run_meal_graph(b"fake-bytes", "image/jpeg", "user-1")

    # Initial pass + MAX_RETRIES retries, then stop.
    assert identify_calls["count"] == 1 + MAX_RETRIES
    assert len(candidates) == 1
    assert candidates[0].usda is None
