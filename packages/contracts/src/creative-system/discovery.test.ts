import { describe, expect, test } from 'bun:test';

import {
  attachTasteExampleInputSchema,
  inspectTasteObjectInputSchema,
  isTasteCardWithinBound,
  previewTastePlanInputSchema,
  publishTasteVersionInputSchema,
  resolveTasteRecipeInputSchema,
  searchTasteLibraryInputSchema,
  searchTasteLibraryOutputSchema,
  TASTE_CARD_MAX_CODE_POINTS,
  TASTE_ELIMINATING_TIERS,
  TASTE_INSPECT_DEFAULT_CODE_POINTS,
  TASTE_INSPECT_MAX_CODE_POINTS,
  TASTE_RANKING_TIERS,
  TASTE_READ_TOOLS,
  TASTE_SEARCH_DEFAULT_LIMIT,
  TASTE_SEARCH_MAX_LIMIT,
  TASTE_TOOL_NAMES,
  TASTE_WRITE_TOOLS,
  tasteCardCodePoints,
  tasteToolResultSchema,
} from './discovery';
import { tasteManifestCardSchema } from './library';

const BRAND = '3f1a2b0c-4d5e-4f60-9a1b-2c3d4e5f6a7b';

const card = tasteManifestCardSchema.parse({
  id: 'poster.club-night.photographic-strobe',
  version: 1,
  kind: 'taste-preset',
  name: 'Photographic strobe',
  summary: 'Repeat one photographed subject until it degrades into motion ghosts.',
  familyId: 'event-promotion',
  preFormatIds: ['club-night'],
  communicationJobs: ['announce'],
  mechanisms: ['repeat-and-degrade'],
  placements: ['4:5'],
  polishLevel: 'documentary-candid',
  styleIds: ['punk-xerox'],
  requiredInputs: ['event-details'],
  requiredReferenceRoles: [],
  copyStrategies: ['generate-then-compose'],
  supportedPlanKinds: ['generate-then-compose'],
  qualification: 'draft',
  ownership: 'first-party',
  brandCompatibility: 'compatible',
  providerCompatibility: ['google.gemini-3.1-flash-image.v1'],
  costBand: 'low',
  latencyBand: 'fast',
  previewAsset: null,
  whyItWorks: 'The repetition visually performs all-night movement.',
});

describe('the tool surface', () => {
  test('is nine stable names split into reads and permissioned writes', () => {
    expect(TASTE_READ_TOOLS.length).toBe(4);
    expect(TASTE_WRITE_TOOLS.length).toBe(5);
    expect(TASTE_TOOL_NAMES.length).toBe(9);
    expect(new Set(TASTE_TOOL_NAMES).size).toBe(9);
  });

  test('carries no generation tool — generation belongs to the harness', () => {
    for (const name of TASTE_TOOL_NAMES) {
      expect(name).not.toContain('generate');
      expect(name).not.toContain('render');
      expect(name).not.toContain('execute');
    }
  });
});

describe('the ranking ladder', () => {
  test('is doc 25s order, with similarity second-to-last and diversity last', () => {
    expect([...TASTE_RANKING_TIERS]).toEqual([
      'tenancy-and-status',
      'family-placement-provider-eligibility',
      'brand-hard-compatibility',
      'required-input-availability',
      'job-and-mechanism-relevance',
      'qualification-evidence',
      'brand-approved-examples',
      'cost-and-latency',
      'semantic-similarity',
      'controlled-diversity',
    ]);
  });

  test('places semantic similarity strictly below every compatibility tier', () => {
    const similarity = TASTE_RANKING_TIERS.indexOf('semantic-similarity');
    for (const tier of [
      'brand-hard-compatibility',
      'family-placement-provider-eligibility',
      'required-input-availability',
    ] as const) {
      expect(TASTE_RANKING_TIERS.indexOf(tier)).toBeLessThan(similarity);
    }
  });

  test('eliminates only on tenancy/status and hard eligibility', () => {
    expect([...TASTE_ELIMINATING_TIERS]).toEqual([
      'tenancy-and-status',
      'family-placement-provider-eligibility',
    ]);
  });
});

