"""Step 1 of the pipeline: identify_foods.

Sends the meal photo to Gemini and asks ONLY "what food items are here", never
"how much". Portion size is always user-entered — see plan §1/§6 for why.
"""

import json

from google import genai
from google.genai import types

from app.config import get_settings
from app.schemas import IdentifiedItem

IDENTIFY_PROMPT = """You are looking at a photo of a meal. List each distinct food item you can see.

For each item give:
- "name": a plain, generic food name (e.g. "grilled chicken breast", "steamed white rice", "broccoli") —
  prefer generic/homemade phrasing over brand names unless packaging is clearly visible.
- "confidence": your confidence (0.0-1.0) that this item is present and correctly identified.

Do NOT estimate quantity, weight, or portion size — that is handled separately by the user.

Respond with ONLY a JSON array, no other text, in this exact shape:
[{"name": "...", "confidence": 0.0}]
"""


def identify_foods(image_bytes: bytes, mime_type: str = "image/jpeg") -> list[IdentifiedItem]:
    settings = get_settings()
    if not settings.gemini_api_key:
        raise RuntimeError("GEMINI_API_KEY is not set — copy backend/.env.example to backend/.env and fill it in.")

    client = genai.Client(api_key=settings.gemini_api_key)
    response = client.models.generate_content(
        model=settings.gemini_model,
        contents=[
            types.Part.from_bytes(data=image_bytes, mime_type=mime_type),
            IDENTIFY_PROMPT,
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
