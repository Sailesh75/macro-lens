"""Step 5 of the pipeline: finalize — turn user-entered grams into macros.

Pure arithmetic, no AI involved: USDA gives macros per 100g, the user gives
grams, we scale. This only runs after the human-in-the-loop grams input.
"""

from app.schemas import ComputedItem, UsdaMatch


def compute_item_macros(name: str, grams: float, usda: UsdaMatch) -> ComputedItem:
    factor = grams / 100.0
    return ComputedItem(
        name=name,
        grams=grams,
        calories=round(usda.calories_per_100g * factor, 1),
        protein=round(usda.protein_per_100g * factor, 1),
        carbs=round(usda.carbs_per_100g * factor, 1),
        fat=round(usda.fat_per_100g * factor, 1),
    )


def sum_macros(items: list[dict]) -> dict[str, float]:
    """items: raw meal_items DB rows. Missing/null macros (e.g. an item that
    never got USDA-matched, so was never calculated) count as 0 rather than
    breaking the sum.
    """
    return {
        "calories": round(sum(i.get("calories") or 0 for i in items), 1),
        "protein": round(sum(i.get("protein") or 0 for i in items), 1),
        "carbs": round(sum(i.get("carbs") or 0 for i in items), 1),
        "fat": round(sum(i.get("fat") or 0 for i in items), 1),
    }
