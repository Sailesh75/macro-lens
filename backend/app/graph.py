"""Phase 4: the agentic identify+match pipeline as an actual LangGraph graph.

Scope, deliberately: LangGraph is used for the one part of the pipeline that
is genuinely cyclic — identify_foods -> lookup_usda -> check_matches, which
can loop back to identify_foods with a refined prompt when a match couldn't
be found. `finalize` (the /calculate step) stays a plain function — it's
pure arithmetic with no LLM/orchestration involved, so wrapping it in a graph
node would be decorative, not useful. See learning.md for the reasoning
behind not using LangGraph's interrupt()/checkpointer for the human-in-the-
loop grams step either — our REST API + Postgres already solve that.

Graph shape:

    identify_foods --> lookup_usda --check_matches--> [retry] --> identify_foods (loop)
                                          |
                                          +--> [continue] --> suggest_defaults --> END
"""

from typing import TypedDict

from langgraph.graph import END, START, StateGraph

from app import db
from app.pipeline.quantity import resolve_quantity_to_grams
from app.pipeline.usda import match_food
from app.pipeline.vision import identify_foods, identify_foods_from_text
from app.schemas import MealItemCandidate, UsdaMatch

MAX_RETRIES = 2


class MealGraphState(TypedDict):
    source: str  # "image" or "text" — picks which identify_foods_node branch runs
    image_bytes: bytes | None
    mime_type: str | None
    text: str | None  # set for source="text" (typing/voice) requests only
    user_id: str | None  # None for a guest (stateless) request
    identified_items: list[dict]              # [{"name": str, "confidence": float, "amount": float|None, "unit": str|None}]
    usda_matches: dict[str, UsdaMatch | None]  # item name -> match (or None)
    unmatched_names: list[str]
    retry_count: int
    candidates: list[MealItemCandidate]        # final output, set by suggest_defaults


def identify_foods_node(state: MealGraphState) -> dict:
    """Step 1. On a retry pass (unmatched_names non-empty from a previous
    lookup_usda run), asks the model to re-describe exactly the items that
    couldn't be matched, instead of re-describing everything blind.

    Deliberately doesn't say "be more specific" — real testing showed that's
    backwards for some foods. "Steamed momos" (an accurate, specific name)
    got zero good USDA matches (its search results were all unrelated
    seafood dishes matched on the word "steamed"); the more GENERIC name
    "steamed dumplings" found a real, well-matched USDA entry. Being more
    specific helps for some mismatches (the original "mutton stew dumpling"
    bug needed a more specific description to avoid); being more generic
    helps for others (a regional dish with no exact USDA equivalent). Let
    the model choose the direction rather than only ever pushing one way.

    Branches on state["source"] rather than being two separate graph nodes —
    photo and typed/spoken descriptions feed the exact same retry cycle and
    downstream steps, they just differ in how "what did the model see" gets
    produced. identify_foods never sets amount/unit (a photo can't state a
    quantity); identify_foods_from_text does when the input mentioned one.
    """
    unmatched = state.get("unmatched_names")
    retry_count = state.get("retry_count", 0)

    retry_hint = None
    if unmatched:
        retry_hint = (
            f"These items didn't find a good nutrition database match: {', '.join(unmatched)}. "
            "Try re-describing them differently — sometimes a MORE GENERIC/common name matches "
            "better than an exact regional name (e.g. 'dumplings' instead of a specific regional "
            "name for them), and sometimes a MORE SPECIFIC description helps instead. Use your "
            "judgment about which direction is more likely to match a real database entry."
        )
        retry_count += 1

    if state["source"] == "text":
        items = identify_foods_from_text(state["text"], retry_hint=retry_hint)
    else:
        items = identify_foods(state["image_bytes"], state["mime_type"], retry_hint=retry_hint)

    return {
        "identified_items": [
            {"name": i.name, "confidence": i.confidence, "amount": i.amount, "unit": i.unit} for i in items
        ],
        "retry_count": retry_count,
    }


