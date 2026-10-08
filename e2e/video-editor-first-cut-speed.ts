/**
 * The `speed samples:` note scripts/video-studio/scorecard.mjs grade() reads for f34: each
 * draft's user-visible time, Draft click to its summary. A draft that never showed a summary
 * (an alert, or the budget ran out) has no such time.
 */
export const firstCutSpeedNote = (
  drafts: ReadonlyArray<{ ms: number; failure: string; summary: readonly unknown[] }>,
): string =>
  `speed samples: ${JSON.stringify({
    draft: drafts.filter((draft) => !draft.failure && draft.summary.length > 0).map((d) => d.ms),
  })}`;