describe('search input', () => {
  test('defaults to a bounded result set', () => {
    const parsed = searchTasteLibraryInputSchema.parse({ brandId: BRAND });
    expect(parsed.limit).toBe(TASTE_SEARCH_DEFAULT_LIMIT);
    expect(TASTE_SEARCH_DEFAULT_LIMIT).toBeLessThanOrEqual(TASTE_SEARCH_MAX_LIMIT);
  });

  test('refuses a limit above the hard cap', () => {
    const parsed = searchTasteLibraryInputSchema.safeParse({
      brandId: BRAND,
      limit: TASTE_SEARCH_MAX_LIMIT + 1,
    });
    expect(parsed.success).toBe(false);
  });

  test('refuses an unknown facet rather than ignoring it', () => {
    const parsed = searchTasteLibraryInputSchema.safeParse({ brandId: BRAND, vibe: 'luxury' });
    expect(parsed.success).toBe(false);
  });
});

describe('search output', () => {
  test('carries only manifest cards, and cards stay inside the context bound', () => {
    const out = searchTasteLibraryOutputSchema.parse({
      cards: [card],
      totalEligible: 1,
      totalConsidered: 40,
      appliedFilters: [
        { facet: 'familyId', value: 'event-promotion', eliminated: 39, relaxable: true },
      ],
      distinctDirections: 1,
      withheldNearDuplicates: 0,
      diversityNote: 'one direction available',
      contextCodePoints: tasteCardCodePoints(card),
    });
    expect(out.cards).toHaveLength(1);
    expect(isTasteCardWithinBound(card)).toBe(true);
    expect(tasteCardCodePoints(card)).toBeLessThanOrEqual(TASTE_CARD_MAX_CODE_POINTS);
  });

  test('refuses a card carrying a preset body', () => {
    const withBody = { ...card, laws: ['a law that should never reach a search result'] };
    const out = searchTasteLibraryOutputSchema.safeParse({
      cards: [withBody],
      totalEligible: 1,
      totalConsidered: 1,
      appliedFilters: [],
      distinctDirections: 1,
      withheldNearDuplicates: 0,
      diversityNote: 'x y z',
      contextCodePoints: 0,
    });
    expect(out.success).toBe(false);
  });

  test('refuses more cards than the hard cap', () => {
    const out = searchTasteLibraryOutputSchema.safeParse({
      cards: Array.from({ length: TASTE_SEARCH_MAX_LIMIT + 1 }, () => card),
      totalEligible: 13,
      totalConsidered: 13,
      appliedFilters: [],
      distinctDirections: 1,
      withheldNearDuplicates: 0,
      diversityNote: 'x y z',
      contextCodePoints: 0,
    });
    expect(out.success).toBe(false);
  });
});

describe('the tool envelope', () => {
  const envelope = tasteToolResultSchema(searchTasteLibraryOutputSchema);

  const errorBase = {
    status: 'error' as const,
    summary: 'The provider filter eliminated every candidate.',
    warnings: [
      {
        code: 'PROVIDER_INCOMPATIBLE' as const,
        message: 'No eligible object supports fal.flux-2.v1.',
        objectId: null,
        field: 'providerId',
      },
    ],
    nextActions: [],
    artifacts: [],
    recovery: {
      rootCauseHint: 'Every candidate declared a different provider profile.',
      safeRetry: 'Re-run search without providerId, then check providerCompatibility per card.',
      stopCondition: 'Stop after one relaxed retry; a second identical call cannot succeed.',
    },
  };

  test('accepts a complete error result', () => {
    expect(envelope.safeParse(errorBase).success).toBe(true);
  });

  test('refuses an error with no recovery', () => {
    const { recovery: _recovery, ...withoutRecovery } = errorBase;
    expect(envelope.safeParse(withoutRecovery).success).toBe(false);
  });

  test('refuses an error with no coded cause', () => {
    expect(envelope.safeParse({ ...errorBase, warnings: [] }).success).toBe(false);
  });

  test('refuses an error that also returns data', () => {
    const withData = {
      ...errorBase,
      data: {
        cards: [],
        totalEligible: 0,
        totalConsidered: 0,
        appliedFilters: [],
        distinctDirections: 0,
        withheldNearDuplicates: 0,
        diversityNote: 'x y z',
        contextCodePoints: 0,
      },
    };
    expect(envelope.safeParse(withData).success).toBe(false);
  });

  test('lets an empty success distinguish itself from an error by code', () => {
    const empty = envelope.safeParse({
      status: 'warning',
      summary: 'Nothing matched the requested family.',
      data: {
        cards: [],
        totalEligible: 0,
        totalConsidered: 40,
        appliedFilters: [
          { facet: 'familyId', value: 'packaging', eliminated: 40, relaxable: true },
        ],
        distinctDirections: 0,
        withheldNearDuplicates: 0,
        diversityNote: 'no eligible direction',
        contextCodePoints: 0,
      },
      warnings: [
        {
          code: 'NO_MATCH',
          message: 'The family filter eliminated 40.',
          objectId: null,
          field: 'familyId',
        },
      ],
      nextActions: [
        {
          tool: 'search_taste_library',
          why: 'Relax the family filter — it eliminated every candidate.',
          args: { brandId: BRAND },
        },
      ],
      artifacts: [],
    });
    expect(empty.success).toBe(true);
  });
});