def lookup_usda_node(state: MealGraphState) -> dict:
    """Step 2. match_food already handles disambiguation among multiple
    USDA candidates internally (see pipeline/usda.py) — this node's job is
    just to run it per item and track which ones came back unmatched, for
    check_matches to decide whether a retry is worth it.

    Phase 5: on the graph's final attempt (no more retries left regardless
    of this run's outcome), passes allow_fallback=True so match_food takes
    the closest available USDA candidate instead of leaving the item
    permanently unmatched — see match_food's docstring for why.
    """
    is_final_attempt = state.get("retry_count", 0) >= MAX_RETRIES
    matches: dict[str, UsdaMatch | None] = {}
    unmatched: list[str] = []
    for item in state["identified_items"]:
        name = item["name"]
        result = match_food(name, allow_fallback=is_final_attempt)
        matches[name] = result
        if result is None:
            unmatched.append(name)
    return {"usda_matches": matches, "unmatched_names": unmatched}


def check_matches(state: MealGraphState) -> str:
    """Conditional edge: retry identify_foods (capped) if anything's still
    unmatched, otherwise move on. This is the actual cycle in the graph —
    the reason this pipeline benefits from LangGraph over a plain chain.
    """
    if state["unmatched_names"] and state["retry_count"] < MAX_RETRIES:
        return "retry"
    return "continue"


def suggest_defaults_node(state: MealGraphState) -> dict:
    """Step 3 (grams pre-fill). Builds the final item list the route returns
    to the client — grams still null unless pre-filled here, always editable
    via /meals/calculate either way. Two independent sources, checked in
    priority order:

    1. A quantity the user just stated in this message ("2 medium bananas") —
       resolved to grams via pipeline/quantity.py, using real USDA portion
       data, never an invented number. Wins over personalization because
       it's the freshest, most specific thing the user just said.
    2. Personalization (plan §6) — keyed on usda.fdc_id, not the item name
       (Phase 5 fix): the AI-generated name varies call to call ("chili
       sauce" vs "dark chili sauce" for the same real food), which
       fragmented the running average across different name buckets.
       Guest requests (user_id is None) have no history to look up, so they
       always fall through to no suggestion — not an error.
    """
    candidates = []
    for item in state["identified_items"]:
        name = item["name"]
        usda = state["usda_matches"].get(name)

        suggested = None
        suggested_source = None
        stated_grams = resolve_quantity_to_grams(usda, item.get("amount"), item.get("unit"))
        if stated_grams is not None:
            suggested = stated_grams
            suggested_source = "stated"
        elif usda and state["user_id"]:
            remembered = db.get_suggested_grams(state["user_id"], usda.fdc_id)
            if remembered is not None:
                suggested = remembered
                suggested_source = "remembered"

        candidates.append(
            MealItemCandidate(
                name=name,
                confidence=item["confidence"],
                usda=usda,
                suggested_grams=suggested,
                suggested_grams_source=suggested_source,
            )
        )
    return {"candidates": candidates}


def build_meal_graph():
    graph = StateGraph(MealGraphState)
    graph.add_node("identify_foods", identify_foods_node)
    graph.add_node("lookup_usda", lookup_usda_node)
    graph.add_node("suggest_defaults", suggest_defaults_node)

    graph.add_edge(START, "identify_foods")
    graph.add_edge("identify_foods", "lookup_usda")
    graph.add_conditional_edges(
        "lookup_usda",
        check_matches,
        {"retry": "identify_foods", "continue": "suggest_defaults"},
    )
    graph.add_edge("suggest_defaults", END)

    return graph.compile()


meal_graph = build_meal_graph()


def run_meal_graph(image_bytes: bytes, mime_type: str, user_id: str | None) -> list[MealItemCandidate]:
    """Entry point used by routes/meals.py's POST /meals/identify (photo)."""
    result = meal_graph.invoke(
        {
            "source": "image",
            "image_bytes": image_bytes,
            "mime_type": mime_type,
            "text": None,
            "user_id": user_id,
            "identified_items": [],
            "usda_matches": {},
            "unmatched_names": [],
            "retry_count": 0,
            "candidates": [],
        }
    )
    return result["candidates"]


def run_meal_graph_from_text(text: str, user_id: str | None) -> list[MealItemCandidate]:
    """Entry point used by routes/meals.py's POST /meals/identify-text
    (typing/voice). Same graph, same retry cycle and USDA matching as the
    photo path — see identify_foods_node and suggest_defaults_node's
    source-aware branches.
    """
    result = meal_graph.invoke(
        {
            "source": "text",
            "image_bytes": None,
            "mime_type": None,
            "text": text,
            "user_id": user_id,
            "identified_items": [],
            "usda_matches": {},
            "unmatched_names": [],
            "retry_count": 0,
            "candidates": [],
        }
    )
    return result["candidates"]
