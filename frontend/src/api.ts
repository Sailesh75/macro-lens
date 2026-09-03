import { supabase } from "./supabaseClient";
import type {
  CalculateRequest,
  CalculateResponse,
  DailyStatsResponse,
  IdentifyResponse,
  MealListResponse,
} from "./types";

const API_BASE = import.meta.env.VITE_API_BASE_URL ?? "http://127.0.0.1:8000";

// Used by /meals/identify and /meals/calculate, which support guest access —
// no session just means "no Authorization header," not an error. The
// backend treats a missing header as an anonymous, stateless request.
async function optionalAuthHeader(): Promise<Record<string, string>> {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  return token ? { Authorization: `Bearer ${token}` } : {};
}

// Used by history/stats endpoints, which have no guest equivalent — there's
// no such thing as anonymous history, so a missing session is a real error.
async function authHeader(): Promise<Record<string, string>> {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) throw new Error("Not logged in");
  return { Authorization: `Bearer ${token}` };
}

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
    headers: await optionalAuthHeader(),
    body: formData,
  });
  return parseOrThrow<IdentifyResponse>(res);
}

// Typing/voice entry point. Voice mode reuses this unchanged — the browser's
// SpeechRecognition API turns speech into text client-side first, so by the
// time it reaches here it's indistinguishable from something typed.
export async function identifyMealFromText(text: string): Promise<IdentifyResponse> {
  const res = await fetch(`${API_BASE}/meals/identify-text`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...(await optionalAuthHeader()) },
    body: JSON.stringify({ text }),
  });
  return parseOrThrow<IdentifyResponse>(res);
}

export async function calculateMeal(payload: CalculateRequest): Promise<CalculateResponse> {
  const res = await fetch(`${API_BASE}/meals/calculate`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...(await optionalAuthHeader()) },
    body: JSON.stringify(payload),
  });
  return parseOrThrow<CalculateResponse>(res);
}

export async function listMeals(): Promise<MealListResponse> {
  const res = await fetch(`${API_BASE}/meals`, { headers: await authHeader() });
  return parseOrThrow<MealListResponse>(res);
}

export async function getDailyStats(date?: string): Promise<DailyStatsResponse> {
  const url = new URL(`${API_BASE}/stats/daily`);
  if (date) url.searchParams.set("date", date);
  const res = await fetch(url, { headers: await authHeader() });
  return parseOrThrow<DailyStatsResponse>(res);
}
