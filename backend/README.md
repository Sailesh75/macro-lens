# Backend — Phase 1

The vision → USDA → grams → macros pipeline as plain FastAPI endpoints, no
database or S3 yet (that's the next Phase 1 step). See
[../ai-macro-logger-plan.md](../ai-macro-logger-plan.md) for the full plan.

## Setup

```powershell
cd backend
python -m venv .venv
.venv\Scripts\activate
pip install -r requirements.txt
copy .env.example .env
```

Then fill in `.env` with two keys:

1. **`GEMINI_API_KEY`** — https://aistudio.google.com/apikey (free, instant)
2. **`USDA_API_KEY`** — https://fdc.nal.usda.gov/api-key-signup.html (free, instant, emailed to you)

Leave the Supabase/AWS lines commented out for now — they're not used yet.

## Run

```powershell
uvicorn app.main:app --reload
```

Server comes up at http://127.0.0.1:8000 — interactive docs (and a way to
test the endpoints without a frontend yet) at http://127.0.0.1:8000/docs.

## Endpoints so far

- `GET /health` — sanity check
- `POST /meals/identify` — upload a photo (`multipart/form-data`, field `photo`), get back identified food items each matched to a USDA entry. No grams yet.
- `POST /meals/calculate` — send back `{"items": [{"name": ..., "fdc_id": ..., "grams": ...}]}` for the items you got from `/identify`, get computed macros per item + totals.

## What's not here yet

- Persistence (Supabase) — meals aren't saved anywhere yet, this is pure request/response
- Photo storage (S3) — photos aren't kept after the request
- The LangGraph retry/human-in-the-loop graph — `/identify` and `/calculate`
  are two plain endpoints standing in for what becomes a graph in Phase 3
- Personalization (`suggested_grams` is always `null` right now)

Each of those gets wired in as we go — see the roadmap in the plan doc.
