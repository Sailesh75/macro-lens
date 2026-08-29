"""Phase 1: photo -> S3 -> vision -> USDA -> grams -> macros, persisted to
Supabase. Phase 2: list/detail views over what's been logged. Phase 4: the
identify step now runs through the LangGraph graph in app/graph.py instead
of a plain inline loop.

identify/calculate also support fully stateless guest access (no
Authorization header at all): nothing gets uploaded to S3 or written to
Supabase for a guest request — see get_optional_user_id. History/detail/
stats endpoints stay real-auth-only; there's no such thing as guest history.
"""

import uuid

from fastapi import APIRouter, Depends, HTTPException, UploadFile

from app import db
from app.auth import get_current_user_id, get_optional_user_id
from app.graph import run_meal_graph
from app.pipeline.macros import compute_item_macros, sum_macros
from app.pipeline.storage import upload_photo
from app.pipeline.usda import get_match_by_fdc_id
from app.schemas import (
    CalculateRequest,
    CalculateResponse,
    IdentifyResponse,
    MealItemRow,
    MealListResponse,
    MealSummary,
)

router = APIRouter(prefix="/meals", tags=["meals"])


def _to_meal_summary(meal: dict) -> MealSummary:
    items = meal.get("meal_items") or []
    totals = sum_macros(items)
    return MealSummary(
        id=meal["id"],
        image_url=meal.get("image_url"),
        created_at=meal["created_at"],
        status=meal["status"],
        items=[MealItemRow(**item) for item in items],
        total_calories=totals["calories"],
        total_protein=totals["protein"],
        total_carbs=totals["carbs"],
        total_fat=totals["fat"],
    )


@router.post("/identify", response_model=IdentifyResponse)
async def identify(photo: UploadFile, user_id: str | None = Depends(get_optional_user_id)) -> IdentifyResponse:
    """Runs the identify_foods -> lookup_usda -> check_matches (-> retry) ->
    suggest_defaults graph (app/graph.py). For a real user, saves a `meals`
    row plus one `meal_items` row per item (grams still null — filled in
    next via /calculate). For a guest (user_id is None): no S3 upload, no
    database writes at all — `meal_id` is a throwaway uuid never persisted,
    only there so the request/response shape matches the authenticated path.
    """
    image_bytes = await photo.read()
    if not image_bytes:
        raise HTTPException(400, "Uploaded file is empty")

    content_type = photo.content_type or "image/jpeg"
    candidates = run_meal_graph(image_bytes, content_type, user_id)

    if user_id:
        image_url = upload_photo(image_bytes, content_type=content_type)
        meal_id = db.create_meal(user_id=user_id, image_url=image_url)
        db.create_meal_items(meal_id, candidates)
    else:
        meal_id = str(uuid.uuid4())

    return IdentifyResponse(meal_id=meal_id, items=candidates)


@router.post("/calculate", response_model=CalculateResponse)
async def calculate(payload: CalculateRequest, user_id: str | None = Depends(get_optional_user_id)) -> CalculateResponse:
    """Step 5+6: given user-entered grams per item, compute macros. For a
    real user, also writes them back onto the meal's rows, marks it done,
    and updates the personalization signal (plan §6). For a guest, none of
    that happens — the computed macros are simply returned, nothing saved.
    """
    computed = []
    for entry in payload.items:
        try:
            usda = get_match_by_fdc_id(entry.fdc_id)
        except Exception as e:
            raise HTTPException(400, f"Could not re-verify USDA match for '{entry.name}' ({entry.fdc_id})") from e
        computed.append(compute_item_macros(entry.name, entry.grams, usda))

    if user_id:
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


@router.get("", response_model=MealListResponse)
async def list_meals(user_id: str = Depends(get_current_user_id)) -> MealListResponse:
    """Meal history — most recent first, each with its items and totals."""
    meals = db.list_meals(user_id)
    return MealListResponse(meals=[_to_meal_summary(m) for m in meals])


@router.get("/{meal_id}", response_model=MealSummary)
async def get_meal(meal_id: str, user_id: str = Depends(get_current_user_id)) -> MealSummary:
    meal = db.get_meal(meal_id, user_id)
    if not meal:
        raise HTTPException(404, "Meal not found")
    return _to_meal_summary(meal)
