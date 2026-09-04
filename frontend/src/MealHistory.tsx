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
    <section className="mt-6 rounded-2xl bg-white p-6 shadow-sm ring-1 ring-neutral-200 dark:bg-neutral-900 dark:ring-neutral-800">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-base font-semibold">Meal history</h2>
        <div className="flex items-center gap-2">
          <input
            type="date"
            value={selectedDate}
            onChange={(e) => {
              setSelectedDate(e.target.value);
              setShowAll(false);
            }}
            className="rounded-lg border border-neutral-300 px-2 py-1 text-sm dark:border-neutral-700 dark:bg-neutral-800"
          />
          <button
            type="button"
            onClick={() => setShowAll((prev) => !prev)}
            className="text-sm text-neutral-500 underline decoration-neutral-300 underline-offset-2 hover:text-neutral-900 dark:hover:text-neutral-100"
          >
            {showAll ? "Show selected date only" : "Show all"}
          </button>
        </div>
      </div>

      {loading && <p className="mt-2 text-sm italic text-neutral-400">Loading...</p>}
      {!loading && meals.length === 0 && (
        <p className="mt-2 text-sm italic text-neutral-400">No meals logged yet.</p>
      )}
      {!loading && meals.length > 0 && visibleMeals.length === 0 && (
        <p className="mt-2 text-sm italic text-neutral-400">No meals logged on this date.</p>
      )}
      {!loading &&
        visibleMeals.map((meal) => (
          <div
            key={meal.id}
            className="border-b border-neutral-100 py-3 last:border-none dark:border-neutral-800"
          >
            <div className="flex justify-between text-sm">
              <span>{new Date(meal.created_at).toLocaleString()}</span>
              <span className="italic text-neutral-400">{meal.status}</span>
            </div>
            <ul className="mt-1 list-disc pl-5 text-sm text-neutral-600 dark:text-neutral-300">
              {meal.items.map((item) => (
                <li key={item.id}>
                  {item.food_name}
                  {item.grams != null ? ` — ${item.grams}g` : " — grams not entered yet"}
                  {item.calories != null ? ` (${item.calories} kcal)` : ""}
                </li>
              ))}
            </ul>
            {meal.status === "done" && (
              <p className="mt-1 text-sm">
                Total: {meal.total_calories} kcal &middot; {meal.total_protein}g protein &middot;{" "}
                {meal.total_carbs}g carbs &middot; {meal.total_fat}g fat
              </p>
            )}
          </div>
        ))}
    </section>
  );
}
