"""Vision/LLM steps of the pipeline: identify_foods (Step 1) and
disambiguate_match (part of Step 2, called from the graph's lookup_usda node
when USDA returns multiple candidates for one item).

identify_foods sends the meal photo to Gemini and asks ONLY "what food items
are here", never "how much". Portion size is always user-entered — see plan
§1/§6 for why.
"""

import json
import time

from google import genai
from google.genai import errors as genai_errors
from google.genai import types

from app.config import get_settings
from app.schemas import IdentifiedItem

# Gemini occasionally returns 503 "high demand" during load spikes — the
# SDK's own built-in retry (via tenacity) already tries a few times internally
# and gives up fast. This outer retry gives a real overload a longer chance
# to clear, same pattern as USDA's flakiness fix in pipeline/usda.py.
_MAX_ATTEMPTS = 3

IDENTIFY_PROMPT_TEMPLATE = """You are looking at a photo of a meal. List each distinct food item you can see.

For each item give:
- "name": a plain, generic food name (e.g. "grilled chicken breast", "steamed white rice", "broccoli") —
  prefer generic/homemade phrasing over brand names unless packaging is clearly visible.
- "confidence": your confidence (0.0-1.0) that this item is present and correctly identified.

Do NOT estimate quantity, weight, or portion size — that is handled separately by the user.
{retry_hint}
Respond with ONLY a JSON array, no other text, in this exact shape:
[{{"name": "...", "confidence": 0.0}}]
"""


def _generate_with_retry(client: genai.Client, **kwargs) -> genai.types.GenerateContentResponse:
    """Shared retry wrapper for Gemini calls — see _MAX_ATTEMPTS note above.
    Used by both identify_foods and disambiguate_match so the resilience
    fix lives in one place, not copy-pasted per call site.
    """
    last_error: Exception | None = None
    for attempt in range(_MAX_ATTEMPTS):
        try:
            return client.models.generate_content(**kwargs)
        except genai_errors.ServerError as e:
            last_error = e
            if attempt < _MAX_ATTEMPTS - 1:
                time.sleep(2 * (attempt + 1))
    raise last_error


def _client() -> genai.Client:
    settings = get_settings()
    if not settings.gemini_api_key:
        raise RuntimeError("GEMINI_API_KEY is not set — copy backend/.env.example to backend/.env and fill it in.")
    return genai.Client(api_key=settings.gemini_api_key)


def identify_foods(image_bytes: bytes, mime_type: str = "image/jpeg", retry_hint: str | None = None) -> list[IdentifiedItem]:
    """retry_hint: set by the graph's check_matches retry path — e.g.
    "Be more specific about: steamed dumplings, chili sauce" — when a
    previous pass's items couldn't be matched to a real USDA entry, asking
    Gemini to re-describe just those items more precisely.
    """
    settings = get_settings()
    client = _client()

    hint_text = f"\n{retry_hint}\n" if retry_hint else ""
    prompt = IDENTIFY_PROMPT_TEMPLATE.format(retry_hint=hint_text)

    response = _generate_with_retry(
        client,
        model=settings.gemini_model,
        contents=[
            types.Part.from_bytes(data=image_bytes, mime_type=mime_type),
            prompt,
        ],
        config=types.GenerateContentConfig(
            response_mime_type="application/json",
            temperature=0.2,
        ),
    )

    raw = response.text or "[]"
    try:
        parsed = json.loads(raw)
    except json.JSONDecodeError as e:
        raise RuntimeError(f"Gemini did not return valid JSON: {raw!r}") from e

    return [IdentifiedItem(**item) for item in parsed]


DISAMBIGUATE_PROMPT_TEMPLATE = """A food was identified in a photo as: "{item_name}"

Here are USDA FoodData Central search results that matched that name:
{candidate_list}

USDA entries can share keywords with a completely different dish (e.g. a plain
steamed dumpling is not the same food as a mutton stew that happens to contain
dumplings). Pick the candidate that is the best real-world match for
"{item_name}" — or say none are a good match if that's genuinely the case.

Respond with ONLY a JSON object, no other text, in this exact shape:
{{"best_index": <integer index of the best match, or null if none fit>}}
"""


def disambiguate_match(item_name: str, candidate_descriptions: list[str]) -> int | None:
    """Called from the graph's lookup_usda node when USDA returns more than
    one candidate for an item — picks the best one instead of blindly taking
    the top search result (the root cause of the "steamed dumplings" ->
    "mutton stew dumpling" mismatch in learning.md). Returns None if the LLM
    says none of the candidates are a good match.
    """
    settings = get_settings()
    client = _client()

    listing = "\n".join(f"{i}: {desc}" for i, desc in enumerate(candidate_descriptions))
    prompt = DISAMBIGUATE_PROMPT_TEMPLATE.format(item_name=item_name, candidate_list=listing)

    response = _generate_with_retry(
        client,
        model=settings.gemini_model,
        contents=[prompt],
        config=types.GenerateContentConfig(
            response_mime_type="application/json",
            temperature=0.0,
        ),
    )

    raw = response.text or "{}"
    try:
        parsed = json.loads(raw)
    except json.JSONDecodeError as e:
        raise RuntimeError(f"Gemini did not return valid JSON: {raw!r}") from e

    best_index = parsed.get("best_index")
    if best_index is None:
        return None
    if not (0 <= best_index < len(candidate_descriptions)):
        return None  # guard against a hallucinated out-of-range index
    return best_index
