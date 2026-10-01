// The creative recommendation card's pure reads: which ad it is about, what to say about
// the angle and the audience, why the engine raised it, and which flash creatives belong
// to it. No React, no fetch.

import type {
  AdSetSnapshot,
  AdsetAd,
  CreativeSwapJobRow,
  RecommendationRow,
} from '@continuum/contracts';
import { GLOBAL_ANGLE_LABELS, type GlobalAngleId } from '@continuum/contracts';
import { z } from 'zod';
import type { EvidenceSeries } from './recQueueModel';

export const CREATIVE_KINDS = new Set([
  'creative_refresh',
  'variate_creative',
  'seed_experiment',
  'pause_ad',
]);

export function isCreativeRecommendation(rec: Pick<RecommendationRow, 'kind' | 'ad_id'>): boolean {
  return CREATIVE_KINDS.has(rec.kind) || Boolean(rec.ad_id);
}

type Seed = {
  winnerAdId?: string | null;
  winnerAssetId?: string | null;
  angleId?: string | null;
  labels?: Record<string, unknown> | null;
  rebuildCraft?: boolean;
  audience?: { branch?: string | null; strategy?: string | null; offerText?: string | null } | null;
};

const seedOf = (rec: Pick<RecommendationRow, 'seed'>): Seed =>
  (rec.seed && typeof rec.seed === 'object' ? (rec.seed as Seed) : {}) ?? {};

/** The ad the recommendation is about: its own ad_id, else the seed's winner. */
export function subjectAdId(rec: Pick<RecommendationRow, 'ad_id' | 'seed'>): string | null {
  if (typeof rec.ad_id === 'string' && rec.ad_id) return rec.ad_id;
  const winner = seedOf(rec).winnerAdId;
  return typeof winner === 'string' && winner ? winner : null;
}

/** The ads to show: the subject ad when known, otherwise the ad set's delivering ads. */
export function subjectAds(
  rec: Pick<RecommendationRow, 'ad_id' | 'seed'>,
  ads: readonly AdsetAd[],
  limit = 3,
): AdsetAd[] {
  const id = subjectAdId(rec);
  if (id) {
    const hit = ads.find((ad) => ad.id === id);
    return hit ? [hit] : [];
  }
  const active = ads.filter((ad) => (ad.status ?? '').toUpperCase() === 'ACTIVE');
  return (active.length > 0 ? active : ads).slice(0, limit);
}

export function adImageUrl(ad: AdsetAd): string | null {
  const creative = ad.creative ?? null;
  return creative?.imageUrl ?? creative?.posterUrl ?? ad.thumbnailUrl ?? null;
}

const str = (value: unknown): string | null =>
  typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;

/** "Discount offer" from the closed vocabulary, else the labeler's own angle / hook words. */
export function angleWords(rec: Pick<RecommendationRow, 'seed'>): string | null {
  const seed = seedOf(rec);
  if (typeof seed.angleId === 'string' && seed.angleId in GLOBAL_ANGLE_LABELS) {
    return GLOBAL_ANGLE_LABELS[seed.angleId as GlobalAngleId];
  }
  const labels = seed.labels ?? null;
  if (!labels) return null;
  const parts = [str(labels.angle), str(labels.hook ?? labels.hookArchetype)].filter(
    (part): part is string => part !== null,
  );
  return parts.length > 0 ? parts.join(' · ') : null;
}

/** "Prospecting · Broad" from the seed's parsed ad set name, else the snapshot's audience type. */
export function audienceWords(
  rec: Pick<RecommendationRow, 'seed'>,
  audienceType: string | null | undefined,
): string | null {
  const audience = seedOf(rec).audience ?? null;
  const parts = [str(audience?.branch), str(audience?.strategy), str(audience?.offerText)].filter(
    (part): part is string => part !== null,
  );
  if (parts.length > 0) return parts.join(' · ');
  return str(audienceType);
}

