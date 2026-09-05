import { describe, expect, test } from 'bun:test';
import { ANGLE_VOCAB_VERSION } from './angles';
import {
  type AngleSynthesisContext,
  type ProposedConcept,
  proposalBudget,
  reviewProposedConcepts,
} from './angleSynthesis';

const citation = (nodeId: string) => ({
  kind: 'creative_node' as const,
  nodeId,
  claim: 'observed',
  observedAt: '2026-09-01T00:00:00Z',
  asOf: '2026-09-05T00:00:00Z',
});

const context = (creativeIds: string[]): AngleSynthesisContext => ({
  brandId: 'brand-1',
  vocabVersion: ANGLE_VOCAB_VERSION,
  allowedAngles: [
    { angleId: 'risk_reversal_trial', label: 'Trial', definition: 'd' },
    { angleId: 'offer_discount', label: 'Discount', definition: 'd' },
  ],
  existingConcepts: [
    { conceptId: 'c-1', slug: 'existing', label: 'Existing', angleId: 'offer_discount', status: 'live' },
  ],
  evidence: {
    performance: [],
    analytics: [],
    audiences: [],
    catalog: [],
    creatives: creativeIds.map(citation),
  },
});

const concept = (over: Partial<ProposedConcept> = {}): ProposedConcept => ({
  angleId: 'risk_reversal_trial',
  proposedBrandAngleSlug: null,
  slug: 'trial-first-week',
  label: 'Trial the first week',
  description: 'Lead with the trial.',
  groundedOn: ['creative-a'],
  mergeCandidateConceptId: null,
  ...over,
});

describe('the evidence floor decides how many angles are supportable', () => {
  test('one creative cannot support a spread of distinguished angles', () => {
    const budget = proposalBudget(context(['creative-a']));
    expect(budget.max).toBe(1);
    expect(budget.reason).toMatch(/no comparison/i);
  });

  test('no creative evidence supports nothing', () => {
    expect(proposalBudget(context([])).max).toBe(1);
  });

  test('plenty of creatives opens the full 3-5 range', () => {
    const budget = proposalBudget(context(['a', 'b', 'c', 'd', 'e', 'f']));
    expect(budget.min).toBe(3);
    expect(budget.max).toBe(5);
  });

  test('three creatives caps at three, not five', () => {
    expect(proposalBudget(context(['a', 'b', 'c'])).max).toBe(3);
  });
});

describe('a proposal is judged against what the worker was actually given', () => {
  const ctx = context(['creative-a', 'creative-b']);

  test('an on-list, properly cited concept is accepted', () => {
    const { accepted, rejected } = reviewProposedConcepts(ctx, [concept()]);
    expect(accepted).toHaveLength(1);
    expect(rejected).toHaveLength(0);
  });

  // A coerce here would launder a hallucinated strategy into the store as a real row.
  test('an off-vocabulary angle is REJECTED, never coerced', () => {
    const { accepted, rejected } = reviewProposedConcepts(ctx, [
      concept({ angleId: 'social_proof_peer' }),
    ]);
    expect(accepted).toHaveLength(0);
    expect(rejected[0].reason).toMatch(/not in this portfolio's allowed list/);
  });

  // An invented citation is worse than none: it reads as checked.
  test('a concept citing evidence it was never given is rejected', () => {
    const { rejected } = reviewProposedConcepts(ctx, [
      concept({ groundedOn: ['creative-a', 'creative-invented'] }),
    ]);
    expect(rejected[0].reason).toMatch(/never given: creative-invented/);
  });

  test('a merge target that does not exist is rejected', () => {
    const { rejected } = reviewProposedConcepts(ctx, [
      concept({ mergeCandidateConceptId: 'c-999' }),
    ]);
    expect(rejected[0].reason).toMatch(/not an existing concept/);
  });

  test('one bad concept does not discard the good ones', () => {
    const { accepted, rejected } = reviewProposedConcepts(ctx, [
      concept(),
      concept({ angleId: 'authority_expert', slug: 'bad-one' }),
      concept({ angleId: 'offer_discount', slug: 'discount-led', groundedOn: ['creative-b'] }),
    ]);
    expect(accepted).toHaveLength(2);
    expect(rejected).toHaveLength(1);
  });
});
