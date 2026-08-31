import type { MealSummary } from "./types";

interface Props {
  meals: MealSummary[];
  loading: boolean;
}

export function MealHistory({ meals, loading }: Props) {
  return (
    <section className="mt-6 rounded-2xl bg-white p-6 shadow-sm ring-1 ring-neutral-200 dark:bg-neutral-900 dark:ring-neutral-800">
      <h2 className="text-base font-semibold">Meal history</h2>
      {loading && <p className="mt-2 text-sm italic text-neutral-400">Loading...</p>}
      {!loading && meals.length === 0 && (
        <p className="mt-2 text-sm italic text-neutral-400">No meals logged yet.</p>
      )}
      {!loading &&
        meals.map((meal) => (
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
