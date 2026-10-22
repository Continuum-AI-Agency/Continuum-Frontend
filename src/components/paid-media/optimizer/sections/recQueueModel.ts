// The recommendation queue's pure reads: the one-line evidence behind a row, the money a row
// puts on the table, the "as of" line that says whether the queue is current, and the
// grouped summary that turns ten identical "Pause ad set · HIGH" rows into "5 ad sets ·
// sustained poor CPA · $1,240/day". No React, no fetch — all of it testable on fixtures.

import type {
  AdSetSnapshot,
  CandidateHeadline,
  CycleItemRow,
  RecommendationEvidence,
  RecommendationRow,
} from '@continuum/contracts';
import { candidateHeadlineSchema } from '@continuum/contracts';
import { formatCurrency, formatHeadline, formatPercent, formatPerPeriod } from '../format';
import { recommendationLabel } from '../reportModel';

export { jainaPromptHref } from '@/lib/jaina/deepLink';

const WINDOW_LABEL: Record<string, string> = { d3: '3d', d7: '7d', d14: '14d' };

const METRIC_LABEL: Record<string, string> = {
  spend: 'Spend',
  cpp: 'Cost per result',
  cpa: 'Cost per result',
  ctr: 'CTR',
  frequency: 'Frequency',
  reach_expansion: 'Reach growth',
};

function formatMetricValue(metric: string, value: number, currency: string | null): string {
  switch (metric) {
    case 'spend':
    case 'cpp':
    case 'cpa':
      return formatCurrency(value, currency);
    case 'ctr':
      return formatPercent(value * 100, { fractionDigits: 2 });
    case 'reach_expansion':
      return `${value.toFixed(2)}×`;
    default:
      return Number.isInteger(value) ? String(value) : value.toFixed(1);
  }
}

/** "Cost per result $140 vs 2.5× the robust reference ($10) · 14d". Null when the row
 *  predates structured evidence — the prose reason still stands on its own then. */
export function evidenceLine(
  evidence: RecommendationEvidence | null | undefined,
  currency: string | null,
): string | null {
  if (!evidence) return null;
  const metric = METRIC_LABEL[evidence.metric] ?? evidence.metric;
  const value = formatMetricValue(evidence.metric, evidence.value, currency);
  const window = WINDOW_LABEL[evidence.window] ?? evidence.window;
  return `${metric} ${value} ${evidence.comparator} · ${window}`;
}

/** Daily money the recommendation puts on the table; 0 when unknown so sorts stay stable. */
export function impactPerDay(rec: Pick<RecommendationRow, 'evidence'>): number {
  const value = rec.evidence?.estImpactPerDay;
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : 0;
}

/** "$120/day · $3,600/mo at stake" — null when the engine gave no sizing.
 *
 *  The period pair, not a bare "/day": the queue and the account cards are two views of the
 *  same money, and until this went through one helper they printed it two different ways. */
export function impactLabel(
  rec: Pick<RecommendationRow, 'evidence'>,
  currency: string | null,
): string | null {
  const value = impactPerDay(rec);
  return value > 0 ? `${formatPerPeriod(value, currency)} at stake` : null;
}

/**
 * The headline a queue row leads with, when the engine declared one.
 *
 * `RecommendationEvidenceSchema` is deliberately loose, so a detector that already writes the
 * account vocabulary can carry it straight into a recommendation. It is parsed rather than
 * trusted: this is the boundary between an engine row and a render surface, and a malformed
 * headline must read as "no headline", never as a card printing a figure nobody computed.
 *
 * Null is the normal case today and is not a defect — the row falls back to its money, exactly
 * as a candidate with no headline does.
 */
export function queueHeadline(rec: Pick<RecommendationRow, 'evidence'>): CandidateHeadline | null {
  const raw = (rec.evidence as { headline?: unknown } | null | undefined)?.headline;
  if (!raw) return null;
  const parsed = candidateHeadlineSchema.safeParse(raw);
  return parsed.success ? parsed.data : null;
}

