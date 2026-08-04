import { describe, expect, it } from 'bun:test';

import { CONTENT_FAMILIES, type ContentFamily } from '../creative-system/families';
import {
  BRAND_DIRECTION_PIECES,
  type BrandDirectionDocument,
  type BrandDirectionExample,
  type BrandDirectionPiece,
  type BrandDirectionRule,
  type BrandDirectionRuleInput,
  brandDirectionDocumentSchema,
  brandDirectionExampleSchema,
  brandDirectionRuleSchema,
  computeDirectionChecksum,
  violatesPolishFloor,
} from './brand-direction';
import { brandDirectionConflictFixtures } from './brand-direction.fixtures';
import {
  admitsPiece,
  admitsProhibitionCategory,
  BRAND_DIRECTION_DEFAULT_BUDGET,
  type BrandDirectionBudget,
  type BrandDirectionFamilyCard,
  type BrandDirectionPlanContext,
  PLAN_GATED_PIECES,
  planCarriesIdentityReference,
  renderRuleForBudget,
  resolveBrandDirection,
  resolvePlanAdmittedPieces,
} from './brand-direction-resolve';
import { type BrandMdTokens, brandMdTokensSchema } from './brand-md';

const BRAND_ID = '5c1b6a10-8f2d-4d31-9d0a-6f0e2f0a1b2c';
const APPROVER = '9f1c2d3e-4a5b-4c6d-8e9f-0a1b2c3d4e5f';
const ASSET = '11111111-2222-4333-8444-555555555555';
const VERSION = '66666666-7777-4888-8999-aaaaaaaaaaaa';
const T0 = '2026-07-01T10:00:00.000Z';
const NOW = '2026-08-01T00:00:00.000Z';

const NO_PIECES: BrandDirectionFamilyCard = { requiredBrandBookPieces: [] };

const plan = (overrides: Partial<BrandDirectionPlanContext> = {}): BrandDirectionPlanContext => ({
  mediaKind: 'still',
  channels: [],
  mechanism: null,
  textStrategy: 'none',
  referenceRoles: [],
  involvesProduct: false,
  involvesPeople: false,
  involvesLogo: false,
  medium: 'photographic',
  aspect: null,
  ...overrides,
});

type Envelope = Partial<Omit<BrandDirectionRuleInput, 'piece' | 'value'>>;

const envelope = (id: string, overrides: Envelope = {}) => ({
  id,
  applicability: {
    families: 'all' as const,
    excludedFamilies: [],
    mediaKinds: ['still' as const, 'motion' as const, 'sequence' as const],
    channels: [],
  },
  strength: 'hard' as const,
  provenance: 'approved-by-user' as const,
  confidence: 1,
  approvalState: 'approved' as const,
  sourceVersion: { kind: 'manual' as const, ref: 'test', versionId: null, capturedAt: T0 },
  observability: 'deterministic' as const,
  rationale: null,
  supersedes: [],
  createdAt: T0,
  updatedAt: T0,
  approvedBy: APPROVER,
  approvedAt: T0,
  lastAppliedAt: null,
  ...overrides,
});

const thesis = (statement: string) => ({
  statement,
  businessLink: null,
  visualConsequences: [],
  notThis: [],
});

const thesisRule = (id: string, statement: string, overrides: Envelope = {}): BrandDirectionRule =>
  brandDirectionRuleSchema.parse({
    ...envelope(id, overrides),
    piece: 'visual-thesis',
    value: thesis(statement),
  });

const photographyValue = (polishFloor: 'raw-amateur' | 'studio-clean' | 'campaign-polished') => ({
  subjectMatter: [],
  pointOfView: 'observer' as const,
  castingSummary: null,
  cameraDistance: 'close' as const,
  lensCharacter: 'telephoto-compression' as const,
  angleTendency: 'three-quarter' as const,
  lightingLogic: {
    key: 'soft' as const,
    direction: 'top-left-45',
    shadowBehaviour: 'controlled-falloff',
    note: null,
  },
  realismMode: 'constructed-studio' as const,
  movementGesture: 'still' as const,
  environment: [],
  props: { allowed: [], forbidden: [] },
  postProcessing: {
    grain: 'none' as const,
    halation: false,
    colourGrade: null,
    retouchPolicy: 'standard-commercial' as const,
  },
  polishFloor,
  productDepictionRequiresReference: true,
  identityPreservation: 'strict' as const,
});

const prohibitionValue = (
  observableFailure: string,
  category: 'colour' | 'people' | 'product' | 'logo' | 'motion' | 'composition',
) => ({
  observableFailure,
  category,
  detector: 'palette-histogram' as const,
  detectorConfig: null,
  severity: 'reject' as const,
  exampleRefs: [],
  replacementGuidance: null,
});

const prohibitionRule = (
  id: string,
  observableFailure: string,
  category: Parameters<typeof prohibitionValue>[1],
  overrides: Envelope = {},
): BrandDirectionRule =>
  brandDirectionRuleSchema.parse({
    ...envelope(id, overrides),
    piece: 'prohibition',
    value: prohibitionValue(observableFailure, category),
  });

const integrationValue = (overrides: Record<string, unknown> = {}) => ({
  logoRenderPolicy: 'composited-from-asset-only' as const,
  logoAssetRef: { assetId: ASSET, versionId: VERSION },
  placementLaws: [{ zone: 'bottom-right' as const, priority: 1 }],
  clearSpace: { unit: 'logo-height' as const, multiple: 1 },
  minimumSize: { unit: 'percent-of-shortest-edge' as const, value: 6, contextNote: null },
  maxOccurrences: 1,
  forbiddenTreatments: ['stretch' as const],
  coBrandingRules: {
    allowed: false,
    lockupOrder: 'brand-first' as const,
    separatorRule: null,
    partnerMinClearSpace: null,
  },
  productRenderPolicy: 'model-may-render-from-reference' as const,
  productAssetRefs: [],
  packagingTextPolicy: 'no-legible-text' as const,
  signatureMarkBehaviour: { markId: null, whenRequired: 'never' as const, frequency: 0 },
  integrationMechanism: 'foreground-lockup' as const,
  verificationHooks: ['logo-pixel-diff' as const, 'occurrence-count' as const],
  ...overrides,
});

