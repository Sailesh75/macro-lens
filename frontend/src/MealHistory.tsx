import type { MealSummary } from "./types";

interface Props {
  meals: MealSummary[];
  loading: boolean;
}

export function MealHistory({ meals, loading }: Props) {
  return (
    <section className="card">
      <h2>Meal history</h2>
      {loading && <p className="muted">Loading...</p>}
      {!loading && meals.length === 0 && <p className="muted">No meals logged yet.</p>}
      {!loading &&
        meals.map((meal) => (
          <div key={meal.id} className="history-item">
            <div className="history-header">
              <span>{new Date(meal.created_at).toLocaleString()}</span>
              <span className="muted">{meal.status}</span>
            </div>
            <ul>
              {meal.items.map((item) => (
                <li key={item.id}>
                  {item.food_name}
                  {item.grams != null ? ` — ${item.grams}g` : " — grams not entered yet"}
                  {item.calories != null ? ` (${item.calories} kcal)` : ""}
                </li>
              ))}
            </ul>
            {meal.status === "done" && (
              <p className="history-total">
                Total: {meal.total_calories} kcal &middot; {meal.total_protein}g protein &middot;{" "}
                {meal.total_carbs}g carbs &middot; {meal.total_fat}g fat
              </p>
            )}
          </div>
        ))}
    </section>
  );
}
