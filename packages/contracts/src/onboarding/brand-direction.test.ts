import { describe, expect, it } from 'bun:test';

import { renderForcedBrandBlock } from '../ai-studio/brand-enforcement';
import {
  type ApprovedRule,
  asApprovedProhibition,
  asApprovedRule,
  asProposedRule,
  BRAND_DIRECTION_PIECES,
  type BrandDirectionDocument,
  type BrandDirectionPiece,
  type BrandDirectionRule,
  type BrandDirectionRuleInput,
  brandDirectionDocumentSchema,
  brandDirectionExampleSchema,
  brandDirectionRuleSchema,
  canonicalDirectionJson,
  computeDirectionChecksum,
  directionSha256Hex,
  legacyImageryRuleId,
  type ProposedRule,
  proposeDirectionFromLegacyImagery,
  readBrandDirection,
  violatesPolishFloor,
} from './brand-direction';
import { brandDirectionConflictFixtures } from './brand-direction.fixtures';
import {
  type BrandMdTokens,
  brandMdTokensSchema,
  parseBrandMd,
  serializeBrandMd,
} from './brand-md';

const APPROVER = '9f1c2d3e-4a5b-4c6d-8e9f-0a1b2c3d4e5f';
const ASSET = '11111111-2222-4333-8444-555555555555';
const VERSION = '66666666-7777-4888-8999-aaaaaaaaaaaa';
const T0 = '2026-07-01T10:00:00.000Z';

type EnvelopeOverrides = Partial<Omit<BrandDirectionRuleInput, 'piece' | 'value'>>;

