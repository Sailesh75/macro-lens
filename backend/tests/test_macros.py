"""Pure arithmetic — no mocking needed, and stable across the Phase 4
LangGraph rewrite (this logic doesn't change shape when the pipeline becomes
a graph)."""

from app.pipeline.macros import compute_item_macros, sum_macros
from app.schemas import UsdaMatch


def _usda(calories=200.0, protein=10.0, carbs=20.0, fat=5.0) -> UsdaMatch:
    return UsdaMatch(
        fdc_id="1",
        matched_description="test food",
        calories_per_100g=calories,
        protein_per_100g=protein,
        carbs_per_100g=carbs,
        fat_per_100g=fat,
    )


def test_compute_item_macros_scales_by_grams():
    result = compute_item_macros("test food", grams=150, usda=_usda())
    assert result.grams == 150
    assert result.calories == 300.0  # 200 * 1.5
    assert result.protein == 15.0
    assert result.carbs == 30.0
    assert result.fat == 7.5


def test_compute_item_macros_zero_grams():
    result = compute_item_macros("x", grams=0, usda=_usda(calories=100, protein=1, carbs=1, fat=1))
    assert result.calories == 0
    assert result.protein == 0


def test_sum_macros_adds_up_present_items():
    items = [
        {"calories": 100, "protein": 10, "carbs": 5, "fat": 2},
        {"calories": 50, "protein": 5, "carbs": 2, "fat": 1},
    ]
    assert sum_macros(items) == {"calories": 150.0, "protein": 15.0, "carbs": 7.0, "fat": 3.0}


def test_sum_macros_treats_missing_values_as_zero():
    # e.g. an item that was identified but never USDA-matched/calculated
    items = [
        {"calories": 100, "protein": 10, "carbs": 5, "fat": 2},
        {"calories": None, "protein": None, "carbs": None, "fat": None},
    ]
    assert sum_macros(items) == {"calories": 100.0, "protein": 10.0, "carbs": 5.0, "fat": 2.0}


def test_sum_macros_empty_list():
    assert sum_macros([]) == {"calories": 0.0, "protein": 0.0, "carbs": 0.0, "fat": 0.0}
