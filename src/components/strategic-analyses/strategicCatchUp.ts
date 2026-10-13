// Which completed strategic-analysis runs a mounting listener should announce.
//
// The catch-up query reads every run completed after the last one this browser saw. With no
// stamp — a first visit, a cleared storage — "after" was 1970, so every run the brand ever
// finished rose as a "Strategic analysis ready" toast on every first mount
// (PP-L1-strategic-analysis-toast-on-every-first-mount). A run finished before this browser
// started watching is history, not news: the first mount only learns where "now" is.

export type CompletedRun = { id: string; completedAt: string | null };

export type CatchUpPlan = {
  /** Runs to announce, oldest first. */
  announce: CompletedRun[];
  /** The stamp to persist: the newest completion seen, or the one already held. */
  lastCompletedAt: string | null;
};

export function planCatchUp(
  rows: readonly CompletedRun[],
  lastCompletedAt: string | null,
  seen: ReadonlySet<string>,
): CatchUpPlan {
  const newest = rows.reduce<string | null>(
    (latest, row) =>
      row.completedAt !== null && (latest === null || row.completedAt > latest)
        ? row.completedAt
        : latest,
    lastCompletedAt,
  );
  if (lastCompletedAt === null) return { announce: [], lastCompletedAt: newest };
  const announce = rows.filter(
    (row) => !seen.has(row.id) && row.completedAt !== null && row.completedAt > lastCompletedAt,
  );
  return { announce, lastCompletedAt: newest };
}