export type CreativeCardCopy = {
  /** What the card asks for, in one line. */
  headline: string;
  /** The headline's first half: what is wrong (or right) with the creative today. */
  problem: string;
  /** The headline's second half: what to make. Null when the kind names no action. */
  instruction: string | null;
  /** Why: winner or fatigue, in the engine's own terms. */
  because: 'winner' | 'fatigue' | 'variance' | 'drag' | 'other';
};

const copyOf = (
  problem: string,
  instruction: string | null,
  because: CreativeCardCopy['because'],
  headline = instruction ? `${problem} — ${instruction.toLowerCase()}` : problem,
): CreativeCardCopy => ({ headline, problem, instruction, because });

export function creativeCardCopy(
  rec: Pick<RecommendationRow, 'kind' | 'trigger' | 'seed'>,
): CreativeCardCopy {
  const rebuild = Boolean(seedOf(rec).rebuildCraft);
  switch (rec.kind) {
    case 'variate_creative':
      return rebuild
        ? copyOf(
            'The idea wins, the craft is losing ground',
            'Keep the angle, rebuild the execution',
            'winner',
            'Keep the angle, rebuild the execution — the idea wins, the craft is losing ground',
          )
        : copyOf(
            'This creative is the ad set’s winner',
            'Make variations of this winner — hold what wins, vary the visual and the CTA',
            'winner',
            'Make variations of this winner — hold what wins, vary the visual and the CTA',
          );
    case 'seed_experiment':
      return copyOf(
        'Nothing to compare yet',
        'Add a second creative so this ad set can teach',
        'variance',
      );
    case 'creative_refresh':
      return rec.trigger.startsWith('C4')
        ? copyOf('This creative is wearing out against its own history', 'Refresh it', 'fatigue')
        : copyOf('Engagement is decaying while cost rises', 'Refresh the creative', 'fatigue');
    case 'pause_ad':
      return copyOf('This creative is burning the ad set', 'Pause it', 'drag');
    default:
      return copyOf('Creative recommendation', null, 'other');
  }
}

export const SWAP_STATUS_LABEL: Record<string, string> = {
  queued: 'Queued',
  generating: 'Generating',
  generated: 'Ready for review',
  publishing: 'Publishing',
  published: 'Live',
  failed: 'Failed',
  cancelled: 'Cancelled',
};

/** The flash creatives that belong to this recommendation: by recommendation id first,
 *  then any job on the same ad set (an older request for the same creative problem). */
export function flashCreativesFor(
  rec: Pick<RecommendationRow, 'id' | 'adset_id'>,
  jobs: readonly CreativeSwapJobRow[],
): CreativeSwapJobRow[] {
  const own = jobs.filter((job) => job.recommendation_id === rec.id);
  if (own.length > 0) return own;
  return jobs.filter((job) => job.adset_id === rec.adset_id && job.status !== 'cancelled');
}

// ── The comparison behind the card ──────────────────────────────────────────
// The engine ranks an ad set's creatives on cost per result in the objective's own unit
// (`paid_media_get_adset_creative_standing`): the winner, the laggards, and the median a
// new ad has to beat. The card draws exactly that, so the chart and the sentence agree.

export type CreativeStanding = NonNullable<AdSetSnapshot['creative']>;

export type StandingBar = {
  adId: string;
  name: string;
  costPerEvent: number | null;
  events: number;
  spend: number;
  /** The creative this recommendation is about. */
  subject: boolean;
  /** The engine's cheapest creative (the winner) — highlighted even when not the subject. */
  winner: boolean;
  /** 0–1 share of the widest bar; null when the ad has no cost yet. */
  share: number | null;
};

export type StandingChart = {
  bars: StandingBar[];
  median: number | null;
  /** 0–1 position of the median on the same scale; null when off scale. */
  medianShare: number | null;
  /** Ads the engine compared vs. ads it saw (the rest were under the evidence floor). */
  eligibleAds: number;
  totalAds: number;
};

