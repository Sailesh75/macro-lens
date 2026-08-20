"""Quick connectivity check for everything configured in .env so far.
Never prints actual key values — only presence/booleans and public info (URLs, results).

Run from backend/: .venv\\Scripts\\python.exe scripts\\smoke_test.py
"""

import sys

import httpx

sys.path.insert(0, ".")

from app.config import get_settings  # noqa: E402
from app.pipeline.usda import search_food  # noqa: E402


def check_config():
    s = get_settings()
    print("== Config presence ==")
    print(f"GEMINI_API_KEY set: {bool(s.gemini_api_key)}")
    print(f"GEMINI_MODEL: {s.gemini_model}")
    print(f"USDA_API_KEY set: {bool(s.usda_api_key)}")
    print(f"SUPABASE_URL: {s.supabase_url or '(not set)'}")
    print(f"SUPABASE_SERVICE_KEY set: {bool(s.supabase_service_key)}")
    return s


def check_usda():
    print("\n== USDA FoodData Central ==")
    try:
        results = search_food("chicken breast")
        if not results:
            print("Reached USDA API but got 0 results — unexpected, check the query/key.")
            return
        top = results[0]
        print(f"OK — top match for 'chicken breast': {top.get('description')} (fdcId {top.get('fdcId')})")
    except Exception as e:
        print(f"FAILED: {e}")


def check_supabase(s):
    print("\n== Supabase ==")
    if not s.supabase_url or not s.supabase_service_key:
        print("Skipped — SUPABASE_URL / SUPABASE_SERVICE_KEY not set in .env yet.")
        return
    try:
        resp = httpx.get(
            f"{s.supabase_url}/rest/v1/meals",
            params={"select": "id", "limit": 1},
            headers={
                "apikey": s.supabase_service_key,
                "Authorization": f"Bearer {s.supabase_service_key}",
            },
            timeout=10.0,
        )
        if resp.status_code == 200:
            print(f"OK — 'meals' table reachable, {len(resp.json())} row(s) returned.")
        else:
            print(f"FAILED: HTTP {resp.status_code} — {resp.text[:300]}")
    except Exception as e:
        print(f"FAILED: {e}")


if __name__ == "__main__":
    settings = check_config()
    check_usda()
    check_supabase(settings)
