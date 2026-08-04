import { describe, expect, it } from 'bun:test';

import {
  COPY_ROLES,
  copyItemSchema,
  copyPlanSchema,
  creativeConstraintSchema,
  creativeReferenceSchema,
  FACTUAL_COPY_ROLES,
  isYieldable,
  REFERENCE_ROLES,
  requiresOcrGate,
} from './references';

const asset = {
  assetId: '3f9d1a4e-6c2b-4a11-9d3e-5b7c8a0f1e22',
  versionId: 'a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d',
};

const reference = {
  asset,
  role: 'borrow-composition' as const,
  strength: 'preferred' as const,
  focus: null,
  rightsNote: null,
};

const copyItem = {
  role: 'headline' as const,
  text: 'A cleaner cup from the gear you already own',
  exact: false,
  case: 'as-written' as const,
  fixedLineBreaks: false,
  styleNote: null,
};

describe('creativeReferenceSchema', () => {
  it('accepts a borrowing role with no rights note', () => {
    expect(creativeReferenceSchema.parse(reference).role).toBe('borrow-composition');
  });

  it('refuses a person-identity reference with no recorded rights basis', () => {
    expect(() =>
      creativeReferenceSchema.parse({ ...reference, role: 'preserve-person-identity' }),
    ).toThrow();

    const withRights = creativeReferenceSchema.parse({
      ...reference,
      role: 'preserve-person-identity',
      rightsNote: 'Model release on file, signed 2026-04-02, unlimited paid social.',
    });
    expect(withRights.rightsNote).toBeTruthy();
  });

  it('rejects a transport URL smuggled in beside the durable ref', () => {
    expect(() =>
      creativeReferenceSchema.parse({ ...reference, signedUrl: 'https://example.test/x.png' }),
    ).toThrow();
  });

  it('keeps every role addressable rather than collapsing to a boolean', () => {
    expect(REFERENCE_ROLES).toContain('avoid-resembling');
    expect(REFERENCE_ROLES).toContain('use-logo-exactly');
  });
});

describe('creativeConstraintSchema', () => {
  it('lets only a non-privileged avoid yield', () => {
    const brandProhibition = creativeConstraintSchema.parse({
      force: 'avoid',
      origin: 'brand-prohibition',
      statement: 'No visible gradient behind the wordmark',
      sourceId: 'brand-rule-14',
      sourceVersion: 3,
    });
    expect(isYieldable(brandProhibition)).toBe(false);

    const presetPreference = creativeConstraintSchema.parse({
      force: 'avoid',
      origin: 'preset-law',
      statement: 'No more than one prop in the negative space',
      sourceId: null,
      sourceVersion: null,
    });
    expect(isYieldable(presetPreference)).toBe(true);
  });

  it('never yields a must, whatever its origin', () => {
    const userMust = creativeConstraintSchema.parse({
      force: 'must',
      origin: 'user-correction',
      statement: 'The cap stays matte black',
      sourceId: null,
      sourceVersion: null,
    });
    expect(isYieldable(userMust)).toBe(false);
  });
});

describe('copyItemSchema', () => {
  it('forces exact on every factual role', () => {
    for (const role of FACTUAL_COPY_ROLES) {
      expect(() => copyItemSchema.parse({ ...copyItem, role, exact: false })).toThrow();
      expect(copyItemSchema.parse({ ...copyItem, role, exact: true }).exact).toBe(true);
    }
  });

  it('leaves the interpretive roles free to be inexact', () => {
    const interpretive = COPY_ROLES.filter((role) => !FACTUAL_COPY_ROLES.includes(role));
    expect(interpretive.length).toBeGreaterThan(0);
    for (const role of interpretive) {
      expect(copyItemSchema.parse({ ...copyItem, role, exact: false }).exact).toBe(false);
    }
  });

  it('measures the copy itself in code points', () => {
    const text = '🎉'.repeat(600);
    expect(text.length).toBe(1_200);
    expect(copyItemSchema.parse({ ...copyItem, text }).text).toBe(text);
    expect(() => copyItemSchema.parse({ ...copyItem, text: '🎉'.repeat(601) })).toThrow();
  });
});

describe('copyPlanSchema', () => {
  it('refuses a no-copy plan carrying words', () => {
    expect(() =>
      copyPlanSchema.parse({
        strategy: 'no-copy',
        items: [copyItem],
        allowAdditionalText: false,
        typeRegisters: null,
      }),
    ).toThrow();
  });

  it('refuses a copy strategy that carries no words', () => {
    expect(() =>
      copyPlanSchema.parse({
        strategy: 'model-rendered',
        items: [],
        allowAdditionalText: false,
        typeRegisters: null,
      }),
    ).toThrow();
  });

  it('raises the OCR gate only when a guarantee was made', () => {
    const inexact = copyPlanSchema.parse({
      strategy: 'model-rendered',
      items: [copyItem],
      allowAdditionalText: false,
      typeRegisters: 2,
    });
    expect(requiresOcrGate(inexact)).toBe(false);

    const exact = copyPlanSchema.parse({
      strategy: 'generate-then-compose',
      items: [{ ...copyItem, role: 'price', exact: true, text: '$49.00' }],
      allowAdditionalText: false,
      typeRegisters: 2,
    });
    expect(requiresOcrGate(exact)).toBe(true);
  });
});
