// The ten conflict fixtures the compiler is built against.
//
// A conflict-resolution policy stated in prose is a policy nobody can regress. These
// fixtures fix the four cases that actually happen — brand versus preset, brand versus
// campaign colour, brand versus explicit user intent, brand versus the chosen medium —
// and pin the asymmetry the whole system turns on:
//
//   a PRESET preference is suppressible by the brand, silently but recorded;
//   explicit USER intent is never silently overridden — a hard brand rule against it
//   BLOCKS, with the rule id, the document version it came from, who approved it, and a
//   list of remedies.
//
// CF-03 and CF-03b are the pair that earns the strength enum: the same user intent
// against the same brand value produces a block or a recorded override purely on whether
// the rule is `hard` or `strong-preference`. If those two ever produce the same outcome,
// the strength field has stopped meaning anything.
//
// Every `brandRules` entry is parsed through `brandDirectionRuleSchema` at module load,
// so a fixture that drifts out of the contract fails at import rather than producing a
// misleading green compiler test. `expected` is the compiler's contract, asserted by the
// packet that owns compilation; this packet asserts only that the fixtures are
// well-formed and resolvable.

import type { ContentFamily } from '../creative-system/families';
import type { PolishLevel } from '../creative-system/vocabulary';
import {
  type BrandDirectionPiece,
  type BrandDirectionRule,
  type BrandDirectionRuleInput,
  type BrandRuleApprovalState,
  type BrandRuleProvenance,
  type BrandRuleSourceVersion,
  type BrandRuleStrength,
  brandDirectionRuleSchema,
} from './brand-direction';
import type { BrandDirectionPlanContext } from './brand-direction-resolve';

const APPROVER = '9f1c2d3e-4a5b-4c6d-8e9f-0a1b2c3d4e5f';
const LOGO_ASSET = '11111111-2222-4333-8444-555555555555';
const LOGO_VERSION = '66666666-7777-4888-8999-aaaaaaaaaaaa';
const PRODUCT_ASSET = 'bbbbbbbb-cccc-4ddd-8eee-ffffffffffff';
const PRODUCT_VERSION = '12121212-3434-4565-8787-989898989898';

/** Fails loudly at import with the offending id, instead of silently shipping a bad fixture. */
const rule = (input: BrandDirectionRuleInput): BrandDirectionRule => {
  const parsed = brandDirectionRuleSchema.safeParse(input);
  if (!parsed.success) {
    throw new Error(
      `brand-direction fixture "${input.id}" is invalid: ${parsed.error.issues
        .map((issue) => `${issue.path.join('.')}: ${issue.message}`)
        .join('; ')}`,
    );
  }
  return parsed.data;
};

