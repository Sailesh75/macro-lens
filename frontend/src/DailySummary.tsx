import type { DailyStatsResponse } from "./types";

interface Props {
  stats: DailyStatsResponse | null;
  loading: boolean;
}

export function DailySummary({ stats, loading }: Props) {
  return (
    <section className="card">
      <h2>Today's totals</h2>
      {loading && <p className="muted">Loading...</p>}
      {!loading && stats && (
        <p>
          <strong>{stats.total_calories}</strong> kcal &middot; {stats.total_protein}g protein &middot;{" "}
          {stats.total_carbs}g carbs &middot; {stats.total_fat}g fat
          <br />
          <span className="muted">
            from {stats.meal_count} meal{stats.meal_count === 1 ? "" : "s"} logged today
          </span>
        </p>
      )}
    </section>
  );
}
