import { describe, expect, it } from 'bun:test';

import type { BrandBookResponse, ReadinessAnalysis } from '@continuum/contracts';

import { extractReadiness, selectReadinessSummary } from './readinessSummary';

const readiness: ReadinessAnalysis = {
  overall_score: 78,
  dimensions: {
    value_proposition: { score: 60, rationale: 'x' },
    icp_clarity: { score: 60, rationale: 'x' },
    customer_pains: { score: 60, rationale: 'x' },
    success_metrics: { score: 60, rationale: 'x' },
    positioning: { score: 60, rationale: 'x' },
    messaging_coherence: { score: 60, rationale: 'x' },
    brand_identity: { score: 60, rationale: 'x' },
  },
  findings: [
    {
      dimension: 'icp_clarity',
      score: 20,
      severity: 'high',
      headline: 'ICP is vague',
      detail: 'No named segment',
      recommendation: 'Name the primary buyer',
    },
  ],
  generated_at: '2026-07-02T00:00:00.000Z',
};

function book(overrides: Partial<BrandBookResponse>): BrandBookResponse {
  return {
    brand_id: 'b1',
    status: 'ready',
    present: true,
    refreshed_at: null,
    stale: false,
    assembled: null,
    composite: null,
    summary_markdown: null,
    brand_md: null,
    brand_tokens: null,
    brand_md_is_edited: false,
    documents: [],
    ...overrides,
  } as BrandBookResponse;
}

describe('extractReadiness', () => {
  it('returns null for a null book', () => {
    expect(extractReadiness(null)).toBeNull();
  });

  it('reads readiness from the assembled report layer', () => {
    const b = book({
      assembled: {
        onboarding: null,
        guidelines: [],
        documents: [],
        report: {
          composite: null,
          readiness,
          brand_md: null,
          brand_tokens: null,
          brand_md_is_edited: false,
        },
      },
    });
    expect(extractReadiness(b)?.overall_score).toBe(78);
  });

  it('falls back to the top-level composite for back-compat books', () => {
    const b = book({
      composite: { readiness } as BrandBookResponse['composite'],
    });
    expect(extractReadiness(b)?.overall_score).toBe(78);
  });
});

describe('selectReadinessSummary', () => {
  it('projects the compact summary from the Brand Book read path', () => {
    const b = book({
      assembled: {
        onboarding: null,
        guidelines: [],
        documents: [],
        report: {
          composite: null,
          readiness,
          brand_md: null,
          brand_tokens: null,
          brand_md_is_edited: false,
        },
      },
    });
    expect(selectReadinessSummary(b)).toEqual({
      score: 78,
      band: 'ready',
      top_blocker: 'ICP is vague',
      next_action: 'Name the primary buyer',
    });
  });

  it('returns a not_started summary when the book has no readiness', () => {
    expect(selectReadinessSummary(book({}))).toEqual({
      score: 0,
      band: 'not_started',
      top_blocker: null,
      next_action: null,
    });
  });
});