const documentOf = (
  rules: BrandDirectionRule[],
  examples: BrandDirectionExample[] = [],
): BrandDirectionDocument =>
  brandDirectionDocumentSchema.parse({
    schemaVersion: 2,
    brandId: BRAND_ID,
    version: 7,
    checksum: computeDirectionChecksum(rules, examples),
    rules,
    examples,
    updatedAt: T0,
  });

const resolve = (args: {
  pieces?: readonly BrandDirectionPiece[];
  rules?: BrandDirectionRule[];
  examples?: BrandDirectionExample[];
  /** `null` is a VALUE here, not "unset" — see the unknown-family suite. */
  family?: ContentFamily | null;
  plan?: BrandDirectionPlanContext;
  tokens?: BrandMdTokens | null;
  familyCard?: BrandDirectionFamilyCard;
  budget?: BrandDirectionBudget;
}) =>
  resolveBrandDirection({
    brandId: BRAND_ID,
    family: args.family === undefined ? 'product-still-life' : args.family,
    plan: args.plan ?? plan({ involvesProduct: true, involvesLogo: true }),
    document: args.rules === undefined ? null : documentOf(args.rules, args.examples ?? []),
    tokens: args.tokens ?? null,
    familyCard: args.familyCard ?? NO_PIECES,
    budget: args.budget,
    pieces: args.pieces,
    now: NOW,
  });

/* -------------------------------------------------------------------------- */
/*  F5 — the piece-gating matrix                                               */
/* -------------------------------------------------------------------------- */

/** One canonical plan per family, so the admitted-piece matrix is a fixed golden set. */
const CANONICAL_PLANS: Record<ContentFamily, BrandDirectionPlanContext> = {
  'campaign-key-visual': plan({
    medium: 'mixed',
    textStrategy: 'reserved-overlay',
    involvesProduct: true,
    involvesLogo: true,
  }),
  'product-still-life': plan({
    medium: 'photographic',
    involvesProduct: true,
    involvesLogo: true,
  }),
  'editorial-illustration': plan({ medium: 'illustrated' }),
  'creator-ugc': plan({ medium: 'photographic', involvesPeople: true, involvesProduct: true }),
  'carousel-infographic': plan({ medium: 'illustrated', textStrategy: 'direct-exact-text' }),
  'typography-led': plan({
    medium: 'typographic',
    textStrategy: 'typography-as-image',
    involvesLogo: true,
  }),
  packaging: plan({
    medium: 'photographic',
    textStrategy: 'direct-exact-text',
    involvesProduct: true,
    involvesLogo: true,
  }),
  'event-promotion': plan({ medium: 'typographic', textStrategy: 'direct-exact-text' }),
  'portrait-character': plan({ medium: 'photographic', involvesPeople: true }),
  'motion-storyboard': plan({ mediaKind: 'sequence', medium: 'photographic' }),
  'icon-illustration-system': plan({ medium: 'illustrated' }),
  'pattern-texture': plan({ medium: 'illustrated' }),
  'spatial-environment': plan({ medium: 'photographic' }),
  'brand-identity-exploration': plan({
    medium: 'typographic',
    textStrategy: 'typography-as-image',
    involvesLogo: true,
  }),
  'short-form-explainer': plan({
    mediaKind: 'motion',
    medium: 'mixed',
    textStrategy: 'reserved-overlay',
    involvesPeople: true,
  }),
};

describe('F5 piece gating', () => {
  it('gates every plan-gated piece and leaves brand-signature to its own frequency rule', () => {
    expect([...PLAN_GATED_PIECES].sort()).toEqual(
      BRAND_DIRECTION_PIECES.filter(
        (piece) => piece !== 'brand-signature' && piece !== 'unclassified-direction',
      )
        .slice()
        .sort(),
    );
  });

  it('admits a different, smaller-than-total piece set for each of the fifteen families', () => {
    const matrix = new Map<ContentFamily, BrandDirectionPiece[]>();
    for (const family of CONTENT_FAMILIES) {
      const admitted = resolvePlanAdmittedPieces(CANONICAL_PLANS[family]);
      expect(admitted.length).toBeLessThan(PLAN_GATED_PIECES.length);
      matrix.set(family, admitted);
    }
    // A matrix where every family got the same set would prove nothing about filtering.
    const distinct = new Set([...matrix.values()].map((pieces) => pieces.join('|')));
    expect(distinct.size).toBeGreaterThan(1);
  });

  it('admits seven pieces for product-still-life and a DIFFERENT seven for typography-led', () => {
    const stillLife = resolvePlanAdmittedPieces(CANONICAL_PLANS['product-still-life']);
    const typographic = resolvePlanAdmittedPieces(CANONICAL_PLANS['typography-led']);

    expect(stillLife).toEqual([
      'visual-thesis',
      'composition',
      'colour-behaviour',
      'prohibition',
      'brand-integration',
      'product-world',
      'photography',
    ]);
    expect(typographic).toEqual([
      'visual-thesis',
      'composition',
      'colour-behaviour',
      'prohibition',
      'brand-integration',
      'illustration-graphic',
      'typography-behaviour',
    ]);
    expect(stillLife).toHaveLength(7);
    expect(typographic).toHaveLength(7);
    expect(stillLife.filter((piece) => !typographic.includes(piece))).toEqual([
      'product-world',
      'photography',
    ]);
    expect(typographic.filter((piece) => !stillLife.includes(piece))).toEqual([
      'illustration-graphic',
      'typography-behaviour',
    ]);
  });

  it('keeps motion silent for a still plan and people silent without people', () => {
    expect(admitsPiece('motion', plan({ mediaKind: 'still' }))).toBe(false);
    expect(admitsPiece('motion', plan({ mediaKind: 'motion' }))).toBe(true);
    expect(admitsPiece('people-characters', plan({ involvesPeople: false }))).toBe(false);
    expect(admitsPiece('typography-behaviour', plan({ textStrategy: 'none' }))).toBe(false);
  });

  it('sub-gates a prohibition on its own category', () => {
    const stillNoPeople = plan({ involvesProduct: true });
    expect(admitsProhibitionCategory('people', stillNoPeople)).toBe(false);
    expect(admitsProhibitionCategory('motion', stillNoPeople)).toBe(false);
    expect(admitsProhibitionCategory('product', stillNoPeople)).toBe(true);
    expect(admitsProhibitionCategory('colour', stillNoPeople)).toBe(true);
  });

  it('drops a people-category prohibition from a product-only run', () => {
    const resolved = resolve({
      rules: [
        prohibitionRule('rule-people-ban-0001', 'a model looking away from the camera', 'people'),
        prohibitionRule('rule-colour-ban-0001', 'a multi-stop gradient mesh field', 'colour'),
      ],
      plan: plan({ involvesProduct: true, involvesLogo: false }),
    });
    expect(resolved.prohibitions.map((rule) => rule.id)).toEqual(['rule-colour-ban-0001']);
  });
});

