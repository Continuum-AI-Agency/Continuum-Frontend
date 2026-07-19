import { describe, expect, it } from 'bun:test';
import type { AdsetAd, PaidCreativeVerdict } from '@continuum/contracts';
import {
  hasThinVerdictEvidence,
  joinAdsetCreativeRows,
  summarizeVerdictCoverage,
  verdictCoverageNotice,
} from './adsetVerdictRows';

const ad = (id: string, name?: string): AdsetAd => ({
  id,
  name: name ?? `Ad ${id}`,
  status: 'ACTIVE',
  thumbnailUrl: null,
});

const verdict = (
  adId: string,
  overrides: Partial<PaidCreativeVerdict> = {},
): PaidCreativeVerdict => ({
  adId,
  adsetId: null,
  campaignId: null,
  adName: `Ad ${adId}`,
  funnelStage: 'unknown',
  verdict: 'scale',
  reason: `${adId} beat the cohort median`,
  flags: [],
  spend: 100,
  cpa: 18.79,
  cpaVsCohortMedian: 0.6,
  window: 'd30',
  optimizerRecommendationId: null,
  thumbnailUrl: null,
  permalinkUrl: null,
  ...overrides,
});

describe('joinAdsetCreativeRows', () => {
  it('attaches each ad its own verdict, keeping the ad set order', () => {
    const rows = joinAdsetCreativeRows({
      ads: [ad('a1'), ad('a2')],
      verdicts: [verdict('a2', { verdict: 'iterate' }), verdict('a1', { verdict: 'scale' })],
    });

    expect(rows.map((row) => row.ad.id)).toEqual(['a1', 'a2']);
    expect(rows[0].verdict?.verdict).toBe('scale');
    expect(rows[1].verdict?.verdict).toBe('iterate');
  });

  it('leaves an ad with no verdict as null rather than dropping the ad', () => {
    const rows = joinAdsetCreativeRows({ ads: [ad('a1'), ad('a2')], verdicts: [verdict('a1')] });

    expect(rows).toHaveLength(2);
    expect(rows[1].ad.id).toBe('a2');
    expect(rows[1].verdict).toBeNull();
    expect(rows[1].thinEvidence).toBe(false);
  });

  it('ignores verdicts for ads that are not in this ad set', () => {
    const rows = joinAdsetCreativeRows({
      ads: [ad('a1')],
      verdicts: [verdict('other-adset-ad', { verdict: 'kill' }), verdict('a1')],
    });

    expect(rows).toHaveLength(1);
    expect(rows[0].verdict?.adId).toBe('a1');
  });

  it('returns no rows for an ad set with no ads, whatever the report holds', () => {
    expect(joinAdsetCreativeRows({ ads: [], verdicts: [verdict('a1')] })).toEqual([]);
  });

  it('returns every ad unverdicted when the report is empty', () => {
    const rows = joinAdsetCreativeRows({ ads: [ad('a1'), ad('a2')], verdicts: [] });

    expect(rows.every((row) => row.verdict === null)).toBe(true);
  });

  it('flags a verdict whose own cohort was too thin to read as confidence', () => {
    const rows = joinAdsetCreativeRows({
      ads: [ad('a1'), ad('a2')],
      verdicts: [
        verdict('a1', { flags: ['low_evidence'] }),
        verdict('a2', { flags: ['spend_concentrated'] }),
      ],
    });

    expect(rows[0].thinEvidence).toBe(true);
    expect(rows[1].thinEvidence).toBe(false);
  });
});

describe('hasThinVerdictEvidence', () => {
  it('reads the assembler low_evidence flag and nothing else', () => {
    expect(hasThinVerdictEvidence(verdict('a1', { flags: ['low_evidence'] }))).toBe(true);
    expect(hasThinVerdictEvidence(verdict('a1', { flags: ['confounded'] }))).toBe(false);
    expect(hasThinVerdictEvidence(verdict('a1'))).toBe(false);
  });
});

describe('summarizeVerdictCoverage', () => {
  const rowsFor = (verdicts: PaidCreativeVerdict[]) =>
    joinAdsetCreativeRows({ ads: [ad('a1'), ad('a2')], verdicts });

  it('reports no_report when the brand has no assembled report', () => {
    expect(summarizeVerdictCoverage({ rows: rowsFor([]), hasReport: false })).toEqual({
      kind: 'no_report',
    });
  });

  it('separates "no report" from "report covers none of these ads"', () => {
    expect(summarizeVerdictCoverage({ rows: rowsFor([]), hasReport: true })).toEqual({
      kind: 'none_covered',
      total: 2,
    });
  });

  it('counts partial coverage', () => {
    expect(summarizeVerdictCoverage({ rows: rowsFor([verdict('a1')]), hasReport: true })).toEqual({
      kind: 'partial',
      covered: 1,
      total: 2,
    });
  });

  it('reports full coverage when every ad carries a verdict', () => {
    expect(
      summarizeVerdictCoverage({
        rows: rowsFor([verdict('a1'), verdict('a2')]),
        hasReport: true,
      }),
    ).toEqual({ kind: 'full', total: 2 });
  });

  it('treats an ad set with no ads as covered-by-nothing rather than partial', () => {
    expect(summarizeVerdictCoverage({ rows: [], hasReport: true })).toEqual({
      kind: 'none_covered',
      total: 0,
    });
  });
});

describe('verdictCoverageNotice', () => {
  it('says plainly that no report exists', () => {
    expect(verdictCoverageNotice({ kind: 'no_report' })).toBe(
      'No creative report for this brand yet, so none of these ads has a verdict.',
    );
  });

  it('says the report covers none of these ads', () => {
    expect(verdictCoverageNotice({ kind: 'none_covered', total: 3 })).toContain('covers none');
  });

  it('counts the uncovered ads on partial coverage', () => {
    expect(verdictCoverageNotice({ kind: 'partial', covered: 1, total: 3 })).toBe(
      '2 of 3 ads are not covered by the current creative report.',
    );
  });

  it('adds no caveat when coverage is complete', () => {
    expect(verdictCoverageNotice({ kind: 'full', total: 2 })).toBeNull();
  });
});
