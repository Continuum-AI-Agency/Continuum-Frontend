// G08 Quality Score on the adaptive board, from keyword_quality (the 50 keywords that spent most
// in the window): keyword spend by Quality Score 1–10, the share at Quality Score ≤ 3 — V5's line
// is 10% of the keyword spend — and how Google rates that spend on each of its three components.
// The histogram is the Quality Score map's own (buildQualityScoreMap), so the board and the map
// agree to the cent. An unscored keyword's spend counts in the whole, never as a low score.

import {
  G11_MAX_QUALITY_SCORE,
  type GoogleKeywordQualityRead,
  type KeywordQuality,
} from '@continuum/contracts';
import { buildQualityScoreMap, type QsBucket } from '../../../google/views/qualityScoreModel';

export const LOW_QS_MAX = G11_MAX_QUALITY_SCORE;

export const QS_COMPONENTS = ['expected_ctr', 'ad_relevance', 'landing_page'] as const;
export type QsComponent = (typeof QS_COMPONENTS)[number];

export const QS_COMPONENT_LABEL: Record<QsComponent, string> = {
  expected_ctr: 'Expected CTR',
  ad_relevance: 'Ad relevance',
  landing_page: 'Landing page',
};

/** Google's three ratings, worst first. */
export const RATINGS = ['BELOW_AVERAGE', 'AVERAGE', 'ABOVE_AVERAGE'] as const;
export type Rating = (typeof RATINGS)[number];

export const RATING_LABEL: Record<Rating, string> = {
  BELOW_AVERAGE: 'Below average',
  AVERAGE: 'Average',
  ABOVE_AVERAGE: 'Above average',
};

export type ComponentSplit = {
  component: QsComponent;
  /** Keyword spend Google rated on this component, by rating. */
  spend: Record<Rating, number>;
  /** Their sum; 0 when Google rated none of the spend yet. */
  rated: number;
};

export type LowKeyword = {
  id: string;
  keyword: string;
  score: number;
  spend: number;
  /** Null when the account's conversions are not counted. */
  conversions: number | null;
  ratings: Record<QsComponent, Rating | null>;
};

export type QualityLensModel =
  | { kind: 'empty'; window: { since: string; until: string } }
  | {
      kind: 'read';
      window: { since: string; until: string };
      /** One per score 1–10, empty ones included. */
      histogram: QsBucket[];
      unscored: { keywords: number; spend: number };
      /** Scored and unscored together: the whole the low share is taken of. */
      keywordSpend: number;
      low: { keywords: number; spend: number; share: number };
      /** Every keyword's spend by rating, per component. */
      components: ComponentSplit[];
      /** The same for the low-score spend alone: what drags it down. */
      lowComponents: ComponentSplit[];
      /** The low-score keywords that spent most, each with its three ratings. */
      lowest: LowKeyword[];
      /** The component rated below average on the largest share of the low-score spend. */
      weakest: { component: QsComponent; share: number } | null;
      average: number | null;
      scored: number;
      total: number;
    };

function ratingOf(value: string | null): Rating | null {
  return RATINGS.find((rating) => rating === value) ?? null;
}

function ratingsOf(keyword: KeywordQuality): Record<QsComponent, Rating | null> {
  return {
    expected_ctr: ratingOf(keyword.expected_ctr),
    ad_relevance: ratingOf(keyword.ad_relevance),
    landing_page: ratingOf(keyword.landing_page_experience),
  };
}

function splitOf(component: QsComponent, keywords: readonly KeywordQuality[]): ComponentSplit {
  const spend: Record<Rating, number> = { BELOW_AVERAGE: 0, AVERAGE: 0, ABOVE_AVERAGE: 0 };
  for (const keyword of keywords) {
    const rating = ratingsOf(keyword)[component];
    if (rating) spend[rating] += keyword.metrics.spend;
  }
  return { component, spend, rated: spend.BELOW_AVERAGE + spend.AVERAGE + spend.ABOVE_AVERAGE };
}

/** The low-score keywords listed with their ratings. */
export const LOWEST_SHOWN = 4;

/** On a tie, the component named first is the one the Optimizer's V5 card fixes first: a
 *  landing page per service, then the ads that name it. */
const FIX_ORDER: readonly QsComponent[] = ['landing_page', 'ad_relevance', 'expected_ctr'];

export function buildQualityLens(read: GoogleKeywordQualityRead): QualityLensModel {
  const map = buildQualityScoreMap(read);
  const scoredSpend = map.buckets.reduce((sum, bucket) => sum + bucket.spend, 0);
  const keywordSpend = scoredSpend + map.unscored.spend;
  if (keywordSpend <= 0) return { kind: 'empty', window: read.range };

  const lowBuckets = map.buckets.filter((bucket) => bucket.score <= LOW_QS_MAX);
  const lowSpend = lowBuckets.reduce((sum, bucket) => sum + bucket.spend, 0);
  const lowShare = lowSpend / keywordSpend;
  const lowKeywords = read.keywords
    .filter((keyword) => keyword.quality_score !== null && keyword.quality_score <= LOW_QS_MAX)
    .sort((a, b) => b.metrics.spend - a.metrics.spend);

  const lowSplits = QS_COMPONENTS.map((component) => splitOf(component, lowKeywords));
  const weakest = lowSplits
    .filter((split) => split.rated > 0 && split.spend.BELOW_AVERAGE > 0)
    .map((split) => ({
      component: split.component,
      share: split.spend.BELOW_AVERAGE / split.rated,
    }))
    .sort(
      (a, b) =>
        b.share - a.share || FIX_ORDER.indexOf(a.component) - FIX_ORDER.indexOf(b.component),
    )[0];

  return {
    kind: 'read',
    window: read.range,
    histogram: map.buckets,
    unscored: map.unscored,
    keywordSpend,
    low: {
      keywords: lowBuckets.reduce((sum, bucket) => sum + bucket.keywords, 0),
      spend: lowSpend,
      share: lowShare,
    },
    components: QS_COMPONENTS.map((component) => splitOf(component, read.keywords)),
    lowComponents: lowSplits,
    lowest: lowKeywords.slice(0, LOWEST_SHOWN).map((keyword) => ({
      id: `${keyword.criterion_id}:${keyword.ad_group}`,
      keyword: keyword.keyword,
      score: keyword.quality_score ?? 0,
      spend: keyword.metrics.spend,
      conversions: keyword.metrics.conversions,
      ratings: ratingsOf(keyword),
    })),
    weakest: weakest ?? null,
    average: read.average_quality_score,
    scored: read.scored_keywords,
    total: read.total_keywords,
  };
}
