// Shared vocabulary and pure selectors for the two "What's Working — Ads"
// surfaces: the compact verdict strip that stays on the dashboard and the
// win-rate explorer that pops out of the Scale toolbar. Both read the same
// materialized paid_media.creative_reports row, so the funnel filter, the
// labels, and the formatters live here rather than being duplicated per surface.

import type {
  CreativeWinRateFlag,
  CreativeWinRateRow,
  PaidCreativeVerdict,
} from '@continuum/contracts';

// The funnel filter, the thin-evidence rule and the two selectors moved into
// `@continuum/contracts` when the automations `whats_working` source began
// reading the same paid_media.creative_reports row. Re-exported here so every
// existing call site and spec in this directory is unchanged — if the dashboard
// and a scheduled report disagreed about what counts as evidence, one of them
// would be lying.
export {
  FUNNEL_TABS,
  type FunnelTab,
  hasThinEvidence,
  MIN_TRUSTWORTHY_COHORT,
  selectVerdictsByKind,
  selectWinRateRows,
  type VerdictsByKind,
} from '@continuum/contracts';

export const FLAG_LABEL: Record<CreativeWinRateFlag, string> = {
  low_evidence: 'low evidence',
  spend_concentrated: 'spend concentrated',
  warm_audience_skew: 'warm-audience skew',
  confounded: 'confounded',
  thumbnail_derived: 'thumbnail-derived',
};

// One-line "why this flag matters" copy for the explorer tooltip. Only flags that
// need explaining live here; a missing entry renders the label alone.
export const FLAG_TOOLTIP: Partial<Record<CreativeWinRateFlag, string>> = {
  thumbnail_derived:
    'Some labels here were read from Meta’s 64×64 thumbnail. Treat the visual attribute as inferred from the ad copy, not observed.',
};

export const DIMENSION_LABEL: Record<CreativeWinRateRow['dimension'], string> = {
  hook_archetype: 'Hook',
  angle: 'Angle',
  asset_type: 'Asset',
  theme: 'Theme',
  funnel_stage: 'Funnel',
  visual_style: 'Visual style',
};

export const VERDICT_STYLE: Record<PaidCreativeVerdict['verdict'], string> = {
  kill: 'bg-destructive/10 text-destructive',
  scale: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400',
  iterate: 'bg-amber-500/10 text-amber-600 dark:text-amber-400',
  watch: 'bg-muted text-muted-foreground',
};

export const humanize = (value: string): string => value.replace(/_/g, ' ');

export const percent = (value: number | null): string =>
  value === null ? '—' : `${Math.round(value * 100)}%`;

// KNOWN WRONG for non-USD accounts, and deliberately left that way for now. The
// creative report carries no money currency (its `currency` field is the KPI kind:
// purchases | leads | clicks), and the honest fix is to stamp the ad account's
// currency into the report at assembly time — it is generated server-side from that
// account and already knows it. Resolving it client-side instead would mean pulling
// the optimizer's account hook into this directory, and a sibling spec mock.modules
// that module process-wide. A wrong symbol on an MXN account misreads by ~20x, so
// this is a real defect, not cosmetic.
export const money = (value: number | null): string =>
  value === null ? '—' : `$${value.toFixed(2)}`;

export const isHttpUrl = (value: string | null | undefined): value is string =>
  typeof value === 'string' && /^https?:\/\//.test(value);

/** CPA read against its cohort median, e.g. "0.6x cohort median". */
export const cohortMultipleLabel = (verdict: PaidCreativeVerdict): string | null =>
  verdict.cpaVsCohortMedian === null || verdict.cpaVsCohortMedian === undefined
    ? null
    : `${verdict.cpaVsCohortMedian.toFixed(1)}x cohort median`;
