"""Phase 1 endpoints: photo -> S3 -> vision -> USDA -> grams -> macros, all
persisted to Supabase. This closes out Phase 1.
"""

from fastapi import APIRouter, HTTPException, UploadFile

from app import db
from app.config import get_settings
from app.pipeline.macros import compute_item_macros
from app.pipeline.storage import upload_photo
from app.pipeline.usda import get_match_by_fdc_id, match_food
from app.pipeline.vision import identify_foods
from app.schemas import (
    CalculateRequest,
    CalculateResponse,
    IdentifyResponse,
    MealItemCandidate,
)

router = APIRouter(prefix="/meals", tags=["meals"])


def _current_user_id() -> str:
    """Stand-in for real auth (Phase 2). See scripts/create_test_user.py."""
    user_id = get_settings().test_user_id
    if not user_id:
        raise HTTPException(500, "TEST_USER_ID not set in .env — run scripts/create_test_user.py first")
    return user_id


@router.post("/identify", response_model=IdentifyResponse)
async def identify(photo: UploadFile) -> IdentifyResponse:
    """Step 1+2+3: identify food items in the photo, match each to USDA, and
    look up a suggested portion from this user's history. Saves a `meals` row
    plus one `meal_items` row per item (grams still null — the user fills
    those in next via /calculate).
    """
    user_id = _current_user_id()
    image_bytes = await photo.read()
    if not image_bytes:
        raise HTTPException(400, "Uploaded file is empty")

    content_type = photo.content_type or "image/jpeg"
    image_url = upload_photo(image_bytes, content_type=content_type)
    identified = identify_foods(image_bytes, mime_type=content_type)

    candidates: list[MealItemCandidate] = []
    for item in identified:
        usda = match_food(item.name)
        suggested = db.get_suggested_grams(user_id, item.name) if usda else None
        candidates.append(
            MealItemCandidate(
                name=item.name,
                confidence=item.confidence,
                usda=usda,
                suggested_grams=suggested,
            )
        )

    meal_id = db.create_meal(user_id=user_id, image_url=image_url)
    db.create_meal_items(meal_id, candidates)

    return IdentifyResponse(meal_id=meal_id, items=candidates)


@router.post("/calculate", response_model=CalculateResponse)
async def calculate(payload: CalculateRequest) -> CalculateResponse:
    """Step 5+6: given user-entered grams per item, compute macros, write
    them back onto the meal's rows, mark the meal done, and update this
    user's per-food running average (the personalization signal — see
    plan §6, this is a pre-fill memory, never a correction of an AI guess).
    """
    user_id = _current_user_id()
    computed = []
    for entry in payload.items:
        try:
            usda = get_match_by_fdc_id(entry.fdc_id)
        except Exception as e:
            raise HTTPException(400, f"Could not re-verify USDA match for '{entry.name}' ({entry.fdc_id})") from e
        computed.append(compute_item_macros(entry.name, entry.grams, usda))

    db.finalize_meal_items(payload.meal_id, computed)
    for entry in payload.items:
        db.record_user_grams(user_id, entry.name, entry.fdc_id, entry.grams)

    return CalculateResponse(
        items=computed,
        total_calories=round(sum(i.calories for i in computed), 1),
        total_protein=round(sum(i.protein for i in computed), 1),
        total_carbs=round(sum(i.carbs for i in computed), 1),
        total_fat=round(sum(i.fat for i in computed), 1),
    )
