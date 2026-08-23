from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.routes import meals, stats

app = FastAPI(title="AI Food & Macro Logger — API", version="0.1.0")

# Local Vite dev server — both localhost (desktop) and the LAN IP (testing
# from a phone on the same Wi-Fi). Tighten this once there's a real deployed
# frontend origin.
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://10.0.0.111:5173"],
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(meals.router)
app.include_router(stats.router)


@app.get("/health")
def health() -> dict:
    return {"status": "ok"}
