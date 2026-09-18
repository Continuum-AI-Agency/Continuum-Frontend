// The recommendation queue's pure reads: the one-line evidence behind a row, the money a row
// puts on the table, the "as of" line that says whether the queue is current, and the
// grouped summary that turns ten identical "Pause ad set · HIGH" rows into "5 ad sets ·
// sustained poor CPA · $1,240/day". No React, no fetch — all of it testable on fixtures.

import type {
  AdSetSnapshot,
  RecommendationEvidence,
  RecommendationRow,
} from '@continuum/contracts';
import { formatCurrency } from '../format';
import { recommendationLabel } from '../reportModel';

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
      return `${(value * 100).toFixed(2)}%`;
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

/** "$120/day at stake" — null when the engine gave no sizing. */
export function impactLabel(
  rec: Pick<RecommendationRow, 'evidence'>,
  currency: string | null,
): string | null {
  const value = impactPerDay(rec);
  return value > 0 ? `${formatCurrency(value, currency)}/day at stake` : null;
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

const AS_OF_FMT = new Intl.DateTimeFormat('en-US', {
  month: 'short',
  day: 'numeric',
  hour: 'numeric',
  minute: '2-digit',
});

/** "As of Sep 17, 6:10 AM · next cycle Sep 20, 6:00 AM". Null with no scored cycle yet. */
export function asOfLine(latestCycleTs: string | null, nextCycleTs: string | null): string | null {
  const at = latestCycleTs ? Date.parse(latestCycleTs) : Number.NaN;
  if (Number.isNaN(at)) return null;
  const parts = [`As of ${AS_OF_FMT.format(new Date(at))}`];
  const next = nextCycleTs ? Date.parse(nextCycleTs) : Number.NaN;
  if (!Number.isNaN(next)) parts.push(`next cycle ${AS_OF_FMT.format(new Date(next))}`);
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
  if (field === 'max_change_pct_per_cycle') return `${Math.round(value * 100)}%`;
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
      return `${(value * 100).toFixed(2)}%`;
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

/** Deep link into the Jaina tab with the prompt prepared. */
export function jainaPromptHref(prompt: string): string {
  return `/scale?tab=jaina&prompt=${encodeURIComponent(prompt)}`;
}
