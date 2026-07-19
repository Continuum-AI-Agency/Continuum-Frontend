// Joins the ads of ONE ad set to the brand-wide creative report's verdicts, so a
// budget move on that ad set can be read next to the kill/scale/iterate call on
// the creatives carrying it.
//
// The report is brand-wide and independently gated (evidence floors, labeling
// coverage), so partial coverage is the normal case rather than an error. The
// coverage summary exists to say that out loud: an ad set whose ads carry no
// verdict must read as "not covered", never as an empty box that implies
// "nothing wrong".
//
// Verdicts are never recomputed or re-scored here — the assembler owns the
// rules. The only editorial act is flagging a verdict whose own flags say its
// cohort was too thin to read as confidence, so the UI can de-emphasise it.

import type { AdsetAd, PaidCreativeVerdict } from '@continuum/contracts';

export type AdsetCreativeVerdictRow = {
  ad: AdsetAd;
  verdict: PaidCreativeVerdict | null;
  /** The verdict's own cohort was too thin to read as confidence. */
  thinEvidence: boolean;
};

export const hasThinVerdictEvidence = (verdict: PaidCreativeVerdict): boolean =>
  verdict.flags.includes('low_evidence');

/**
 * One row per ad in the ad set, in the ad set's own order. Verdicts for ads that
 * are not in this ad set are dropped — the join key is the ad id, so a
 * brand-wide report never leaks another ad set's calls into this list.
 */
export function joinAdsetCreativeRows({
  ads,
  verdicts,
}: {
  ads: readonly AdsetAd[];
  verdicts: readonly PaidCreativeVerdict[];
}): AdsetCreativeVerdictRow[] {
  const verdictByAdId = new Map(verdicts.map((verdict) => [verdict.adId, verdict]));
  return ads.map((ad) => {
    const verdict = verdictByAdId.get(ad.id) ?? null;
    return { ad, verdict, thinEvidence: verdict ? hasThinVerdictEvidence(verdict) : false };
  });
}

export type AdsetVerdictCoverage =
  | { kind: 'no_report' }
  | { kind: 'none_covered'; total: number }
  | { kind: 'partial'; covered: number; total: number }
  | { kind: 'full'; total: number };

/**
 * How much of this ad set the creative report actually speaks to. `hasReport` is
 * false whenever the report has not been assembled for the brand yet, which is a
 * different statement from "these ads were assessed and nothing was found".
 */
export function summarizeVerdictCoverage({
  rows,
  hasReport,
}: {
  rows: readonly AdsetCreativeVerdictRow[];
  hasReport: boolean;
}): AdsetVerdictCoverage {
  if (!hasReport) return { kind: 'no_report' };
  const total = rows.length;
  const covered = rows.filter((row) => row.verdict !== null).length;
  if (covered === 0) return { kind: 'none_covered', total };
  if (covered < total) return { kind: 'partial', covered, total };
  return { kind: 'full', total };
}

/**
 * The plain-language disclosure for a coverage state. `full` returns null — a
 * fully covered ad set needs no caveat, the rows speak for themselves.
 */
export function verdictCoverageNotice(coverage: AdsetVerdictCoverage): string | null {
  switch (coverage.kind) {
    case 'no_report':
      return 'No creative report for this brand yet, so none of these ads has a verdict.';
    case 'none_covered':
      return 'The current creative report covers none of these ads, so there is no verdict either way.';
    case 'partial':
      return `${coverage.total - coverage.covered} of ${coverage.total} ads are not covered by the current creative report.`;
    case 'full':
      return null;
  }
}
