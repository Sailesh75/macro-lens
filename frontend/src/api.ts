import type {
  CalculateRequest,
  CalculateResponse,
  DailyStatsResponse,
  IdentifyResponse,
  MealListResponse,
} from "./types";

const API_BASE = import.meta.env.VITE_API_BASE_URL ?? "http://127.0.0.1:8000";

async function parseOrThrow<T>(res: Response): Promise<T> {
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`${res.status} ${res.statusText}: ${body}`);
  }
  return res.json() as Promise<T>;
}

export async function identifyMeal(photo: File): Promise<IdentifyResponse> {
  const formData = new FormData();
  formData.append("photo", photo);
  const res = await fetch(`${API_BASE}/meals/identify`, {
    method: "POST",
    body: formData,
  });
  return parseOrThrow<IdentifyResponse>(res);
}

export async function calculateMeal(payload: CalculateRequest): Promise<CalculateResponse> {
  const res = await fetch(`${API_BASE}/meals/calculate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  return parseOrThrow<CalculateResponse>(res);
}

export async function listMeals(): Promise<MealListResponse> {
  const res = await fetch(`${API_BASE}/meals`);
  return parseOrThrow<MealListResponse>(res);
}

export async function getDailyStats(date?: string): Promise<DailyStatsResponse> {
  const url = new URL(`${API_BASE}/stats/daily`);
  if (date) url.searchParams.set("date", date);
  const res = await fetch(url);
  return parseOrThrow<DailyStatsResponse>(res);
}
