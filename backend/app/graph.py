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
from app.pipeline.usda import match_food
from app.pipeline.vision import identify_foods
from app.schemas import MealItemCandidate, UsdaMatch

MAX_RETRIES = 2


class MealGraphState(TypedDict):
    image_bytes: bytes
    mime_type: str
    user_id: str
    identified_items: list[dict]              # [{"name": str, "confidence": float}]
    usda_matches: dict[str, UsdaMatch | None]  # item name -> match (or None)
    unmatched_names: list[str]
    retry_count: int
    candidates: list[MealItemCandidate]        # final output, set by suggest_defaults


def identify_foods_node(state: MealGraphState) -> dict:
    """Step 1. On a retry pass (unmatched_names non-empty from a previous
    lookup_usda run), asks Gemini to be more specific about exactly the
    items that couldn't be matched, instead of re-describing everything
    blind.
    """
    unmatched = state.get("unmatched_names")
    retry_count = state.get("retry_count", 0)

    retry_hint = None
    if unmatched:
        retry_hint = f"Be more specific about: {', '.join(unmatched)}"
        retry_count += 1

    items = identify_foods(state["image_bytes"], state["mime_type"], retry_hint=retry_hint)
    return {
        "identified_items": [{"name": i.name, "confidence": i.confidence} for i in items],
        "retry_count": retry_count,
    }


def lookup_usda_node(state: MealGraphState) -> dict:
    """Step 2. match_food already handles disambiguation among multiple
    USDA candidates internally (see pipeline/usda.py) — this node's job is
    just to run it per item and track which ones came back unmatched, for
    check_matches to decide whether a retry is worth it.
    """
    matches: dict[str, UsdaMatch | None] = {}
    unmatched: list[str] = []
    for item in state["identified_items"]:
        name = item["name"]
        result = match_food(name)
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
    """Step 3 (personalization pre-fill). Builds the final item list the
    route returns to the client — grams still null, filled in by the user
    via /meals/calculate.
    """
    candidates = []
    for item in state["identified_items"]:
        name = item["name"]
        usda = state["usda_matches"].get(name)
        suggested = db.get_suggested_grams(state["user_id"], name) if usda else None
        candidates.append(
            MealItemCandidate(name=name, confidence=item["confidence"], usda=usda, suggested_grams=suggested)
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


def run_meal_graph(image_bytes: bytes, mime_type: str, user_id: str) -> list[MealItemCandidate]:
    """Entry point used by routes/meals.py."""
    result = meal_graph.invoke(
        {
            "image_bytes": image_bytes,
            "mime_type": mime_type,
            "user_id": user_id,
            "identified_items": [],
            "usda_matches": {},
            "unmatched_names": [],
            "retry_count": 0,
            "candidates": [],
        }
    )
    return result["candidates"]
