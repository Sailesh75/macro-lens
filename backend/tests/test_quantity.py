"""Tests for resolve_quantity_to_grams — the deterministic, sourced-data-only
conversion from a typed/spoken quantity to grams. See the module docstring:
the LLM only extracts the literal amount+unit the user said; this function
does 100% of the actual arithmetic, and only from real data.
"""

from app.pipeline.quantity import resolve_quantity_to_grams
from app.schemas import Portion, UsdaMatch

_BANANA = UsdaMatch(
    fdc_id="1",
    matched_description="Banana, raw",
    calories_per_100g=89,
    protein_per_100g=1.1,
    carbs_per_100g=23,
    fat_per_100g=0.3,
    portions=[
        Portion(label="small (6\" to 6-7/8\" long)", grams=101),
        Portion(label="medium (7\" to 7-7/8\" long)", grams=118),
        Portion(label="large (8\" to 8-7/8\" long)", grams=136),
    ],
)

_RICE_NO_PORTIONS = UsdaMatch(
    fdc_id="2",
    matched_description="Rice, white, cooked",
    calories_per_100g=130,
    protein_per_100g=2.7,
    carbs_per_100g=28,
    fat_per_100g=0.3,
    portions=[],
)


def test_resolves_metric_weight_units_directly():
    assert resolve_quantity_to_grams(_RICE_NO_PORTIONS, 150, "g") == 150.0
    assert resolve_quantity_to_grams(_RICE_NO_PORTIONS, 0.2, "kg") == 200.0


def test_resolves_imperial_weight_units_via_conversion():
    assert resolve_quantity_to_grams(_RICE_NO_PORTIONS, 1, "oz") == 28.3


def test_matches_descriptive_unit_against_usda_portion_by_substring():
    """"2 medium bananas" -> count 2 x the "medium" portion's 118g."""
    assert resolve_quantity_to_grams(_BANANA, 2, "medium") == 236.0
    assert resolve_quantity_to_grams(_BANANA, 1, "large") == 136.0


def test_returns_none_when_unit_matches_no_portion_and_isnt_a_weight():
    """A descriptor that doesn't correspond to any real data for this food
    (e.g. "extra large" wasn't one of the USDA portions above) must not
    invent a number — leave it for the user to enter manually.
    """
    assert resolve_quantity_to_grams(_BANANA, 1, "extra large") is None


def test_returns_none_when_food_has_no_usable_portions_and_unit_isnt_metric():
    """"2 eggs" against a food with zero USDA portions — nothing to match
    against, so no guess is made.
    """
    assert resolve_quantity_to_grams(_RICE_NO_PORTIONS, 2, "bowl") is None


def test_returns_none_when_no_quantity_was_stated_at_all():
    assert resolve_quantity_to_grams(_BANANA, None, None) is None


def test_returns_none_when_there_is_no_usda_match():
    """No matched food at all -> nothing to resolve against."""
    assert resolve_quantity_to_grams(None, 2, "medium") is None
