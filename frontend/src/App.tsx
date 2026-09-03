import type { Session } from "@supabase/supabase-js";
import { useEffect, useRef, useState } from "react";
import { calculateMeal, getDailyStats, identifyMeal, identifyMealFromText, listMeals } from "./api";
import { Auth } from "./Auth";
import { DailySummary } from "./DailySummary";
import { MealHistory } from "./MealHistory";
import { supabase } from "./supabaseClient";
import type {
  CalculateResponse,
  DailyStatsResponse,
  IdentifyResponse,
  MealSummary,
} from "./types";

type Status =
  | "idle"
  | "identifying"
  | "identified"
  | "calculating"
  | "done"
  | "error";

// Minimal shape of the browser's (non-standard, prefixed) Web Speech API —
// no @types package for it, and only these few members are used here.
interface SpeechRecognitionLike {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  onresult: ((event: { results: { [i: number]: { [j: number]: { transcript: string } } } }) => void) | null;
  onend: (() => void) | null;
  onerror: (() => void) | null;
  start: () => void;
  stop: () => void;
}

declare global {
  interface Window {
    SpeechRecognition?: new () => SpeechRecognitionLike;
    webkitSpeechRecognition?: new () => SpeechRecognitionLike;
  }
}

function App() {
  const [session, setSession] = useState<Session | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [isGuest, setIsGuest] = useState(false);

  const [photo, setPhoto] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const galleryInputRef = useRef<HTMLInputElement>(null);
  const [status, setStatus] = useState<Status>("idle");
  const [error, setError] = useState<string | null>(null);
  const [identifyResult, setIdentifyResult] = useState<IdentifyResponse | null>(
    null,
  );
  const [gramsByName, setGramsByName] = useState<Record<string, string>>({});
  // Count-based entry (e.g. "2 medium bananas"): gramsPerUnitByName holds the
  // USDA portion the user picked (its gram weight), countByName how many of
  // them. Both are just a convenience for computing gramsByName — grams
  // stays the value actually submitted, and stays directly editable too.
  const [gramsPerUnitByName, setGramsPerUnitByName] = useState<Record<string, number>>({});
  const [countByName, setCountByName] = useState<Record<string, string>>({});
  const [calculateResult, setCalculateResult] =
    useState<CalculateResponse | null>(null);

  // Typing/voice entry point (alternative to photo). Voice mode is just the
  // browser's speech-to-text filling `description` — by the time it's
  // submitted it's indistinguishable from something typed.
  const [entryMode, setEntryMode] = useState<"photo" | "text">("photo");
  const [description, setDescription] = useState("");
  const [isListening, setIsListening] = useState(false);
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const speechSupported =
    typeof window !== "undefined" &&
    !!(window.SpeechRecognition || window.webkitSpeechRecognition);

  const [meals, setMeals] = useState<MealSummary[]>([]);
  const [mealsLoading, setMealsLoading] = useState(true);
  const [dailyStats, setDailyStats] = useState<DailyStatsResponse | null>(null);
  const [statsLoading, setStatsLoading] = useState(true);

  async function refreshHistoryAndStats() {
    setMealsLoading(true);
    setStatsLoading(true);
    try {
      const [mealsResult, statsResult] = await Promise.all([
        listMeals(),
        getDailyStats(),
      ]);
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
    const { data: listener } = supabase.auth.onAuthStateChange(
      (_event, newSession) => {
        setSession(newSession);
      },
    );
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
    resetMealState();
  }

  function handlePortionChange(itemName: string, gramsPerUnit: number | null) {
    if (gramsPerUnit == null) {
      // "Enter grams manually" — stop computing from a portion, leave
      // whatever grams value is already there for the user to edit freely.
      setGramsPerUnitByName((prev) => {
        const next = { ...prev };
        delete next[itemName];
        return next;
      });
      return;
    }
    setGramsPerUnitByName((prev) => ({ ...prev, [itemName]: gramsPerUnit }));
    const count = Number(countByName[itemName] ?? "1") || 1;
    setGramsByName((prev) => ({ ...prev, [itemName]: String(Math.round(gramsPerUnit * count)) }));
  }

  function handleCountChange(itemName: string, countStr: string) {
    setCountByName((prev) => ({ ...prev, [itemName]: countStr }));
    const gramsPerUnit = gramsPerUnitByName[itemName];
    if (gramsPerUnit == null) return; // no portion picked yet — nothing to recompute
    const count = Number(countStr) || 0;
    setGramsByName((prev) => ({
      ...prev,
      [itemName]: count > 0 ? String(Math.round(gramsPerUnit * count)) : "",
    }));
  }

  function resetMealState() {
    setIdentifyResult(null);
    setCalculateResult(null);
    setGramsByName({});
    setGramsPerUnitByName({});
    setCountByName({});
    setError(null);
  }

  function handleEntryModeChange(mode: "photo" | "text") {
    setEntryMode(mode);
    resetMealState();
  }

  function toggleListening() {
    if (isListening) {
      recognitionRef.current?.stop();
      return;
    }
    const Ctor = window.SpeechRecognition ?? window.webkitSpeechRecognition;
    if (!Ctor) return; // speechSupported already guards the button, but be safe
    const recognition = new Ctor();
    recognition.continuous = false;
    recognition.interimResults = false;
    recognition.lang = "en-US";
    recognition.onresult = (event) => {
      const transcript = event.results[0][0].transcript;
      setDescription((prev) => (prev ? `${prev} ${transcript}` : transcript));
    };
    recognition.onend = () => setIsListening(false);
    recognition.onerror = () => setIsListening(false);
    recognitionRef.current = recognition;
    recognition.start();
    setIsListening(true);
  }

  function applySuggestedGrams(items: IdentifyResponse["items"]) {
    const initialGrams: Record<string, string> = {};
    for (const item of items) {
      if (item.suggested_grams != null) {
        initialGrams[item.name] = String(item.suggested_grams);
      }
    }
    setGramsByName(initialGrams);
    setGramsPerUnitByName({});
    setCountByName({});
  }

  async function handleIdentifyText() {
    if (!description.trim()) return;
    setStatus("identifying");
    setError(null);
    try {
      const result = await identifyMealFromText(description.trim());
      setIdentifyResult(result);
      applySuggestedGrams(result.items);
      setStatus("identified");
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setStatus("error");
    }
  }

  async function handleIdentify() {
    if (!photo) return;
    setStatus("identifying");
    setError(null);
    try {
      const result = await identifyMeal(photo);
      setIdentifyResult(result);
      // Pre-fill grams where available — either a stated quantity (text/voice
      // mode) or personalization (plan §6). Still fully editable either way.
      applySuggestedGrams(result.items);
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
        throw new Error(
          "Enter grams for at least one matched item before calculating.",
        );
      }

      const result = await calculateMeal({
        meal_id: identifyResult.meal_id,
        items,
      });
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
        <h1 className="text-xl font-semibold tracking-tight">
          AI Macro Logger
        </h1>
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
          Guest mode — nothing here is saved.{" "}
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
        Take a photo, or describe what you ate by typing or speaking.
      </p>

      <div className="mt-4 flex gap-1 border-b border-neutral-200 dark:border-neutral-800">
        <button
          type="button"
          onClick={() => handleEntryModeChange("photo")}
          className={`px-3 py-2 text-sm font-medium ${
            entryMode === "photo"
              ? "border-b-2 border-neutral-900 text-neutral-900 dark:border-neutral-100 dark:text-neutral-100"
              : "text-neutral-500 hover:text-neutral-700 dark:hover:text-neutral-300"
          }`}
        >
          Photo
        </button>
        <button
          type="button"
          onClick={() => handleEntryModeChange("text")}
          className={`px-3 py-2 text-sm font-medium ${
            entryMode === "text"
              ? "border-b-2 border-neutral-900 text-neutral-900 dark:border-neutral-100 dark:text-neutral-100"
              : "text-neutral-500 hover:text-neutral-700 dark:hover:text-neutral-300"
          }`}
        >
          Describe (type or speak)
        </button>
      </div>

      {entryMode === "photo" ? (
        <section className="mt-4 rounded-2xl bg-white p-6 shadow-sm ring-1 ring-neutral-200 dark:bg-neutral-900 dark:ring-neutral-800">
          <label className="block text-sm font-medium text-neutral-700 dark:text-neutral-300">
            Meal photo
          </label>

          {/* Two hidden inputs, one button each. `capture="environment"` makes
              mobile browsers open the camera directly instead of a file
              picker; desktop browsers ignore the attribute and just show the
              normal file dialog, so both buttons behave the same there. */}
          <input
            ref={cameraInputRef}
            type="file"
            accept="image/*"
            capture="environment"
            onChange={handlePhotoChange}
            className="hidden"
          />
          <input
            ref={galleryInputRef}
            type="file"
            accept="image/*"
            onChange={handlePhotoChange}
            className="hidden"
          />
          <div className="mt-2 flex gap-2">
            <button
              type="button"
              onClick={() => cameraInputRef.current?.click()}
              className="rounded-lg bg-neutral-900 px-3 py-2 text-sm font-medium text-white transition hover:bg-neutral-700 dark:bg-neutral-100 dark:text-neutral-900 dark:hover:bg-white"
            >
              Take photo
            </button>
            <button
              type="button"
              onClick={() => galleryInputRef.current?.click()}
              className="rounded-lg border border-neutral-300 bg-white px-3 py-2 text-sm font-medium text-neutral-900 transition hover:bg-neutral-50 dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-100 dark:hover:bg-neutral-700"
            >
              Choose from gallery
            </button>
          </div>
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
      ) : (
        <section className="mt-4 rounded-2xl bg-white p-6 shadow-sm ring-1 ring-neutral-200 dark:bg-neutral-900 dark:ring-neutral-800">
          <label className="block text-sm font-medium text-neutral-700 dark:text-neutral-300">
            What did you eat?
          </label>
          <p className="mt-1 text-xs text-neutral-400">
            Mention quantities where you can (e.g. "2 medium bananas, 150g of rice") — they'll
            pre-fill grams for you, still editable. Anything left vague just needs grams entered
            manually below, same as photo mode.
          </p>
          <div className="mt-2 flex items-start gap-2">
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
              placeholder="e.g. I had 2 eggs, a slice of toast with butter, and a medium banana"
              className="flex-1 rounded-lg border border-neutral-300 px-3 py-2 text-sm outline-none focus:border-neutral-500 dark:border-neutral-700 dark:bg-neutral-800"
            />
            {speechSupported && (
              <button
                type="button"
                onClick={toggleListening}
                title={isListening ? "Stop listening" : "Speak instead of typing"}
                className={`rounded-lg border px-3 py-2 text-sm transition ${
                  isListening
                    ? "border-red-300 bg-red-50 text-red-600 dark:border-red-900/50 dark:bg-red-950/40 dark:text-red-400"
                    : "border-neutral-300 bg-white text-neutral-900 hover:bg-neutral-50 dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-100 dark:hover:bg-neutral-700"
                }`}
              >
                {isListening ? "● Listening..." : "🎤"}
              </button>
            )}
          </div>
          <button
            onClick={handleIdentifyText}
            disabled={!description.trim() || status === "identifying"}
            className="mt-4 rounded-lg bg-neutral-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-neutral-700 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-neutral-100 dark:text-neutral-900 dark:hover:bg-white"
          >
            {status === "identifying" ? "Identifying..." : "Identify food"}
          </button>
        </section>
      )}

      {error && (
        <p className="mt-4 text-sm font-medium text-red-600 dark:text-red-400">
          {error}
        </p>
      )}

      {identifyResult && (
        <section className="mt-6 rounded-2xl bg-white p-6 shadow-sm ring-1 ring-neutral-200 dark:bg-neutral-900 dark:ring-neutral-800">
          <h2 className="text-base font-semibold">Identified items</h2>
          <div className="mt-3 overflow-x-auto">
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr className="text-left text-neutral-500">
                  <th className="border-b border-neutral-200 pb-2 font-medium dark:border-neutral-800">
                    Item
                  </th>
                  <th className="border-b border-neutral-200 pb-2 font-medium dark:border-neutral-800">
                    Confidence
                  </th>
                  <th className="border-b border-neutral-200 pb-2 font-medium dark:border-neutral-800">
                    USDA match
                  </th>
                  <th className="border-b border-neutral-200 pb-2 font-medium dark:border-neutral-800">
                    Grams
                  </th>
                </tr>
              </thead>
              <tbody>
                {identifyResult.items.map((item) => (
                  <tr key={item.name}>
                    <td className="border-b border-neutral-100 py-2 dark:border-neutral-800">
                      {item.name}
                    </td>
                    <td className="border-b border-neutral-100 py-2 dark:border-neutral-800">
                      {Math.round(item.confidence * 100)}%
                    </td>
                    <td className="border-b border-neutral-100 py-2 dark:border-neutral-800">
                      {item.usda ? (
                        item.usda.matched_description
                      ) : (
                        <span className="italic text-neutral-400">
                          no match found
                        </span>
                      )}
                    </td>
                    <td className="border-b border-neutral-100 py-2 dark:border-neutral-800">
                      {item.usda && item.usda.portions.length > 0 && (
                        <div className="mb-1 flex items-center gap-1">
                          <select
                            value={gramsPerUnitByName[item.name] ?? ""}
                            onChange={(e) =>
                              handlePortionChange(
                                item.name,
                                e.target.value === "" ? null : Number(e.target.value),
                              )
                            }
                            className="rounded-lg border border-neutral-300 px-1.5 py-1 text-xs dark:border-neutral-700 dark:bg-neutral-800"
                          >
                            <option value="">grams manually</option>
                            {item.usda.portions.map((p) => (
                              <option key={p.label} value={p.grams}>
                                {p.label} ({Math.round(p.grams)}g)
                              </option>
                            ))}
                          </select>
                          {gramsPerUnitByName[item.name] != null && (
                            <input
                              type="number"
                              min="1"
                              step="1"
                              value={countByName[item.name] ?? "1"}
                              onChange={(e) => handleCountChange(item.name, e.target.value)}
                              className="w-12 rounded-lg border border-neutral-300 px-1.5 py-1 text-xs dark:border-neutral-700 dark:bg-neutral-800"
                              title="Count"
                            />
                          )}
                        </div>
                      )}
                      <div className="flex items-center gap-2">
                        <input
                          type="number"
                          min="0"
                          step="1"
                          placeholder={
                            item.suggested_grams ? undefined : "grams"
                          }
                          disabled={!item.usda}
                          value={gramsByName[item.name] ?? ""}
                          onChange={(e) =>
                            setGramsByName((prev) => ({
                              ...prev,
                              [item.name]: e.target.value,
                            }))
                          }
                          className="w-20 rounded-lg border border-neutral-300 px-2 py-1 text-sm disabled:cursor-not-allowed disabled:opacity-50 dark:border-neutral-700 dark:bg-neutral-800"
                        />
                        {item.suggested_grams != null && (
                          <span
                            className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300"
                            title={
                              item.suggested_grams_source === "stated"
                                ? "Parsed from what you typed/said"
                                : "Pre-filled from your history"
                            }
                          >
                            {item.suggested_grams_source === "stated" ? "from your description" : "remembered"}
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
                  <th className="border-b border-neutral-200 pb-2 font-medium dark:border-neutral-800">
                    Item
                  </th>
                  <th className="border-b border-neutral-200 pb-2 font-medium dark:border-neutral-800">
                    Grams
                  </th>
                  <th className="border-b border-neutral-200 pb-2 font-medium dark:border-neutral-800">
                    Calories
                  </th>
                  <th className="border-b border-neutral-200 pb-2 font-medium dark:border-neutral-800">
                    Protein
                  </th>
                  <th className="border-b border-neutral-200 pb-2 font-medium dark:border-neutral-800">
                    Carbs
                  </th>
                  <th className="border-b border-neutral-200 pb-2 font-medium dark:border-neutral-800">
                    Fat
                  </th>
                </tr>
              </thead>
              <tbody>
                {calculateResult.items.map((item) => (
                  <tr key={item.name}>
                    <td className="border-b border-neutral-100 py-2 dark:border-neutral-800">
                      {item.name}
                    </td>
                    <td className="border-b border-neutral-100 py-2 dark:border-neutral-800">
                      {item.grams}
                    </td>
                    <td className="border-b border-neutral-100 py-2 dark:border-neutral-800">
                      {item.calories}
                    </td>
                    <td className="border-b border-neutral-100 py-2 dark:border-neutral-800">
                      {item.protein}
                    </td>
                    <td className="border-b border-neutral-100 py-2 dark:border-neutral-800">
                      {item.carbs}
                    </td>
                    <td className="border-b border-neutral-100 py-2 dark:border-neutral-800">
                      {item.fat}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr>
                  <td className="pt-2 font-semibold">Total</td>
                  <td className="pt-2"></td>
                  <td className="pt-2 font-semibold">
                    {calculateResult.total_calories}
                  </td>
                  <td className="pt-2 font-semibold">
                    {calculateResult.total_protein}
                  </td>
                  <td className="pt-2 font-semibold">
                    {calculateResult.total_carbs}
                  </td>
                  <td className="pt-2 font-semibold">
                    {calculateResult.total_fat}
                  </td>
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