/* -------------------------------------------------------------------------- */
/*  F1-F4 — applicability                                                      */
/* -------------------------------------------------------------------------- */

describe('applicability filtering', () => {
  it('lets excludedFamilies beat families: all', () => {
    const rule = thesisRule('rule-thesis-all-0001', 'always on', {
      applicability: {
        families: 'all',
        excludedFamilies: ['creator-ugc'],
        mediaKinds: ['still', 'motion', 'sequence'],
        channels: [],
      },
    });
    expect(resolve({ rules: [rule], family: 'product-still-life' }).required).toHaveLength(1);
    expect(
      resolve({
        rules: [rule],
        family: 'creator-ugc',
        plan: plan({ involvesPeople: true }),
      }).required,
    ).toHaveLength(0);
  });

  it('matches every channel when the rule declares none, and requires an intersection otherwise', () => {
    const anyChannel = thesisRule('rule-any-channel-0001', 'everywhere');
    const paidOnly = thesisRule('rule-paid-only-0001', 'paid only', {
      applicability: {
        families: 'all',
        excludedFamilies: [],
        mediaKinds: ['still', 'motion', 'sequence'],
        channels: ['paid-social'],
      },
    });

    const unspecified = resolve({ rules: [anyChannel, paidOnly] });
    expect(unspecified.required.map((rule) => rule.id)).toEqual(['rule-any-channel-0001']);

    const paid = resolve({
      rules: [anyChannel, paidOnly],
      plan: plan({ involvesProduct: true, involvesLogo: true, channels: ['paid-social'] }),
    });
    expect(paid.required.map((rule) => rule.id).sort()).toEqual([
      'rule-any-channel-0001',
      'rule-paid-only-0001',
    ]);
  });

  it('keeps a motion-only rule silent for a still plan', () => {
    const motionOnly = thesisRule('rule-motion-only-0001', 'motion only', {
      applicability: {
        families: 'all',
        excludedFamilies: [],
        mediaKinds: ['motion'],
        channels: [],
      },
    });
    expect(resolve({ rules: [motionOnly] }).required).toHaveLength(0);
    expect(
      resolve({
        rules: [motionOnly],
        plan: plan({ mediaKind: 'motion', involvesProduct: true, involvesLogo: true }),
      }).required,
    ).toHaveLength(1);
  });

  it('prefers a family-scoped rule over a families: all rule and records why', () => {
    const general = brandDirectionRuleSchema.parse({
      ...envelope('rule-integration-general-0001'),
      piece: 'brand-integration',
      value: integrationValue(),
    });
    const scoped = brandDirectionRuleSchema.parse({
      ...envelope('rule-integration-scoped-0001', {
        applicability: {
          families: ['product-still-life'],
          excludedFamilies: [],
          mediaKinds: ['still', 'motion', 'sequence'],
          channels: [],
        },
      }),
      piece: 'brand-integration',
      value: integrationValue({ maxOccurrences: 2 }),
    });

    const resolved = resolve({ rules: [general, scoped] });
    expect(resolved.brandIntegration?.rule?.id).toBe('rule-integration-scoped-0001');
    expect(resolved.conflicts.map((conflict) => conflict.code)).toContain('scoped-rule-preferred');
  });
});

/* -------------------------------------------------------------------------- */
/*  F5b — the caller's piece selection                                         */
/* -------------------------------------------------------------------------- */

/*
 * The seam the Canvas brand-book toggle drives. Everything here is about one property: a
 * selection may WITHHOLD what the plan allowed, and may never ADMIT what the plan excluded.
 */
