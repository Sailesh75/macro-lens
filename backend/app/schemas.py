from pydantic import BaseModel, Field


class IdentifiedItem(BaseModel):
    """One food item the model spotted — from a photo, or from typed/spoken
    text. Photo mode never sets amount/unit (no portion/grams from a photo —
    see plan §1/§6); text/voice mode sets them only when the user actually
    stated a quantity ("2 eggs", "150g rice") — literal extraction of what
    was said, never an invented estimate. See pipeline/quantity.py for how
    amount+unit become an actual gram figure.
    """

    name: str = Field(description="Plain-language food name, e.g. 'grilled chicken breast'")
    confidence: float = Field(ge=0, le=1, description="Model's confidence this item is present and correctly named")
    amount: float | None = Field(default=None, description="Numeric quantity stated in text/voice input, if any")
    unit: str | None = Field(default=None, description="Unit/descriptor accompanying amount, e.g. 'g', 'medium', 'egg'")


class Portion(BaseModel):
    """A named, USDA-sourced serving size for a food, e.g. "medium (7\" to
    7-7/8\" long)" = 118g for a banana. Lets the frontend offer a count-based
    entry ("2 medium bananas") that still resolves to a real gram figure
    instead of an assumed constant — see plan §1/§6 for why grams stays the
    thing that's actually stored, this is just a convenience for computing it.
    """

    label: str
    grams: float = Field(gt=0)


class UsdaMatch(BaseModel):
    fdc_id: str
    matched_description: str
    calories_per_100g: float
    protein_per_100g: float
    carbs_per_100g: float
    fat_per_100g: float
    portions: list[Portion] = Field(default_factory=list)


class MealItemCandidate(BaseModel):
    """One row the frontend will show the user: an identified item + its USDA match, awaiting a grams value."""

    name: str
    confidence: float
    usda: UsdaMatch | None = None
    suggested_grams: float | None = None  # a pre-fill, always editable — never authoritative
    # Where suggested_grams came from, so the frontend can label it honestly:
    # "stated" = parsed from what the user typed/said this time; "remembered"
    # = personalization (plan §6); None = no suggestion at all.
    suggested_grams_source: str | None = None


class IdentifyResponse(BaseModel):
    meal_id: str
    items: list[MealItemCandidate]


class IdentifyTextRequest(BaseModel):
    """Body for POST /meals/identify-text — the typing/voice entry point.
    Voice mode is just this same request with browser speech-to-text having
    already produced the text client-side; no separate backend path needed.
    """

    text: str = Field(min_length=1, max_length=2000)


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
