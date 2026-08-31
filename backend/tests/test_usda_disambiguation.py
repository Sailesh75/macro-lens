"""Tests for Phase 4's disambiguation logic in match_food — picking among
multiple USDA candidates via an LLM call instead of blindly taking the top
search result. See learning.md for the "steamed dumplings" -> "mutton stew
dumpling" bug this fixes.
"""

from app.pipeline.usda import match_food

_DETAIL = {
    "description": "chosen food",
    "foodNutrients": [
        {"nutrient": {"name": "Energy", "unitName": "KCAL"}, "amount": 100.0},
        {"nutrient": {"name": "Protein", "unitName": "G"}, "amount": 5.0},
        {"nutrient": {"name": "Carbohydrate, by difference", "unitName": "G"}, "amount": 10.0},
        {"nutrient": {"name": "Total lipid (fat)", "unitName": "G"}, "amount": 2.0},
    ],
}


def test_match_food_skips_disambiguation_with_one_candidate(monkeypatch):
    """No point spending an LLM call when there's nothing to disambiguate."""
    monkeypatch.setattr(
        "app.pipeline.usda.search_food",
        lambda name: [{"fdcId": 1, "description": "only candidate"}],
    )
    monkeypatch.setattr("app.pipeline.usda.get_food_detail", lambda fdc_id: _DETAIL)

    def boom(*args, **kwargs):
        raise AssertionError("disambiguate_match should not be called for a single candidate")

    monkeypatch.setattr("app.pipeline.vision.disambiguate_match", boom)

    result = match_food("some food")
    assert result is not None
    assert result.fdc_id == "1"


def test_match_food_disambiguates_among_multiple_candidates(monkeypatch):
    candidates = [
        {"fdcId": 1, "description": "wrong candidate"},
        {"fdcId": 2, "description": "right candidate"},
    ]
    monkeypatch.setattr("app.pipeline.usda.search_food", lambda name: candidates)
    monkeypatch.setattr("app.pipeline.usda.get_food_detail", lambda fdc_id: _DETAIL)
    # Picks index 1 -> the "right candidate"
    monkeypatch.setattr("app.pipeline.vision.disambiguate_match", lambda name, descs: 1)

    result = match_food("some food")
    assert result is not None
    assert result.fdc_id == "2"


def test_match_food_returns_none_when_no_candidate_is_a_good_match(monkeypatch):
    candidates = [
        {"fdcId": 1, "description": "unrelated dish A"},
        {"fdcId": 2, "description": "unrelated dish B"},
    ]
    monkeypatch.setattr("app.pipeline.usda.search_food", lambda name: candidates)

    def boom(*args, **kwargs):
        raise AssertionError("get_food_detail should not be called when nothing matched")

    monkeypatch.setattr("app.pipeline.usda.get_food_detail", boom)
    monkeypatch.setattr("app.pipeline.vision.disambiguate_match", lambda name, descs: None)

    assert match_food("some food") is None  # allow_fallback defaults to False


def test_match_food_falls_back_to_closest_candidate_when_allowed(monkeypatch):
    """Phase 5: allow_fallback=True (the graph's final attempt) must not
    give up just because no candidate looked like a great match — a
    regional dish (e.g. Nepali momos) may have nothing close in USDA at
    all, and an approximate match beats leaving the user permanently stuck.
    """
    candidates = [
        {"fdcId": 1, "description": "closest available dish"},
        {"fdcId": 2, "description": "less close dish"},
    ]
    monkeypatch.setattr("app.pipeline.usda.search_food", lambda name: candidates)
    monkeypatch.setattr("app.pipeline.usda.get_food_detail", lambda fdc_id: _DETAIL)
    monkeypatch.setattr("app.pipeline.vision.disambiguate_match", lambda name, descs: None)

    result = match_food("some regional dish", allow_fallback=True)
    assert result is not None
    assert result.fdc_id == "1"  # falls back to the top search result