describe('a caller piece selection narrows, and only narrows', () => {
  const thesis = thesisRule('rule-thesis-sel-0001', 'the thesis');
  const integration = brandDirectionRuleSchema.parse({
    ...envelope('rule-integration-sel-0001'),
    piece: 'brand-integration',
    value: integrationValue(),
  });

  it('keeps everything the plan admits when no preference is expressed', () => {
    const undecided = resolve({ rules: [thesis, integration] });
    const explicit = resolve({
      rules: [thesis, integration],
      pieces: ['visual-thesis', 'brand-integration'],
    });

    expect(undecided.provenance.ruleIds).toEqual(explicit.provenance.ruleIds);
  });

  it('withholds a piece the caller did not select', () => {
    const resolved = resolve({ rules: [thesis, integration], pieces: ['brand-integration'] });

    expect(resolved.required.map((rule) => rule.id)).not.toContain('rule-thesis-sel-0001');
    expect(resolved.preferred.map((rule) => rule.id)).not.toContain('rule-thesis-sel-0001');
  });

  it('an EMPTY selection means no brand pieces at all, not "no preference"', () => {
    const resolved = resolve({ rules: [thesis, integration], pieces: [] });

    expect(resolved.required).toEqual([]);
    expect(resolved.preferred).toEqual([]);
    expect(resolved.prohibitions).toEqual([]);
  });

  it('a withheld rule stays READABLE as a proposal — deselected is not unapproved', () => {
    const resolved = resolve({ rules: [thesis, integration], pieces: ['brand-integration'] });

    expect(resolved.proposals.map((rule) => rule.id)).toContain('rule-thesis-sel-0001');
  });

  it('cannot admit a piece the PLAN gate excluded — selection intersects, never overrides', () => {
    /* A still plan that involves no logo excludes brand-integration however hard you ask. */
    const stillNoLogo = plan({ involvesLogo: false, involvesProduct: false });
    const resolved = resolve({
      rules: [integration],
      plan: stillNoLogo,
      pieces: ['brand-integration'],
    });
    const planOnly = resolve({ rules: [integration], plan: stillNoLogo });

    expect(resolved.required.map((rule) => rule.id)).toEqual(
      planOnly.required.map((rule) => rule.id),
    );
  });

  it('frees budget: deselecting a piece stops it crowding the SAME bucket', () => {
    /*
     * Both rules are `strong-preference`, so both compete for the `preferred` bucket — which
     * is the only way a selection can free budget. A cross-bucket deselection frees nothing,
     * and pretending otherwise would oversell the feature.
     */
    const softThesis = thesisRule('rule-thesis-budget-0001', 'a thesis long enough to cost', {
      strength: 'strong-preference',
    });
    const softPhotography = brandDirectionRuleSchema.parse({
      ...envelope('rule-photography-budget-0001', { strength: 'strong-preference' }),
      piece: 'photography',
      value: photographyValue('studio-clean'),
    });
    const tight = {
      charBudget: 7_200,
      byBucket: {
        'brand-integration': 1_400,
        required: 2_400,
        prohibitions: 1_200,
        preferred: 400,
        examples: 600,
      },
    };

    const both = resolve({ rules: [softThesis, softPhotography], budget: tight });
    const narrowed = resolve({
      rules: [softThesis, softPhotography],
      budget: tight,
      pieces: ['visual-thesis'],
    });

    expect(both.budget.omitted.length).toBeGreaterThan(0);
    expect(narrowed.budget.omitted).toEqual([]);
  });
});

/* -------------------------------------------------------------------------- */
/*  An unknown family                                                          */
/* -------------------------------------------------------------------------- */

/*
 * `family: null` exists for the literal generation path, which carries a prompt and no
 * communication job. It is NOT a wildcard, and every test below is about that distinction:
 * null admits strictly less than any real family, never more.
 */
describe('a null family means UNKNOWN, not "any"', () => {
  const universal = thesisRule('rule-universal-0001', 'applies everywhere');
  const scopedToStillLife = thesisRule('rule-scoped-0001', 'still life only', {
    applicability: {
      families: ['product-still-life'],
      excludedFamilies: [],
      mediaKinds: ['still', 'motion', 'sequence'],
      channels: [],
    },
  });

  it('admits a families: all rule', () => {
    const resolved = resolve({ rules: [universal], family: null });
    expect(resolved.required.map((rule) => rule.id)).toEqual(['rule-universal-0001']);
  });

  it('REFUSES a family-scoped rule, because nothing says this is that family', () => {
    const resolved = resolve({ rules: [scopedToStillLife], family: null });
    expect(resolved.required).toHaveLength(0);
  });

  it('never lets a family-scoped rule through, whatever else changes', () => {
    /*
     * The two resolutions are NOT a subset relation, and that is worth stating: under a real
     * family F6a prefers the scoped rule and drops the general one, so `product-still-life`
     * keeps only the scoped rule while `null` keeps only the universal one. The property that
     * actually matters is one-directional — a rule the brand scoped to a specific family can
     * never be admitted when the family is unknown, because there is nothing to match it to.
     */
    const rules = [universal, scopedToStillLife];
    const known = resolve({ rules, family: 'product-still-life' }).required.map((rule) => rule.id);
    const unknown = resolve({ rules, family: null }).required.map((rule) => rule.id);

    expect(known).toEqual(['rule-scoped-0001']);
    expect(unknown).toEqual(['rule-universal-0001']);
    expect(unknown).not.toContain('rule-scoped-0001');
  });

  it('still respects mediaKind, which a literal request genuinely declares', () => {
    const motionOnly = thesisRule('rule-motion-0001', 'motion only', {
      applicability: {
        families: 'all',
        excludedFamilies: [],
        mediaKinds: ['motion'],
        channels: [],
      },
    });

    expect(resolve({ rules: [motionOnly], family: null }).required).toHaveLength(0);
    expect(
      resolve({
        rules: [motionOnly],
        family: null,
        plan: plan({ mediaKind: 'motion', involvesProduct: true, involvesLogo: true }),
      }).required,
    ).toHaveLength(1);
  });

  it('raises no scoped-rule-preferred conflict, because no rule can be scoped to nothing', () => {
    const resolved = resolve({ rules: [universal, scopedToStillLife], family: null });
    expect(resolved.conflicts.map((conflict) => conflict.code)).not.toContain(
      'scoped-rule-preferred',
    );
  });

  it('pins no example, because appliesTo has no wildcard to match', () => {
    const resolved = resolve({ rules: [universal], family: null });
    expect(resolved.examples.positive).toEqual([]);
    expect(resolved.examples.negative).toEqual([]);
  });

  it('reports the null family on its own output rather than inventing one', () => {
    expect(resolve({ rules: [universal], family: null }).family).toBeNull();
  });
});

/* -------------------------------------------------------------------------- */
/*  Authority — the property that matters                                      */
/* -------------------------------------------------------------------------- */

