// Shared vocabulary and pure selectors for the two "What's Working — Ads"
// surfaces: the compact verdict strip that stays on the dashboard and the
// win-rate explorer that pops out of the Scale toolbar. Both read the same
// materialized paid_media.creative_reports row, so the funnel filter, the
// labels, and the formatters live here rather than being duplicated per surface.

import type {
  CreativeWinRateFlag,
  CreativeWinRateRow,
  PaidCreativeReport,
  PaidCreativeVerdict,
  PaidFunnelStage,
} from '@continuum/contracts';

export const FUNNEL_TABS = ['all', 'tof', 'mof', 'bof'] as const;
export type FunnelTab = (typeof FUNNEL_TABS)[number];

export const FLAG_LABEL: Record<CreativeWinRateFlag, string> = {
  low_evidence: 'low evidence',
  spend_concentrated: 'spend concentrated',
  warm_audience_skew: 'warm-audience skew',
  confounded: 'confounded',
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

// A cohort this small cannot separate the creative attribute from the ad that
// happened to be in it: "100%, 1/1 ads" is arithmetically true and practically
// empty. We never restate the number — we de-emphasise it and sort it down, so
// the reader's eye lands on categories that actually carry evidence.
export const MIN_TRUSTWORTHY_COHORT = 3;

export const hasThinEvidence = (row: CreativeWinRateRow): boolean =>
  row.eligibleAds < MIN_TRUSTWORTHY_COHORT || row.flags.includes('low_evidence');

export const humanize = (value: string): string => value.replace(/_/g, ' ');

export const percent = (value: number | null): string =>
  value === null ? '—' : `${Math.round(value * 100)}%`;

export const money = (value: number | null): string =>
  value === null ? '—' : `$${value.toFixed(2)}`;

export const isHttpUrl = (value: string | null | undefined): value is string =>
  typeof value === 'string' && /^https?:\/\//.test(value);

const matchesFunnel = (stage: PaidFunnelStage, funnel: FunnelTab): boolean =>
  funnel === 'all' || stage === (funnel as PaidFunnelStage);

/**
 * Win-rate rows for the explorer table. The funnel_stage dimension is dropped:
 * it restates the funnel column rather than describing a creative attribute.
 */
export function selectWinRateRows(
  report: PaidCreativeReport | null,
  funnel: FunnelTab,
  options: { hideThinEvidence?: boolean } = {},
): CreativeWinRateRow[] {
  const rows = (report?.winRates ?? [])
    .filter((row) => row.dimension !== 'funnel_stage')
    .filter((row) => matchesFunnel(row.funnelStage, funnel));
  return options.hideThinEvidence ? rows.filter((row) => !hasThinEvidence(row)) : rows;
}

export type VerdictsByKind = Record<'kill' | 'scale' | 'iterate', PaidCreativeVerdict[]>;

export function selectVerdictsByKind(
  report: PaidCreativeReport | null,
  funnel: FunnelTab,
): VerdictsByKind {
  const verdicts = (report?.verdicts ?? []).filter((verdict) =>
    matchesFunnel(verdict.funnelStage, funnel),
  );
  return {
    kill: verdicts.filter((verdict) => verdict.verdict === 'kill'),
    scale: verdicts.filter((verdict) => verdict.verdict === 'scale'),
    iterate: verdicts.filter((verdict) => verdict.verdict === 'iterate'),
  };
}

/** CPA read against its cohort median, e.g. "0.6x cohort median". */
export const cohortMultipleLabel = (verdict: PaidCreativeVerdict): string | null =>
  verdict.cpaVsCohortMedian === null || verdict.cpaVsCohortMedian === undefined
    ? null
    : `${verdict.cpaVsCohortMedian.toFixed(1)}x cohort median`;
