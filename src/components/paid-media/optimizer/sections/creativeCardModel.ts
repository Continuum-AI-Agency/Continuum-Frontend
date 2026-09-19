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
  /** Why: winner or fatigue, in the engine's own terms. */
  because: 'winner' | 'fatigue' | 'variance' | 'drag' | 'other';
};

export function creativeCardCopy(
  rec: Pick<RecommendationRow, 'kind' | 'trigger' | 'seed'>,
): CreativeCardCopy {
  const rebuild = Boolean(seedOf(rec).rebuildCraft);
  switch (rec.kind) {
    case 'variate_creative':
      return {
        headline: rebuild
          ? 'Keep the angle, rebuild the execution — the idea wins, the craft is losing ground'
          : 'Make variations of this winner — hold what wins, vary the visual and the CTA',
        because: 'winner',
      };
    case 'seed_experiment':
      return {
        headline: 'Nothing to compare yet — add a second creative so this ad set can teach',
        because: 'variance',
      };
    case 'creative_refresh':
      return {
        headline: rec.trigger.startsWith('C4')
          ? 'This creative is wearing out against its own history — refresh it'
          : 'Engagement is decaying while cost rises — refresh the creative',
        because: 'fatigue',
      };
    case 'pause_ad':
      return {
        headline: 'This creative is burning the ad set — pause it',
        because: 'drag',
      };
    default:
      return { headline: 'Creative recommendation', because: 'other' };
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
