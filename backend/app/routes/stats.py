"""Phase 2: daily macro summary. Aggregates already-computed meal_items
totals across a user's `done` meals for one calendar day.

Day boundaries are UTC for now — a deliberate simplification, not a bug: a
per-user timezone would need to be captured somewhere (user profile, browser
offset sent with the request) and there's nowhere to store that yet. Worth
revisiting once real auth/user profiles exist.
"""

from datetime import date as date_cls
from datetime import datetime, time, timedelta, timezone

from fastapi import APIRouter, Depends, Query

from app import db
from app.auth import get_current_user_id
from app.pipeline.macros import sum_macros
from app.schemas import DailyStatsResponse

router = APIRouter(prefix="/stats", tags=["stats"])


@router.get("/daily", response_model=DailyStatsResponse)
async def daily_stats(
    date: str | None = Query(default=None, description="YYYY-MM-DD, defaults to today (UTC)"),
    user_id: str = Depends(get_current_user_id),
) -> DailyStatsResponse:
    target_date = date_cls.fromisoformat(date) if date else datetime.now(timezone.utc).date()

    start = datetime.combine(target_date, time.min, tzinfo=timezone.utc)
    end = start + timedelta(days=1)

    meals = db.get_meals_in_range(user_id, start.isoformat(), end.isoformat())
    all_items = [item for meal in meals for item in (meal.get("meal_items") or [])]
    totals = sum_macros(all_items)

    return DailyStatsResponse(
        date=target_date.isoformat(),
        meal_count=len(meals),
        total_calories=totals["calories"],
        total_protein=totals["protein"],
        total_carbs=totals["carbs"],
        total_fat=totals["fat"],
    )
