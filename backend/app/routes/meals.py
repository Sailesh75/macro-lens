"""Phase 1 endpoints: no DB/S3 yet, just the vision -> USDA -> grams -> macros
flow, so we can verify the core pipeline works before adding persistence.
"""

from fastapi import APIRouter, HTTPException, UploadFile

from app.pipeline.macros import compute_item_macros
from app.pipeline.usda import get_match_by_fdc_id, match_food
from app.pipeline.vision import identify_foods
from app.schemas import (
    CalculateRequest,
    CalculateResponse,
    IdentifyResponse,
    MealItemCandidate,
)

router = APIRouter(prefix="/meals", tags=["meals"])


@router.post("/identify", response_model=IdentifyResponse)
async def identify(photo: UploadFile) -> IdentifyResponse:
    """Step 1+2: identify food items in the photo, then match each to USDA.
    Returns items with no grams filled in — the frontend collects those next.
    """
    image_bytes = await photo.read()
    if not image_bytes:
        raise HTTPException(400, "Uploaded file is empty")

    identified = identify_foods(image_bytes, mime_type=photo.content_type or "image/jpeg")

    candidates: list[MealItemCandidate] = []
    for item in identified:
        usda = match_food(item.name)
        candidates.append(
            MealItemCandidate(
                name=item.name,
                confidence=item.confidence,
                usda=usda,
                suggested_grams=None,  # personalization lands in Phase 4
            )
        )

    return IdentifyResponse(items=candidates)


@router.post("/calculate", response_model=CalculateResponse)
async def calculate(payload: CalculateRequest) -> CalculateResponse:
    """Step 5: given user-entered grams per item, compute macros. Re-fetches
    the USDA match by fdc_id rather than trusting client-sent macro numbers.
    """
    computed = []
    for entry in payload.items:
        try:
            usda = get_match_by_fdc_id(entry.fdc_id)
        except Exception as e:
            raise HTTPException(400, f"Could not re-verify USDA match for '{entry.name}' ({entry.fdc_id})") from e
        computed.append(compute_item_macros(entry.name, entry.grams, usda))

    return CalculateResponse(
        items=computed,
        total_calories=round(sum(i.calories for i in computed), 1),
        total_protein=round(sum(i.protein for i in computed), 1),
        total_carbs=round(sum(i.carbs for i in computed), 1),
        total_fat=round(sum(i.fat for i in computed), 1),
    )
