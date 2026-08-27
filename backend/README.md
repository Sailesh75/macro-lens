# Backend — Phases 1-3 complete

The full photo → S3 → vision → USDA → grams → macros pipeline, persisted to
Supabase, with real auth, history/summary endpoints, tests, and CI/CD. See
[../ai-macro-logger-plan.md](../ai-macro-logger-plan.md) for the full plan.

## Deployed environments

| Environment | Branch | URL |
|---|---|---|
| Staging | `staging` | https://ai-macro-logger.onrender.com |
| Production | `master` | https://ai-macro-logger-prod.onrender.com |

Both Render services build from the `backend` subdirectory and read the same
environment variables described below. Both currently point at the **same**
Supabase project (see plan §8 Phase 3 for why) — staging and production share
a database and Auth user pool, a deliberate cost tradeoff, not an oversight.

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
4. **`AWS_ACCESS_KEY_ID`** / **`AWS_SECRET_ACCESS_KEY`** / **`AWS_REGION`** / **`S3_BUCKET_NAME`** — an IAM user scoped to just your bucket (PutObject/GetObject/DeleteObject only), and the bucket itself with public access blocked.

No `TEST_USER_ID` anymore — auth is real now (see below). `scripts/create_test_user.py` is kept around only as an optional utility for creating a throwaway account without going through the frontend sign-up form.

## Auth

Every request (except `/health`) must carry `Authorization: Bearer <token>`,
where the token is a real Supabase session access token — obtained by
signing up/logging in through the frontend, or via Supabase's own REST auth
endpoints if testing with Postman directly. `app/auth.py` verifies the token
against Supabase's Auth API on every request and uses the resulting user id
for all queries — nothing trusts a client-supplied user id.

## Run

```powershell
uvicorn app.main:app --reload
```

Server comes up at http://127.0.0.1:8000 — interactive docs at
http://127.0.0.1:8000/docs (note: `/docs`' "Try it out" won't have a valid
token unless you paste one into the Authorize button manually).

## Tests

```powershell
pip install -r requirements-dev.txt
pytest
```

Coverage so far focuses on stable, pure-logic pieces and the resilience
fixes made after real incidents (see `learning.md`) — macro math, the
kcal/kJ extraction bug (regression-tested), and the USDA/Gemini retry logic,
all with mocked HTTP/SDK calls so tests run offline and don't burn API
quota. Not yet covered: the routes themselves (needs a test Supabase
setup/fixtures) and anything in the future LangGraph graph.

## Endpoints

- `GET /health` — sanity check, no auth required
- `POST /meals/identify` — upload a photo (`multipart/form-data`, field `photo`). Identifies food items, matches each to USDA, looks up a suggested portion from this user's history, and creates a `meals` + `meal_items` row. Returns `meal_id` plus the items (grams still null).
- `POST /meals/calculate` — send `{"meal_id": ..., "items": [{"name": ..., "fdc_id": ..., "grams": ...}]}` using the `meal_id` and items from `/identify`. Computes macros, writes them onto the meal's rows, marks it `done`, and updates this user's per-food average grams (the personalization signal).
- `GET /meals` — this user's meal history, most recent first, each with items and totals.
- `GET /meals/{id}` — a single meal's detail, scoped to the requesting user.
- `GET /stats/daily?date=YYYY-MM-DD` — aggregated macros across this user's `done` meals for one day (defaults to today, UTC).

## What's not here yet

- The LangGraph retry/human-in-the-loop graph — `/identify` and `/calculate`
  are two plain endpoints standing in for what becomes a graph in Phase 4
- Weekly stats (plan §8 mentions it; only daily is built)
- Presigned GET URLs for displaying photos back — the bucket blocks public access on purpose, so `meals.image_url` isn't browser-viewable yet as-is; that gets solved when the frontend needs to actually show photos
- CI and CD aren't gated together yet — GitHub Actions runs tests, but Render/Vercel deploy on every push to their watched branch regardless of whether those tests passed. A branch protection rule requiring the CI check before merge would close this; deferred deliberately for now

Each of those gets wired in as we go — see the roadmap in the plan doc.