/** Cheapest first; ads without a cost (no results yet) go last so the picture stays the
 *  cost ranking. Returns null when nothing is comparable — the card then says so. */
export function standingChart(
  standing: CreativeStanding | null | undefined,
  subjectAdId: string | null,
): StandingChart | null {
  if (!standing) return null;
  const listed = [
    ...(standing.winner ? [{ ad: standing.winner, winner: true }] : []),
    ...standing.laggards.map((ad) => ({ ad, winner: false })),
  ];
  const seen = new Set<string>();
  const rows = listed.filter(({ ad }) => {
    if (seen.has(ad.adId)) return false;
    seen.add(ad.adId);
    return true;
  });
  if (rows.length === 0) return null;
  const costs = rows.map(({ ad }) => ad.costPerEvent).filter((v): v is number => v != null);
  const max = Math.max(...costs, standing.medianCostPerEvent ?? 0, 0);
  const share = (v: number | null) => (v == null || max <= 0 ? null : Math.min(1, v / max));
  const bars = rows
    .map<StandingBar>(({ ad, winner }) => ({
      adId: ad.adId,
      name: ad.adName ?? ad.adId,
      costPerEvent: ad.costPerEvent ?? null,
      events: ad.events,
      spend: ad.spend,
      subject: ad.adId === subjectAdId,
      winner,
      share: share(ad.costPerEvent ?? null),
    }))
    .sort((a, b) => {
      if (a.costPerEvent == null) return b.costPerEvent == null ? 0 : 1;
      if (b.costPerEvent == null) return -1;
      return a.costPerEvent - b.costPerEvent;
    });
  return {
    bars,
    median: standing.medianCostPerEvent ?? null,
    medianShare: share(standing.medianCostPerEvent ?? null),
    eligibleAds: standing.eligibleAds,
    totalAds: standing.totalAds,
  };
}

// ── The communication angle ─────────────────────────────────────────────────
// `paid_media_get_ad_angles` returns each labelled ad's coarse hookArchetype as `angle`;
// the closed-vocabulary keys (angle_id, angle_leaning, angle_leaning_share) arrive with a
// later migration, so they are optional here and the card works with or without them.

export const cardAdAngleSchema = z.object({
  ad_id: z.string(),
  adset_id: z.string(),
  angle: z.string().nullable().optional(),
  hook: z.string().nullable().optional(),
  rationale: z.string().nullable().optional(),
  themes: z.array(z.string()).nullable().optional(),
  analyzed_at: z.string().nullable().optional(),
  angle_id: z.string().nullable().optional(),
  angle_leaning: z.string().nullable().optional(),
  angle_leaning_share: z.number().min(0).max(1).nullable().optional(),
});
export type CardAdAngle = z.infer<typeof cardAdAngleSchema>;

/** Row-wise: a malformed row is dropped, the rest still render. */
export function parseCardAdAngles(data: unknown): CardAdAngle[] {
  if (!Array.isArray(data)) return [];
  const rows: CardAdAngle[] = [];
  for (const raw of data) {
    const parsed = cardAdAngleSchema.safeParse(raw);
    if (parsed.success) rows.push(parsed.data);
  }
  return rows;
}

export type ResolvedAngle =
  | { status: 'confirmed'; label: string }
  | { status: 'leaning'; label: string; share: number | null }
  | { status: 'none' };

const NO_ANGLE: ResolvedAngle = { status: 'none' };

const vocabularyLabel = (id: string | null | undefined): string | null =>
  typeof id === 'string' && Object.hasOwn(GLOBAL_ANGLE_LABELS, id)
    ? GLOBAL_ANGLE_LABELS[id as GlobalAngleId]
    : null;

function seedAngle(rec: Pick<RecommendationRow, 'seed'>): ResolvedAngle {
  const confirmed = vocabularyLabel(seedOf(rec).angleId);
  if (confirmed) return { status: 'confirmed', label: confirmed };
  const words = angleWords(rec);
  return words ? { status: 'leaning', label: words, share: null } : NO_ANGLE;
}

