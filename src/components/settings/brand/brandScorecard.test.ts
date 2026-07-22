import { describe, expect, it } from 'bun:test';
import { type BrandReportResult, brandReportResultSchema } from '@continuum/contracts';

// Tests for scorecard derivation logic. BrandScorecard renders from
// result.readiness — we verify the data contracts here so the component can
// trust the shape it receives.

const READINESS_FULL = {
  overall_score: 78,
  dimensions: {
    value_proposition: { score: 82, rationale: 'Sharp.' },
    icp_clarity: { score: 80, rationale: 'Named buyer.' },
    customer_pains: { score: 70, rationale: 'Implied.' },
    success_metrics: { score: 65, rationale: 'No KPI.' },
    positioning: { score: 85, rationale: 'Clear.' },
    messaging_coherence: { score: 79, rationale: 'Aligned.' },
    brand_identity: { score: 72, rationale: 'Palette set.' },
  },
  findings: [],
  generated_at: '2026-06-22T00:00:00Z',
};

function buildResult(overrides?: Partial<BrandReportResult>): BrandReportResult {
  return brandReportResultSchema.parse({
    brand_profile: { id: 'sc-test', brand_name: 'Scorey', website_url: 'https://scorey.test' },
    structured: {
      connected_accounts: [],
      website: { website_url: 'https://scorey.test', palette: null, typography: null },
      documents: {},
      target_audience: { summary: 'Test audience.' },
      business: null,
      strategy: null,
      guidelines: null,
    },
    understanding: {
      positioning_thesis: 'Scorey scores things.',
      hypothesis_icp: 'Marketers',
      brand_pillars: ['quality'],
      tonal_signal: 'confident',
      notable_evidence: [],
    },
    audits: { strategy: { score: 74, severity: 'medium', findings: [] } },
    readiness: READINESS_FULL,
    ...overrides,
  });
}

describe('BrandScorecard data derivation', () => {
  it('parses a result with full readiness without error', () => {
    const result = buildResult();
    expect(result.readiness?.overall_score).toBe(78);
  });

  it('exposes all seven readiness dimensions', () => {
    const result = buildResult();
    const keys = Object.keys(result.readiness?.dimensions ?? {});
    expect(keys).toHaveLength(7);
  });

  it('exposes strategy audit score', () => {
    const result = buildResult();
    expect(result.audits?.strategy?.score).toBe(74);
  });

  it('returns null readiness when omitted (BrandScorecard returns null)', () => {
    const result = buildResult({ readiness: undefined });
    // The schema defaults readiness to null when not provided.
    expect(result.readiness == null).toBe(true);
  });

  it("scores above 75 map to 'green' bucket", () => {
    // This is the scoreBadgeColor logic inlined so we can test it without a DOM.
    const scoreBadgeColor = (score: number) => {
      if (score >= 75) return 'green';
      if (score >= 50) return 'yellow';
      if (score >= 1) return 'red';
      return 'gray';
    };
    expect(scoreBadgeColor(78)).toBe('green');
    expect(scoreBadgeColor(75)).toBe('green');
    expect(scoreBadgeColor(74)).toBe('yellow');
    expect(scoreBadgeColor(50)).toBe('yellow');
    expect(scoreBadgeColor(49)).toBe('red');
    expect(scoreBadgeColor(1)).toBe('red');
    expect(scoreBadgeColor(0)).toBe('gray');
  });
});