describe('no non-approved rule ever reaches an authoritative bucket', () => {
  const PROVENANCES = [
    'approved-by-user',
    'extracted-from-source',
    'inferred-by-model',
    'proposed-from-performance',
  ] as const;
  const STATES = ['approved', 'proposed', 'rejected', 'retired'] as const;
  const STRENGTHS = ['hard', 'strong-preference', 'default'] as const;

  /** A tiny deterministic PRNG, so a failing case is reproducible rather than a mystery. */
  // biome-ignore-start lint/suspicious/noBitwiseOperators: a linear congruential generator is defined by 32-bit wraparound; `>>> 0` IS the modulus.
  const lcg = (seed: number) => {
    let state = seed >>> 0;
    return () => {
      state = (state * 1_664_525 + 1_013_904_223) >>> 0;
      return state / 0x1_0000_0000;
    };
  };
  // biome-ignore-end lint/suspicious/noBitwiseOperators: end of the generator.

  it('holds for 200 randomly generated documents', () => {
    const random = lcg(20_260_801);
    const pick = <T>(values: readonly T[]): T => values[Math.floor(random() * values.length)];

    for (let iteration = 0; iteration < 200; iteration += 1) {
      const rules: BrandDirectionRule[] = [];
      const ruleCount = 1 + Math.floor(random() * 6);

      for (let index = 0; index < ruleCount; index += 1) {
        const approvalState = pick(STATES);
        const provenance = pick(PROVENANCES);
        const strength = pick(STRENGTHS);
        const approved = approvalState === 'approved';
        const candidate = brandDirectionRuleSchema.safeParse({
          ...envelope(`rule-fuzz-${iteration}-${index}`, {
            strength,
            provenance,
            approvalState,
            confidence: provenance === 'inferred-by-model' ? 0.4 : 0.9,
            approvedBy: approved ? APPROVER : null,
            approvedAt: approved ? T0 : null,
          }),
          piece: pick(['visual-thesis', 'prohibition'] as const),
          value:
            random() < 0.5
              ? thesis(`thesis ${iteration}-${index}`)
              : prohibitionValue(`observable failure ${iteration}-${index}`, 'colour'),
        });
        // Invalid combinations are rejected at parse — which is itself the guarantee.
        if (candidate.success) rules.push(candidate.data);
      }

      const resolved = resolve({ rules, familyCard: NO_PIECES });
      const authoritative = [...resolved.required, ...resolved.preferred, ...resolved.prohibitions];
      for (const rule of authoritative) {
        expect(rule.approvalState).toBe('approved');
        expect(rule.approvedBy).not.toBeNull();
        expect(['approved-by-user', 'extracted-from-source']).toContain(rule.provenance);
        expect(rule.piece).not.toBe('unclassified-direction');
      }
    }
  });

  it('never resolves an unclassified-direction rule into an authoritative bucket', () => {
    const legacy = brandDirectionRuleSchema.parse({
      ...envelope('legacy-imagery:mood:abc123', {
        strength: 'default',
        approvalState: 'proposed',
        approvedBy: null,
        approvedAt: null,
        observability: 'human-only',
      }),
      piece: 'unclassified-direction',
      value: { text: 'quiet, worn', legacyField: 'mood', suggestedPiece: null },
    });

    for (const family of CONTENT_FAMILIES) {
      const resolved = resolve({
        rules: [legacy],
        family,
        plan: CANONICAL_PLANS[family],
      });
      expect(resolved.required).toHaveLength(0);
      expect(resolved.preferred).toHaveLength(0);
      expect(resolved.prohibitions).toHaveLength(0);
      expect(resolved.proposals.map((rule) => rule.id)).toContain('legacy-imagery:mood:abc123');
    }
  });

  it('routes a rejected or retired rule nowhere at all', () => {
    for (const state of ['rejected', 'retired'] as const) {
      const rule = thesisRule('rule-dead-0001', 'dead', {
        strength: 'default',
        approvalState: state,
        approvedBy: null,
        approvedAt: null,
      });
      const resolved = resolve({ rules: [rule] });
      expect(resolved.required).toHaveLength(0);
      expect(resolved.preferred).toHaveLength(0);
      expect(resolved.proposals).toHaveLength(0);
    }
  });
});

/* -------------------------------------------------------------------------- */
/*  Determinism                                                                */
/* -------------------------------------------------------------------------- */

describe('determinism', () => {
  const shuffleKeys = <T>(value: T): T => JSON.parse(JSON.stringify(value, reverseKeyOrder)) as T;

  function reverseKeyOrder(this: unknown, _key: string, value: unknown): unknown {
    if (value === null || typeof value !== 'object' || Array.isArray(value)) return value;
    const record = value as Record<string, unknown>;
    const reversed: Record<string, unknown> = {};
    for (const key of Object.keys(record).reverse()) reversed[key] = record[key];
    return reversed;
  }

  const rules = [
    thesisRule('rule-thesis-z-0001', 'a workshop that sells bottles'),
    prohibitionRule('rule-ban-a-0001', 'a multi-stop gradient mesh field', 'colour'),
    brandDirectionRuleSchema.parse({
      ...envelope('rule-photography-m-0001', { strength: 'strong-preference' }),
      piece: 'photography',
      value: photographyValue('studio-clean'),
    }),
  ];

  it('produces the same checksum for shuffled rule order and shuffled key order', () => {
    const forward = resolve({ rules });
    const reversed = resolve({ rules: [...rules].reverse() });
    const rekeyed = resolve({
      rules: [...rules].reverse().map((rule) => brandDirectionRuleSchema.parse(shuffleKeys(rule))),
    });

    expect(reversed.provenance.checksum).toBe(forward.provenance.checksum);
    expect(rekeyed.provenance.checksum).toBe(forward.provenance.checksum);
    expect(reversed.provenance.ruleIds).toEqual(forward.provenance.ruleIds);
  });

  it('excludes resolvedAt from the checksum', () => {
    const early = resolveBrandDirection({
      brandId: BRAND_ID,
      family: 'product-still-life',
      plan: plan({ involvesProduct: true, involvesLogo: true }),
      document: documentOf(rules),
      tokens: null,
      familyCard: NO_PIECES,
      now: '2026-01-01T00:00:00.000Z',
    });
    const late = resolveBrandDirection({
      brandId: BRAND_ID,
      family: 'product-still-life',
      plan: plan({ involvesProduct: true, involvesLogo: true }),
      document: documentOf(rules),
      tokens: null,
      familyCard: NO_PIECES,
      now: '2027-12-31T23:59:59.000Z',
    });
    expect(late.provenance.checksum).toBe(early.provenance.checksum);
    expect(late.resolvedAt).not.toBe(early.resolvedAt);
  });

  it('orders the output by strength, then block order, deterministically', () => {
    const resolved = resolve({ rules: [...rules].reverse() });
    expect(resolved.required.map((rule) => rule.piece)).toEqual(['visual-thesis']);
    expect(resolved.preferred.map((rule) => rule.piece)).toEqual(['photography']);
    expect(resolved.prohibitions.map((rule) => rule.piece)).toEqual(['prohibition']);
  });
});

