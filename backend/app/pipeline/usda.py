"""Step 2 of the pipeline: lookup_usda.

Matches each identified item name to a USDA FoodData Central entry and pulls
its per-100g macros. We restrict to Foundation/SR Legacy data types so we get
plain "chicken breast, cooked" style entries instead of a flood of branded
products — see plan §4 note on match ambiguity.
"""

import httpx

from app.config import get_settings
from app.schemas import UsdaMatch

BASE_URL = "https://api.nal.usda.gov/fdc/v1"

# Nutrient names as they appear in FDC's foodNutrients[].nutrient.name
_NUTRIENT_MAP = {
    "calories_per_100g": "Energy",
    "protein_per_100g": "Protein",
    "carbs_per_100g": "Carbohydrate, by difference",
    "fat_per_100g": "Total lipid (fat)",
}


def search_food(query: str, page_size: int = 5) -> list[dict]:
    settings = get_settings()
    if not settings.usda_api_key:
        raise RuntimeError("USDA_API_KEY is not set — copy backend/.env.example to backend/.env and fill it in.")

    resp = httpx.get(
        f"{BASE_URL}/foods/search",
        params={
            "query": query,
            "api_key": settings.usda_api_key,
            "pageSize": page_size,
            "dataType": ["Foundation", "SR Legacy"],
        },
        timeout=10.0,
    )
    resp.raise_for_status()
    return resp.json().get("foods", [])


def get_food_detail(fdc_id: str) -> dict:
    settings = get_settings()
    resp = httpx.get(
        f"{BASE_URL}/food/{fdc_id}",
        params={"api_key": settings.usda_api_key},
        timeout=10.0,
    )
    resp.raise_for_status()
    return resp.json()


def _extract_macros_per_100g(food_detail: dict) -> dict[str, float]:
    macros = {key: 0.0 for key in _NUTRIENT_MAP}
    for entry in food_detail.get("foodNutrients", []):
        nutrient = entry.get("nutrient", {})
        name = nutrient.get("name")
        unit = (nutrient.get("unitName") or "").upper()
        amount = entry.get("amount")
        if name is None or amount is None:
            continue
        # FDC lists Energy twice per food (kcal AND kJ) — without filtering by
        # unit, whichever comes later in the list silently wins, which was
        # showing kJ values mislabeled as calories (~4.18x too high).
        if name == "Energy" and unit != "KCAL":
            continue
        for field, fdc_name in _NUTRIENT_MAP.items():
            if name == fdc_name:
                macros[field] = amount
    return macros


def get_match_by_fdc_id(fdc_id: str) -> UsdaMatch:
    """Re-fetch a specific USDA entry by id — used when the client already
    knows which match it wants (e.g. confirming grams for a previously
    identified item) instead of re-running a text search.
    """
    detail = get_food_detail(fdc_id)
    macros = _extract_macros_per_100g(detail)
    return UsdaMatch(
        fdc_id=fdc_id,
        matched_description=detail.get("description", fdc_id),
        calories_per_100g=macros["calories_per_100g"],
        protein_per_100g=macros["protein_per_100g"],
        carbs_per_100g=macros["carbs_per_100g"],
        fat_per_100g=macros["fat_per_100g"],
    )


def match_food(item_name: str) -> UsdaMatch | None:
    """Take the top search result for now. Ambiguous-match disambiguation
    (LLM-assisted pick among multiple candidates) is a Phase 3 refinement
    once the graph's check_matches/retry loop exists — see plan §4.
    """
    candidates = search_food(item_name)
    if not candidates:
        return None

    top = candidates[0]
    fdc_id = str(top["fdcId"])
    detail = get_food_detail(fdc_id)
    macros = _extract_macros_per_100g(detail)

    return UsdaMatch(
        fdc_id=fdc_id,
        matched_description=top.get("description", item_name),
        calories_per_100g=macros["calories_per_100g"],
        protein_per_100g=macros["protein_per_100g"],
        carbs_per_100g=macros["carbs_per_100g"],
        fat_per_100g=macros["fat_per_100g"],
    )