/** One ad's angle: confirmed id, then the classifier's leaning, then the coarse archetype
 *  when it is a vocabulary key, then (with a rec) the legacy seed. */
export function resolveAdAngle(
  row: CardAdAngle | null,
  rec: Pick<RecommendationRow, 'seed'> | null,
): ResolvedAngle {
  if (row) {
    const confirmed = vocabularyLabel(row.angle_id);
    if (confirmed) return { status: 'confirmed', label: confirmed };
    const leaning = vocabularyLabel(row.angle_leaning);
    if (leaning)
      return { status: 'leaning', label: leaning, share: row.angle_leaning_share ?? null };
    const coarse = vocabularyLabel(row.angle);
    if (coarse) return { status: 'leaning', label: coarse, share: null };
  }
  return rec ? seedAngle(rec) : NO_ANGLE;
}

export function angleChipText(angle: ResolvedAngle): string {
  switch (angle.status) {
    case 'confirmed':
      return angle.label;
    case 'leaning':
      return angle.share != null
        ? `Leaning: ${angle.label} · ${Math.round(angle.share * 100)}%`
        : `Leaning: ${angle.label}`;
    default:
      return 'Not classified yet';
  }
}

export const angleAriaLabel = (angle: ResolvedAngle): string =>
  `Communication angle: ${angleChipText(angle)}`;

export type CardAngles = {
  /** Each shown ad's own angle, in the order the card shows the ads. */
  perAd: Map<string, ResolvedAngle>;
  /** The angle most of the shown ads share; confirmed beats leaning on a tie. */
  dominant: ResolvedAngle;
  /** True when the shown ads do not share one angle. */
  mixed: boolean;
  /** The first shown ad's hook, quoted on the card. */
  hook: string | null;
};

export function cardAngles(
  rec: Pick<RecommendationRow, 'ad_id' | 'adset_id' | 'seed'>,
  shownAds: readonly Pick<AdsetAd, 'id'>[],
  rows: readonly CardAdAngle[],
): CardAngles {
  const subject = subjectAdId(rec);
  const ids =
    shownAds.length > 0
      ? shownAds.map((ad) => ad.id)
      : subject
        ? [subject]
        : rows.filter((row) => row.adset_id === rec.adset_id).map((row) => row.ad_id);
  const byId = new Map(rows.map((row) => [row.ad_id, row]));
  const perAd = new Map<string, ResolvedAngle>();
  let hook: string | null = null;
  for (const id of ids) {
    const row = byId.get(id) ?? null;
    perAd.set(id, resolveAdAngle(row, null));
    if (hook === null) hook = str(row?.hook);
  }
  const tally = new Map<string, { angle: ResolvedAngle; count: number }>();
  for (const angle of perAd.values()) {
    if (angle.status === 'none') continue;
    const entry = tally.get(angle.label);
    if (!entry) tally.set(angle.label, { angle, count: 1 });
    else {
      entry.count += 1;
      if (angle.status === 'confirmed') entry.angle = angle;
    }
  }
  const ranked = [...tally.values()].sort(
    (a, b) =>
      b.count - a.count ||
      Number(b.angle.status === 'confirmed') - Number(a.angle.status === 'confirmed'),
  );
  const seedHook = str(seedOf(rec).labels?.hook);
  return {
    perAd,
    dominant: ranked[0]?.angle ?? seedAngle(rec),
    mixed: ranked.length > 1,
    hook: hook ?? seedHook,
  };
}

// ── What's wearing out ──────────────────────────────────────────────────────
// The evidence metric across 14, 7 and 3 days, drawn to scale (every bar against the largest
// of the three) so a 29% drop looks like one. The worst recent window is flagged when it is
// worse than the 14-day level, in the direction the metric goes bad.

const LOWER_IS_WORSE = new Set(['ctr']);
const HIGHER_IS_WORSE = new Set(['cpa', 'cpp', 'frequency']);