/* -------------------------------------------------------------------------- */
/*  Budget                                                                     */
/* -------------------------------------------------------------------------- */

describe('budget', () => {
  const example = (assetId: string, kind: 'positive' | 'negative'): BrandDirectionExample =>
    brandDirectionExampleSchema.parse({
      assetId,
      versionId: VERSION,
      kind,
      appliesTo: ['product-still-life'],
      annotations: [
        {
          dimension: 'photography',
          note: 'the controlled falloff on the shoulder of the bottle, not the surface it sits on',
        },
      ],
      authority: 'approved',
      rightsNote: null,
      addedBy: APPROVER,
      addedAt: T0,
    });

  const preferredRule = (id: string, confidence: number): BrandDirectionRule =>
    brandDirectionRuleSchema.parse({
      ...envelope(id, { strength: 'strong-preference', confidence }),
      piece: 'visual-thesis',
      value: thesis(`a thesis long enough to cost meaningful characters — ${id}`),
    });

  it('drops examples before preferred rules, and names every omission', () => {
    const tight: BrandDirectionBudget = {
      charBudget: 10_000,
      byBucket: {
        'brand-integration': 10_000,
        required: 10_000,
        prohibitions: 10_000,
        preferred: 10_000,
        examples: 10,
      },
    };
    const resolved = resolve({
      rules: [preferredRule('rule-pref-a-0001', 0.9)],
      examples: [
        example('aaaaaaaa-1111-4111-8111-111111111111', 'positive'),
        example('bbbbbbbb-1111-4111-8111-111111111111', 'negative'),
      ],
      budget: tight,
    });

    expect(resolved.examples.positive).toHaveLength(0);
    expect(resolved.examples.negative).toHaveLength(0);
    expect(resolved.preferred).toHaveLength(1);
    expect(resolved.budget.omitted.every((entry) => entry.bucket === 'examples')).toBe(true);
    expect(resolved.budget.omitted).toHaveLength(2);
  });

  it('drops the lowest-confidence preferred rule first', () => {
    const rules = [
      preferredRule('rule-pref-high-0001', 0.9),
      preferredRule('rule-pref-low-0001', 0.2),
    ];
    const cost = renderRuleForBudget(rules[0]).length;
    const resolved = resolve({
      rules,
      budget: {
        ...BRAND_DIRECTION_DEFAULT_BUDGET,
        byBucket: { ...BRAND_DIRECTION_DEFAULT_BUDGET.byBucket, preferred: cost + 5 },
      },
    });

    expect(resolved.preferred.map((rule) => rule.id)).toEqual(['rule-pref-high-0001']);
    expect(resolved.budget.omitted).toEqual([
      { ruleId: 'rule-pref-low-0001', bucket: 'preferred', reason: 'budget' },
    ]);
  });

  it('flags overflow on a never-trimmed bucket and drops nothing from it', () => {
    const rules = [
      thesisRule('rule-hard-a-0001', 'a hard thesis with a reasonably long statement'),
      prohibitionRule('rule-hard-b-0001', 'a multi-stop gradient mesh used as a field', 'colour'),
    ];
    const resolved = resolve({
      rules,
      budget: {
        charBudget: 10,
        byBucket: {
          'brand-integration': 1,
          required: 1,
          prohibitions: 1,
          preferred: 1,
          examples: 1,
        },
      },
    });

    expect(resolved.budget.overflow).toBe(true);
    expect(resolved.required).toHaveLength(1);
    expect(resolved.prohibitions).toHaveLength(1);
    expect(resolved.budget.omitted).toHaveLength(0);
  });

  it('never truncates: every emitted value is byte-identical to its source', () => {
    const rules = [
      thesisRule(
        'rule-long-thesis-0001',
        'a very long statement that would be an obvious candidate for a renderer to cut in half rather than drop',
      ),
    ];
    const resolved = resolve({
      rules,
      budget: {
        charBudget: 5,
        byBucket: {
          'brand-integration': 1,
          required: 1,
          prohibitions: 1,
          preferred: 1,
          examples: 1,
        },
      },
    });
    expect(resolved.required[0]?.value).toEqual(rules[0].value);
    for (const entry of resolved.budget.omitted) {
      expect(entry.reason).toBe('budget');
    }
  });

  it('reports usage per bucket', () => {
    const resolved = resolve({ rules: [thesisRule('rule-usage-0001', 'a thesis')] });
    expect(resolved.budget.charBudget).toBe(BRAND_DIRECTION_DEFAULT_BUDGET.charBudget);
    expect(resolved.budget.byBucket.required).toBeGreaterThan(0);
    expect(resolved.budget.charsUsed).toBe(
      Object.values(resolved.budget.byBucket).reduce((sum, value) => sum + value, 0),
    );
    expect(resolved.budget.overflow).toBe(false);
  });
});

/* -------------------------------------------------------------------------- */
/*  Missing data and brand integration                                         */
/* -------------------------------------------------------------------------- */