/** "33% cheaper per result" — the queue row's lead line, or null when it has no headline. */
export function queueHeadlineLine(
  rec: Pick<RecommendationRow, 'evidence'>,
  currency: string | null,
): string | null {
  const headline = queueHeadline(rec);
  if (!headline) return null;
  const { figure, label } = formatHeadline(headline, currency);
  return `${figure} ${label}`;
}

export type QueueSummaryGroup = {
  kind: string;
  trigger: string;
  label: string;
  count: number;
  impactPerDay: number;
};

/** One line per (kind, trigger) across the pending rows, biggest money first. */
export function queueSummary(
  recs: ReadonlyArray<Pick<RecommendationRow, 'kind' | 'trigger' | 'evidence' | 'status'>>,
): QueueSummaryGroup[] {
  const groups = new Map<string, QueueSummaryGroup>();
  for (const rec of recs) {
    if (rec.status !== 'pending') continue;
    const key = `${rec.kind}|${rec.trigger}`;
    const group = groups.get(key) ?? {
      kind: rec.kind,
      trigger: rec.trigger,
      label: recommendationLabel(rec.kind).label,
      count: 0,
      impactPerDay: 0,
    };
    group.count += 1;
    group.impactPerDay += impactPerDay(rec);
    groups.set(key, group);
  }
  return [...groups.values()].sort((a, b) => b.impactPerDay - a.impactPerDay || b.count - a.count);
}

/** The trigger id in words: 'P2_sustained_poor' → 'sustained poor'. The prefix is engine
 *  vocabulary the reader does not need; the words after it are the reason in two words. */
export function triggerWords(trigger: string): string {
  const stripped = trigger.replace(/^[A-Z]\d+_/, '').replace(/^rule:/, 'rule ');
  return stripped.replace(/_/g, ' ');
}

/** The engine's trigger ids, in the words a reader needs. The queue summary used to print
 *  `triggerWords` — "not being delivered for off meta", "change a setting for velocity cap
 *  binding" — which is the id with its underscores swapped for spaces. Unknown triggers still
 *  fall back to that, so a new engine trigger reads as something rather than nothing. */
const TRIGGER_REASONS: Readonly<Record<string, string>> = {
  P1_zero_upper_funnel: 'no upper-funnel results',
  P2_sustained_poor: 'sustained poor cost',
  P3_low_significance: 'too few results to judge',
  C1_creative_drag: 'a creative dragging results down',
  C2_creative_winner: 'a winning creative',
  C3_no_variance: 'too few creatives to compare',
  C4_creative_decay: 'a creative wearing out',
  C5_auction_displacement: 'a creative losing the auction',
  F1_creative_fatigue: 'creative fatigue',
  F2_audience_saturation: 'audience saturation',
  F3_audience_exhausted: 'an exhausted audience',
  D1_off_meta: 'paused or removed on Meta',
  D2_dark_with_budget: 'no delivery despite budget',
  D3_learning_limited: 'stuck in limited learning',
  S1_velocity_cap_binding: 'the per-cycle change cap',
  S2_floor_too_high: 'floors above the pool',
  S3_persistent_underspend: 'persistent underspend',
  S5_tracking_gap: 'a tracking gap',
};

/** Why a group of recommendations fired, in words: 'D1_off_meta' → 'paused or removed on Meta'. */
export function triggerReason(trigger: string): string {
  return TRIGGER_REASONS[trigger] ?? triggerWords(trigger);
}

/** The ISO day (YYYY-MM-DD) an instant falls on in `timeZone` (the viewer's own when absent). */
function isoDayIn(at: Date, timeZone?: string): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    ...(timeZone ? { timeZone } : {}),
  }).formatToParts(at);
  const part = (type: string) => parts.find((p) => p.type === type)?.value ?? '';
  return `${part('year')}-${part('month')}-${part('day')}`;
}

