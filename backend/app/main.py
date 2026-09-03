from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.routes import meals, stats

app = FastAPI(title="MacroLens — API", version="0.1.0")

# Local dev (desktop + phone-on-LAN) plus the deployed Vercel frontends —
# production and staging each need to be listed explicitly since the backend
# on each Render environment is shared config, not per-environment CORS.
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
        "http://10.0.0.111:5173",
        "https://frontend-sigma-liart-68.vercel.app",  # production
        "https://frontend-git-staging-saileshs-projects-d22c8616.vercel.app",  # staging
    ],
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(meals.router)
app.include_router(stats.router)


@app.get("/health")
def health() -> dict:
    return {"status": "ok"}
