"""Step 2 of the pipeline: lookup_usda.

Matches each identified item name to a USDA FoodData Central entry and pulls
its per-100g macros. Restricted to three dataTypes: Foundation and SR Legacy
(single-ingredient entries, e.g. "chicken breast, cooked") plus Survey
(FNDDS) — USDA's dataset of composite/mixed dishes as commonly eaten (e.g.
"Rice, fried, with chicken" as ONE entry), which is what lets a whole dish
get logged as one item instead of decomposed into its ingredients. See
learning.md for why FNDDS was added. Deliberately excludes "Branded" —
that's commercial products, which would flood results with a specific brand's
packaged version of a food rather than a generic one.
"""

import time

import httpx

from app.config import get_settings
from app.schemas import UsdaMatch

BASE_URL = "https://api.nal.usda.gov/fdc/v1"


def _get_with_retry(url: str, params: dict, max_attempts: int = 3) -> httpx.Response:
    """USDA's API is intermittently flaky — the exact same request can return
    a valid 200 one moment and a 404 (their website's HTML shell, not a real
    API error) the next. A short retry with backoff smooths over that instead
    of failing the whole pipeline on a one-off blip.
    """
    last_error: Exception | None = None
    for attempt in range(max_attempts):
        resp = httpx.get(url, params=params, timeout=10.0)
        if resp.status_code == 200:
            return resp
        last_error = httpx.HTTPStatusError(
            f"USDA API returned {resp.status_code}", request=resp.request, response=resp
        )
        if attempt < max_attempts - 1:
            time.sleep(0.5 * (attempt + 1))
    raise last_error

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

    resp = _get_with_retry(
        f"{BASE_URL}/foods/search",
        params={
            "query": query,
            "api_key": settings.usda_api_key,
            "pageSize": page_size,
            "dataType": ["Foundation", "SR Legacy", "Survey (FNDDS)"],
        },
    )
    return resp.json().get("foods", [])


def get_food_detail(fdc_id: str) -> dict:
    settings = get_settings()
    resp = _get_with_retry(
        f"{BASE_URL}/food/{fdc_id}",
        params={"api_key": settings.usda_api_key},
    )
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
    """Phase 4: disambiguates among multiple USDA candidates via an LLM call
    instead of blindly taking the top search result — the root cause of the
    "steamed dumplings" -> "Stew, dumpling with mutton (Navajo)" mismatch in
    learning.md. With exactly one candidate, skips the LLM call entirely
    (nothing to disambiguate, no point spending the API call).

    Deliberately swallows USDA errors (after retries already failed) and
    returns None instead of raising — USDA's API is known to be flaky, and
    one item failing to match shouldn't take down the whole /meals/identify
    request when the other items matched fine. The caller (and the graph's
    check_matches conditional) treats None the same as "no match found."
    """
    # Imported here, not at module level, to avoid usda.py depending on the
    # Gemini client existing/being configured for tests that never hit the
    # multi-candidate path.
    from app.pipeline.vision import disambiguate_match

    try:
        candidates = search_food(item_name)
        if not candidates:
            return None

        if len(candidates) == 1:
            chosen = candidates[0]
        else:
            descriptions = [c.get("description", "") for c in candidates]
            best_index = disambiguate_match(item_name, descriptions)
            if best_index is None:
                return None
            chosen = candidates[best_index]

        fdc_id = str(chosen["fdcId"])
        detail = get_food_detail(fdc_id)
    except httpx.HTTPStatusError as e:
        print(f"[usda] match_food('{item_name}') failed after retries, returning no match: {e}")
        return None

    macros = _extract_macros_per_100g(detail)
    return UsdaMatch(
        fdc_id=fdc_id,
        matched_description=chosen.get("description", item_name),
        calories_per_100g=macros["calories_per_100g"],
        protein_per_100g=macros["protein_per_100g"],
        carbs_per_100g=macros["carbs_per_100g"],
        fat_per_100g=macros["fat_per_100g"],
    )