/**
 * Whole calendar days from `sinceDay` (YYYY-MM-DD) to today in `timeZone`, never negative.
 *
 * The engine's `days_absent` is frozen at cycle time and floors a mid-day timestamp against the
 * cycle's midnight, so an ad set that left Meta on the cycle's own day read "-1 days", and two
 * rows absent since the same day printed different counts (one per cycle that wrote them).
 * Counting calendar days from the date the row names, to today, gives one answer per date.
 * Null when the day does not parse.
 */
export function daysSince(
  sinceDay: string,
  now: Date = new Date(),
  timeZone?: string,
): number | null {
  const from = Date.parse(`${sinceDay}T00:00:00Z`);
  const to = Date.parse(`${isoDayIn(now, timeZone)}T00:00:00Z`);
  if (!Number.isFinite(from) || !Number.isFinite(to)) return null;
  return Math.max(0, Math.round((to - from) / 86_400_000));
}

// ── The velocity-cap settings finding, said truthfully ───────────────────────
// S1 counts a move as "bound by the cap" when its size equals the cap OR when the solver had
// to breach it (cap_breached). A pacing-driven cut of -37% to -60% is the second kind: the cap
// did not bind it, pacing carried it past the cap, which pacing is allowed to do. The engine
// reason still says "the ±30% velocity cap bound on 6 of 6 moves". Until it tells the two apart
// (packages/optimization-engine/src/settings.ts, S1), the queue recounts from the cycle's own
// items and says what happened.

const CAP_EPS = 0.005;

/** The S1 recommendation, re-said from the cycle items when moves went past the cap; the
 *  recommendation itself otherwise. Only the words change — id, status and patch are kept. */
export function withHonestCapBinding<
  T extends Pick<RecommendationRow, 'trigger' | 'reason' | 'evidence'>,
>(rec: T, items: ReadonlyArray<Pick<CycleItemRow, 'change_pct'>>): T {
  if (rec.trigger !== 'S1_velocity_cap_binding') return rec;
  const capMatch = /±(\d+(?:\.\d+)?)%/.exec(rec.evidence?.comparator ?? rec.reason ?? '');
  if (!capMatch) return rec;
  const capPct = Number(capMatch[1]);
  const cap = capPct / 100;
  const moved = items.filter(
    (item) => typeof item.change_pct === 'number' && Math.abs(item.change_pct) > 1e-6,
  );
  const beyond = moved.filter((item) => Math.abs(item.change_pct as number) > cap + CAP_EPS);
  if (beyond.length === 0) return rec;
  const atCap = moved.filter(
    (item) => Math.abs(Math.abs(item.change_pct as number) - cap) <= CAP_EPS,
  ).length;
  const n = moved.length;
  const held =
    atCap === 0
      ? 'The cap held none of them back.'
      : `The cap held ${atCap} other move${atCap === 1 ? '' : 's'} at ±${capPct}%.`;
  const reason = `${beyond.length} of ${n} moves went past the ±${capPct}% per-cycle cap: pacing (or keeping the pool whole) may exceed it, so the cap did not bind them. ${held}`;
  const headline = queueHeadline(rec);
  const evidence = rec.evidence
    ? {
        ...rec.evidence,
        comparator: `${beyond.length} of ${n} moves past the ±${capPct}% cap`,
        ...(headline
          ? {
              headline: {
                ...headline,
                value: Math.round((beyond.length / n) * 100),
                label: 'of moves went past the cap',
              },
            }
          : {}),
      }
    : rec.evidence;
  return { ...rec, reason, evidence };
}

const AS_OF_FMT = new Intl.DateTimeFormat('en-US', {
  month: 'short',
  day: 'numeric',
  hour: 'numeric',
  minute: '2-digit',
});

