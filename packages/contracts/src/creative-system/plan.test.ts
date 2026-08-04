import { describe, expect, it } from 'bun:test';

import {
  candidateReceiptSchema,
  compiledCreativePlanSchema,
  hardCheckSchema,
  isServerRunnable,
  PLAN_KINDS,
  type PlanStep,
  qualificationManifestSchema,
  realismHardChecks,
} from './plan';
import {
  ALWAYS_FORBIDDEN_SIGNATURES,
  POLISH_LEVEL_OBSERVABLE,
  type PolishDirection,
  REALISM_DEVICE_PROFILE,
} from './vocabulary';

const providerStep: PlanStep = {
  index: 1,
  executor: 'provider',
  operation: 'generate-image',
  prompt: 'A ceramic pour-over cone mid-brew on a scarred oak counter.',
  negativePrompt: null,
  referenceOrder: [],
  consumesStep: null,
};

const compositorStep: PlanStep = {
  index: 2,
  executor: 'server-compositor',
  operation: 'render-typography',
  prompt: null,
  negativePrompt: null,
  referenceOrder: [],
  consumesStep: 1,
};

const basePlan = {
  kind: 'single-generation' as const,
  steps: [providerStep],
  copyStrategy: 'no-copy' as const,
  candidateCount: 5,
  providerId: 'vertex',
  modelId: 'gemini-3-pro-image',
  profileVersion: 1,
  degradations: [],
};

/** One valid plan per discriminator, so no kind can be added without a shape. */
const plansByKind = {
  'single-generation': basePlan,
  'generate-then-edit': {
    ...basePlan,
    kind: 'generate-then-edit' as const,
    steps: [providerStep, { ...providerStep, index: 2, operation: 'edit-image', consumesStep: 1 }],
  },
  'generate-then-compose': {
    ...basePlan,
    kind: 'generate-then-compose' as const,
    copyStrategy: 'generate-then-compose' as const,
    steps: [providerStep, compositorStep],
  },
  'deterministic-composition': {
    ...basePlan,
    kind: 'deterministic-composition' as const,
    copyStrategy: 'deterministic-only' as const,
    steps: [{ ...compositorStep, index: 1, consumesStep: null }],
  },
  storyboard: {
    ...basePlan,
    kind: 'storyboard' as const,
    steps: [providerStep, { ...providerStep, index: 2 }, { ...providerStep, index: 3 }],
  },
} as const;

