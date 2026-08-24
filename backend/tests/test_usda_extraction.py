"""Regression coverage for the real kcal/kJ bug found in dev (see
learning.md): USDA lists "Energy" twice per food — once in kcal, once in kJ
— and extraction must not silently pick whichever comes last in the list.
"""

from app.pipeline.usda import _extract_macros_per_100g


def _nutrient(name: str, unit: str, amount: float) -> dict:
    return {"nutrient": {"name": name, "unitName": unit}, "amount": amount}


def test_extract_macros_prefers_kcal_over_kj_energy_entry():
    food_detail = {
        # Order matters for this test: matches the real API response order
        # that triggered the bug (kcal first, kJ second) — a naive "last
        # matching entry wins" extraction would pick 422.0 (kJ) here, which
        # is exactly what happened in production.
        "foodNutrients": [
            _nutrient("Energy", "kcal", 101.0),  # real API casing, lowercase
            _nutrient("Energy", "kJ", 422.0),
            _nutrient("Protein", "G", 8.71),
            _nutrient("Carbohydrate, by difference", "G", 8.03),
            _nutrient("Total lipid (fat)", "G", 3.78),
        ]
    }
    macros = _extract_macros_per_100g(food_detail)
    assert macros["calories_per_100g"] == 101.0  # not 422.0
    assert macros["protein_per_100g"] == 8.71
    assert macros["carbs_per_100g"] == 8.03
    assert macros["fat_per_100g"] == 3.78


def test_extract_macros_missing_nutrients_default_to_zero():
    assert _extract_macros_per_100g({"foodNutrients": []}) == {
        "calories_per_100g": 0.0,
        "protein_per_100g": 0.0,
        "carbs_per_100g": 0.0,
        "fat_per_100g": 0.0,
    }
