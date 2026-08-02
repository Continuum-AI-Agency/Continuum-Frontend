import { describe, expect, it } from 'bun:test';

import {
  angleSynthesisContextSchema,
  evidenceCitationSchema,
  proposedConceptSchema,
} from './angleSynthesis';
import { ANGLE_VOCAB_VERSION, GLOBAL_ANGLE_DEFINITIONS, GLOBAL_ANGLE_LABELS } from './angles';

const validConcept = {
  angleId: 'risk_reversal_trial',
  proposedBrandAngleSlug: null,
  slug: 'risk-free-trial',
  label: 'Try the gym on a day pass',
  description: 'Invite non-members to experience the facility before any commitment.',
  groundedOn: ['creative_node:ad_9912'],
  mergeCandidateConceptId: null,
};

describe('proposedConceptSchema', () => {
  it('accepts a valid proposal', () => {
    const parsed = proposedConceptSchema.parse(validConcept);
    expect(parsed.angleId).toBe('risk_reversal_trial');
    expect(parsed.groundedOn).toEqual(['creative_node:ad_9912']);
  });

  it('rejects an off-enum angleId rather than coercing it to unknown', () => {
    const result = proposedConceptSchema.safeParse({
      ...validConcept,
      angleId: 'free_day_pass_energy',
    });
    expect(result.success).toBe(false);
  });

  it('rejects an empty groundedOn — an ungrounded concept is an opinion', () => {
    const result = proposedConceptSchema.safeParse({ ...validConcept, groundedOn: [] });
    expect(result.success).toBe(false);
  });

  it('carries zero numeric fields', () => {
    const parsed = proposedConceptSchema.parse(validConcept) as Record<string, unknown>;
    for (const value of Object.values(parsed)) {
      expect(typeof value).not.toBe('number');
    }
  });

  it('strips numbers an over-eager worker tries to smuggle in', () => {
    const parsed = proposedConceptSchema.parse({
      ...validConcept,
      confidence: 0.91,
      estimatedRoas: 3.4,
    }) as Record<string, unknown>;
    expect(parsed.confidence).toBeUndefined();
    expect(parsed.estimatedRoas).toBeUndefined();
  });
});

describe('proposedConceptSchema slug regex', () => {
  const slugOk = (slug: string) =>
    proposedConceptSchema.safeParse({ ...validConcept, slug }).success;

  it('accepts a normal kebab-case slug', () => {
    expect(slugOk('risk-free-trial')).toBe(true);
  });

  it('rejects an uppercase single character', () => {
    expect(slugOk('A')).toBe(false);
  });

  it('rejects a two-character slug', () => {
    expect(slugOk('ab')).toBe(false);
  });

  it('rejects a leading hyphen', () => {
    expect(slugOk('-lead')).toBe(false);
  });

  it('rejects a 60-character slug', () => {
    expect(slugOk('a'.repeat(60))).toBe(false);
  });
});

describe('evidenceCitationSchema', () => {
  it('parses a citation with both timestamps', () => {
    const parsed = evidenceCitationSchema.parse({
      kind: 'winrate_row',
      nodeId: 'winrate:hook_archetype:social_proof',
      claim: 'Social-proof hooks win 62% of their ad sets.',
      observedAt: '2026-07-20T00:00:00.000Z',
      asOf: '2026-07-29T00:00:00.000Z',
    });
    expect(parsed.kind).toBe('winrate_row');
  });

  it('rejects an unknown citation kind', () => {
    const result = evidenceCitationSchema.safeParse({
      kind: 'vibes',
      nodeId: 'n1',
      claim: 'c',
      observedAt: '2026-07-20T00:00:00.000Z',
      asOf: '2026-07-29T00:00:00.000Z',
    });
    expect(result.success).toBe(false);
  });
});

describe('angleSynthesisContextSchema', () => {
  const context = {
    brandId: 'brand_1',
    vocabVersion: ANGLE_VOCAB_VERSION,
    allowedAngles: [
      {
        angleId: 'risk_reversal_trial',
        label: GLOBAL_ANGLE_LABELS.risk_reversal_trial,
        definition: GLOBAL_ANGLE_DEFINITIONS.risk_reversal_trial,
      },
    ],
    existingConcepts: [],
    evidence: {
      performance: [],
      analytics: [],
      audiences: [],
      catalog: [],
      creatives: [],
    },
  };

  it('parses a minimal context', () => {
    const parsed = angleSynthesisContextSchema.parse(context);
    expect(parsed.allowedAngles[0]?.angleId).toBe('risk_reversal_trial');
  });

  it('pins vocabVersion so a stale vocabulary cannot be replayed silently', () => {
    const result = angleSynthesisContextSchema.safeParse({
      ...context,
      vocabVersion: ANGLE_VOCAB_VERSION + 1,
    });
    expect(result.success).toBe(false);
  });

  it('rejects an allowedAngles entry outside the closed vocabulary', () => {
    const result = angleSynthesisContextSchema.safeParse({
      ...context,
      allowedAngles: [{ angleId: 'made_up_angle', label: 'Made up', definition: 'Invented.' }],
    });
    expect(result.success).toBe(false);
  });
});