describe('compiledCreativePlanSchema', () => {
  it('parses every declared plan kind', () => {
    expect(Object.keys(plansByKind).sort()).toEqual([...PLAN_KINDS].sort());
    for (const kind of PLAN_KINDS) {
      expect(compiledCreativePlanSchema.parse(plansByKind[kind]).kind).toBe(kind);
    }
  });

  it('holds a single-generation plan to exactly one step', () => {
    const result = compiledCreativePlanSchema.safeParse({
      ...basePlan,
      steps: [providerStep, { ...providerStep, index: 2 }],
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.some((issue) => issue.message.includes('exactly one step'))).toBe(
        true,
      );
    }
  });

  it('refuses a provider step inside a deterministic composition', () => {
    const result = compiledCreativePlanSchema.safeParse({
      ...plansByKind['deterministic-composition'],
      steps: [
        { ...compositorStep, index: 1, consumesStep: null },
        { ...providerStep, index: 2 },
      ],
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(
        result.error.issues.some((issue) => issue.message.includes('may not contain a provider')),
      ).toBe(true);
    }
  });

  it('refuses duplicate step indices', () => {
    expect(
      compiledCreativePlanSchema.safeParse({
        ...plansByKind.storyboard,
        steps: [providerStep, providerStep],
      }).success,
    ).toBe(false);
  });

  it('rejects unknown keys', () => {
    expect(compiledCreativePlanSchema.safeParse({ ...basePlan, retries: 2 }).success).toBe(false);
  });
});

describe('isServerRunnable', () => {
  it('is true when every step has a server-side executor', () => {
    expect(isServerRunnable(compiledCreativePlanSchema.parse(plansByKind.storyboard))).toBe(true);
  });

  it('is false the moment one step needs a browser', () => {
    const plan = compiledCreativePlanSchema.parse({
      ...plansByKind['generate-then-compose'],
      steps: [providerStep, { ...compositorStep, executor: 'browser-only' as const }],
    });
    expect(isServerRunnable(plan)).toBe(false);
  });
});

describe('realismHardChecks', () => {
  const polish: PolishDirection = {
    level: 'documentary-candid',
    devices: ['direct-flash-falloff', 'unstyled-background-clutter'],
    forbidSignatures: ['uniform-creamy-bokeh'],
  };

  it('derives one check per declared device, worded by the profile', () => {
    const checks = realismHardChecks(polish);
    const deviceChecks = checks.filter((check) => check.kind === 'realism-device-present');
    expect(deviceChecks).toHaveLength(2);
    expect(deviceChecks[0]?.expectation).toBe(
      REALISM_DEVICE_PROFILE['direct-flash-falloff'].evaluatorCue,
    );
    expect(deviceChecks[1]?.expectation).toBe(
      REALISM_DEVICE_PROFILE['unstyled-background-clutter'].evaluatorCue,
    );
  });

  it('carries the polish level as the observable a judge can score', () => {
    const levelCheck = realismHardChecks(polish).find(
      (check) => check.kind === 'polish-level-match',
    );
    expect(levelCheck?.expectation).toBe(POLISH_LEVEL_OBSERVABLE['documentary-candid']);
  });

  it('always screens the baseline signatures on top of the declared ones', () => {
    const slopCheck = realismHardChecks(polish).find(
      (check) => check.kind === 'slop-signature-absent',
    );
    expect(slopCheck?.signatures).toContain('uniform-creamy-bokeh');
    for (const signature of ALWAYS_FORBIDDEN_SIGNATURES) {
      expect(slopCheck?.signatures).toContain(signature);
    }
  });

  it('keeps the baseline even when the direction forbids nothing extra', () => {
    const checks = realismHardChecks({
      level: 'campaign-polished',
      devices: [],
      forbidSignatures: [],
    });
    const slopCheck = checks.find((check) => check.kind === 'slop-signature-absent');
    expect(slopCheck?.signatures).toEqual([...ALWAYS_FORBIDDEN_SIGNATURES]);
    expect(checks.filter((check) => check.kind === 'realism-device-present')).toHaveLength(0);
  });

  it('emits checks the hard-check schema accepts as they stand', () => {
    for (const check of realismHardChecks(polish)) {
      expect(hardCheckSchema.parse(check).kind).toBe(check.kind);
    }
  });
});

describe('candidateReceiptSchema', () => {
  const receipt = {
    candidateIndex: 1,
    asset: {
      assetId: '3f9d1a4e-6c2b-4a11-9d3e-5b7c8a0f1e22',
      versionId: 'a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d',
    },
    outcome: 'near-miss' as const,
    failedChecks: [],
    rubricScore: 0.71,
    selectionRationale: null,
    providerError: null,
  };

  it('keeps a loser without demanding a rationale', () => {
    expect(candidateReceiptSchema.parse(receipt).outcome).toBe('near-miss');
  });

  it('refuses a selected candidate with no stated reason', () => {
    expect(candidateReceiptSchema.safeParse({ ...receipt, outcome: 'selected' }).success).toBe(
      false,
    );

    const selected = candidateReceiptSchema.parse({
      ...receipt,
      outcome: 'selected',
      selectionRationale: 'Only candidate where the steam reads against the dark background.',
    });
    expect(selected.outcome).toBe('selected');
  });
});

describe('qualificationManifestSchema', () => {
  const manifest = {
    presetRef: { id: 'club-night-poster', version: 2 },
    family: 'event-promotion' as const,
    providerId: 'vertex',
    modelId: 'gemini-3-pro-image',
    profileVersion: 1,
    status: 'curated' as const,
    runCount: 40,
    briefCount: 8,
    brandCount: 3,
    passAt1: 0.62,
    successAt5: 0.94,
    hardPassRate: 0.88,
    medianRubricScore: 0.74,
    worstRubricScore: 0.51,
    dispersion: 0.12,
    duplicateRate: 0.05,
    selectionUplift: 0.18,
    freeTextBaselinePassAt1: null,
    receiptIds: ['5c6d7e8f-9a0b-4c1d-8e2f-3a4b5c6d7e8f'],
    qualifiedBy: null,
    qualifiedAt: null,
  };

  it('lets a curated manifest stand without a human or a baseline', () => {
    expect(qualificationManifestSchema.parse(manifest).status).toBe('curated');
  });

  it('refuses to call a preset qualified with no human approver', () => {
    expect(
      qualificationManifestSchema.safeParse({
        ...manifest,
        status: 'qualified',
        freeTextBaselinePassAt1: 0.31,
      }).success,
    ).toBe(false);
  });

  it('refuses to call a preset qualified with no free-text baseline arm', () => {
    expect(
      qualificationManifestSchema.safeParse({
        ...manifest,
        status: 'qualified',
        qualifiedBy: 'duane@continuumai.agency',
      }).success,
    ).toBe(false);
  });

  it('accepts a qualification carrying both', () => {
    const qualified = qualificationManifestSchema.parse({
      ...manifest,
      status: 'qualified',
      qualifiedBy: 'duane@continuumai.agency',
      qualifiedAt: '2026-08-01T09:00:00.000Z',
      freeTextBaselinePassAt1: 0.31,
    });
    expect(qualified.freeTextBaselinePassAt1).toBe(0.31);
  });
});
