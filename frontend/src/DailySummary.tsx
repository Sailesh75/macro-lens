import type { DailyStatsResponse } from "./types";
import { MacroBar, MacroStat } from "./ui";

interface Props {
  stats: DailyStatsResponse | null;
  loading: boolean;
}

export function DailySummary({ stats, loading }: Props) {
  return (
    <section className="card mt-10">
      <div className="flex items-baseline justify-between">
        <h2 className="font-semibold">Today</h2>
        {!loading && stats && (
          <span className="eyebrow">
            {stats.meal_count} meal{stats.meal_count === 1 ? "" : "s"} logged
          </span>
        )}
      </div>
      {loading && (
        <div className="mt-4 space-y-3">
          <div className="h-10 w-32 animate-pulse rounded-lg bg-neutral-200/70 dark:bg-white/[0.06]" />
          <div className="h-1.5 animate-pulse rounded-full bg-neutral-200/70 dark:bg-white/[0.06]" />
        </div>
      )}
      {!loading && stats && (
        <>
          <div className="mt-4 flex items-end gap-2">
            <span className="text-4xl font-semibold tabular-nums tracking-tight">
              {stats.total_calories}
            </span>
            <span className="pb-1 text-sm text-neutral-400">kcal</span>
          </div>
          <div className="mt-5">
            <MacroBar protein={stats.total_protein} carbs={stats.total_carbs} fat={stats.total_fat} />
          </div>
          <div className="mt-4 grid grid-cols-3 gap-4">
            <MacroStat label="Protein" value={stats.total_protein} dot="bg-protein" />
            <MacroStat label="Carbs" value={stats.total_carbs} dot="bg-carbs" />
            <MacroStat label="Fat" value={stats.total_fat} dot="bg-fat" />
          </div>
        </>
      )}
    </section>
  );
}
