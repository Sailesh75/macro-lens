# Frontend — Phase 2 (in progress)

React + TypeScript + Vite. Covers the core "log a meal" flow so far: upload
a photo → see identified items (with USDA matches + any remembered grams
pre-filled) → enter/confirm grams → see computed macros. Meal history and
daily/weekly summaries aren't built yet.

## Setup

```powershell
cd frontend
npm install
```

No `.env` needed unless your backend isn't running at the default
`http://127.0.0.1:8000` — see `.env.example` if you need to point elsewhere.

## Run

Make sure the backend (`backend/`, `uvicorn app.main:app --reload`) is
running first, then:

```powershell
npm run dev
```

Opens at http://localhost:5173. The backend's CORS is already configured to
allow this origin (see `backend/app/main.py`).

## What's here

- `src/api.ts` — typed fetch wrappers for `/meals/identify` and `/meals/calculate`
- `src/types.ts` — TypeScript types mirroring `backend/app/schemas.py` (kept in sync by hand)
- `src/App.tsx` — the whole flow in one component for now; will split into pieces once meal history/summary views get added

## What's not here yet

- Meal history list, daily/weekly macro summaries (plan §8, rest of Phase 2)
- Any styling framework — plain CSS on purpose, matching the plan's "keep the grams-entry UI simple" note
- Real auth — the backend still uses one hardcoded `TEST_USER_ID` (Phase 2 will eventually wire real Supabase Auth login here)