/**
 * "As of Sep 17, 6:10 AM · next cycle Sep 20, 6:00 AM". Null with no scored cycle yet.
 *
 * On a STALE portfolio (stale_for_days set — a cycle was missed) the same date reads
 * "next attempt Sep 20, 6:00 AM". next_realloc_at is real: the scheduler will claim the
 * portfolio then. But it has been claiming it for weeks and no cycle has landed, so the date
 * says when it will try, not when a cycle will run. Dropping the date would hide that the
 * scheduler still touches the portfolio; "next cycle" would promise what 49 claims did not
 * deliver. "attempt" is the word that is true of both.
 */
export function asOfLine(
  latestCycleTs: string | null,
  nextCycleTs: string | null,
  stale = false,
): string | null {
  const at = latestCycleTs ? Date.parse(latestCycleTs) : Number.NaN;
  if (Number.isNaN(at)) return null;
  const parts = [`As of ${AS_OF_FMT.format(new Date(at))}`];
  const next = nextCycleTs ? Date.parse(nextCycleTs) : Number.NaN;
  if (!Number.isNaN(next)) {
    parts.push(`${stale ? 'next attempt' : 'next cycle'} ${AS_OF_FMT.format(new Date(next))}`);
  }
  return parts.join(' · ');
}

// ── Settings recommendations ─────────────────────────────────────────────────
// The engine's S family proposes a change to ONE portfolio field, carried in `seed.patch`
// (the jsonb column record_cycle already stores). These reads keep the shape honest: a
// patch is only a patch if it names a known field and a numeric target.

export type SettingsPatch = {
  field: 'max_change_pct_per_cycle' | 'daily_total' | 'period_budget';
  from: number | null;
  to: number;
};

const SETTINGS_FIELDS = new Set(['max_change_pct_per_cycle', 'daily_total', 'period_budget']);

export function settingsPatchOf(rec: Pick<RecommendationRow, 'seed'>): SettingsPatch | null {
  const raw = (rec.seed as { patch?: unknown } | null | undefined)?.patch;
  if (!raw || typeof raw !== 'object') return null;
  const { field, from, to } = raw as { field?: unknown; from?: unknown; to?: unknown };
  if (typeof field !== 'string' || !SETTINGS_FIELDS.has(field)) return null;
  if (typeof to !== 'number' || !Number.isFinite(to)) return null;
  return {
    field: field as SettingsPatch['field'],
    from: typeof from === 'number' && Number.isFinite(from) ? from : null,
    to,
  };
}

export function settingsFieldLabel(field: SettingsPatch['field']): string {
  switch (field) {
    case 'max_change_pct_per_cycle':
      return 'Autopilot hold threshold';
    case 'daily_total':
      return 'Daily total';
    case 'period_budget':
      return 'Flight budget';
  }
}

export function formatSettingsValue(
  field: SettingsPatch['field'],
  value: number | null,
  currency: string | null,
): string {
  if (value == null) return 'not set';
  // The stored field is a fraction; `formatPercent` takes display units and never multiplies.
  if (field === 'max_change_pct_per_cycle') return formatPercent(value * 100);
  return formatCurrency(value, currency);
}

// ── The chart behind the evidence ─────────────────────────────────────────────
// A recommendation argues from a comparison — 3d against 14d, a value against a cap —
// and the account snapshot already holds every window it was measured on. This turns
// the evidence metric into the three-window series a small bar chart draws, with the
// threshold it crossed, so the row can SHOW the argument instead of only stating it.

export type EvidencePoint = { label: string; value: number };
export type EvidenceSeries = {
  metric: string;
  /** How to print a value: money, a percentage, a plain number, or a multiple. */
  unit: 'money' | 'percent' | 'number' | 'multiple';
  points: EvidencePoint[];
  threshold: number | null;
  thresholdLabel: string | null;
};

type Window = AdSetSnapshot['windows']['d3'];

const kpiOf = (w: Window, kpiField: string): number => {
  const value = (w as unknown as Record<string, unknown>)[kpiField];
  return typeof value === 'number' && Number.isFinite(value) ? value : 0;
};

