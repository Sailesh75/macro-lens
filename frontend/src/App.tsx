import type { Session } from "@supabase/supabase-js";
import { useEffect, useRef, useState } from "react";
import { calculateMeal, getDailyStats, identifyMeal, identifyMealFromText, listMeals } from "./api";
import { Auth } from "./Auth";
import { DailySummary } from "./DailySummary";
import { MealHistory } from "./MealHistory";
import { supabase } from "./supabaseClient";
import {
  ArrowRightIcon,
  Backdrop,
  Brand,
  CameraIcon,
  ImageIcon,
  LogOutIcon,
  LogoMark,
  MacroBar,
  MacroStat,
  MicIcon,
  Spinner,
  TextIcon,
} from "./ui";
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
  const [isDragging, setIsDragging] = useState(false);
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
    selectPhoto(e.target.files?.[0] ?? null);
    // Reset so picking the same file again still fires onChange.
    e.target.value = "";
  }

  function handlePhotoDrop(e: React.DragEvent) {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file?.type.startsWith("image/")) selectPhoto(file);
  }

  function selectPhoto(file: File | null) {
    if (!file) return;
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
      <div className="grid min-h-svh place-items-center">
        <Backdrop />
        <LogoMark className="size-10 animate-pulse" />
      </div>
    );
  }

  if (!session && !isGuest) {
    return <Auth onGuestContinue={() => setIsGuest(true)} />;
  }

  const hour = new Date().getHours();
  const greeting = hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";
  const today = new Date().toLocaleDateString(undefined, {
    weekday: "long",
    month: "short",
    day: "numeric",
  });

  return (
    <div className="min-h-svh">
      <Backdrop />

      <header className="sticky top-0 z-20 border-b border-neutral-200/60 bg-neutral-50/70 backdrop-blur-xl dark:border-white/[0.06] dark:bg-neutral-950/60">
        <div className="mx-auto flex h-16 max-w-2xl items-center justify-between gap-4 px-4">
          <Brand />
          {session ? (
            <div className="flex min-w-0 items-center gap-1">
              <span className="hidden truncate rounded-full border border-neutral-200 px-3 py-1 text-xs text-neutral-500 sm:block dark:border-white/10 dark:text-neutral-400">
                {/* Email/password sign-ups carry a username; Google users fall back to their email. */}
                {session.user.user_metadata?.username || session.user.email}
              </span>
              <button
                type="button"
                onClick={handleLogout}
                aria-label="Log out"
                title="Log out"
                className="grid size-9 place-items-center rounded-full text-neutral-500 transition hover:bg-neutral-200/60 hover:text-neutral-900 dark:text-neutral-400 dark:hover:bg-white/10 dark:hover:text-white"
              >
                <LogOutIcon />
              </button>
            </div>
          ) : (
            <button
              type="button"
              className="btn-primary h-9 rounded-full px-4"
              onClick={() => setIsGuest(false)}
            >
              Log in
            </button>
          )}
        </div>
      </header>

      <main className="mx-auto max-w-2xl px-4 pb-24 pt-10">
        {!session && (
          <p className="mb-8 flex items-center gap-2.5 rounded-2xl border border-amber-200/70 bg-amber-50/80 px-4 py-2.5 text-sm text-amber-900 dark:border-amber-400/15 dark:bg-amber-400/[0.06] dark:text-amber-200">
            <span className="size-1.5 shrink-0 rounded-full bg-amber-500" />
            <span>
              Guest mode: nothing here is saved.{" "}
              <button
                type="button"
                className="font-medium underline underline-offset-2"
                onClick={() => setIsGuest(false)}
              >
                Log in
              </button>{" "}
              to keep your history and daily totals.
            </span>
          </p>
        )}

        <div className="animate-rise">
          <p className="eyebrow">
            {today} · {greeting}
          </p>
          <h1 className="mt-3 text-4xl font-semibold tracking-tight sm:text-5xl">
            What's on your <span className="font-display font-normal italic">plate?</span>
          </h1>
          <p className="mt-3 text-neutral-500 dark:text-neutral-400">
            Take a photo, or describe what you ate by typing or speaking.
          </p>
        </div>

        <div className="segmented mt-8">
          <button
            type="button"
            aria-pressed={entryMode === "photo"}
            onClick={() => handleEntryModeChange("photo")}
          >
            <CameraIcon /> Photo
          </button>
          <button
            type="button"
            aria-pressed={entryMode === "text"}
            onClick={() => handleEntryModeChange("text")}
          >
            <TextIcon /> Describe
          </button>
        </div>

        {entryMode === "photo" ? (
          <section className="card mt-4">
            {/* Two hidden inputs, one button each. `capture="environment"` makes
                mobile browsers open the camera directly instead of a file
                picker; desktop browsers ignore the attribute and just show the
                normal file dialog. */}
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

            {previewUrl ? (
              <div className="group relative overflow-hidden rounded-2xl">
                <img
                  className="max-h-80 w-full object-cover"
                  src={previewUrl}
                  alt="Selected meal"
                />
                <button
                  type="button"
                  onClick={() => galleryInputRef.current?.click()}
                  className="absolute right-3 top-3 rounded-full bg-black/55 px-3 py-1.5 text-xs font-medium text-white backdrop-blur-md transition hover:bg-black/75"
                >
                  Change photo
                </button>
              </div>
            ) : (
              <>
                {/* Mobile: separate "Take photo" (camera) and "Choose from
                    gallery" tiles — a camera shortcut is worth surfacing on a
                    phone. Desktop: one drop zone that opens the file picker
                    (or accepts a dragged image). Which one shows is a CSS
                    breakpoint (viewport width), not a device check. */}
                <div className="grid grid-cols-2 gap-3 sm:hidden">
                  <button
                    type="button"
                    onClick={() => cameraInputRef.current?.click()}
                    className="flex aspect-[4/3] flex-col items-center justify-center gap-2 rounded-2xl bg-neutral-900 text-sm font-medium text-white transition active:scale-[0.98] dark:bg-white dark:text-neutral-900"
                  >
                    <CameraIcon className="size-6" />
                    Take photo
                  </button>
                  <button
                    type="button"
                    onClick={() => galleryInputRef.current?.click()}
                    className="flex aspect-[4/3] flex-col items-center justify-center gap-2 rounded-2xl border border-dashed border-neutral-300 text-sm font-medium transition active:scale-[0.98] dark:border-white/15"
                  >
                    <ImageIcon className="size-6" />
                    From gallery
                  </button>
                </div>
                <button
                  type="button"
                  onClick={() => galleryInputRef.current?.click()}
                  onDragOver={(e) => {
                    e.preventDefault();
                    setIsDragging(true);
                  }}
                  onDragLeave={() => setIsDragging(false)}
                  onDrop={handlePhotoDrop}
                  className={`group hidden h-56 w-full flex-col items-center justify-center gap-3 rounded-2xl border border-dashed transition sm:flex ${
                    isDragging
                      ? "border-neutral-900 bg-accent/15 dark:border-white"
                      : "border-neutral-300 hover:border-neutral-400 hover:bg-neutral-50 dark:border-white/15 dark:hover:border-white/30 dark:hover:bg-white/[0.03]"
                  }`}
                >
                  <span className="grid size-12 place-items-center rounded-full bg-neutral-900 text-white transition group-hover:scale-105 dark:bg-white dark:text-neutral-900">
                    <CameraIcon className="size-5" />
                  </span>
                  <span className="text-sm font-medium">Drop a meal photo, or click to browse</span>
                  <span className="text-xs text-neutral-400">JPG, PNG or HEIC</span>
                </button>
              </>
            )}

            <button
              onClick={handleIdentify}
              disabled={!photo || status === "identifying"}
              className="btn-primary mt-4 w-full"
            >
              {status === "identifying" ? (
                <>
                  <Spinner /> Identifying
                </>
              ) : (
                <>
                  Identify food <ArrowRightIcon />
                </>
              )}
            </button>
          </section>
        ) : (
          <section className="card mt-4">
            <div className="relative">
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={4}
                aria-label="What did you eat?"
                placeholder="e.g. I had 2 eggs, a slice of toast with butter, and a medium banana"
                className="input h-auto resize-none py-3 pr-14 leading-relaxed"
              />
              {speechSupported && (
                <button
                  type="button"
                  onClick={toggleListening}
                  aria-label={isListening ? "Stop listening" : "Speak instead of typing"}
                  title={isListening ? "Stop listening" : "Speak instead of typing"}
                  className={`absolute bottom-3 right-3 grid size-9 place-items-center rounded-full transition ${
                    isListening
                      ? "bg-red-500 text-white ring-4 ring-red-500/25"
                      : "bg-neutral-100 text-neutral-600 hover:bg-neutral-200 dark:bg-white/10 dark:text-neutral-300 dark:hover:bg-white/15"
                  }`}
                >
                  {isListening ? (
                    <span className="size-2.5 animate-pulse rounded-sm bg-white" />
                  ) : (
                    <MicIcon />
                  )}
                </button>
              )}
            </div>
            <p className="mt-2 text-xs leading-relaxed text-neutral-400">
              {isListening
                ? "Listening… speak now."
                : "Mention quantities where you can (\"2 bananas, 150g rice\") and they'll pre-fill grams. Anything vague just needs grams entered below."}
            </p>
            <button
              onClick={handleIdentifyText}
              disabled={!description.trim() || status === "identifying"}
              className="btn-primary mt-4 w-full"
            >
              {status === "identifying" ? (
                <>
                  <Spinner /> Identifying
                </>
              ) : (
                <>
                  Identify food <ArrowRightIcon />
                </>
              )}
            </button>
          </section>
        )}

        {error && (
          <p className="mt-4 rounded-xl bg-red-50 px-3.5 py-2.5 text-sm text-red-700 dark:bg-red-400/10 dark:text-red-300">
            {error}
          </p>
        )}

        {identifyResult && (
          <section className="card mt-6 animate-rise">
            <div className="flex items-baseline justify-between">
              <h2 className="font-semibold">Identified items</h2>
              <span className="eyebrow">Step 2 · confirm grams</span>
            </div>
            <ul className="mt-2 divide-y divide-neutral-100 dark:divide-white/[0.06]">
              {identifyResult.items.map((item) => (
                <li
                  key={item.name}
                  className="flex flex-col gap-3 py-4 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-medium capitalize">{item.name}</span>
                      <span
                        className="rounded-full bg-neutral-100 px-2 py-0.5 text-[11px] font-medium tabular-nums text-neutral-500 dark:bg-white/[0.06] dark:text-neutral-400"
                        title="Model confidence"
                      >
                        {Math.round(item.confidence * 100)}%
                      </span>
                    </div>
                    <p className="mt-0.5 truncate text-xs text-neutral-500 dark:text-neutral-400">
                      {item.usda ? (
                        item.usda.matched_description
                      ) : (
                        <span className="italic">No USDA match found</span>
                      )}
                    </p>
                  </div>

                  <div className="flex shrink-0 flex-wrap items-center gap-2">
                    {item.usda && item.usda.portions.length > 0 && (
                      <>
                        <select
                          value={gramsPerUnitByName[item.name] ?? ""}
                          onChange={(e) =>
                            handlePortionChange(
                              item.name,
                              e.target.value === "" ? null : Number(e.target.value),
                            )
                          }
                          className="input-sm max-w-40 text-xs"
                          aria-label="Portion"
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
                            className="input-sm w-14"
                            title="Count"
                            aria-label="Count"
                          />
                        )}
                      </>
                    )}
                    <div className="relative">
                      <input
                        type="number"
                        min="0"
                        step="1"
                        placeholder={item.suggested_grams ? undefined : "0"}
                        disabled={!item.usda}
                        value={gramsByName[item.name] ?? ""}
                        onChange={(e) =>
                          setGramsByName((prev) => ({
                            ...prev,
                            [item.name]: e.target.value,
                          }))
                        }
                        aria-label={`Grams of ${item.name}`}
                        className="input-sm w-24 pr-7 tabular-nums"
                      />
                      <span className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-xs text-neutral-400">
                        g
                      </span>
                    </div>
                    {item.suggested_grams != null && (
                      <span
                        className="rounded-full bg-accent/25 px-2 py-0.5 text-[11px] font-medium text-lime-800 dark:bg-accent/10 dark:text-accent"
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
                </li>
              ))}
            </ul>
            <button
              onClick={handleCalculate}
              disabled={status === "calculating"}
              className="btn-primary mt-2 w-full"
            >
              {status === "calculating" ? (
                <>
                  <Spinner /> Calculating
                </>
              ) : (
                <>
                  Calculate macros <ArrowRightIcon />
                </>
              )}
            </button>
          </section>
        )}

        {calculateResult && (
          <section className="card mt-6 animate-rise">
            <div className="flex items-baseline justify-between">
              <h2 className="font-semibold">Macros</h2>
              <span className="eyebrow">This meal</span>
            </div>
            <div className="mt-4 flex items-end gap-2">
              <span className="text-5xl font-semibold tabular-nums tracking-tight">
                {calculateResult.total_calories}
              </span>
              <span className="pb-1.5 text-sm text-neutral-400">kcal</span>
            </div>
            <div className="mt-5">
              <MacroBar
                protein={calculateResult.total_protein}
                carbs={calculateResult.total_carbs}
                fat={calculateResult.total_fat}
              />
            </div>
            <div className="mt-4 grid grid-cols-3 gap-4">
              <MacroStat label="Protein" value={calculateResult.total_protein} dot="bg-protein" />
              <MacroStat label="Carbs" value={calculateResult.total_carbs} dot="bg-carbs" />
              <MacroStat label="Fat" value={calculateResult.total_fat} dot="bg-fat" />
            </div>

            <div className="mt-6 overflow-x-auto">
              <table className="w-full text-sm tabular-nums">
                <thead>
                  <tr className="text-left text-xs text-neutral-400 [&>th]:pb-2 [&>th]:font-medium">
                    <th>Item</th>
                    <th className="text-right">Grams</th>
                    <th className="text-right">kcal</th>
                    <th className="text-right">P</th>
                    <th className="text-right">C</th>
                    <th className="text-right">F</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-neutral-100 border-t border-neutral-100 dark:divide-white/[0.06] dark:border-white/[0.06]">
                  {calculateResult.items.map((item) => (
                    <tr key={item.name} className="[&>td]:py-2.5 [&>td:not(:first-child)]:pl-3 [&>td:not(:first-child)]:text-right">
                      <td className="capitalize">{item.name}</td>
                      <td className="text-neutral-500 dark:text-neutral-400">{item.grams}</td>
                      <td>{item.calories}</td>
                      <td className="text-neutral-500 dark:text-neutral-400">{item.protein}</td>
                      <td className="text-neutral-500 dark:text-neutral-400">{item.carbs}</td>
                      <td className="text-neutral-500 dark:text-neutral-400">{item.fat}</td>
                    </tr>
                  ))}
                </tbody>
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
      </main>
    </div>
  );
}

export default App;