describe('missing data', () => {
  it('reports a piece the family card required and the brand never authored', () => {
    const resolved = resolve({
      rules: [thesisRule('rule-thesis-only-0001', 'a thesis')],
      familyCard: { requiredBrandBookPieces: ['visual-thesis', 'photography', 'colour-behaviour'] },
    });
    expect(
      resolved.missing.filter((warning) => warning.code === 'piece_missing').map((w) => w.piece),
    ).toEqual(['photography', 'colour-behaviour']);
  });

  it('reports a parse loss so it is never mistaken for "the brand said nothing"', () => {
    const resolved = resolveBrandDirection({
      brandId: BRAND_ID,
      family: 'product-still-life',
      plan: plan({ involvesProduct: true }),
      document: documentOf([]),
      tokens: null,
      familyCard: NO_PIECES,
      readDrops: [{ index: 0, reason: 'unknown_enum', detail: 'polishFloor' }],
      now: NOW,
    });
    expect(resolved.missing.map((warning) => warning.code)).toContain('rules_dropped_on_read');
  });

  it('reports the absence of a v2 document rather than pretending it resolved', () => {
    const resolved = resolve({});
    expect(resolved.directionVersion).toBeNull();
    expect(resolved.missing.map((warning) => warning.code)).toContain('no_direction_document');
  });
});

describe('brand integration', () => {
  const tokensWithLogo: BrandMdTokens = brandMdTokensSchema.parse({
    schema_version: 1,
    brand_name: 'Halden',
    logo: { storage_path: 'brands/halden/logo.svg', treatment_default: 'palette-only' },
  });

  it('synthesises a conservative default that is a PROPOSAL, never a rule', () => {
    const resolved = resolve({
      rules: [],
      tokens: tokensWithLogo,
      plan: plan({ involvesLogo: true }),
    });

    expect(resolved.brandIntegration?.source).toBe('implicit-default');
    expect(resolved.brandIntegration?.value.logoRenderPolicy).toBe('composited-from-asset-only');
    expect(resolved.brandIntegration?.rule).toBeNull();
    expect(resolved.required.some((rule) => rule.piece === 'brand-integration')).toBe(false);
    expect(resolved.proposals.map((rule) => rule.id)).toContain(
      'implicit-brand-integration-default',
    );
    expect(resolved.missing.map((warning) => warning.code)).toContain(
      'brand_integration_undeclared',
    );
  });

  it('does not synthesise anything when no logo or product is in play', () => {
    const resolved = resolve({ rules: [], tokens: tokensWithLogo, plan: plan() });
    expect(resolved.brandIntegration).toBeNull();
  });

  it('surfaces verification hooks for the evaluation contract', () => {
    const rule = brandDirectionRuleSchema.parse({
      ...envelope('rule-integration-hooks-0001'),
      piece: 'brand-integration',
      value: integrationValue({
        verificationHooks: ['logo-pixel-diff', 'clear-space-geometry', 'occurrence-count'],
      }),
    });
    const resolved = resolve({ rules: [rule], plan: plan({ involvesLogo: true }) });
    expect(resolved.brandIntegration?.verificationHooks).toEqual([
      'logo-pixel-diff',
      'clear-space-geometry',
      'occurrence-count',
    ]);
  });

  it('keeps the integration rule out of required and in its own bucket', () => {
    const rule = brandDirectionRuleSchema.parse({
      ...envelope('rule-integration-bucket-0001'),
      piece: 'brand-integration',
      value: integrationValue(),
    });
    const resolved = resolve({ rules: [rule], plan: plan({ involvesLogo: true }) });
    expect(resolved.required.some((entry) => entry.piece === 'brand-integration')).toBe(false);
    expect(resolved.brandIntegration?.rule?.id).toBe('rule-integration-bucket-0001');
    expect(resolved.budget.byBucket['brand-integration']).toBeGreaterThan(0);
  });
});

/* -------------------------------------------------------------------------- */
/*  Intra-book conflicts                                                       */
/* -------------------------------------------------------------------------- */

describe('intra-book conflicts', () => {
  it('flags a second approved thesis', () => {
    const resolved = resolve({
      rules: [
        thesisRule('rule-thesis-one-0001', 'a workshop that sells bottles'),
        thesisRule('rule-thesis-two-0001', 'a laboratory that sells bottles'),
      ],
    });
    const conflict = resolved.conflicts.find((entry) => entry.code === 'duplicate-thesis');
    expect(conflict?.ruleIds.sort()).toEqual(['rule-thesis-one-0001', 'rule-thesis-two-0001']);
  });

  it('flags two hard rules of the same piece that disagree on a scalar', () => {
    const raw = brandDirectionRuleSchema.parse({
      ...envelope('rule-photo-raw-0001', {
        applicability: {
          families: ['product-still-life'],
          excludedFamilies: [],
          mediaKinds: ['still', 'motion', 'sequence'],
          channels: [],
        },
        observability: 'vision-judge',
      }),
      piece: 'photography',
      value: photographyValue('raw-amateur'),
    });
    const polished = brandDirectionRuleSchema.parse({
      ...envelope('rule-photo-polished-0001', {
        applicability: {
          families: ['product-still-life'],
          excludedFamilies: [],
          mediaKinds: ['still', 'motion', 'sequence'],
          channels: [],
        },
        observability: 'vision-judge',
      }),
      piece: 'photography',
      value: photographyValue('campaign-polished'),
    });

    const conflict = resolve({ rules: [raw, polished] }).conflicts.find(
      (entry) => entry.code === 'strength-contradiction',
    );
    expect(conflict?.detail).toContain('polishFloor');
  });

  it('flags an integration policy nothing could verify', () => {
    // Hand-built rather than parsed: the schema already refuses this shape, and the
    // resolver has to hold the line for a document that never went through the reader.
    const parsed = brandDirectionRuleSchema.parse({
      ...envelope('rule-integration-unverifiable-0001'),
      piece: 'brand-integration',
      value: integrationValue({ verificationHooks: ['human-signoff'] }),
    });
    const resolved = resolve({ rules: [parsed], plan: plan({ involvesLogo: true }) });
    const conflict = resolved.conflicts.find((entry) => entry.code === 'integration-inconsistency');
    expect(conflict?.detail).toContain('verify the composite');
  });

  it('flags a prohibition that bans what a preference asks for', () => {
    const preference = brandDirectionRuleSchema.parse({
      ...envelope('rule-illustration-pref-0001', { strength: 'strong-preference' }),
      piece: 'illustration-graphic',
      value: {
        allowedMedia: ['collage'],
        markMaking: ['soft neon gradient vapour'],
        geometryOrganicBalance: 'balanced',
        iconBehaviour: { strokeWidth: 2, cornerRadius: 0, gridUnit: 24, fillStyle: 'solid' },
        diagramStyle: {
          connectors: 'curved',
          labelPlacement: 'callout',
          dataInkPolicy: 'moderate',
        },
        printProcesses: [],
        prohibitedStockMotifs: [],
        aiSignatureBans: [],
      },
    });
    const ban = prohibitionRule('rule-ban-vapour-0001', 'Soft Neon Gradient Vapour', 'colour');

    const resolved = resolve({
      rules: [preference, ban],
      plan: plan({ medium: 'illustrated', involvesProduct: true }),
    });
    const conflict = resolved.conflicts.find((entry) => entry.code === 'prohibition-vs-preference');
    expect(conflict?.ruleIds).toEqual(['rule-ban-vapour-0001', 'rule-illustration-pref-0001']);
  });

  it('suppresses an exact duplicate and says which rule won', () => {
    const first = thesisRule('rule-dupe-a-0001', 'a workshop that sells bottles');
    const second = thesisRule('rule-dupe-b-0001', 'a workshop that sells bottles', {
      strength: 'strong-preference',
    });
    const resolved = resolve({ rules: [first, second] });
    expect(resolved.required.map((rule) => rule.id)).toEqual(['rule-dupe-a-0001']);
    const conflict = resolved.conflicts.find((entry) => entry.code === 'duplicate-suppressed');
    expect(conflict?.ruleIds).toEqual(['rule-dupe-a-0001', 'rule-dupe-b-0001']);
  });
});