describe('inspect input', () => {
  test('defaults to a summarized response inside a section budget', () => {
    const parsed = inspectTasteObjectInputSchema.parse({ brandId: BRAND, id: 'poster.x' });
    expect(parsed.sections).toEqual(['summary']);
    expect(parsed.maxCodePoints).toBe(TASTE_INSPECT_DEFAULT_CODE_POINTS);
    expect(parsed.version).toBeNull();
  });

  test('refuses a budget above the inspection ceiling', () => {
    const parsed = inspectTasteObjectInputSchema.safeParse({
      brandId: BRAND,
      id: 'poster.x',
      maxCodePoints: TASTE_INSPECT_MAX_CODE_POINTS + 1,
    });
    expect(parsed.success).toBe(false);
  });

  test('refuses an unrecognised section rather than returning nothing for it', () => {
    const parsed = inspectTasteObjectInputSchema.safeParse({
      brandId: BRAND,
      id: 'poster.x',
      sections: ['laws', 'secret-sauce'],
    });
    expect(parsed.success).toBe(false);
  });
});

describe('resolve input', () => {
  test('accepts a partial brief — reporting what is missing is the job', () => {
    const parsed = resolveTasteRecipeInputSchema.parse({
      brandId: BRAND,
      selection: { presetId: 'poster.x', presetVersion: 1 },
      brief: { job: { audience: 'people who go out on a Friday' } },
      placement: '4:5',
    });
    expect(parsed.brief.job?.primaryMessage).toBeUndefined();
    expect(parsed.providedInputs).toEqual([]);
  });

  test('refuses a reference pointed at a signed URL instead of a durable ref', () => {
    const parsed = resolveTasteRecipeInputSchema.safeParse({
      brandId: BRAND,
      selection: {},
      brief: {},
      placement: '4:5',
      references: [
        { url: 'https://signed.example/x.png', role: 'borrow-palette', strength: 'hint' },
      ],
    });
    expect(parsed.success).toBe(false);
  });
});

describe('preview input', () => {
  test('defaults to the headless surface, where a browser-only step is a refusal', () => {
    const parsed = previewTastePlanInputSchema.parse({
      brandId: BRAND,
      recipeDraftId: 'rcp_0123456789ab',
      providerId: 'google.gemini-3.1-flash-image.v1',
    });
    expect(parsed.executionSurface).toBe('headless');
    expect(parsed.candidateCount).toBeNull();
  });
});

describe('write inputs', () => {
  test('publish requires a named human approver', () => {
    const parsed = publishTasteVersionInputSchema.safeParse({
      brandId: BRAND,
      actor: { userId: null, serviceIdentity: 'agent:organic', roles: ['agent'] },
      draftId: 'draft-1',
      qualificationManifestId: 'qm-1',
      targetQualification: 'curated',
    });
    expect(parsed.success).toBe(false);
  });

  test('attaching an example has nowhere to put a signed URL or inline bytes', () => {
    const base = {
      brandId: BRAND,
      actor: { userId: 'u1', serviceIdentity: null, roles: ['brand-editor'] as const },
      objectId: 'poster.x',
      version: 1,
      kind: 'positive' as const,
      annotation: 'The halftone survives at reading distance.',
      authority: 'approved' as const,
    };
    expect(
      attachTasteExampleInputSchema.safeParse({
        ...base,
        asset: {
          assetId: '9f1a2b0c-4d5e-4f60-9a1b-2c3d4e5f6a7b',
          versionId: '8f1a2b0c-4d5e-4f60-9a1b-2c3d4e5f6a7b',
        },
      }).success,
    ).toBe(true);
    expect(
      attachTasteExampleInputSchema.safeParse({
        ...base,
        asset: { url: 'https://signed.example/x.png' },
      }).success,
    ).toBe(false);
    expect(
      attachTasteExampleInputSchema.safeParse({
        ...base,
        asset: { data: 'data:image/png;base64,AAAA' },
      }).success,
    ).toBe(false);
  });
});
