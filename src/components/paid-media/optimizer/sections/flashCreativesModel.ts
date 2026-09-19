// Flash creatives on the recommendation card: what to ask the workflow for, which
// workflow, and where a finished variant can go. Pure; the RPC calls live in the hooks.

import type { AdsetAd, RecommendationRow } from '@continuum/contracts';
import { type FlashBrief, type FlashWant, flashPrompts } from '@continuum/contracts';
import {
  adImageUrl,
  angleWords,
  audienceWords,
  subjectAdId,
  subjectAds,
} from './creativeCardModel';
import { evidenceLine } from './recQueueModel';

/** The placement ratio the winner runs in, from its creative format. */
export function ratioForCreative(ad: AdsetAd | null | undefined): string | null {
  switch (ad?.creative?.format) {
    case 'video':
      return '9:16';
    case 'carousel':
      return '1:1';
    case 'image':
      return '4:5';
    default:
      return null;
  }
}

export function flashWantFor(
  rec: Pick<RecommendationRow, 'ad_id' | 'seed'>,
  ads: readonly AdsetAd[],
  count = 3,
): FlashWant {
  const [subject] = subjectAds(rec, ads, 1);
  const seed = (rec.seed ?? null) as { winnerAssetId?: string | null } | null;
  return {
    ratio: ratioForCreative(subject),
    hasReference: Boolean(seed?.winnerAssetId),
    count,
  };
}

/** The Library assets to hand in as references: the winner when it is in the Library. */
export function referenceAssetIdsFor(rec: Pick<RecommendationRow, 'seed'>): string[] {
  const seed = (rec.seed ?? null) as { winnerAssetId?: string | null } | null;
  return typeof seed?.winnerAssetId === 'string' && seed.winnerAssetId ? [seed.winnerAssetId] : [];
}

export function flashBriefFor(
  rec: RecommendationRow,
  adsetName: string | null,
  audienceType: string | null | undefined,
  ads: readonly AdsetAd[],
  currency: string | null,
  brandName: string | null,
): Omit<FlashBrief, 'variant'> {
  const [subject] = subjectAds(rec, ads, 1);
  return {
    angle: angleWords(rec),
    hook: null,
    audience: audienceWords(rec, audienceType) ?? adsetName,
    why: evidenceLine(rec.evidence, currency) ?? rec.reason ?? null,
    cta: null,
    sourceAdName: subject?.name ?? (subjectAdId(rec) ? `ad ${subjectAdId(rec)}` : null),
    brandName,
  };
}

/** One positive prompt for the run (the workflow yields the variants); the negative is fixed. */
export function flashPromptsFor(brief: Omit<FlashBrief, 'variant'>): {
  positive: string;
  negative: string;
} {
  return flashPrompts({ ...brief, variant: 0 });
}

export type PortfolioAudience = {
  adset_id: string;
  adset_name: string | null;
  targeting_hash: string | null;
  age_min?: number | null;
  age_max?: number | null;
  genders?: number[] | null;
};

export type ImplementTarget = {
  adsetId: string;
  name: string;
  /** 'here' = the ad set the recommendation is about; 'same_audience' = identical targeting
   *  fingerprint; 'other' = any other ad set in the portfolio. */
  relation: 'here' | 'same_audience' | 'other';
};

/** Where a variant can go: here first, then every ad set with the same targeting, then the
 *  rest of the portfolio. Ad sets without a fingerprint can only be "other". */
export function implementTargets(
  audiences: readonly PortfolioAudience[],
  sourceAdsetId: string,
): ImplementTarget[] {
  const source = audiences.find((a) => a.adset_id === sourceAdsetId) ?? null;
  const here: ImplementTarget = {
    adsetId: sourceAdsetId,
    name: source?.adset_name ?? sourceAdsetId,
    relation: 'here',
  };
  const others = audiences
    .filter((a) => a.adset_id !== sourceAdsetId)
    .map<ImplementTarget>((a) => ({
      adsetId: a.adset_id,
      name: a.adset_name ?? a.adset_id,
      relation:
        source?.targeting_hash && a.targeting_hash === source.targeting_hash
          ? 'same_audience'
          : 'other',
    }))
    .sort((a, b) =>
      a.relation === b.relation
        ? a.name.localeCompare(b.name)
        : a.relation === 'same_audience'
          ? -1
          : 1,
    );
  return [here, ...others];
}

/** The ad a new variant sits beside in a target ad set: its first delivering ad. */
export function predecessorAdIn(ads: readonly AdsetAd[]): AdsetAd | null {
  const active = ads.find((ad) => (ad.status ?? '').toUpperCase() === 'ACTIVE');
  return active ?? ads[0] ?? null;
}

export { adImageUrl };