const WINDOW_ORDER = [
  ['14d', '14 days'],
  ['7d', '7 days'],
  ['3d', '3 days'],
] as const;

export type WearOutRow = {
  label: (typeof WINDOW_ORDER)[number][1];
  value: number;
  /** 0–1 of the largest of the three windows. */
  share: number;
  /** The worst recent window, when it is worse than 14 days. */
  flagged: boolean;
  /** Percent change against the 14-day level; null for the 14-day row itself. */
  changePct: number | null;
};

export type WearOut = {
  metric: string;
  unit: EvidenceSeries['unit'];
  rows: WearOutRow[];
  /** 0–1 position of the 14-day level on the same scale. */
  baselineShare: number;
  /** Cost per result, 3 days against 14 days, in percent; null when it is the metric drawn
   *  or either window has no results. */
  costChangePct: number | null;
};

type SnapshotWindows = { windows: Record<'d3' | 'd7' | 'd14', unknown> };

const numberField = (window: unknown, field: string): number => {
  const value =
    window && typeof window === 'object' ? (window as Record<string, unknown>)[field] : null;
  return typeof value === 'number' && Number.isFinite(value) ? value : 0;
};

function costPerResult(window: unknown, kpiField: string): number | null {
  const events = numberField(window, kpiField);
  return events > 0 ? numberField(window, 'spend') / events : null;
}

function costChange(snapshot: SnapshotWindows | null | undefined, kpiField: string): number | null {
  if (!snapshot) return null;
  const recent = costPerResult(snapshot.windows.d3, kpiField);
  const baseline = costPerResult(snapshot.windows.d14, kpiField);
  if (recent == null || baseline == null || baseline <= 0) return null;
  return ((recent - baseline) / baseline) * 100;
}

export function wearOutComparison(
  series: EvidenceSeries | null,
  snapshot: SnapshotWindows | null | undefined,
  kpiField: string,
): WearOut | null {
  if (!series) return null;
  const valueOf = new Map(series.points.map((point) => [point.label, point.value]));
  if (!WINDOW_ORDER.every(([key]) => valueOf.has(key))) return null;
  const values = WINDOW_ORDER.map(([key]) => valueOf.get(key) ?? 0);
  const max = Math.max(...values);
  if (max <= 0) return null;
  const baseline = values[0] ?? 0;
  const badness = (value: number): number =>
    LOWER_IS_WORSE.has(series.metric)
      ? baseline - value
      : HIGHER_IS_WORSE.has(series.metric)
        ? value - baseline
        : 0;
  let worst: number | null = null;
  for (let index = 1; index < values.length; index += 1) {
    const amount = badness(values[index] ?? 0);
    if (amount > 0 && (worst == null || amount > badness(values[worst] ?? 0))) worst = index;
  }
  const isCost = series.metric === 'cpa' || series.metric === 'cpp';
  return {
    metric: series.metric,
    unit: series.unit,
    rows: WINDOW_ORDER.map(([, label], index) => {
      const value = values[index] ?? 0;
      return {
        label,
        value,
        share: value / max,
        flagged: index === worst,
        changePct: index === 0 || baseline <= 0 ? null : ((value - baseline) / baseline) * 100,
      };
    }),
    baselineShare: baseline / max,
    costChangePct: isCost ? null : costChange(snapshot, kpiField),
  };
}

const METRIC_TITLE: Record<string, string> = {
  ctr: 'CTR',
  cpa: 'Cost per result',
  cpp: 'Cost per result',
};

export const wearOutMetricTitle = (metric: string): string => METRIC_TITLE[metric] ?? metric;

/** "+31%" / "−29%", rounded to whole percent. */
export function signedPercent(pct: number): string {
  const rounded = Math.round(pct);
  return rounded > 0 ? `+${rounded}%` : rounded < 0 ? `−${Math.abs(rounded)}%` : '0%';
}