export function evidenceSeries(
  evidence: RecommendationEvidence | null | undefined,
  snapshot: AdSetSnapshot | null | undefined,
  kpiField: string,
): EvidenceSeries | null {
  if (!evidence || !snapshot) return null;
  const { d3, d7, d14 } = snapshot.windows;
  const windows: [string, Window, number][] = [
    ['3d', d3, 3],
    ['7d', d7, 7],
    ['14d', d14, 14],
  ];
  switch (evidence.metric) {
    case 'cpp':
    case 'cpa': {
      const points = windows.map(([label, w]) => {
        const events = kpiOf(w, kpiField);
        return { label, value: events > 0 ? w.spend / events : 0 };
      });
      return {
        metric: evidence.metric,
        unit: 'money',
        points,
        threshold: evidence.threshold,
        thresholdLabel: evidence.threshold != null ? 'reference' : null,
      };
    }
    case 'spend': {
      const points = windows.map(([label, w, days]) => ({ label, value: w.spend / days }));
      return {
        metric: 'spend per day',
        unit: 'money',
        points,
        threshold: null,
        thresholdLabel: null,
      };
    }
    case 'ctr': {
      const points = windows.map(([label, w]) => ({
        label,
        value: w.impressions > 0 ? w.clicks / w.impressions : 0,
      }));
      return {
        metric: 'ctr',
        unit: 'percent',
        points,
        threshold: evidence.threshold,
        thresholdLabel: evidence.threshold != null ? '14d' : null,
      };
    }
    case 'frequency': {
      const freq = snapshot.frequency7d;
      if (typeof freq !== 'number') return null;
      return {
        metric: 'frequency',
        unit: 'number',
        points: [{ label: '7d', value: freq }],
        threshold: evidence.threshold,
        thresholdLabel: evidence.threshold != null ? 'cap' : null,
      };
    }
    case 'reach_expansion': {
      const r7 = d7.reach ?? 0;
      const r14 = d14.reach ?? 0;
      if (r7 <= 0 || r14 <= 0) return null;
      return {
        metric: 'people reached',
        unit: 'number',
        points: [
          { label: '7d', value: r7 },
          { label: '14d', value: r14 },
        ],
        threshold: null,
        thresholdLabel: null,
      };
    }
    default:
      return null;
  }
}

export function formatEvidenceValue(
  unit: EvidenceSeries['unit'],
  value: number,
  currency: string | null,
): string {
  switch (unit) {
    case 'money':
      return formatCurrency(value, currency);
    case 'percent':
      return formatPercent(value * 100, { fractionDigits: 2 });
    case 'multiple':
      return `${value.toFixed(2)}×`;
    default:
      return Number.isInteger(value) ? String(value) : value.toFixed(1);
  }
}

// ── Hand-off to Jaina for audience expansion ──────────────────────────────────
// "Expand audience" ends in advice inside the Optimizer; the options with sizes live in
// Jaina's audience tools (catalogue search, reach estimate, audience groups). The row hands
// the ad set and its diagnosis over in one prepared prompt, so the person lands in a
// three-bucket answer instead of a blank chat.

export function audienceExpansionPrompt(
  rec: Pick<RecommendationRow, 'adset_id' | 'reason' | 'trigger'>,
  adsetName: string | null,
): string {
  const subject = adsetName ? `"${adsetName}" (ad set ${rec.adset_id})` : `ad set ${rec.adset_id}`;
  const diagnosis = rec.reason ? ` The optimizer's diagnosis: ${rec.reason}` : '';
  return (
    `Expand the audience of ${subject}.${diagnosis} ` +
    'Give me the three buckets — what it targets now, what the account already owns that it has never used (saved audiences, lookalikes, wider age or geo), and net-new interests verified in the catalogue this session — each option with its id and estimated size, then the combined reach estimate. Apply the brand rules first and mark anything they block.'
  );
}