const stillPlan = (
  overrides: Partial<BrandDirectionPlanContext> = {},
): BrandDirectionPlanContext => ({
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

/* -------------------------------------------------------------------------- */
/*  Fixture types                                                              */
/* -------------------------------------------------------------------------- */

export const BRAND_DIRECTION_CONFLICT_CLASSES = [
  'hard-conflict',
  'preference-override',
  'preset-suppressed',
  'unsatisfiable-plan',
  'applicability-miss',
] as const;
export type BrandDirectionConflictClass = (typeof BRAND_DIRECTION_CONFLICT_CLASSES)[number];

export type BrandDirectionFixturePresetFragment = {
  presetId: string;
  presetVersion: string;
  preferences?: Record<string, string>;
  required?: Record<string, string>;
};

export type BrandDirectionFixtureUserSpecFragment = {
  brief: string;
  style?: { polish?: PolishLevel };
  campaign?: { accent?: string; accentShare?: number };
};

export type BrandDirectionFixtureRemedy = {
  code: string;
  target?: string;
  detail?: string;
  explanation?: string;
  /** `'partial'` means the remedy removes some reasons but not all — `stillFails` names them. */
  resolves: boolean | 'partial';
  stillFails?: string[];
  creates?: {
    piece: BrandDirectionPiece;
    value: Record<string, unknown>;
    applicability?: Record<string, unknown>;
    approvalState: BrandRuleApprovalState;
    provenance: BrandRuleProvenance;
    strength?: BrandRuleStrength;
  };
};

export type BrandDirectionFixtureWarning = {
  code: string;
  severity: 'info' | 'warn' | 'error';
  detail?: string;
};

export type BrandDirectionFixtureExpectation = {
  class: BrandDirectionConflictClass;
  resolution: 'compile' | 'blocked';
  winner?: 'brand' | 'user';
  citedRuleIds?: string[];
  citedField?: string;
  conflictingInput?: string;
  brandValue?: string;
  requestedValue?: string;
  effectivePolish?: PolishLevel;
  overriddenRuleIds?: string[];
  suppressedPresetPaths?: string[];
  provenanceShown?: {
    provenance: BrandRuleProvenance;
    sourceVersion: BrandRuleSourceVersion;
    approvedBy: string;
    approvedAt: string;
  };
  message?: string;
  warnings?: BrandDirectionFixtureWarning[];
  informational?: Array<{ code: string; ruleId: string; reason: string }>;
  reasons?: Array<{ code: string; detail: string }>;
  violations?: string[];
  remedies?: BrandDirectionFixtureRemedy[];
  /** True when no single remedy in the list resolves every reported violation. */
  remediesPartial?: boolean;
  renderedFallback?: string;
  evaluationContractAdds?: string[];
  evaluationContractDrops?: string[];
  receiptAdds?: Record<string, unknown>;
  planForced?: string;
  scopedRulePreferred?: { general: string; scoped: string };
};

export type BrandDirectionConflictFixture = {
  id: string;
  title: string;
  family: ContentFamily;
  plan: BrandDirectionPlanContext;
  brandRules: BrandDirectionRule[];
  presetFragment: BrandDirectionFixturePresetFragment;
  userSpecFragment: BrandDirectionFixtureUserSpecFragment;
  expected: BrandDirectionFixtureExpectation;
};

/* -------------------------------------------------------------------------- */
/*  CF-01 — brand forbids gradients, preset prefers one                        */
/* -------------------------------------------------------------------------- */

const gradientProhibition = rule({
  id: 'rule-prohibit-gradient-mesh',
  piece: 'prohibition',
  value: {
    observableFailure: 'multi-stop gradient mesh used as a background field',
    category: 'colour',
    detector: 'palette-histogram',
    detectorConfig: { maxDistinctHuesInLargestRegion: 2, minRegionShare: 0.35 },
    severity: 'reject',
    exampleRefs: [],
    replacementGuidance:
      'Use one flat brand surface colour or a single-material photographic ground.',
  },
  applicability: {
    families: 'all',
    excludedFamilies: [],
    mediaKinds: ['still', 'motion', 'sequence'],
    channels: [],
  },
  strength: 'hard',
  provenance: 'approved-by-user',
  confidence: 1,
  approvalState: 'approved',
  sourceVersion: {
    kind: 'manual',
    ref: 'brand-book/prohibitions',
    versionId: null,
    capturedAt: '2026-07-01T10:00:00.000Z',
  },
  observability: 'deterministic',
  rationale: 'Gradient fields read as generic template work and dilute the flat-surface system.',
  supersedes: [],
  createdAt: '2026-07-01T10:00:00.000Z',
  updatedAt: '2026-07-01T10:00:00.000Z',
  approvedBy: APPROVER,
  approvedAt: '2026-07-01T10:00:00.000Z',
  lastAppliedAt: null,
});

const illustrationNoGradient = rule({
  id: 'rule-illustration-no-gradient',
  piece: 'illustration-graphic',
  value: {
    allowedMedia: ['vector', 'cut-paper', 'collage'],
    markMaking: ['flat hard-edged shapes', 'single-weight rule lines'],
    geometryOrganicBalance: 'geometric-lean',
    iconBehaviour: { strokeWidth: 2, cornerRadius: 0, gridUnit: 24, fillStyle: 'solid' },
    diagramStyle: {
      connectors: 'orthogonal',
      labelPlacement: 'outside',
      dataInkPolicy: 'minimal',
    },
    printProcesses: ['screenprint'],
    prohibitedStockMotifs: ['gradient mesh', 'aurora blur', 'glass morphism panel'],
    aiSignatureBans: [
      { kind: 'novel', signature: 'soft neon gradient vapour', detector: 'vision-judge' },
      { kind: 'known', signature: 'hdr-halo-edges', detector: 'vision-judge' },
    ],
  },
  applicability: {
    families: 'all',
    excludedFamilies: [],
    mediaKinds: ['still', 'motion', 'sequence'],
    channels: [],
  },
  strength: 'hard',
  provenance: 'approved-by-user',
  confidence: 1,
  approvalState: 'approved',
  sourceVersion: {
    kind: 'manual',
    ref: 'brand-book/illustration',
    versionId: null,
    capturedAt: '2026-07-01T10:00:00.000Z',
  },
  observability: 'vision-judge',
  rationale: 'The graphic system is flat spot colour; gradients are the tell of a template.',
  supersedes: [],
  createdAt: '2026-07-01T10:05:00.000Z',
  updatedAt: '2026-07-01T10:05:00.000Z',
  approvedBy: APPROVER,
  approvedAt: '2026-07-01T10:05:00.000Z',
  lastAppliedAt: null,
});

const gradientPlan = stillPlan({
  medium: 'mixed',
  textStrategy: 'reserved-overlay',
  involvesProduct: true,
  involvesLogo: true,
});

const CF_01: BrandDirectionConflictFixture = {
  id: 'CF-01-gradient-forbidden-vs-preset-gradient',
  title: 'Brand forbids gradient fields; the preset prefers one',
  family: 'campaign-key-visual',
  plan: gradientPlan,
  brandRules: [gradientProhibition, illustrationNoGradient],
  presetFragment: {
    presetId: 'first-party/bold-commercial/gradient-field',
    presetVersion: '1.0.0',
    preferences: { backgroundTreatment: 'soft-gradient-field', accentBehaviour: 'gradient-sweep' },
    required: { attentionDevice: 'one-loud-accent' },
  },
  userSpecFragment: { brief: 'Launch key visual for the new bottle.' },
  expected: {
    class: 'preset-suppressed',
    resolution: 'compile',
    winner: 'brand',
    suppressedPresetPaths: ['preferences.backgroundTreatment', 'preferences.accentBehaviour'],
    citedRuleIds: ['rule-prohibit-gradient-mesh', 'rule-illustration-no-gradient'],
    warnings: [{ code: 'preset_preference_suppressed_by_brand', severity: 'info' }],
    renderedFallback:
      "preset.required.attentionDevice is preserved; background resolves to the brand's flat dominant surface",
    evaluationContractAdds: [
      'palette-histogram:gradient-mesh',
      'vision-judge:soft-neon-gradient-vapour',
    ],
  },
};

const CF_01B: BrandDirectionConflictFixture = {
  id: 'CF-01b-gradient-forbidden-vs-preset-required-gradient',
  title: 'The same brand rules against a preset whose REQUIRED structure is the gradient',
  family: 'campaign-key-visual',
  plan: gradientPlan,
  brandRules: [gradientProhibition, illustrationNoGradient],
  presetFragment: {
    presetId: 'first-party/bold-commercial/gradient-field',
    presetVersion: '1.0.0',
    required: { backgroundTreatment: 'soft-gradient-field', attentionDevice: 'one-loud-accent' },
  },
  userSpecFragment: { brief: 'Launch key visual for the new bottle.' },
  expected: {
    class: 'hard-conflict',
    resolution: 'blocked',
    winner: 'brand',
    citedRuleIds: ['rule-prohibit-gradient-mesh', 'rule-illustration-no-gradient'],
    citedField: 'required.backgroundTreatment',
    warnings: [{ code: 'preset_required_violates_hard_brand_rule', severity: 'error' }],
    remedies: [
      {
        code: 'choose-a-different-preset',
        detail: 'A preset whose required structure violates a hard brand rule is not compilable.',
        resolves: true,
      },
    ],
  },
};

/* -------------------------------------------------------------------------- */
/*  CF-02 — campaign accent allowed / disallowed                               */
/* -------------------------------------------------------------------------- */

const accentPolicyValue = {
  roleRatios: [
    { role: 'dominant' as const, minShare: 0.45, maxShare: 0.8 },
    { role: 'accent' as const, minShare: 0, maxShare: 0.15 },
  ],
  backgroundSurfacePairs: [],
  contrastFloor: 4.5,
  prohibitedPairings: [{ a: '#ff4d00', b: '#00e5ff', reason: 'reads as a competitor lockup' }],
  substituteForColour: 'material' as const,
  saturationPolicy: 'natural' as const,
  neutralPolicy: { allowed: ['#ffffff', '#111111'], roleLimit: 'support-only' as const },
};

const accentRuleEnvelope = {
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
  sourceVersion: {
    kind: 'manual' as const,
    ref: 'brand-book/colour',
    versionId: null,
    capturedAt: '2026-05-20T09:00:00.000Z',
  },
  observability: 'deterministic' as const,
  rationale:
    'The accent is the only saturated colour the system permits; share is capped so it stays an accent.',
  supersedes: [],
  createdAt: '2026-05-20T09:00:00.000Z',
  updatedAt: '2026-05-20T09:00:00.000Z',
  approvedBy: APPROVER,
  approvedAt: '2026-05-20T09:00:00.000Z',
  lastAppliedAt: null,
};

const accentPreapprovedRule = rule({
  ...accentRuleEnvelope,
  id: 'rule-campaign-accent-policy',
  piece: 'colour-behaviour',
  value: {
    ...accentPolicyValue,
    campaignAccentPolicy: { mode: 'preapproved-list', allowed: ['#ff4d00'], maxShare: 0.15 },
  },
});

const accentForbiddenRule = rule({
  ...accentRuleEnvelope,
  id: 'rule-campaign-accent-policy',
  piece: 'colour-behaviour',
  value: {
    ...accentPolicyValue,
    campaignAccentPolicy: { mode: 'forbidden', allowed: [], maxShare: 0 },
  },
});

const accentPlan = stillPlan({
  medium: 'mixed',
  textStrategy: 'reserved-overlay',
  involvesProduct: true,
  involvesLogo: true,
});

const CF_02A: BrandDirectionConflictFixture = {
  id: 'CF-02a-campaign-accent-allowed',
  title: 'Campaign requests a pre-approved accent within its share cap',
  family: 'campaign-key-visual',
  plan: accentPlan,
  brandRules: [accentPreapprovedRule],
  presetFragment: { presetId: 'first-party/bold-commercial/flat-surface', presetVersion: '1.0.0' },
  userSpecFragment: {
    brief: 'Spring campaign key visual.',
    campaign: { accent: '#ff4d00', accentShare: 0.1 },
  },
  expected: {
    class: 'applicability-miss',
    resolution: 'compile',
    citedRuleIds: ['rule-campaign-accent-policy'],
    receiptAdds: {
      accent: '#ff4d00',
      share: 0.1,
      policyMode: 'preapproved-list',
      ruleId: 'rule-campaign-accent-policy',
    },
    evaluationContractAdds: ['palette-share:accent<=0.15'],
  },
};

const CF_02B: BrandDirectionConflictFixture = {
  id: 'CF-02b-campaign-accent-disallowed',
  title: 'Campaign requests an unlisted accent above the share cap',
  family: 'campaign-key-visual',
  plan: accentPlan,
  brandRules: [accentPreapprovedRule],
  presetFragment: { presetId: 'first-party/bold-commercial/flat-surface', presetVersion: '1.0.0' },
  userSpecFragment: {
    brief: 'Spring campaign key visual.',
    campaign: { accent: '#00e5ff', accentShare: 0.2 },
  },
  expected: {
    class: 'hard-conflict',
    resolution: 'blocked',
    winner: 'brand',
    citedRuleIds: ['rule-campaign-accent-policy'],
    citedField: 'colour-behaviour.campaignAccentPolicy',
    violations: [
      'accent-not-in-allowed-list',
      'accent-share-exceeds-max',
      'prohibited-pairing-hit',
    ],
    remediesPartial: true,
    remedies: [
      { code: 'use-allowed-accent', target: '#ff4d00', resolves: true },
      {
        code: 'request-accent-approval',
        explanation:
          'Extends the allowed list, but only once a human approves it — the compiler cannot self-approve a rule (R1).',
        creates: {
          piece: 'colour-behaviour',
          value: {
            campaignAccentPolicy: {
              mode: 'preapproved-list',
              allowed: ['#ff4d00', '#00e5ff'],
              maxShare: 0.2,
            },
          },
          approvalState: 'proposed',
          provenance: 'approved-by-user',
          strength: 'strong-preference',
        },
        resolves: false,
      },
      {
        code: 'reduce-share',
        detail: 'Resolves the share violation only; the accent is still not on the allowed list.',
        resolves: 'partial',
        stillFails: ['accent-not-in-allowed-list', 'prohibited-pairing-hit'],
      },
    ],
  },
};

const CF_02C: BrandDirectionConflictFixture = {
  id: 'CF-02c-campaign-accent-forbidden-mode',
  title: 'Accent mode is forbidden, so even the pre-approved hex blocks',
  family: 'campaign-key-visual',
  plan: accentPlan,
  brandRules: [accentForbiddenRule],
  presetFragment: { presetId: 'first-party/bold-commercial/flat-surface', presetVersion: '1.0.0' },
  userSpecFragment: {
    brief: 'Spring campaign key visual.',
    campaign: { accent: '#ff4d00', accentShare: 0.1 },
  },
  expected: {
    class: 'hard-conflict',
    resolution: 'blocked',
    winner: 'brand',
    citedRuleIds: ['rule-campaign-accent-policy'],
    citedField: 'colour-behaviour.campaignAccentPolicy.mode',
    violations: ['campaign-accents-forbidden'],
    message: 'mode is evaluated before allowed; a forbidden policy admits no hex at all',
    remedies: [
      {
        code: 'drop-campaign-accent',
        detail: 'Compose the campaign from the brand palette with no campaign accent.',
        resolves: true,
      },
    ],
  },
};

/* -------------------------------------------------------------------------- */
/*  CF-03 — polish floor versus explicit raw-amateur intent                    */
/* -------------------------------------------------------------------------- */

const polishFloorValue = {
  // Spec drafted `polished-commercial`; the frozen ordinal scale calls this `studio-clean`.
  polishFloor: 'studio-clean' as const,
  realismMode: 'constructed-studio' as const,
  lightingLogic: {
    key: 'soft' as const,
    direction: 'top-left-45',
    shadowBehaviour: 'controlled-falloff',
    note: 'no on-camera flash',
  },
  postProcessing: {
    grain: 'none' as const,
    halation: false,
    colourGrade: 'neutral-accurate',
    retouchPolicy: 'standard-commercial' as const,
  },
  productDepictionRequiresReference: true,
  identityPreservation: 'strict' as const,
  cameraDistance: 'close' as const,
  lensCharacter: 'telephoto-compression' as const,
  angleTendency: 'three-quarter' as const,
  pointOfView: 'observer' as const,
  movementGesture: 'still' as const,
  subjectMatter: ['the product'],
  environment: ['seamless studio sweep'],
  props: { allowed: ['ingredient', 'material sample'], forbidden: ['hands', 'clutter'] },
  castingSummary: null,
};

const polishFloorSourceVersion: BrandRuleSourceVersion = {
  kind: 'uploaded-document',
  ref: 'brand-guidelines-2026.pdf',
  versionId: 'v3',
  capturedAt: '2026-06-10T00:00:00.000Z',
};

const polishFloorEnvelope = {
  id: 'rule-photography-polish-floor',
  piece: 'photography' as const,
  value: polishFloorValue,
  applicability: {
    families: ['product-still-life' as const, 'campaign-key-visual' as const, 'packaging' as const],
    excludedFamilies: ['creator-ugc' as const],
    mediaKinds: ['still' as const],
    channels: [],
  },
  provenance: 'extracted-from-source' as const,
  confidence: 0.95,
  approvalState: 'approved' as const,
  approvedBy: APPROVER,
  approvedAt: '2026-06-12T09:30:00.000Z',
  observability: 'vision-judge' as const,
  sourceVersion: polishFloorSourceVersion,
  rationale: 'Retail partners reject non-commercial product imagery.',
  supersedes: [],
  createdAt: '2026-06-12T09:30:00.000Z',
  updatedAt: '2026-06-12T09:30:00.000Z',
  lastAppliedAt: null,
};

const polishFloorHard = rule({ ...polishFloorEnvelope, strength: 'hard' });
const polishFloorPreference = rule({ ...polishFloorEnvelope, strength: 'strong-preference' });

const polishPlan = stillPlan({
  medium: 'photographic',
  involvesProduct: true,
  involvesLogo: true,
  channels: ['paid-social'],
});

const polishPreset: BrandDirectionFixturePresetFragment = {
  presetId: 'first-party/studio-product/clean-seamless-packshot',
  presetVersion: '1.0.0',
};

const polishUserSpec: BrandDirectionFixtureUserSpecFragment = {
  brief: 'Make it look like a real customer shot it on a phone.',
  style: { polish: 'raw-amateur' },
};

const CF_03: BrandDirectionConflictFixture = {
  id: 'CF-03-polish-floor-vs-raw-amateur',
  title: 'Brand requires studio-clean product photography; user asks for raw-amateur',
  family: 'product-still-life',
  plan: polishPlan,
  brandRules: [polishFloorHard],
  presetFragment: polishPreset,
  userSpecFragment: polishUserSpec,
  expected: {
    class: 'hard-conflict',
    resolution: 'blocked',
    winner: 'brand',
    conflictingInput: 'spec.style.polish',
    citedRuleIds: ['rule-photography-polish-floor'],
    citedField: 'photography.polishFloor',
    brandValue: 'studio-clean',
    requestedValue: 'raw-amateur',
    provenanceShown: {
      provenance: 'extracted-from-source',
      sourceVersion: polishFloorSourceVersion,
      approvedBy: APPROVER,
      approvedAt: '2026-06-12T09:30:00.000Z',
    },
    message:
      'Your brand’s approved photography rule sets a polish floor of "studio-clean" for product-still-life. It came from brand-guidelines-2026.pdf (v3) and was approved on 2026-06-12. "raw-amateur" is below that floor.',
    remedies: [
      {
        code: 'switch-family',
        target: 'creator-ugc',
        explanation:
          'This rule explicitly excludes creator-ugc. Generating the same brief as a creator-style asset satisfies both the brand and the raw-amateur intent.',
        resolves: true,
      },
      {
        code: 'request-scoped-exception',
        explanation:
          'Propose a scoped exception; it takes effect only after a human approves it in Brand Book.',
        creates: {
          piece: 'photography',
          value: { polishFloor: 'raw-amateur' },
          applicability: { families: ['product-still-life'], channels: ['paid-social'] },
          approvalState: 'proposed',
          provenance: 'approved-by-user',
          strength: 'strong-preference',
        },
        resolves: false,
      },
      {
        code: 'downgrade-strength',
        target: 'rule-photography-polish-floor',
        explanation:
          'Change the Brand Book rule from hard to strong-preference; the same request then compiles with a recorded override.',
        resolves: true,
      },
    ],
  },
};

const CF_03B: BrandDirectionConflictFixture = {
  id: 'CF-03b-polish-floor-strong-preference',
  title: 'The same rule as a strong preference compiles and records an override',
  family: 'product-still-life',
  plan: polishPlan,
  brandRules: [polishFloorPreference],
  presetFragment: polishPreset,
  userSpecFragment: polishUserSpec,
  expected: {
    class: 'preference-override',
    resolution: 'compile',
    winner: 'user',
    effectivePolish: 'raw-amateur',
    overriddenRuleIds: ['rule-photography-polish-floor'],
    warnings: [
      {
        code: 'brand_preference_overridden_by_user',
        severity: 'warn',
        detail: 'photography.polishFloor: brand prefers studio-clean, user requested raw-amateur',
      },
    ],
    receiptAdds: {
      overrides: [
        {
          ruleId: 'rule-photography-polish-floor',
          field: 'photography.polishFloor',
          brandValue: 'studio-clean',
          appliedValue: 'raw-amateur',
          provenance: 'extracted-from-source',
          acknowledged: true,
        },
      ],
    },
    evaluationContractDrops: ['vision-judge:commercial-retouch-adherence'],
  },
};

const CF_03C: BrandDirectionConflictFixture = {
  id: 'CF-03c-polish-floor-applicability-miss',
  title: 'The same hard rule is silent because the family is excluded',
  family: 'creator-ugc',
  plan: polishPlan,
  brandRules: [polishFloorHard],
  presetFragment: polishPreset,
  userSpecFragment: polishUserSpec,
  expected: {
    class: 'applicability-miss',
    resolution: 'compile',
    informational: [
      {
        code: 'rule_not_applicable',
        ruleId: 'rule-photography-polish-floor',
        reason: 'family excluded by the rule',
      },
    ],
  },
};

/* -------------------------------------------------------------------------- */
/*  CF-04 — real product reference required, family is illustration            */
/* -------------------------------------------------------------------------- */

const brandIntegrationCore = rule({
  id: 'rule-brand-integration-core',
  piece: 'brand-integration',
  value: {
    logoRenderPolicy: 'composited-from-asset-only',
    logoAssetRef: { assetId: LOGO_ASSET, versionId: LOGO_VERSION },
    placementLaws: [{ zone: 'bottom-right', priority: 1 }],
    clearSpace: { unit: 'logo-height', multiple: 1 },
    minimumSize: { unit: 'percent-of-shortest-edge', value: 6, contextNote: '9:16 crops' },
    maxOccurrences: 1,
    forbiddenTreatments: [
      'stretch',
      'rotate',
      'recolour-outside-palette',
      'gradient-fill',
      'drop-shadow',
      'perspective-warp',
    ],
    coBrandingRules: {
      allowed: false,
      lockupOrder: 'brand-first',
      separatorRule: null,
      partnerMinClearSpace: null,
    },
    productRenderPolicy: 'real-reference-required',
    productAssetRefs: [{ assetId: PRODUCT_ASSET, versionId: PRODUCT_VERSION, role: 'packaging' }],
    packagingTextPolicy: 'verbatim-from-asset',
    signatureMarkBehaviour: { markId: null, whenRequired: 'never', frequency: 0 },
    integrationMechanism: 'in-world-placement',
    verificationHooks: [
      'logo-pixel-diff',
      'ocr-label-match',
      'reference-composite-required',
      'clear-space-geometry',
      'occurrence-count',
    ],
  },
  applicability: {
    families: 'all',
    excludedFamilies: [],
    mediaKinds: ['still', 'motion', 'sequence'],
    channels: [],
  },
  strength: 'hard',
  provenance: 'approved-by-user',
  confidence: 1,
  approvalState: 'approved',
  sourceVersion: {
    kind: 'manual',
    ref: 'brand-book/integration',
    versionId: null,
    capturedAt: '2026-04-02T08:00:00.000Z',
  },
  observability: 'deterministic',
  rationale: 'A hallucinated mark or invented pack is a hard fail with retail partners.',
  supersedes: [],
  createdAt: '2026-04-02T08:00:00.000Z',
  updatedAt: '2026-04-02T08:00:00.000Z',
  approvedBy: APPROVER,
  approvedAt: '2026-04-02T08:00:00.000Z',
  lastAppliedAt: null,
});

const brandIntegrationIllustration = rule({
  id: 'rule-brand-integration-illustration',
  piece: 'brand-integration',
  value: {
    logoRenderPolicy: 'composited-from-asset-only',
    logoAssetRef: { assetId: LOGO_ASSET, versionId: LOGO_VERSION },
    placementLaws: [{ zone: 'bottom-right', priority: 1 }],
    clearSpace: { unit: 'logo-height', multiple: 1 },
    minimumSize: { unit: 'percent-of-shortest-edge', value: 6, contextNote: null },
    maxOccurrences: 1,
    forbiddenTreatments: ['stretch', 'rotate', 'recolour-outside-palette'],
    coBrandingRules: {
      allowed: false,
      lockupOrder: 'brand-first',
      separatorRule: null,
      partnerMinClearSpace: null,
    },
    productRenderPolicy: 'model-may-render-from-reference',
    productAssetRefs: [{ assetId: PRODUCT_ASSET, versionId: PRODUCT_VERSION, role: 'geometry' }],
    packagingTextPolicy: 'no-legible-text',
    signatureMarkBehaviour: { markId: null, whenRequired: 'never', frequency: 0 },
    integrationMechanism: 'in-world-placement',
    verificationHooks: ['logo-pixel-diff', 'reference-composite-required', 'occurrence-count'],
  },
  applicability: {
    families: ['editorial-illustration', 'icon-illustration-system'],
    excludedFamilies: [],
    mediaKinds: ['still', 'motion', 'sequence'],
    channels: [],
  },
  strength: 'hard',
  provenance: 'approved-by-user',
  confidence: 1,
  approvalState: 'approved',
  sourceVersion: {
    kind: 'manual',
    ref: 'brand-book/integration-illustration',
    versionId: null,
    capturedAt: '2026-06-30T08:00:00.000Z',
  },
  observability: 'deterministic',
  rationale: 'Illustration cannot reproduce label text, so the pack is drawn without legible copy.',
  supersedes: [],
  createdAt: '2026-06-30T08:00:00.000Z',
  updatedAt: '2026-06-30T08:00:00.000Z',
  approvedBy: APPROVER,
  approvedAt: '2026-06-30T08:00:00.000Z',
  lastAppliedAt: null,
});

const illustrationPlan = stillPlan({
  medium: 'illustrated',
  involvesProduct: true,
  involvesLogo: true,
  referenceRoles: ['borrow-treatment', 'borrow-composition'],
});

const illustrationPreset: BrandDirectionFixturePresetFragment = {
  presetId: 'first-party/conceptual-illustration/cut-paper-metaphor',
  presetVersion: '1.0.0',
};

const illustrationUserSpec: BrandDirectionFixtureUserSpecFragment = {
  brief: 'Editorial cover: our bottle as the hero of a cut-paper metaphor.',
};

const CF_04: BrandDirectionConflictFixture = {
  id: 'CF-04-real-product-reference-vs-illustration-family',
  title: 'A hard integration rule cannot be satisfied by an illustration plan',
  family: 'editorial-illustration',
  plan: illustrationPlan,
  brandRules: [brandIntegrationCore],
  presetFragment: illustrationPreset,
  userSpecFragment: illustrationUserSpec,
  expected: {
    class: 'unsatisfiable-plan',
    resolution: 'blocked',
    citedRuleIds: ['rule-brand-integration-core'],
    reasons: [
      {
        code: 'missing_subject_identity_reference',
        detail:
          'productRenderPolicy is real-reference-required, but the plan carries only treatment and composition references.',
      },
      {
        code: 'medium_cannot_satisfy_verbatim_label',
        detail:
          'packagingTextPolicy is verbatim-from-asset; a cut-paper illustration cannot reproduce label text verbatim.',
      },
      {
        code: 'logo_cannot_be_model_rendered',
        detail:
          'logoRenderPolicy is composited-from-asset-only; the selected single-generation illustration plan has no composite step.',
      },
    ],
    remediesPartial: true,
    remedies: [
      {
        code: 'attach-product-reference-and-recompile',
        detail:
          'Attach productAssetRefs[0] as a preserve-product-identity reference and switch the plan to generate-then-compose.',
        resolves: 'partial',
        stillFails: ['medium_cannot_satisfy_verbatim_label'],
      },
      {
        code: 'relax-packaging-text-policy',
        creates: {
          piece: 'brand-integration',
          value: { packagingTextPolicy: 'no-legible-text' },
          applicability: { families: ['editorial-illustration'] },
          approvalState: 'proposed',
          provenance: 'approved-by-user',
        },
        resolves: 'partial',
        stillFails: ['missing_subject_identity_reference'],
      },
      {
        code: 'scope-rule-to-photographic-families',
        detail:
          'Restrict rule-brand-integration-core.applicability.families to the photographic families and author a separate illustration-scoped integration rule.',
        resolves: true,
      },
      {
        code: 'remove-product-from-illustration',
        detail:
          'Illustrate the metaphor without depicting the product; place the logo as a composited endmark.',
        resolves: true,
      },
    ],
  },
};

const CF_04B: BrandDirectionConflictFixture = {
  id: 'CF-04b-illustration-with-approved-scoped-integration',
  title: 'A family-scoped integration rule beats the general one and the plan compiles',
  family: 'editorial-illustration',
  plan: illustrationPlan,
  brandRules: [brandIntegrationCore, brandIntegrationIllustration],
  presetFragment: illustrationPreset,
  userSpecFragment: illustrationUserSpec,
  expected: {
    class: 'applicability-miss',
    resolution: 'compile',
    citedRuleIds: ['rule-brand-integration-illustration'],
    planForced: 'generate-then-compose',
    scopedRulePreferred: {
      general: 'rule-brand-integration-core',
      scoped: 'rule-brand-integration-illustration',
    },
    warnings: [{ code: 'scoped_rule_preferred_over_general', severity: 'info' }],
  },
};

/* -------------------------------------------------------------------------- */
/*  The set                                                                    */
/* -------------------------------------------------------------------------- */

export const brandDirectionConflictFixtures: readonly BrandDirectionConflictFixture[] =
  Object.freeze([CF_01, CF_01B, CF_02A, CF_02B, CF_02C, CF_03, CF_03B, CF_03C, CF_04, CF_04B]);

export const brandDirectionConflictFixtureById = (
  id: string,
): BrandDirectionConflictFixture | undefined =>
  brandDirectionConflictFixtures.find((fixture) => fixture.id === id);
