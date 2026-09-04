# MacroLens

A meal-logging app where you photograph (or describe) a meal, an AI vision
pipeline identifies *what's* on the plate, and you enter *how much* of each
item — in grams. The app never guesses portion size; instead it remembers
your typical portions per food and pre-fills them next time, so logging gets
faster the more you use it.

**Live app:** https://frontend-sigma-liart-68.vercel.app
**API:** https://ai-macro-logger-prod.onrender.com/docs

---

## Why it's built this way

Gram-level portion estimation from a single 2D photo is a known-unreliable
problem — published benchmarks (e.g. Nutrition5k) show 20-40%+ error even
with dedicated models and reference objects. Rather than ship an AI guess and
try to correct it, MacroLens asks the user for the one number a photo
genuinely can't give it, and personalizes by *remembering* that number per
food. The vision model's job is strictly identification (what food, matched
to a real nutrition record); the human's job is quantity. That split is the
whole design.

## What it does

1. Upload a photo, or type/speak a description ("two eggs and a slice of
   toast") — an LLM vision/text pipeline identifies each food item.
2. Each item is matched against the USDA FoodData Central database for real
   per-100g nutrition data (with LLM-assisted disambiguation when USDA
   returns multiple plausible candidates).
3. If you've logged that food before, its usual gram amount is pre-filled
   (still fully editable); if the description already stated a quantity
   ("2 medium bananas"), that's resolved to grams via USDA portion data
   instead.
4. You confirm/edit grams per item → the app computes calories/protein/
   carbs/fat and saves the meal.
5. The grams you entered update a running average for that food, so the
   next pre-fill gets more accurate.
6. History and daily macro totals are available for logged-in users; the
   identify → calculate flow also works fully as a guest, with nothing
   persisted.

## Architecture

```
                    ┌─────────────────────────────┐
  Photo / text  ──▶ │   FastAPI  (POST /meals/…)  │
                    └──────────────┬───────────────┘
                                   ▼
                    ┌─────────────────────────────┐
                    │        LangGraph pipeline     │
                    │                                │
                    │  identify_foods (Gemini)       │
                    │        │                       │
                    │        ▼                       │
                    │  lookup_usda (FoodData Central, │
                    │  LLM disambiguation)            │
                    │        │                       │
                    │  no good match & retries left?  │
                    │   ── yes ──▶ loop back to        │
                    │              identify_foods       │
                    │   ── no ───▶ suggest_defaults     │
                    │      (this user's remembered      │
                    │       grams for each matched food)│
                    └──────────────┬───────────────┘
                                   ▼
                    Photo → S3, item list → client
                                   ▼
                 User reviews / edits grams per item
                                   ▼
                    ┌─────────────────────────────┐
                    │  POST /meals/calculate        │
                    │  grams × USDA per-100g data    │
                    │  → macros, persisted, and the  │
                    │  per-user average grams for    │
                    │  each food is updated           │
                    └─────────────────────────────┘
```

The retry loop (`identify_foods → lookup_usda → check_matches`) is the one
genuinely cyclic part of the pipeline and the actual reason it's built as a
LangGraph graph rather than a linear script — it re-prompts the vision model
with a refined hint (capped at 2 retries) when USDA has no good match for
something. The "wait for the user to enter grams" step doesn't need
LangGraph's interrupt/checkpoint machinery — it's just two REST calls
(`/meals/identify` then `/meals/calculate`) with the in-between state held in
Postgres, which is simpler than standing up graph checkpointing to solve a
problem a normal API already solves.

## Tech stack

| Layer | Choice | Notes |
|---|---|---|
| Frontend | React + TypeScript (Vite) | Plain CSS, no framework |
| Backend / API | Python, FastAPI | |
| Orchestration | LangGraph | Used for the one real cycle in the pipeline; no LangChain |
| Vision & text understanding | Google Gemini (`google-genai` SDK) | Food identification + USDA candidate disambiguation |
| Nutrition data | USDA FoodData Central API | Real external dataset, not synthetic |
| Auth + database | Supabase (Postgres + Auth) | Email/password and Google OAuth |
| Photo storage | AWS S3 | Private bucket, uploaded via a scoped IAM user |
| Hosting | Vercel (frontend) + Render (backend) | Separate staging/production environments on each |
| CI | GitHub Actions | Backend pytest suite + frontend type-check/build on every push/PR |
| Testing | pytest, mocked HTTP/SDK calls | Focused on pipeline logic (macro math, retry/disambiguation, resilience to real USDA/Gemini flakiness hit during development) |

### AWS usage

- **S3** — meal photos are uploaded from the backend to a private bucket
  (public access blocked) using an IAM user scoped to just that bucket
  (`PutObject`/`GetObject`/`DeleteObject`). Credentials are never exposed to
  the frontend.
- Kept deliberately config-only beyond S3 for now (IAM least-privilege
  scoping, a budget alarm) rather than adding infrastructure — e.g. Lambda —
  that wasn't earning its complexity yet. See the repo's internal plan doc
  for what's next on that front.

## Repo structure

```
.
├── backend/            FastAPI app
│   ├── app/
│   │   ├── main.py         app setup, CORS
│   │   ├── graph.py         LangGraph pipeline (identify → USDA lookup → retry → suggest defaults)
│   │   ├── auth.py          Supabase token verification
│   │   ├── db.py             Supabase/Postgres access
│   │   ├── schemas.py        Pydantic request/response models
│   │   ├── pipeline/         vision.py, usda.py, quantity.py, macros.py, storage.py (S3)
│   │   └── routes/           meals.py, stats.py
│   ├── tests/               pytest suite
│   └── supabase/schema.sql   database schema
└── frontend/            React + Vite app
    └── src/                 App.tsx, Auth.tsx, MealHistory.tsx, DailySummary.tsx, api.ts, types.ts
```

Each app has its own README with setup, environment variables, and endpoint
details: [backend/README.md](backend/README.md) ·
[frontend/README.md](frontend/README.md).

## Environments & deployment

| Environment | Branch | Frontend (Vercel) | Backend (Render) |
|---|---|---|---|
| Staging | `staging` | frontend-git-staging-…vercel.app | ai-macro-logger.onrender.com |
| Production | `master` | frontend-sigma-liart-68.vercel.app | ai-macro-logger-prod.onrender.com |

Feature branches → PR into `staging` → CI runs → merge → auto-deploys to
staging (Vercel/Render's native git integration, not custom deploy scripts).
Once verified there, `staging` → `master` promotes to production the same
way. Staging and production currently share one Supabase project (a
deliberate free-tier tradeoff), so they share a database and Auth user pool
but not their frontend/backend deployments.

## Quick start (local)

```powershell
# backend
cd backend
python -m venv .venv && .venv\Scripts\activate
pip install -r requirements.txt
copy .env.example .env   # fill in Gemini / USDA / Supabase / AWS keys
uvicorn app.main:app --reload

# frontend, in another terminal
cd frontend
npm install
copy .env.example .env   # fill in Supabase URL/anon key
npm run dev
```

Full setup instructions (where to get each API key, auth setup, etc.) are in
[backend/README.md](backend/README.md) and
[frontend/README.md](frontend/README.md).
