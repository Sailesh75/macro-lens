# Backend — Phase 1

The full photo → S3 → vision → USDA → grams → macros pipeline, persisted to
Supabase. Phase 1 is complete. See
[../ai-macro-logger-plan.md](../ai-macro-logger-plan.md) for the full plan.

## Setup

```powershell
cd backend
python -m venv .venv
.venv\Scripts\activate
pip install -r requirements.txt
copy .env.example .env
```

Fill in `.env`:

1. **`GEMINI_API_KEY`** — https://aistudio.google.com/apikey (free, instant)
2. **`USDA_API_KEY`** — https://fdc.nal.usda.gov/api-key-signup.html (free, instant, emailed to you)
3. **`SUPABASE_URL`** / **`SUPABASE_SERVICE_KEY`** — create a project at supabase.com, run `supabase/schema.sql` in its SQL Editor, then Project Settings → API. Use the **`service_role`** key (sometimes labeled "Secret key"), not `anon`/"Publishable key" — the service key is required for admin operations and to bypass row-level security from trusted backend code.
4. **`TEST_USER_ID`** — run `.venv\Scripts\python.exe scripts\create_test_user.py` once `SUPABASE_SERVICE_KEY` is set; it creates a placeholder user and prints the id to paste in here. Stands in for real login until Phase 2 wires actual Supabase Auth.

5. **`AWS_ACCESS_KEY_ID`** / **`AWS_SECRET_ACCESS_KEY`** / **`AWS_REGION`** / **`S3_BUCKET_NAME`** — an IAM user scoped to just your bucket (PutObject/GetObject/DeleteObject only, see git history or ask if you need the policy JSON again), and the bucket itself with public access blocked.

## Run

```powershell
uvicorn app.main:app --reload
```

Server comes up at http://127.0.0.1:8000 — interactive docs (and a way to
test the endpoints without a frontend yet) at http://127.0.0.1:8000/docs.

## Endpoints so far

- `GET /health` — sanity check
- `POST /meals/identify` — upload a photo (`multipart/form-data`, field `photo`). Identifies food items, matches each to USDA, looks up a suggested portion from history, and creates a `meals` + `meal_items` row. Returns `meal_id` plus the items (grams still null).
- `POST /meals/calculate` — send `{"meal_id": ..., "items": [{"name": ..., "fdc_id": ..., "grams": ...}]}` using the `meal_id` and items from `/identify`. Computes macros, writes them onto the meal's rows, marks it `done`, and updates this user's per-food average grams (the personalization signal).

## What's not here yet

- The LangGraph retry/human-in-the-loop graph — `/identify` and `/calculate`
  are two plain endpoints standing in for what becomes a graph in Phase 3
- Real auth — every meal is attached to one hardcoded `TEST_USER_ID` until Phase 2's frontend wires actual Supabase Auth login
- Presigned GET URLs for displaying photos back — the bucket blocks public access on purpose, so `meals.image_url` isn't browser-viewable yet as-is; that gets solved when Phase 2 needs to actually show photos

Each of those gets wired in as we go — see the roadmap in the plan doc.
