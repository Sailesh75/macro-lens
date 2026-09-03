"""Turns an amount+unit parsed from typed/spoken text (see vision.py's
identify_foods_from_text) into an actual gram figure — used by the graph's
suggest_defaults_node to pre-fill grams for text/voice entries.

The split of responsibility is deliberate, same principle as the rest of
this app (plan §1/§6): the LLM's job is ONLY to extract the literal number
and unit word the user said ("2" / "medium" from "2 medium bananas") — it
never invents a weight. This module does 100% of the actual arithmetic, and
only from real data: either a standard weight-unit conversion, or a USDA-
sourced portion for that specific food (see pipeline/usda.py's
_extract_portions). If neither applies, it returns None rather than
guessing — the caller leaves grams blank for manual entry, exactly like
photo mode already does when nothing more specific is available.
"""

from app.schemas import UsdaMatch

_UNIT_TO_GRAMS = {
    "g": 1.0,
    "gram": 1.0,
    "grams": 1.0,
    "gm": 1.0,
    "gms": 1.0,
    "kg": 1000.0,
    "kilogram": 1000.0,
    "kilograms": 1000.0,
    "oz": 28.3495,
    "ounce": 28.3495,
    "ounces": 28.3495,
    "lb": 453.592,
    "lbs": 453.592,
    "pound": 453.592,
    "pounds": 453.592,
}


def resolve_quantity_to_grams(usda: UsdaMatch | None, amount: float | None, unit: str | None) -> float | None:
    """amount/unit: e.g. (2, "medium") for "2 medium bananas", or (150, "g")
    for "150g of rice". Returns None when there's no safe, sourced way to
    convert — never a fallback guess.
    """
    if usda is None or amount is None or amount <= 0 or not unit:
        return None

    unit_norm = unit.strip().lower()
    if unit_norm in _UNIT_TO_GRAMS:
        return round(amount * _UNIT_TO_GRAMS[unit_norm], 1)

    # Not a weight unit — try matching it against this food's own USDA
    # portions (e.g. unit "medium" against a portion labelled
    # 'medium (7" to 7-7/8" long)', or unit "egg" against "1 egg").
    for portion in usda.portions:
        if unit_norm in portion.label.lower():
            return round(amount * portion.grams, 1)

    return None
