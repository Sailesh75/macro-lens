import { useEffect, useState } from "react";
import "./App.css";
import { calculateMeal, getDailyStats, identifyMeal, listMeals } from "./api";
import { DailySummary } from "./DailySummary";
import { MealHistory } from "./MealHistory";
import type { CalculateResponse, DailyStatsResponse, IdentifyResponse, MealSummary } from "./types";

type Status = "idle" | "identifying" | "identified" | "calculating" | "done" | "error";

function App() {
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
    refreshHistoryAndStats();
  }, []);

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

  return (
    <div className="page">
      <h1>AI Macro Logger</h1>
      <p className="subtitle">
        Upload a meal photo. The AI identifies what's on your plate — you always enter how much.
      </p>

      <section className="card">
        <input type="file" accept="image/*" onChange={handlePhotoChange} />
        {previewUrl && <img className="preview" src={previewUrl} alt="Selected meal" />}
        <button
          onClick={handleIdentify}
          disabled={!photo || status === "identifying"}
        >
          {status === "identifying" ? "Identifying..." : "Identify food"}
        </button>
      </section>

      {error && <p className="error">{error}</p>}

      {identifyResult && (
        <section className="card">
          <h2>Identified items</h2>
          <table>
            <thead>
              <tr>
                <th>Item</th>
                <th>Confidence</th>
                <th>USDA match</th>
                <th>Grams</th>
              </tr>
            </thead>
            <tbody>
              {identifyResult.items.map((item) => (
                <tr key={item.name}>
                  <td>{item.name}</td>
                  <td>{Math.round(item.confidence * 100)}%</td>
                  <td>
                    {item.usda ? (
                      item.usda.matched_description
                    ) : (
                      <span className="muted">no match found</span>
                    )}
                  </td>
                  <td>
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
                    />
                    {item.suggested_grams != null && (
                      <span className="badge" title="Pre-filled from your history">
                        remembered
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <button onClick={handleCalculate} disabled={status === "calculating"}>
            {status === "calculating" ? "Calculating..." : "Calculate macros"}
          </button>
        </section>
      )}

      {calculateResult && (
        <section className="card">
          <h2>Macros</h2>
          <table>
            <thead>
              <tr>
                <th>Item</th>
                <th>Grams</th>
                <th>Calories</th>
                <th>Protein</th>
                <th>Carbs</th>
                <th>Fat</th>
              </tr>
            </thead>
            <tbody>
              {calculateResult.items.map((item) => (
                <tr key={item.name}>
                  <td>{item.name}</td>
                  <td>{item.grams}</td>
                  <td>{item.calories}</td>
                  <td>{item.protein}</td>
                  <td>{item.carbs}</td>
                  <td>{item.fat}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr>
                <td>
                  <strong>Total</strong>
                </td>
                <td></td>
                <td>
                  <strong>{calculateResult.total_calories}</strong>
                </td>
                <td>
                  <strong>{calculateResult.total_protein}</strong>
                </td>
                <td>
                  <strong>{calculateResult.total_carbs}</strong>
                </td>
                <td>
                  <strong>{calculateResult.total_fat}</strong>
                </td>
              </tr>
            </tfoot>
          </table>
        </section>
      )}

      <DailySummary stats={dailyStats} loading={statsLoading} />
      <MealHistory meals={meals} loading={mealsLoading} />
    </div>
  );
}

export default App;
