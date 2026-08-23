from pydantic import BaseModel, Field


class IdentifiedItem(BaseModel):
    """One food item the vision model spotted in the photo. No portion/grams here — see plan §1/§6."""

    name: str = Field(description="Plain-language food name, e.g. 'grilled chicken breast'")
    confidence: float = Field(ge=0, le=1, description="Model's confidence this item is present and correctly named")


class UsdaMatch(BaseModel):
    fdc_id: str
    matched_description: str
    calories_per_100g: float
    protein_per_100g: float
    carbs_per_100g: float
    fat_per_100g: float


class MealItemCandidate(BaseModel):
    """One row the frontend will show the user: an identified item + its USDA match, awaiting a grams value."""

    name: str
    confidence: float
    usda: UsdaMatch | None = None
    suggested_grams: float | None = None  # filled in once personalization (Phase 4) exists; None for now


class IdentifyResponse(BaseModel):
    meal_id: str
    items: list[MealItemCandidate]


class GramsEntry(BaseModel):
    name: str
    fdc_id: str
    grams: float = Field(gt=0)


class CalculateRequest(BaseModel):
    meal_id: str
    items: list[GramsEntry]


class ComputedItem(BaseModel):
    name: str
    grams: float
    calories: float
    protein: float
    carbs: float
    fat: float


class CalculateResponse(BaseModel):
    items: list[ComputedItem]
    total_calories: float
    total_protein: float
    total_carbs: float
    total_fat: float


class MealItemRow(BaseModel):
    """Mirrors a meal_items DB row as-is — used for history/detail views."""

    id: str
    food_name: str
    fdc_id: str | None = None
    suggested_grams: float | None = None
    grams: float | None = None
    calories: float | None = None
    protein: float | None = None
    carbs: float | None = None
    fat: float | None = None
    match_confidence: float | None = None


class MealSummary(BaseModel):
    id: str
    image_url: str | None = None
    created_at: str
    status: str
    items: list[MealItemRow]
    total_calories: float
    total_protein: float
    total_carbs: float
    total_fat: float


class MealListResponse(BaseModel):
    meals: list[MealSummary]


class DailyStatsResponse(BaseModel):
    date: str
    meal_count: int
    total_calories: float
    total_protein: float
    total_carbs: float
    total_fat: float
