"""Tests for _extract_portions — the count-based-entry feature (plan §1/§6):
a banana has USDA-sourced size options ("small"/"medium"/"large") with real
gram weights, instead of the app assuming one fixed weight per fruit. See
learning.md for why a single constant would be wrong (different bananas are
different sizes) and how this avoids it.
"""

from app.pipeline.usda import _extract_portions


def test_extract_portions_uses_modifier_as_label_for_sr_legacy_foundation():
    """SR Legacy/Foundation entries: modifier holds the human text,
    portionDescription is null — verified against the real API (banana).
    """
    food_detail = {
        "foodPortions": [
            {"amount": 1.0, "gramWeight": 118.0, "modifier": "medium (7\" to 7-7/8\" long)", "portionDescription": None},
            {"amount": 1.0, "gramWeight": 136.0, "modifier": "large (8\" to 8-7/8\" long)", "portionDescription": None},
        ]
    }
    portions = _extract_portions(food_detail)
    assert len(portions) == 2
    assert portions[0].label == 'medium (7" to 7-7/8" long)'
    assert portions[0].grams == 118.0
    assert portions[1].grams == 136.0


def test_extract_portions_prefers_portion_description_for_fndds():
    """Survey (FNDDS) entries do the opposite: `modifier` is an internal
    numeric food-code, and the real text is in `portionDescription` — a bug
    caught by testing against the real API, not assumed from the docs.
    """
    food_detail = {
        "foodPortions": [
            {"amount": 1.0, "gramWeight": 126.0, "modifier": "60343", "portionDescription": "1 banana"},
            {"amount": 1.0, "gramWeight": 6.0, "modifier": "61935", "portionDescription": "1 slice"},
            # A generic placeholder FNDDS uses when nothing more specific applies — not useful as a "count".
            {"amount": 1.0, "gramWeight": 126.0, "modifier": "90000", "portionDescription": "Quantity not specified"},
        ]
    }
    portions = _extract_portions(food_detail)
    assert [p.label for p in portions] == ["1 banana", "1 slice"]
    assert portions[0].grams == 126.0


def test_extract_portions_falls_back_to_amount_and_unit_when_no_modifier():
    food_detail = {
        "foodPortions": [
            {"amount": 1.0, "gramWeight": 85.0, "measureUnit": {"name": "oz"}},
        ]
    }
    portions = _extract_portions(food_detail)
    assert len(portions) == 1
    assert portions[0].label == "1 oz"
    assert portions[0].grams == 85.0


def test_extract_portions_skips_entries_with_no_usable_weight_or_label():
    food_detail = {
        "foodPortions": [
            {"amount": 1.0, "gramWeight": 0, "modifier": "negligible"},  # zero weight — skipped
            {"amount": 1.0, "modifier": "no weight at all"},  # missing gramWeight — skipped
            {"amount": None, "gramWeight": 50.0},  # no modifier, no usable amount/unit — skipped
        ]
    }
    assert _extract_portions(food_detail) == []


def test_extract_portions_returns_empty_list_when_food_has_none():
    """Most cooked/prepared foods (e.g. rice, sauces) have no meaningful
    "count" — the frontend must fall back to grams-only for these, which
    only works if this returns [] rather than raising.
    """
    assert _extract_portions({}) == []
    assert _extract_portions({"foodPortions": []}) == []
