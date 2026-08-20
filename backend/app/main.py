from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.routes import meals

app = FastAPI(title="AI Food & Macro Logger — API", version="0.1.0")

# Local Vite dev server. Tighten this once the frontend has a real deployed origin.
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"],
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(meals.router)


@app.get("/health")
def health() -> dict:
    return {"status": "ok"}
