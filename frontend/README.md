# Frontend — Phase 2 (in progress)

React + TypeScript + Vite. Real Supabase Auth (email/password + Google
OAuth), meal history, daily totals, and the core "log a meal" flow: upload a
photo → see identified items (with USDA matches + any remembered grams
pre-filled) → enter/confirm grams → see computed macros.

## Setup

```powershell
cd frontend
npm install
copy .env.example .env
```

Fill in `.env`:

1. **`VITE_SUPABASE_URL`** / **`VITE_SUPABASE_ANON_KEY`** — Supabase Project Settings → API. The anon/public key is safe here (it's protected by the RLS policies in `backend/supabase/schema.sql`, not by secrecy) — but never put the `service_role` key in frontend code.
2. **`VITE_API_BASE_URL`** — only needed if your backend isn't at the default `http://127.0.0.1:8000`.

**Google OAuth** (optional but wired in): needs a Google Cloud OAuth client (Web application type) with `https://<your-project-ref>.supabase.co/auth/v1/callback` as an authorized redirect URI, and the resulting Client ID/Secret pasted into Supabase's **Authentication → Providers → Google**. Email/password sign-up works without this — Google is an alternative login method, not a requirement.

## Run

Make sure the backend (`backend/`, `uvicorn app.main:app --reload`) is
running first, then:

```powershell
npm run dev
```

Opens at http://localhost:5173. The backend's CORS is already configured to
allow this origin (see `backend/app/main.py`). Sign up with email/password
(you'll need to click the confirmation link Supabase emails you before you
can log in — email confirmation is intentionally left on) or use "Continue
with Google" if that's configured.

## What's here

- `src/supabaseClient.ts` — the Supabase JS client, used only for auth (sign-up/login/session) — actual meal data still goes through the FastAPI backend, never queried directly from the frontend
- `src/Auth.tsx` — sign-up/login form (with "check your email" messaging) plus "Continue with Google"
- `src/api.ts` — typed fetch wrappers for the backend; every call attaches the current session's token as `Authorization: Bearer <token>`
- `src/types.ts` — TypeScript types mirroring `backend/app/schemas.py` (kept in sync by hand)
- `src/App.tsx` — session gating (shows `<Auth />` until logged in) plus the log-a-meal flow, history, and daily summary
- `src/DailySummary.tsx` / `src/MealHistory.tsx` — the history/summary views

## What's not here yet

- Weekly macro summary (plan §8 mentions it; only daily is built)
- Any styling framework — plain CSS on purpose, matching the plan's "keep the grams-entry UI simple" note
- A real deployed origin — CORS and OAuth redirect URIs are currently configured for local dev only
