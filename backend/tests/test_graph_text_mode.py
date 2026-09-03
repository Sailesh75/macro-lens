"""Tests for the typing/voice entry point through the graph
(run_meal_graph_from_text) — same retry cycle and USDA matching as photo
mode (see test_graph.py), plus the quantity-from-text behavior that's
unique to this path: a stated amount+unit pre-fills grams, and takes
priority over personalization when both are available.
"""

from app.graph import MAX_RETRIES, run_meal_graph_from_text
from app.schemas import IdentifiedItem, Portion, UsdaMatch

_BANANA_MATCH = UsdaMatch(
    fdc_id="1",
    matched_description="Banana, raw",
    calories_per_100g=89,
    protein_per_100g=1.1,
    carbs_per_100g=23,
    fat_per_100g=0.3,
    portions=[Portion(label="medium (7\" to 7-7/8\" long)", grams=118)],
)


def test_stated_quantity_prefills_grams(monkeypatch):
    monkeypatch.setattr(
        "app.graph.identify_foods_from_text",
        lambda text, retry_hint=None: [IdentifiedItem(name="banana", confidence=0.9, amount=2, unit="medium")],
    )
    monkeypatch.setattr("app.graph.match_food", lambda name, allow_fallback=False: _BANANA_MATCH)

    def boom(*args, **kwargs):
        raise AssertionError("personalization shouldn't be consulted when the text already stated a quantity")

    monkeypatch.setattr("app.graph.db.get_suggested_grams", boom)

    candidates = run_meal_graph_from_text("2 medium bananas", "user-1")

    assert candidates[0].suggested_grams == 236.0  # 2 x 118g
    assert candidates[0].suggested_grams_source == "stated"


def test_falls_back_to_personalization_when_no_quantity_stated(monkeypatch):
    monkeypatch.setattr(
        "app.graph.identify_foods_from_text",
        lambda text, retry_hint=None: [IdentifiedItem(name="banana", confidence=0.9, amount=None, unit=None)],
    )
    monkeypatch.setattr("app.graph.match_food", lambda name, allow_fallback=False: _BANANA_MATCH)
    monkeypatch.setattr("app.graph.db.get_suggested_grams", lambda user_id, fdc_id: 130.0)

    candidates = run_meal_graph_from_text("I had a banana", "user-1")

    assert candidates[0].suggested_grams == 130.0
    assert candidates[0].suggested_grams_source == "remembered"


def test_unresolvable_unit_falls_back_to_personalization_instead_of_blank(monkeypatch):
    """A stated quantity that can't be resolved to grams (no matching USDA
    portion, not a weight unit) shouldn't just silently lose to nothing —
    personalization is still a reasonable fallback if one exists.
    """
    monkeypatch.setattr(
        "app.graph.identify_foods_from_text",
        lambda text, retry_hint=None: [IdentifiedItem(name="banana", confidence=0.9, amount=1, unit="bunch")],
    )
    monkeypatch.setattr("app.graph.match_food", lambda name, allow_fallback=False: _BANANA_MATCH)
    monkeypatch.setattr("app.graph.db.get_suggested_grams", lambda user_id, fdc_id: 130.0)

    candidates = run_meal_graph_from_text("a bunch of bananas", "user-1")

    assert candidates[0].suggested_grams == 130.0
    assert candidates[0].suggested_grams_source == "remembered"


def test_retry_cycle_works_in_text_mode_too(monkeypatch):
    """Same mechanism as the photo path's retry test — a mismatch triggers
    a re-describe with a refined hint, capped at MAX_RETRIES.
    """
    identify_calls = []

    def fake_identify(text, retry_hint=None):
        identify_calls.append(retry_hint)
        if retry_hint is None:
            return [IdentifiedItem(name="momos", confidence=0.9)]
        return [IdentifiedItem(name="steamed dumplings", confidence=0.9)]

    def fake_match_food(name, allow_fallback=False):
        return _BANANA_MATCH if name == "steamed dumplings" else None

    monkeypatch.setattr("app.graph.identify_foods_from_text", fake_identify)
    monkeypatch.setattr("app.graph.match_food", fake_match_food)
    monkeypatch.setattr("app.graph.db.get_suggested_grams", lambda user_id, fdc_id: None)

    candidates = run_meal_graph_from_text("I had some momos", "user-1")

    assert len(identify_calls) == 2
    assert candidates[0].name == "steamed dumplings"


def test_guest_text_request_never_touches_the_database(monkeypatch):
    def boom(user_id, fdc_id):
        raise AssertionError("get_suggested_grams should never be called for a guest request")

    monkeypatch.setattr(
        "app.graph.identify_foods_from_text",
        lambda text, retry_hint=None: [IdentifiedItem(name="banana", confidence=0.9, amount=None, unit=None)],
    )
    monkeypatch.setattr("app.graph.match_food", lambda name, allow_fallback=False: _BANANA_MATCH)
    monkeypatch.setattr("app.graph.db.get_suggested_grams", boom)

    candidates = run_meal_graph_from_text("I had a banana", None)

    assert candidates[0].suggested_grams is None
    assert candidates[0].suggested_grams_source is None