/* -------------------------------------------------------------------------- */
/*  The CF-03 pair — the whole point of the strength enum                      */
/* -------------------------------------------------------------------------- */

describe('the conflict fixtures resolve as the compiler needs them to', () => {
  const fixture = (id: string) => {
    const found = brandDirectionConflictFixtures.find((entry) => entry.id === id);
    if (!found) throw new Error(`fixture ${id} is missing`);
    return found;
  };

  const resolveFixture = (id: string) => {
    const found = fixture(id);
    return resolveBrandDirection({
      brandId: BRAND_ID,
      family: found.family,
      plan: found.plan,
      document: documentOf(found.brandRules),
      tokens: null,
      familyCard: NO_PIECES,
      now: NOW,
    });
  };

  it('CF-03 lands the polish floor in required, so the compiler must BLOCK', () => {
    const resolved = resolveFixture('CF-03-polish-floor-vs-raw-amateur');
    const rule = resolved.required.find((entry) => entry.id === 'rule-photography-polish-floor');
    expect(rule?.strength).toBe('hard');
    expect(resolved.preferred).toHaveLength(0);
    expect(rule?.piece === 'photography' && rule.value.polishFloor).toBe('studio-clean');
    expect(violatesPolishFloor('studio-clean', 'raw-amateur')).toBe(true);
    expect(rule?.provenance).toBe('extracted-from-source');
    expect(rule?.sourceVersion.ref).toBe('brand-guidelines-2026.pdf');
    expect(rule?.approvedBy).toBe(APPROVER);
  });

  it('CF-03b lands the SAME value in preferred, so the compiler records an override', () => {
    const resolved = resolveFixture('CF-03b-polish-floor-strong-preference');
    const rule = resolved.preferred.find((entry) => entry.id === 'rule-photography-polish-floor');
    expect(rule?.strength).toBe('strong-preference');
    expect(resolved.required).toHaveLength(0);
    expect(rule?.piece === 'photography' && rule.value.polishFloor).toBe('studio-clean');
    // Same brand value, same user intent — only the strength differs, which is the point.
    expect(violatesPolishFloor('studio-clean', 'raw-amateur')).toBe(true);
  });

  it('CF-03c keeps the rule silent because the family is excluded', () => {
    const resolved = resolveFixture('CF-03c-polish-floor-applicability-miss');
    expect(resolved.required).toHaveLength(0);
    expect(resolved.preferred).toHaveLength(0);
    expect(resolved.provenance.ruleIds).toEqual([]);
  });

  it('CF-01 keeps both hard rules for a mixed-medium key visual', () => {
    const resolved = resolveFixture('CF-01-gradient-forbidden-vs-preset-gradient');
    expect(resolved.prohibitions.map((rule) => rule.id)).toEqual(['rule-prohibit-gradient-mesh']);
    expect(resolved.required.map((rule) => rule.id)).toEqual(['rule-illustration-no-gradient']);
  });

  it('CF-04 resolves the hard integration rule that the illustration plan cannot satisfy', () => {
    const found = fixture('CF-04-real-product-reference-vs-illustration-family');
    const resolved = resolveFixture(found.id);
    expect(resolved.brandIntegration?.rule?.id).toBe('rule-brand-integration-core');
    expect(resolved.brandIntegration?.value.productRenderPolicy).toBe('real-reference-required');
    expect(planCarriesIdentityReference(found.plan)).toBe(false);
  });

  it('CF-04b lets the family-scoped integration rule win on specificity', () => {
    const resolved = resolveFixture('CF-04b-illustration-with-approved-scoped-integration');
    expect(resolved.brandIntegration?.rule?.id).toBe('rule-brand-integration-illustration');
    expect(resolved.brandIntegration?.value.packagingTextPolicy).toBe('no-legible-text');
    const conflict = resolved.conflicts.find((entry) => entry.code === 'scoped-rule-preferred');
    expect(conflict?.ruleIds).toEqual([
      'rule-brand-integration-core',
      'rule-brand-integration-illustration',
    ]);
  });

  it('resolves every fixture without an overflow or a non-approved authoritative rule', () => {
    for (const found of brandDirectionConflictFixtures) {
      const resolved = resolveFixture(found.id);
      expect([found.id, resolved.budget.overflow]).toEqual([found.id, false]);
      for (const rule of [...resolved.required, ...resolved.preferred, ...resolved.prohibitions]) {
        expect(rule.approvalState).toBe('approved');
      }
    }
  });
});
