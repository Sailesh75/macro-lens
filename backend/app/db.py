from functools import lru_cache

from supabase import Client, create_client

from app.config import get_settings


@lru_cache
def get_supabase() -> Client:
    """Server-side Supabase client using the service_role key — bypasses RLS,
    so this must only ever be used from trusted backend code, never exposed
    to the frontend.
    """
    settings = get_settings()
    if not settings.supabase_url or not settings.supabase_service_key:
        raise RuntimeError("SUPABASE_URL / SUPABASE_SERVICE_KEY not set — see backend/.env.example")
    return create_client(settings.supabase_url, settings.supabase_service_key)


# --- meals / meal_items -----------------------------------------------------


def create_meal(user_id: str, image_url: str | None = None) -> str:
    row = get_supabase().table("meals").insert({"user_id": user_id, "image_url": image_url}).execute()
    return row.data[0]["id"]


def create_meal_items(meal_id: str, items: list) -> list[dict]:
    """items: list of MealItemCandidate. Inserts one row per item, grams left
    null until the user submits them via /meals/calculate.
    """
    rows = [
        {
            "meal_id": meal_id,
            "food_name": item.name,
            "fdc_id": item.usda.fdc_id if item.usda else None,
            "suggested_grams": item.suggested_grams,
            "match_confidence": item.confidence,
        }
        for item in items
    ]
    result = get_supabase().table("meal_items").insert(rows).execute()
    return result.data


def list_meals(user_id: str) -> list[dict]:
    """Most recent first, each meal with its items embedded (single query via
    PostgREST's foreign-table embedding, not N+1 lookups).
    """
    result = (
        get_supabase()
        .table("meals")
        .select("*, meal_items(*)")
        .eq("user_id", user_id)
        .order("created_at", desc=True)
        .execute()
    )
    return result.data


def get_meal(meal_id: str, user_id: str) -> dict | None:
    """Scoped to user_id too, not just meal_id — so one user can't fetch
    another's meal by guessing/enumerating ids.
    """
    result = (
        get_supabase()
        .table("meals")
        .select("*, meal_items(*)")
        .eq("id", meal_id)
        .eq("user_id", user_id)
        .limit(1)
        .execute()
    )
    return result.data[0] if result.data else None


def get_meals_in_range(user_id: str, start_iso: str, end_iso: str) -> list[dict]:
    """Only `done` meals — a meal still awaiting grams input has no macros
    to contribute to a daily total yet.
    """
    result = (
        get_supabase()
        .table("meals")
        .select("*, meal_items(*)")
        .eq("user_id", user_id)
        .eq("status", "done")
        .gte("created_at", start_iso)
        .lt("created_at", end_iso)
        .execute()
    )
    return result.data


def finalize_meal_items(meal_id: str, computed_items: list) -> None:
    """computed_items: list of ComputedItem, matched back to rows by food_name.
    Writes grams + macros for each item and marks the meal done.
    """
    supabase = get_supabase()
    for item in computed_items:
        supabase.table("meal_items").update(
            {
                "grams": item.grams,
                "calories": item.calories,
                "protein": item.protein,
                "carbs": item.carbs,
                "fat": item.fat,
            }
        ).eq("meal_id", meal_id).eq("food_name", item.name).execute()

    supabase.table("meals").update({"status": "done"}).eq("id", meal_id).execute()


# --- personalization (user_food_defaults) -----------------------------------


def get_suggested_grams(user_id: str, food_name: str) -> float | None:
    result = (
        get_supabase()
        .table("user_food_defaults")
        .select("avg_grams, entry_count")
        .eq("user_id", user_id)
        .eq("food_name", food_name)
        .limit(1)
        .execute()
    )
    if result.data and result.data[0]["entry_count"] >= 1:
        return result.data[0]["avg_grams"]
    return None


def record_user_grams(user_id: str, food_name: str, fdc_id: str | None, grams: float) -> None:
    """Running average, per plan §6 — never a correction of an AI guess, just
    what the user has actually entered for this food before.
    """
    supabase = get_supabase()
    existing = (
        supabase.table("user_food_defaults")
        .select("avg_grams, entry_count")
        .eq("user_id", user_id)
        .eq("food_name", food_name)
        .limit(1)
        .execute()
    )
    if existing.data:
        prev = existing.data[0]
        new_avg = (prev["avg_grams"] * prev["entry_count"] + grams) / (prev["entry_count"] + 1)
        supabase.table("user_food_defaults").update(
            {"avg_grams": new_avg, "entry_count": prev["entry_count"] + 1, "fdc_id": fdc_id}
        ).eq("user_id", user_id).eq("food_name", food_name).execute()
    else:
        supabase.table("user_food_defaults").insert(
            {"user_id": user_id, "food_name": food_name, "fdc_id": fdc_id, "avg_grams": grams, "entry_count": 1}
        ).execute()
