import type { Session } from "@supabase/supabase-js";
import { useEffect, useState } from "react";
import { calculateMeal, getDailyStats, identifyMeal, listMeals } from "./api";
import { Auth } from "./Auth";
import { DailySummary } from "./DailySummary";
import { MealHistory } from "./MealHistory";
import { supabase } from "./supabaseClient";
import type { CalculateResponse, DailyStatsResponse, IdentifyResponse, MealSummary } from "./types";

type Status = "idle" | "identifying" | "identified" | "calculating" | "done" | "error";

function App() {
  const [session, setSession] = useState<Session | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [isGuest, setIsGuest] = useState(false);

  const [photo, setPhoto] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [status, setStatus] = useState<Status>("idle");
  const [error, setError] = useState<string | null>(null);
  const [identifyResult, setIdentifyResult] = useState<IdentifyResponse | null>(null);
  const [gramsByName, setGramsByName] = useState<Record<string, string>>({});
  const [calculateResult, setCalculateResult] = useState<CalculateResponse | null>(null);

  const [meals, setMeals] = useState<MealSummary[]>([]);
  const [mealsLoading, setMealsLoading] = useState(true);
  const [dailyStats, setDailyStats] = useState<DailyStatsResponse | null>(null);
  const [statsLoading, setStatsLoading] = useState(true);

  async function refreshHistoryAndStats() {
    setMealsLoading(true);
    setStatsLoading(true);
    try {
      const [mealsResult, statsResult] = await Promise.all([listMeals(), getDailyStats()]);
      setMeals(mealsResult.meals);
      setDailyStats(statsResult);
    } catch (err) {
      // Non-fatal for the main log-a-meal flow — just leave history/stats stale
      // and surface it quietly rather than blocking the page.
      console.error("Failed to refresh history/stats:", err);
    } finally {
      setMealsLoading(false);
      setStatsLoading(false);
    }
  }

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setAuthLoading(false);
    });
    const { data: listener } = supabase.auth.onAuthStateChange((_event, newSession) => {
      setSession(newSession);
    });
    return () => listener.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (session) refreshHistoryAndStats();
  }, [session]);

  async function handleLogout() {
    await supabase.auth.signOut();
    setIsGuest(false);
  }

  function handlePhotoChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0] ?? null;
    setPhoto(file);
    setPreviewUrl(file ? URL.createObjectURL(file) : null);
    // Starting over with a new photo clears any previous meal's state.
    setIdentifyResult(null);
    setCalculateResult(null);
    setGramsByName({});
    setError(null);
  }

  async function handleIdentify() {
    if (!photo) return;
    setStatus("identifying");
    setError(null);
    try {
      const result = await identifyMeal(photo);
      setIdentifyResult(result);
      // Pre-fill grams from personalization where available (see plan §6) —
      // still fully editable, never authoritative.
      const initialGrams: Record<string, string> = {};
      for (const item of result.items) {
        if (item.suggested_grams != null) {
          initialGrams[item.name] = String(item.suggested_grams);
        }
      }
      setGramsByName(initialGrams);
      setStatus("identified");
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setStatus("error");
    }
  }

  async function handleCalculate() {
    if (!identifyResult) return;
    setStatus("calculating");
    setError(null);
    try {
      const items = identifyResult.items
        .filter((item) => item.usda && gramsByName[item.name])
        .map((item) => ({
          name: item.name,
          fdc_id: item.usda!.fdc_id,
          grams: Number(gramsByName[item.name]),
        }));

      if (items.length === 0) {
        throw new Error("Enter grams for at least one matched item before calculating.");
      }

      const result = await calculateMeal({ meal_id: identifyResult.meal_id, items });
      setCalculateResult(result);
      setStatus("done");
      refreshHistoryAndStats();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setStatus("error");
    }
  }

  if (authLoading) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-8">
        <p className="italic text-neutral-400">Loading...</p>
      </div>
    );
  }

  if (!session && !isGuest) {
    return <Auth onGuestContinue={() => setIsGuest(true)} />;
  }

  return (
    <div className="mx-auto max-w-2xl px-4 py-8">
      <div className="flex items-baseline justify-between gap-4">
        <h1 className="text-xl font-semibold tracking-tight">AI Macro Logger</h1>
        {session ? (
          <button
            type="button"
            className="text-sm text-neutral-500 underline decoration-neutral-300 underline-offset-2 hover:text-neutral-900 dark:hover:text-neutral-100"
            onClick={handleLogout}
          >
            Log out ({session.user.email})
          </button>
        ) : (
          <button
            type="button"
            className="text-sm text-neutral-500 underline decoration-neutral-300 underline-offset-2 hover:text-neutral-900 dark:hover:text-neutral-100"
            onClick={() => setIsGuest(false)}
          >
            Log in
          </button>
        )}
      </div>

      {!session && (
        <p className="mt-3 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:border-amber-900/50 dark:bg-amber-950/40 dark:text-amber-200">
          You're trying this out as a guest — nothing here is saved.{" "}
          <button
            type="button"
            className="font-medium underline underline-offset-2"
            onClick={() => setIsGuest(false)}
          >
            Log in
          </button>{" "}
          to keep your history and daily totals.
        </p>
      )}

      <p className="mt-1 text-sm text-neutral-500">
        Upload a meal photo. The AI identifies what's on your plate — you always enter how much.
      </p>

      <section className="mt-6 rounded-2xl bg-white p-6 shadow-sm ring-1 ring-neutral-200 dark:bg-neutral-900 dark:ring-neutral-800">
        <label className="block text-sm font-medium text-neutral-700 dark:text-neutral-300">
          Meal photo
        </label>
        <input
          type="file"
          accept="image/*"
          onChange={handlePhotoChange}
          className="mt-2 block w-full text-sm text-neutral-500 file:mr-3 file:rounded-lg file:border-0 file:bg-neutral-900 file:px-3 file:py-2 file:text-sm file:font-medium file:text-white hover:file:bg-neutral-700 dark:file:bg-neutral-100 dark:file:text-neutral-900 dark:hover:file:bg-white"
        />
        {previewUrl && (
          <img
            className="mt-4 max-h-72 w-full rounded-xl object-cover"
            src={previewUrl}
            alt="Selected meal"
          />
        )}
        <button
          onClick={handleIdentify}
          disabled={!photo || status === "identifying"}
          className="mt-4 rounded-lg bg-neutral-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-neutral-700 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-neutral-100 dark:text-neutral-900 dark:hover:bg-white"
        >
          {status === "identifying" ? "Identifying..." : "Identify food"}
        </button>
      </section>

      {error && <p className="mt-4 text-sm font-medium text-red-600 dark:text-red-400">{error}</p>}

      {identifyResult && (
        <section className="mt-6 rounded-2xl bg-white p-6 shadow-sm ring-1 ring-neutral-200 dark:bg-neutral-900 dark:ring-neutral-800">
          <h2 className="text-base font-semibold">Identified items</h2>
          <div className="mt-3 overflow-x-auto">
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr className="text-left text-neutral-500">
                  <th className="border-b border-neutral-200 pb-2 font-medium dark:border-neutral-800">Item</th>
                  <th className="border-b border-neutral-200 pb-2 font-medium dark:border-neutral-800">Confidence</th>
                  <th className="border-b border-neutral-200 pb-2 font-medium dark:border-neutral-800">USDA match</th>
                  <th className="border-b border-neutral-200 pb-2 font-medium dark:border-neutral-800">Grams</th>
                </tr>
              </thead>
              <tbody>
                {identifyResult.items.map((item) => (
                  <tr key={item.name}>
                    <td className="border-b border-neutral-100 py-2 dark:border-neutral-800">{item.name}</td>
                    <td className="border-b border-neutral-100 py-2 dark:border-neutral-800">
                      {Math.round(item.confidence * 100)}%
                    </td>
                    <td className="border-b border-neutral-100 py-2 dark:border-neutral-800">
                      {item.usda ? (
                        item.usda.matched_description
                      ) : (
                        <span className="italic text-neutral-400">no match found</span>
                      )}
                    </td>
                    <td className="border-b border-neutral-100 py-2 dark:border-neutral-800">
                      <div className="flex items-center gap-2">
                        <input
                          type="number"
                          min="0"
                          step="1"
                          placeholder={item.suggested_grams ? undefined : "grams"}
                          disabled={!item.usda}
                          value={gramsByName[item.name] ?? ""}
                          onChange={(e) =>
                            setGramsByName((prev) => ({ ...prev, [item.name]: e.target.value }))
                          }
                          className="w-20 rounded-lg border border-neutral-300 px-2 py-1 text-sm disabled:cursor-not-allowed disabled:opacity-50 dark:border-neutral-700 dark:bg-neutral-800"
                        />
                        {item.suggested_grams != null && (
                          <span
                            className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300"
                            title="Pre-filled from your history"
                          >
                            remembered
                          </span>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <button
            onClick={handleCalculate}
            disabled={status === "calculating"}
            className="mt-4 rounded-lg bg-neutral-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-neutral-700 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-neutral-100 dark:text-neutral-900 dark:hover:bg-white"
          >
            {status === "calculating" ? "Calculating..." : "Calculate macros"}
          </button>
        </section>
      )}

      {calculateResult && (
        <section className="mt-6 rounded-2xl bg-white p-6 shadow-sm ring-1 ring-neutral-200 dark:bg-neutral-900 dark:ring-neutral-800">
          <h2 className="text-base font-semibold">Macros</h2>
          <div className="mt-3 overflow-x-auto">
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr className="text-left text-neutral-500">
                  <th className="border-b border-neutral-200 pb-2 font-medium dark:border-neutral-800">Item</th>
                  <th className="border-b border-neutral-200 pb-2 font-medium dark:border-neutral-800">Grams</th>
                  <th className="border-b border-neutral-200 pb-2 font-medium dark:border-neutral-800">Calories</th>
                  <th className="border-b border-neutral-200 pb-2 font-medium dark:border-neutral-800">Protein</th>
                  <th className="border-b border-neutral-200 pb-2 font-medium dark:border-neutral-800">Carbs</th>
                  <th className="border-b border-neutral-200 pb-2 font-medium dark:border-neutral-800">Fat</th>
                </tr>
              </thead>
              <tbody>
                {calculateResult.items.map((item) => (
                  <tr key={item.name}>
                    <td className="border-b border-neutral-100 py-2 dark:border-neutral-800">{item.name}</td>
                    <td className="border-b border-neutral-100 py-2 dark:border-neutral-800">{item.grams}</td>
                    <td className="border-b border-neutral-100 py-2 dark:border-neutral-800">{item.calories}</td>
                    <td className="border-b border-neutral-100 py-2 dark:border-neutral-800">{item.protein}</td>
                    <td className="border-b border-neutral-100 py-2 dark:border-neutral-800">{item.carbs}</td>
                    <td className="border-b border-neutral-100 py-2 dark:border-neutral-800">{item.fat}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr>
                  <td className="pt-2 font-semibold">Total</td>
                  <td className="pt-2"></td>
                  <td className="pt-2 font-semibold">{calculateResult.total_calories}</td>
                  <td className="pt-2 font-semibold">{calculateResult.total_protein}</td>
                  <td className="pt-2 font-semibold">{calculateResult.total_carbs}</td>
                  <td className="pt-2 font-semibold">{calculateResult.total_fat}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        </section>
      )}

      {session && (
        <>
          <DailySummary stats={dailyStats} loading={statsLoading} />
          <MealHistory meals={meals} loading={mealsLoading} />
        </>
      )}
    </div>
  );
}

export default App;
