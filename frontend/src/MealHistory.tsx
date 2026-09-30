import { useState } from "react";
import type { MealSummary } from "./types";

interface Props {
  meals: MealSummary[];
  loading: boolean;
}

// Local (not UTC) YYYY-MM-DD — matches what <input type="date"> uses, and
// avoids a meal near midnight landing on the "wrong" day for the user's
// own timezone.
function toLocalDateString(date: Date): string {
  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  const dd = String(date.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

export function MealHistory({ meals, loading }: Props) {
  // Defaults to today — with weeks of logged meals this list gets long fast,
  // so showing everything by default just buries the thing you actually
  // want to check most days. "Show all" is one click away.
  const [selectedDate, setSelectedDate] = useState(() => toLocalDateString(new Date()));
  const [showAll, setShowAll] = useState(false);

  const visibleMeals = showAll
    ? meals
    : meals.filter((meal) => toLocalDateString(new Date(meal.created_at)) === selectedDate);

  return (
    <section className="card mt-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="font-semibold">History</h2>
        <div className="flex items-center gap-2">
          <input
            type="date"
            value={selectedDate}
            onChange={(e) => {
              setSelectedDate(e.target.value);
              setShowAll(false);
            }}
            aria-label="Date"
            className="input-sm text-xs"
          />
          <button
            type="button"
            onClick={() => setShowAll((prev) => !prev)}
            aria-pressed={showAll}
            className={`h-9 rounded-lg px-3 text-xs font-medium transition ${
              showAll
                ? "bg-neutral-900 text-white dark:bg-white dark:text-neutral-900"
                : "text-neutral-500 hover:bg-neutral-100 hover:text-neutral-900 dark:text-neutral-400 dark:hover:bg-white/[0.06] dark:hover:text-white"
            }`}
          >
            All
          </button>
        </div>
      </div>

      {loading && (
        <div className="mt-4 space-y-3">
          {[0, 1].map((i) => (
            <div key={i} className="h-14 animate-pulse rounded-xl bg-neutral-200/70 dark:bg-white/[0.06]" />
          ))}
        </div>
      )}
      {!loading && meals.length === 0 && (
        <p className="mt-6 pb-2 text-center text-sm text-neutral-400">No meals logged yet.</p>
      )}
      {!loading && meals.length > 0 && visibleMeals.length === 0 && (
        <p className="mt-6 pb-2 text-center text-sm text-neutral-400">Nothing logged on this date.</p>
      )}
      {!loading && visibleMeals.length > 0 && (
        <ul className="mt-2 divide-y divide-neutral-100 dark:divide-white/[0.06]">
          {visibleMeals.map((meal) => (
            <li key={meal.id} className="py-4">
              <div className="flex items-baseline justify-between gap-4">
                <span className="text-xs text-neutral-500 dark:text-neutral-400">
                  {new Date(meal.created_at).toLocaleString(undefined, {
                    month: "short",
                    day: "numeric",
                    hour: "numeric",
                    minute: "2-digit",
                  })}
                </span>
                {meal.status === "done" ? (
                  <span className="text-sm font-semibold tabular-nums">
                    {meal.total_calories}
                    <span className="ml-0.5 font-normal text-neutral-400"> kcal</span>
                  </span>
                ) : (
                  <span className="rounded-full bg-neutral-100 px-2 py-0.5 text-[11px] text-neutral-500 dark:bg-white/[0.06] dark:text-neutral-400">
                    {meal.status}
                  </span>
                )}
              </div>
              <p className="mt-1 text-sm capitalize">
                {meal.items.map((item, i) => (
                  <span key={item.id}>
                    {i > 0 && <span className="text-neutral-300 dark:text-neutral-600">, </span>}
                    {item.food_name}
                    <span className="normal-case text-neutral-400">
                      {item.grams != null ? ` ${item.grams}g` : " (no grams)"}
                    </span>
                  </span>
                ))}
              </p>
              {meal.status === "done" && (
                <p className="mt-1.5 flex gap-3 text-xs tabular-nums text-neutral-500 dark:text-neutral-400">
                  <span className="flex items-center gap-1">
                    <span className="size-1.5 rounded-full bg-protein" />
                    {meal.total_protein}g
                  </span>
                  <span className="flex items-center gap-1">
                    <span className="size-1.5 rounded-full bg-carbs" />
                    {meal.total_carbs}g
                  </span>
                  <span className="flex items-center gap-1">
                    <span className="size-1.5 rounded-full bg-fat" />
                    {meal.total_fat}g
                  </span>
                </p>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
