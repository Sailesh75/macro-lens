import type { DailyStatsResponse } from "./types";

interface Props {
  stats: DailyStatsResponse | null;
  loading: boolean;
}

export function DailySummary({ stats, loading }: Props) {
  return (
    <section className="mt-6 rounded-2xl bg-white p-6 shadow-sm ring-1 ring-neutral-200 dark:bg-neutral-900 dark:ring-neutral-800">
      <h2 className="text-base font-semibold">Today's totals</h2>
      {loading && <p className="mt-2 text-sm italic text-neutral-400">Loading...</p>}
      {!loading && stats && (
        <p className="mt-2 text-sm">
          <span className="text-lg font-semibold">{stats.total_calories}</span> kcal &middot;{" "}
          {stats.total_protein}g protein &middot; {stats.total_carbs}g carbs &middot; {stats.total_fat}g fat
          <br />
          <span className="italic text-neutral-400">
            from {stats.meal_count} meal{stats.meal_count === 1 ? "" : "s"} logged today
          </span>
        </p>
      )}
    </section>
  );
}
