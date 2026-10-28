// The Quality Score map (P6 view 5) from keyword_quality: how the account's spend spreads over
// the 1–10 scores, each keyword with its three components (presentation standard §10: never the
// 1–10 alone), and the waste — spend on a keyword at Quality Score ≤ G11_MAX_QUALITY_SCORE that
// brought no conversion.

import {
  G11_MAX_QUALITY_SCORE,
  type GoogleKeywordQualityRead,
  type KeywordQuality,
} from '@continuum/contracts';
import { type Cell, CONVERSIONS_NOT_COUNTED, missing, resultsText, shown } from './cell';

/** A table holds about 25 rows; the rest is said, not shown (standard §4). */
export const QS_ROWS_SHOWN = 25;

export type QsBand = 'low' | 'mid' | 'high';

export function qsBand(score: number): QsBand {
  if (score <= G11_MAX_QUALITY_SCORE) return 'low';
  return score <= 6 ? 'mid' : 'high';
}

export type QsBucket = { score: number; keywords: number; spend: number; band: QsBand };

export type QsRow = {
  id: string;
  keyword: string;
  matchType: string;
  /** "Campaign · Ad group". */
  where: string;
  score: Cell;
  expectedCtr: Cell;
  adRelevance: Cell;
  landingPage: Cell;
  spend: number;
  conversions: Cell;
  waste: boolean;
};

export type QualityScoreMapModel = {
  /** One per score 1–10, empty ones included, so the map always reads left to right. */
  buckets: QsBucket[];
  unscored: { keywords: number; spend: number };
  /** Null when conversions are not counted: waste cannot be told from a slow keyword. */
  waste: { keywords: number; spend: number } | null;
  average: Cell;
  scored: number;
  total: number;
  rows: QsRow[];
  /** Keywords read but not listed (past QS_ROWS_SHOWN). */
  hiddenRows: number;
};

const NOT_SCORED = 'Google has not scored it yet: too little traffic';

const COMPONENT_WORDS: Readonly<Record<string, string>> = {
  BELOW_AVERAGE: 'Below avg',
  AVERAGE: 'Average',
  ABOVE_AVERAGE: 'Above avg',
};

function componentCell(value: string | null): Cell {
  if (!value) return missing(NOT_SCORED);
  return shown(COMPONENT_WORDS[value] ?? value.toLowerCase().replaceAll('_', ' '));
}

/** True: low score, no conversion. False: scored above the line, unscored, or it converted.
 *  Null: low score, but conversions are not counted on the account. */
export function isWaste(keyword: KeywordQuality): boolean | null {
  if (keyword.quality_score === null || keyword.quality_score > G11_MAX_QUALITY_SCORE) {
    return false;
  }
  if (keyword.metrics.conversions === null) return null;
  return keyword.metrics.conversions === 0;
}

export function buildQualityScoreMap(read: GoogleKeywordQualityRead): QualityScoreMapModel {
  const buckets: QsBucket[] = Array.from({ length: 10 }, (_, index) => ({
    score: index + 1,
    keywords: 0,
    spend: 0,
    band: qsBand(index + 1),
  }));
  const unscored = { keywords: 0, spend: 0 };
  let wasteKeywords = 0;
  let wasteSpend = 0;
  let wasteUnknown = false;
  for (const keyword of read.keywords) {
    const bucket = keyword.quality_score === null ? unscored : buckets[keyword.quality_score - 1];
    if (bucket) {
      bucket.keywords += 1;
      bucket.spend += keyword.metrics.spend;
    }
    const waste = isWaste(keyword);
    if (waste === null) wasteUnknown = true;
    if (waste) {
      wasteKeywords += 1;
      wasteSpend += keyword.metrics.spend;
    }
  }
  const rows = [...read.keywords]
    .sort((a, b) => b.metrics.spend - a.metrics.spend)
    .slice(0, QS_ROWS_SHOWN)
    .map(
      (keyword): QsRow => ({
        id: `${keyword.criterion_id}:${keyword.ad_group}`,
        keyword: keyword.keyword,
        matchType: keyword.match_type.toLowerCase(),
        where: `${keyword.campaign} · ${keyword.ad_group}`,
        score:
          keyword.quality_score === null
            ? missing(NOT_SCORED)
            : shown(String(keyword.quality_score)),
        expectedCtr: componentCell(keyword.expected_ctr),
        adRelevance: componentCell(keyword.ad_relevance),
        landingPage: componentCell(keyword.landing_page_experience),
        spend: keyword.metrics.spend,
        conversions:
          keyword.metrics.conversions === null
            ? missing(CONVERSIONS_NOT_COUNTED)
            : shown(resultsText(keyword.metrics.conversions)),
        waste: isWaste(keyword) === true,
      }),
    );
  return {
    buckets,
    unscored,
    waste: wasteUnknown ? null : { keywords: wasteKeywords, spend: wasteSpend },
    average:
      read.average_quality_score === null
        ? missing('No keyword has a Quality Score yet')
        : shown(read.average_quality_score.toFixed(1)),
    scored: read.scored_keywords,
    total: read.total_keywords,
    rows,
    hiddenRows: Math.max(0, read.keywords.length - rows.length),
  };
}