const envelope = (id: string, overrides: EnvelopeOverrides = {}) => ({
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

/** One minimal, valid value per piece — the fixture bed for the 13-piece round trip. */
const PIECE_VALUES: {
  [P in BrandDirectionPiece]: Extract<BrandDirectionRuleInput, { piece: P }>['value'];
} = {
  'visual-thesis': {
    statement: 'A workshop that happens to sell bottles.',
    businessLink: null,
    visualConsequences: [],
    notThis: [],
  },
  composition: {
    hierarchyPattern: 'single-dominant',
    density: 'sparse',
    negativeSpaceBehaviour: 'generous-margins',
    gridTendency: 'optical',
    cropBehaviour: 'considered-crop',
    scaleContrast: 'moderate',
    symmetry: 'asymmetric',
    layering: { overlapAllowed: false, maxLayers: 2, subjectOverType: true },
    repeatedMechanisms: [],
    safeAreaPolicy: { respectPlatformSafeAreas: true, reservedZones: [] },
  },
  'typography-behaviour': {
    roleAssignments: [],
    permittedScaleRegisters: 2,
    casingPolicy: 'sentence',
    punctuationPolicy: {
      terminalPeriods: false,
      ampersandUse: 'either',
      hyphenationAllowed: false,
    },
    trackingTendency: 'normal',
    lineHeightTendency: 'normal',
    expressiveTreatments: [],
    typeImageInteraction: 'type-over-image',
    exactCopySensitivity: 'verbatim-required',
    forbiddenTypeTropes: [],
    fontUnavailableFallback: 'composite-in-canvas',
    legibilityFloor: { minCapHeightPctOfShortEdge: 4, minContrastRatio: 4.5 },
  },
  'colour-behaviour': {
    roleRatios: [],
    backgroundSurfacePairs: [],
    contrastFloor: 4.5,
    prohibitedPairings: [],
    campaignAccentPolicy: { mode: 'forbidden', allowed: [], maxShare: 0 },
    substituteForColour: 'material',
    neutralPolicy: { allowed: [], roleLimit: 'support-only' },
    saturationPolicy: 'natural',
  },
  photography: {
    subjectMatter: [],
    pointOfView: 'observer',
    castingSummary: null,
    cameraDistance: 'close',
    lensCharacter: 'telephoto-compression',
    angleTendency: 'three-quarter',
    lightingLogic: {
      key: 'soft',
      direction: 'top-left-45',
      shadowBehaviour: 'controlled-falloff',
      note: null,
    },
    realismMode: 'constructed-studio',
    movementGesture: 'still',
    environment: [],
    props: { allowed: [], forbidden: [] },
    postProcessing: {
      grain: 'none',
      halation: false,
      colourGrade: null,
      retouchPolicy: 'standard-commercial',
    },
    polishFloor: 'studio-clean',
    productDepictionRequiresReference: true,
    identityPreservation: 'strict',
  },
  'illustration-graphic': {
    allowedMedia: ['vector'],
    markMaking: [],
    geometryOrganicBalance: 'geometric-lean',
    iconBehaviour: { strokeWidth: 2, cornerRadius: 0, gridUnit: 24, fillStyle: 'solid' },
    diagramStyle: { connectors: 'orthogonal', labelPlacement: 'outside', dataInkPolicy: 'minimal' },
    printProcesses: [],
    prohibitedStockMotifs: [],
    aiSignatureBans: [],
  },
  motion: {
    shotDurationMs: { min: 800, max: 4_000, typical: 1_600 },
    pacing: 'measured',
    cameraMovement: ['locked-off'],
    transitionGrammar: ['hard-cut'],
    typeMotion: 'fade',
    continuityRules: [],
    soundRelationship: {
      musicRole: 'bed',
      voiceRole: 'none',
      sfxPolicy: 'diegetic only',
      silencePermitted: true,
    },
    introOutro: { introMs: 0, outroMs: 800, logoBehaviour: 'endcard' },
    loopPolicy: 'seamless-preferred',
  },
  'people-characters': {
    castingPrinciples: [],
    representationRules: [],
    skinRenderingFidelity: 'documentary-true',
    stylingSystem: { wardrobe: [], accessories: [], grooming: [], makeup: [] },
    posePolicy: 'candid',
    expressionPolicy: 'warm',
    gazePolicy: 'mixed',
    identityContinuity: {
      required: true,
      referenceRole: 'preserve-person-identity',
      toleranceNote: null,
    },
    prohibitedStereotypes: [],
    realPersonPolicy: { mode: 'consented-asset-only', consentEvidenceRef: null },
  },
  'product-world': {
    productScale: 'hero-dominant',
    permittedAngles: ['three-quarter'],
    packagingFidelity: 'exact-asset-only',
    materialsSurfaces: [],
    propRules: { allowed: [], forbidden: [] },
    useContextVsPackshot: { mode: 'packshot-only', contextShare: 0 },
    labelLegibility: 'must-be-legible',
    prohibitedInventions: [],
    variantSystem: { attributesFixed: [], attributesVariable: [] },
  },
  'brand-integration': {
    logoRenderPolicy: 'composited-from-asset-only',
    logoAssetRef: { assetId: ASSET, versionId: VERSION },
    placementLaws: [{ zone: 'bottom-right', priority: 1 }],
    clearSpace: { unit: 'logo-height', multiple: 1 },
    minimumSize: { unit: 'percent-of-shortest-edge', value: 6, contextNote: null },
    maxOccurrences: 1,
    forbiddenTreatments: ['stretch'],
    coBrandingRules: {
      allowed: false,
      lockupOrder: 'brand-first',
      separatorRule: null,
      partnerMinClearSpace: null,
    },
    productRenderPolicy: 'model-may-render-from-reference',
    productAssetRefs: [],
    packagingTextPolicy: 'no-legible-text',
    signatureMarkBehaviour: { markId: null, whenRequired: 'never', frequency: 0 },
    integrationMechanism: 'foreground-lockup',
    verificationHooks: ['logo-pixel-diff', 'occurrence-count'],
  },
  'brand-signature': {
    name: 'The cut rule',
    mechanism: 'repeated-graphic-device',
    description: 'A single hairline rule crosses every composition at the same optical height.',
    frequency: { mode: 'every', maxSharePerCampaign: 1 },
    exampleRefs: [],
    exhaustionGuard: { enabled: true, note: null },
  },
  prohibition: {
    observableFailure: 'multi-stop gradient mesh used as a background field',
    category: 'colour',
    detector: 'palette-histogram',
    detectorConfig: null,
    severity: 'reject',
    exampleRefs: [],
    replacementGuidance: null,
  },
  'unclassified-direction': {
    text: 'warm, human, never sterile',
    legacyField: 'mood',
    suggestedPiece: null,
  },
};

const ruleFor = (
  piece: BrandDirectionPiece,
  overrides: EnvelopeOverrides = {},
): BrandDirectionRule =>
  brandDirectionRuleSchema.parse({
    ...envelope(`rule-${piece}-0001`, overrides),
    piece,
    value: PIECE_VALUES[piece],
  } as BrandDirectionRuleInput);

const documentOf = (rules: BrandDirectionRule[]): BrandDirectionDocument =>
  brandDirectionDocumentSchema.parse({
    schemaVersion: 2,
    brandId: '5c1b6a10-8f2d-4d31-9d0a-6f0e2f0a1b2c',
    version: 3,
    checksum: computeDirectionChecksum(rules, []),
    rules,
    examples: [],
    updatedAt: T0,
  });

/* -------------------------------------------------------------------------- */
/*  v1 preservation                                                            */
/* -------------------------------------------------------------------------- */

describe('v1 Brand Book is byte-stable through this packet', () => {
  const tokens: BrandMdTokens = brandMdTokensSchema.parse({
    schema_version: 1,
    brand_name: 'Halden',
    colors: [{ value: '#111111', role: 'primary', name: 'ink' }],
    typography: [{ family: 'Söhne', role: 'display' }],
    logo: { storage_path: 'brands/halden/logo.svg', treatment_default: 'palette-only' },
    imagery: {
      creative_direction: ['workshop tables, real hands, no styling'],
      mood: ['quiet', 'worn'],
      avoid: ['stock smiles'],
    },
  });

  it('renders the same forced brand block as before v2 existed', () => {
    const { block, renderedPieces } = renderForcedBrandBlock(tokens, [
      'colors',
      'typography',
      'imagery',
    ]);
    expect(renderedPieces).toEqual(['colors', 'typography', 'imagery']);
    expect(block).toBe(
      '<brand_book>(authoritative brand rules — the generation MUST comply)\n' +
        'Colors (use these exact brand colors): #111111 (primary, ink)\n' +
        'Typography: Söhne (display)\n' +
        'Visual direction: workshop tables, real hands, no styling. Mood: quiet, worn. Avoid: stock smiles.\n' +
        '</brand_book>',
    );
  });

  it('round-trips a brand.md document with populated imagery', () => {
    const serialized = serializeBrandMd({ tokens, body: '# Halden\n\nProse body.\n' });
    const reparsed = parseBrandMd(serialized);
    expect(reparsed.tokens?.imagery).toEqual(tokens.imagery);
  });
});

/* -------------------------------------------------------------------------- */
/*  v2 parsing                                                                 */
/* -------------------------------------------------------------------------- */

describe('the thirteen pieces', () => {
  it('covers every declared piece with a fixture value', () => {
    expect(Object.keys(PIECE_VALUES).sort()).toEqual([...BRAND_DIRECTION_PIECES].sort());
  });

  for (const piece of BRAND_DIRECTION_PIECES) {
    it(`${piece} parses and round-trips`, () => {
      // `unclassified-direction` may never be hard, so it carries the migration envelope.
      const overrides: EnvelopeOverrides =
        piece === 'unclassified-direction'
          ? {
              strength: 'default',
              approvalState: 'proposed',
              approvedBy: null,
              approvedAt: null,
              observability: 'human-only',
            }
          : {};
      const parsed = ruleFor(piece, overrides);
      expect(parsed.piece).toBe(piece);
      const reparsed = brandDirectionRuleSchema.parse(parsed);
      expect(canonicalDirectionJson(reparsed)).toBe(canonicalDirectionJson(parsed));
    });
  }

  it('rejects an out-of-range value in every piece', () => {
    const outOfRange: Record<BrandDirectionPiece, Record<string, unknown>> = {
      'visual-thesis': { statement: '' },
      composition: { layering: { overlapAllowed: false, maxLayers: 99, subjectOverType: true } },
      'typography-behaviour': { permittedScaleRegisters: 9 },
      'colour-behaviour': { contrastFloor: 99 },
      photography: { polishFloor: 'polished-commercial' },
      'illustration-graphic': {
        iconBehaviour: { strokeWidth: -1, cornerRadius: 0, gridUnit: 24, fillStyle: 'solid' },
      },
      motion: { shotDurationMs: { min: 4_000, max: 800, typical: 1_600 } },
      'people-characters': { skinRenderingFidelity: 'flawless' },
      'product-world': { useContextVsPackshot: { mode: 'packshot-only', contextShare: 4 } },
      'brand-integration': { maxOccurrences: 9 },
      'brand-signature': { frequency: { mode: 'sometimes', maxSharePerCampaign: 1 } },
      prohibition: { observableFailure: 'short' },
      'unclassified-direction': { legacyField: 'palette' },
    };

    for (const piece of BRAND_DIRECTION_PIECES) {
      const result = brandDirectionRuleSchema.safeParse({
        ...envelope('rule-out-of-range-0001', {
          strength: 'default',
          approvalState: 'proposed',
          approvedBy: null,
          approvedAt: null,
        }),
        piece,
        value: { ...(PIECE_VALUES[piece] as Record<string, unknown>), ...outOfRange[piece] },
      });
      expect([piece, result.success]).toEqual([piece, false]);
    }
  });

  it('rejects the polish vocabulary the spec drafted, keeping one scale in the codebase', () => {
    expect(violatesPolishFloor('studio-clean', 'raw-amateur')).toBe(true);
    expect(violatesPolishFloor('studio-clean', 'campaign-polished')).toBe(false);
    expect(violatesPolishFloor('studio-clean', 'studio-clean')).toBe(false);
  });

  it('strips an unknown top-level rule key rather than rejecting the rule', () => {
    const parsed = brandDirectionRuleSchema.parse({
      ...envelope('rule-future-0001'),
      futureField: 'from a newer writer',
      piece: 'visual-thesis',
      value: PIECE_VALUES['visual-thesis'],
    });
    expect('futureField' in parsed).toBe(false);
  });

  it('rejects an unknown key inside a value, because a half-understood rule is worse than none', () => {
    const result = brandDirectionRuleSchema.safeParse({
      ...envelope('rule-future-0002'),
      piece: 'visual-thesis',
      value: { ...PIECE_VALUES['visual-thesis'], mysteryField: 1 },
    });
    expect(result.success).toBe(false);
  });
});

describe('the document wrapper', () => {
  it('accepts zero rules and the 400-rule ceiling, and rejects 401', () => {
    const one = ruleFor('visual-thesis');
    const many = Array.from({ length: 400 }, (_, index) => ({ ...one, id: `rule-bulk-${index}` }));
    expect(
      brandDirectionDocumentSchema.safeParse({
        schemaVersion: 2,
        brandId: '5c1b6a10-8f2d-4d31-9d0a-6f0e2f0a1b2c',
        version: 1,
        checksum: computeDirectionChecksum([], []),
        rules: [],
        examples: [],
        updatedAt: T0,
      }).success,
    ).toBe(true);
    expect(
      brandDirectionDocumentSchema.safeParse({
        schemaVersion: 2,
        brandId: '5c1b6a10-8f2d-4d31-9d0a-6f0e2f0a1b2c',
        version: 1,
        checksum: computeDirectionChecksum(many, []),
        rules: many,
        examples: [],
        updatedAt: T0,
      }).success,
    ).toBe(true);
    expect(
      brandDirectionDocumentSchema.safeParse({
        schemaVersion: 2,
        brandId: '5c1b6a10-8f2d-4d31-9d0a-6f0e2f0a1b2c',
        version: 1,
        checksum: computeDirectionChecksum(many, []),
        rules: [...many, { ...one, id: 'rule-bulk-401' }],
        examples: [],
        updatedAt: T0,
      }).success,
    ).toBe(false);
  });

  it('requires at least one annotation on an example', () => {
    const base = {
      assetId: ASSET,
      versionId: VERSION,
      kind: 'positive' as const,
      appliesTo: ['product-still-life' as const],
      authority: 'approved' as const,
      rightsNote: null,
      addedBy: APPROVER,
      addedAt: T0,
    };
    expect(brandDirectionExampleSchema.safeParse({ ...base, annotations: [] }).success).toBe(false);
    expect(
      brandDirectionExampleSchema.safeParse({
        ...base,
        annotations: [{ dimension: 'photography', note: 'the falloff, not the couch' }],
      }).success,
    ).toBe(true);
  });
});

/* -------------------------------------------------------------------------- */
/*  Approval invariants                                                        */
/* -------------------------------------------------------------------------- */

describe('approval invariants R1-R6', () => {
  const attempt = (overrides: EnvelopeOverrides) =>
    brandDirectionRuleSchema.safeParse({
      ...envelope('rule-invariant-0001', overrides),
      piece: 'visual-thesis',
      value: PIECE_VALUES['visual-thesis'],
    });

  it('R1 rejects an approved rule with no approver stamps', () => {
    const result = attempt({ approvedBy: null, approvedAt: null });
    expect(result.success).toBe(false);
    expect(JSON.stringify(result.error?.issues)).toContain('R1');
  });

  it('R2 refuses to approve an inferred rule in one write', () => {
    for (const provenance of ['inferred-by-model', 'proposed-from-performance'] as const) {
      const result = attempt({ provenance, confidence: 0.5, strength: 'default' });
      expect(result.success).toBe(false);
      expect(JSON.stringify(result.error?.issues)).toContain('R2');
    }
  });

  it('R3 refuses a hard rule that is not approved', () => {
    const result = attempt({ approvalState: 'proposed', approvedBy: null, approvedAt: null });
    expect(result.success).toBe(false);
    expect(JSON.stringify(result.error?.issues)).toContain('R3');
  });

  it('R4 refuses a hard rule no bench can evaluate', () => {
    const result = attempt({ observability: 'human-only' });
    expect(result.success).toBe(false);
    expect(JSON.stringify(result.error?.issues)).toContain('R4');
  });

  it('R5 refuses a model that self-certifies above 0.8', () => {
    const result = attempt({
      provenance: 'inferred-by-model',
      confidence: 0.95,
      strength: 'default',
      approvalState: 'proposed',
      approvedBy: null,
      approvedAt: null,
    });
    expect(result.success).toBe(false);
    expect(JSON.stringify(result.error?.issues)).toContain('R5');
  });

  it('R6 refuses approval stamps on a rule that is not approved', () => {
    const result = attempt({ approvalState: 'proposed', strength: 'default' });
    expect(result.success).toBe(false);
    expect(JSON.stringify(result.error?.issues)).toContain('R6');
  });

  it('accepts a human-only rule when it is only a preference', () => {
    expect(attempt({ observability: 'human-only', strength: 'strong-preference' }).success).toBe(
      true,
    );
  });
});

describe('brand integration parse guards', () => {
  const integrationRule = (value: Record<string, unknown>) =>
    brandDirectionRuleSchema.safeParse({
      ...envelope('rule-integration-0001'),
      piece: 'brand-integration',
      value: { ...(PIECE_VALUES['brand-integration'] as Record<string, unknown>), ...value },
    });

  it('rejects an approved rule that permits a logo without naming the asset', () => {
    expect(integrationRule({ logoAssetRef: null }).success).toBe(false);
  });

  it('accepts a no-logo policy with no asset ref', () => {
    expect(integrationRule({ logoRenderPolicy: 'no-logo', logoAssetRef: null }).success).toBe(true);
  });

  it('rejects real-reference-required with no product asset refs', () => {
    expect(
      integrationRule({ productRenderPolicy: 'real-reference-required', productAssetRefs: [] })
        .success,
    ).toBe(false);
  });
});

describe('the prohibition vagueness guard', () => {
  const prohibition = (value: Record<string, unknown>) =>
    brandDirectionRuleSchema.safeParse({
      ...envelope('rule-prohibition-0001', { observability: 'vision-judge' }),
      piece: 'prohibition',
      value: { ...(PIECE_VALUES.prohibition as Record<string, unknown>), ...value },
    });

  it('rejects "do not look AI-generated" with a human detector', () => {
    const result = prohibition({
      observableFailure: 'do not look AI-generated',
      detector: 'human',
    });
    expect(result.success).toBe(false);
    expect(JSON.stringify(result.error?.issues)).toContain('unevaluable_prohibition');
  });

  it('accepts the same phrase when a real rubric backs it', () => {
    expect(
      prohibition({
        observableFailure: 'do not look AI-generated',
        detector: 'vision-judge-rubric',
        detectorConfig: { rubric: 'plastic skin, uniform bokeh, no depth cue' },
      }).success,
    ).toBe(true);
  });
});

/* -------------------------------------------------------------------------- */
/*  Branded authority                                                          */
/* -------------------------------------------------------------------------- */

describe('branded authority types', () => {
  it('refuses to brand a rule that fails R1/R2', () => {
    const proposed = brandDirectionRuleSchema.parse({
      ...envelope('rule-proposed-0001', {
        strength: 'default',
        approvalState: 'proposed',
        provenance: 'inferred-by-model',
        confidence: 0.4,
        approvedBy: null,
        approvedAt: null,
      }),
      piece: 'visual-thesis',
      value: PIECE_VALUES['visual-thesis'],
    });
    expect(asApprovedRule(proposed)).toBeNull();
    expect(asApprovedProhibition(proposed)).toBeNull();
    expect(asProposedRule(proposed)).toBe(proposed as ProposedRule);
  });

  it('refuses to brand an unclassified migration landing rule', () => {
    const legacy = ruleFor('unclassified-direction', {
      strength: 'default',
      approvalState: 'proposed',
      approvedBy: null,
      approvedAt: null,
      observability: 'human-only',
    });
    expect(asApprovedRule(legacy)).toBeNull();
  });

  it('brands an approved rule and narrows a prohibition', () => {
    expect(asApprovedRule(ruleFor('visual-thesis'))).not.toBeNull();
    expect(asApprovedProhibition(ruleFor('prohibition'))?.piece).toBe('prohibition');
    expect(asApprovedProhibition(ruleFor('visual-thesis'))).toBeNull();
  });

  it('cannot widen a proposal into an approved rule (compile-time)', () => {
    const proposal = asProposedRule(ruleFor('visual-thesis'));
    // @ts-expect-error a ProposedRule lacks the approved brand and can never be assigned.
    const smuggled: ApprovedRule = proposal;
    expect(smuggled.id).toBe('rule-visual-thesis-0001');

    const raw: BrandDirectionRule = ruleFor('visual-thesis');
    // @ts-expect-error an unbranded rule cannot be assigned either — only asApprovedRule mints one.
    const alsoSmuggled: ApprovedRule = raw;
    expect(alsoSmuggled.id).toBe('rule-visual-thesis-0001');
  });
});

/* -------------------------------------------------------------------------- */
/*  Tolerant read                                                              */
/* -------------------------------------------------------------------------- */

describe('readBrandDirection degrades instead of throwing', () => {
  it('treats absent, null and empty payloads as "no direction yet"', () => {
    for (const raw of [null, undefined, {}]) {
      expect(readBrandDirection(raw)).toEqual({ document: null, dropped: [] });
    }
  });

  it('refuses a future schema version without crashing', () => {
    const result = readBrandDirection({ schemaVersion: 3, rules: [], examples: [] });
    expect(result.document).toBeNull();
    expect(result.dropped).toHaveLength(1);
    expect(result.dropped[0].reason).toBe('unsupported_schema_version');
  });

  it('drops an unknown piece and keeps its valid siblings', () => {
    const valid = ruleFor('visual-thesis');
    const result = readBrandDirection({
      schemaVersion: 2,
      brandId: '5c1b6a10-8f2d-4d31-9d0a-6f0e2f0a1b2c',
      version: 2,
      updatedAt: T0,
      rules: [{ ...valid, id: 'rule-alien-0001', piece: 'vibes' }, valid],
      examples: [],
    });
    expect(result.dropped.map((drop) => drop.reason)).toEqual(['unknown_piece']);
    expect(result.document?.rules.map((rule) => rule.id)).toEqual(['rule-visual-thesis-0001']);
  });

  it('drops a whole rule for one unknown enum inside a known piece', () => {
    const valid = ruleFor('photography');
    const result = readBrandDirection({
      schemaVersion: 2,
      brandId: '5c1b6a10-8f2d-4d31-9d0a-6f0e2f0a1b2c',
      version: 2,
      updatedAt: T0,
      rules: [{ ...valid, value: { ...valid.value, polishFloor: 'hyper-polished' } }],
      examples: [],
    });
    expect(result.dropped[0].reason).toBe('unknown_enum');
    expect(result.document?.rules).toHaveLength(0);
  });

  it('drops a rule that claims approval without an approver, even straight from the DB', () => {
    const valid = ruleFor('visual-thesis');
    const result = readBrandDirection({
      schemaVersion: 2,
      brandId: '5c1b6a10-8f2d-4d31-9d0a-6f0e2f0a1b2c',
      version: 2,
      updatedAt: T0,
      rules: [{ ...valid, approvedBy: null, approvedAt: null }],
      examples: [],
    });
    expect(result.dropped[0].reason).toBe('failed_invariant');
    expect(result.document?.rules).toHaveLength(0);
  });

  it('recomputes the checksum over the rules that actually survived', () => {
    const valid = ruleFor('visual-thesis');
    const result = readBrandDirection({
      schemaVersion: 2,
      brandId: '5c1b6a10-8f2d-4d31-9d0a-6f0e2f0a1b2c',
      version: 2,
      updatedAt: T0,
      checksum: 'f'.repeat(64),
      rules: [valid, { ...valid, id: 'rule-alien-0002', piece: 'vibes' }],
      examples: [],
    });
    expect(result.document?.checksum).toBe(computeDirectionChecksum([valid], []));
  });
});

/* -------------------------------------------------------------------------- */
/*  Determinism primitives                                                     */
/* -------------------------------------------------------------------------- */

describe('canonicalisation and hashing', () => {
  it('is key-order independent', () => {
    expect(canonicalDirectionJson({ b: 1, a: { d: 2, c: 3 } })).toBe(
      canonicalDirectionJson({ a: { c: 3, d: 2 }, b: 1 }),
    );
  });

  it('matches the published SHA-256 vectors', () => {
    expect(directionSha256Hex('abc')).toBe(
      'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad',
    );
    expect(directionSha256Hex('')).toBe(
      'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
    );
  });

  it('hashes a document the same regardless of rule insertion order', () => {
    const a = ruleFor('visual-thesis');
    const b = ruleFor('composition');
    expect(computeDirectionChecksum([a, b], [])).toBe(computeDirectionChecksum([b, a], []));
  });
});

/* -------------------------------------------------------------------------- */
/*  Legacy migration                                                           */
/* -------------------------------------------------------------------------- */

describe('proposeDirectionFromLegacyImagery', () => {
  const tokens: BrandMdTokens = brandMdTokensSchema.parse({
    schema_version: 1,
    brand_name: 'Halden',
    imagery: {
      creative_direction: ['workshop tables, real hands, no styling'],
      mood: ['quiet', 'worn'],
      avoid: ['stock smiles', 'gradient backgrounds'],
    },
  });

  const migrate = (existing: BrandDirectionDocument | null = null) =>
    proposeDirectionFromLegacyImagery({
      brandId: '5c1b6a10-8f2d-4d31-9d0a-6f0e2f0a1b2c',
      tokens,
      capturedAt: T0,
      existing,
    });

  it('returns an empty batch when imagery is null', () => {
    const nullImagery = brandMdTokensSchema.parse({ schema_version: 1, brand_name: 'Halden' });
    expect(
      proposeDirectionFromLegacyImagery({
        brandId: '5c1b6a10-8f2d-4d31-9d0a-6f0e2f0a1b2c',
        tokens: nullImagery,
        capturedAt: T0,
        existing: null,
      }),
    ).toEqual({ rules: [], skipped: [] });
  });

  it('lands every string as an unapproved, unclassified proposal', () => {
    const { rules } = migrate();
    expect(rules).toHaveLength(5);
    for (const rule of rules) {
      expect(rule.piece).toBe('unclassified-direction');
      expect(rule.approvalState).toBe('proposed');
      expect(rule.strength).toBe('default');
      expect(rule.approvedBy).toBeNull();
      expect(rule.approvedAt).toBeNull();
      expect(rule.observability).toBe('human-only');
      expect(rule.sourceVersion.kind).toBe('brand-md');
    }
  });

  it('suggests a prohibition for avoid[] without manufacturing one', () => {
    const { rules } = migrate();
    const avoidRules = rules.filter(
      (rule) => rule.piece === 'unclassified-direction' && rule.value.legacyField === 'avoid',
    );
    expect(avoidRules).toHaveLength(2);
    for (const rule of avoidRules) {
      expect(rule.piece).toBe('unclassified-direction');
      if (rule.piece !== 'unclassified-direction') continue;
      expect(rule.value.suggestedPiece).toBe('prohibition');
    }
  });

  it('produces deterministic ids that survive cosmetic edits', () => {
    expect(legacyImageryRuleId('mood', ' Quiet ')).toBe(legacyImageryRuleId('mood', 'quiet'));
    expect(legacyImageryRuleId('mood', 'quiet')).not.toBe(legacyImageryRuleId('avoid', 'quiet'));
    expect(migrate().rules.map((rule) => rule.id)).toEqual(migrate().rules.map((rule) => rule.id));
  });

  it('is idempotent against the document it already produced', () => {
    const first = migrate();
    const document = documentOf(first.rules);
    const second = migrate(document);
    // Nothing is curated yet, so re-proposing is legal — but the ids are identical, which
    // is what makes the persistence layer's unique constraint a no-op rather than a dupe.
    expect(second.rules.map((rule) => rule.id)).toEqual(first.rules.map((rule) => rule.id));
    expect(new Set(second.rules.map((rule) => rule.id)).size).toBe(second.rules.length);
  });

  it('respects curation: an approved, rejected or retired rule is never re-proposed', () => {
    for (const state of ['approved', 'rejected', 'retired'] as const) {
      const id = legacyImageryRuleId('mood', 'quiet');
      const curated = brandDirectionRuleSchema.parse({
        ...envelope(id, {
          strength: 'default',
          approvalState: state,
          approvedBy: state === 'approved' ? APPROVER : null,
          approvedAt: state === 'approved' ? T0 : null,
          observability: 'human-only',
        }),
        piece: 'unclassified-direction',
        value: PIECE_VALUES['unclassified-direction'],
      });
      const batch = migrate(documentOf([curated]));
      expect(batch.skipped).toEqual([{ id, reason: 'already-curated' }]);
      expect(batch.rules.map((rule) => rule.id)).not.toContain(id);
    }
  });

  it('does not mutate the tokens it was handed', () => {
    const before = JSON.stringify(tokens);
    migrate();
    expect(JSON.stringify(tokens)).toBe(before);
  });
});

/* -------------------------------------------------------------------------- */
/*  Fixtures                                                                   */
/* -------------------------------------------------------------------------- */

describe('conflict fixtures', () => {
  it('ships the ten cases the compiler is built against', () => {
    expect(brandDirectionConflictFixtures.map((fixture) => fixture.id)).toEqual([
      'CF-01-gradient-forbidden-vs-preset-gradient',
      'CF-01b-gradient-forbidden-vs-preset-required-gradient',
      'CF-02a-campaign-accent-allowed',
      'CF-02b-campaign-accent-disallowed',
      'CF-02c-campaign-accent-forbidden-mode',
      'CF-03-polish-floor-vs-raw-amateur',
      'CF-03b-polish-floor-strong-preference',
      'CF-03c-polish-floor-applicability-miss',
      'CF-04-real-product-reference-vs-illustration-family',
      'CF-04b-illustration-with-approved-scoped-integration',
    ]);
  });

  for (const fixture of brandDirectionConflictFixtures) {
    it(`${fixture.id} is well-formed and every rule satisfies the invariants`, () => {
      expect(fixture.brandRules.length).toBeGreaterThan(0);
      for (const rule of fixture.brandRules) {
        const reparsed = brandDirectionRuleSchema.safeParse(rule);
        expect([rule.id, reparsed.success]).toEqual([rule.id, true]);
        expect(asApprovedRule(rule)).not.toBeNull();
      }
    });
  }
});
