import { describe, expect, it } from 'bun:test';

import {
  contentFamilyDefinitionSchema,
  creativePresetDefinitionSchema,
  presetLawSchema,
  tasteManifestCardSchema,
  tasteShortcutSchema,
} from './library';

const exemplar = {
  assetId: '3f9d1a4e-6c2b-4a11-9d3e-5b7c8a0f1e22',
  versionId: 'a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d',
};

const preset = {
  id: 'club-night-poster',
  version: 2,
  familyId: 'event-promotion' as const,
  name: 'Club night riso poster',
  summary: 'Two-ink risograph poster where one enormous numeral carries the whole hierarchy.',
  ownership: 'first-party' as const,
  laws: [
    {
      id: 'two-registers',
      statement: 'Exactly two type sizes, one enormous and one small',
      observable: 'No third type size appears anywhere on the sheet.',
    },
  ],
  slots: [
    {
      key: 'headline',
      label: 'Headline',
      kind: 'text' as const,
      required: true,
      options: [],
      defaultValue: null,
      helpText: 'The one line that has to read across a room.',
    },
  ],
  mechanism: 'scale-collision' as const,
  polishLevel: 'crafted-natural' as const,
  styleRefs: [],
  exclusions: ['No drop shadow behind the numeral'],
  defaultCopyStrategy: 'generate-then-compose' as const,
  recommendedSkillIds: [],
  failureSignatures: ['The numeral shrinks until it competes with the body copy'],
  exampleBriefs: ['A Friday warehouse night with one headline act and a door price'],
  exemplars: [exemplar],
  status: 'curated' as const,
  provenance: 'Mechanisms extracted from period riso printing; no third-party prompt text reused.',
  createdAt: '2026-07-01T10:00:00.000Z',
};

describe('creativePresetDefinitionSchema', () => {
  it('parses a curated preset', () => {
    expect(creativePresetDefinitionSchema.parse(preset).version).toBe(2);
  });

  it('lets a draft exist before it has produced anything', () => {
    const draft = creativePresetDefinitionSchema.parse({
      ...preset,
      status: 'draft' as const,
      exemplars: [],
    });
    expect(draft.exemplars).toEqual([]);
  });

  it('refuses to promote a preset past draft with nothing to show', () => {
    expect(creativePresetDefinitionSchema.safeParse({ ...preset, exemplars: [] }).success).toBe(
      false,
    );
    expect(
      creativePresetDefinitionSchema.safeParse({
        ...preset,
        status: 'qualified' as const,
        exemplars: [],
      }).success,
    ).toBe(false);
  });

  it('refuses a preset that knows what it wants but not what would ruin it', () => {
    expect(creativePresetDefinitionSchema.safeParse({ ...preset, laws: [] }).success).toBe(false);
    expect(creativePresetDefinitionSchema.safeParse({ ...preset, exclusions: [] }).success).toBe(
      false,
    );
    expect(
      creativePresetDefinitionSchema.safeParse({ ...preset, failureSignatures: [] }).success,
    ).toBe(false);
  });

  it('rejects unknown keys', () => {
    expect(creativePresetDefinitionSchema.safeParse({ ...preset, temperature: 0.8 }).success).toBe(
      false,
    );
  });

  it('pins an exemplar by durable id rather than a URL', () => {
    expect(
      creativePresetDefinitionSchema.safeParse({
        ...preset,
        exemplars: [{ ...exemplar, url: 'https://example.test/poster.png' }],
      }).success,
    ).toBe(false);
  });
});

describe('presetLawSchema', () => {
  it('refuses a law nobody could check', () => {
    expect(
      presetLawSchema.safeParse({
        id: 'premium',
        statement: 'The poster should feel premium',
        observable: 'premium',
      }).success,
    ).toBe(false);
  });
});

describe('tasteManifestCardSchema', () => {
  const card = {
    id: 'club-night-poster',
    version: 2,
    kind: 'taste-preset' as const,
    name: 'Club night riso poster',
    summary: 'Two-ink risograph poster with a single enormous numeral.',
    familyId: 'event-promotion' as const,
    preFormatIds: [],
    communicationJobs: ['drive-attendance'],
    mechanisms: ['scale-collision' as const],
    placements: ['instagram-feed'],
    polishLevel: 'crafted-natural' as const,
    styleIds: ['risograph-print'],
    requiredInputs: ['headline', 'date'],
    requiredReferenceRoles: [],
    copyStrategies: ['generate-then-compose' as const],
    supportedPlanKinds: ['generate-then-compose' as const],
    qualification: 'curated' as const,
    ownership: 'first-party' as const,
    brandCompatibility: 'compatible' as const,
    providerCompatibility: ['vertex/gemini-3-pro-image'],
    costBand: 'medium' as const,
    latencyBand: 'standard' as const,
    previewAsset: exemplar,
    whyItWorks: 'The scale collision does the hierarchy so the type never has to shout twice.',
  };

  it('parses a compact card carrying only elimination facets', () => {
    expect(tasteManifestCardSchema.parse(card).kind).toBe('taste-preset');
  });

  it('rejects a signed URL baked into the catalog entry', () => {
    expect(
      tasteManifestCardSchema.safeParse({
        ...card,
        previewUrl: 'https://example.test/preview.png',
      }).success,
    ).toBe(false);
  });

  it('refuses a card that cannot say what its mechanism achieves', () => {
    expect(tasteManifestCardSchema.safeParse({ ...card, whyItWorks: 'nice' }).success).toBe(false);
  });
});

describe('contentFamilyDefinitionSchema', () => {
  it('requires a family to name how it characteristically fails', () => {
    const family = {
      id: 'product-still-life' as const,
      version: 1,
      label: 'Product still life',
      communicationJob: 'Show the object faithfully enough to be bought from',
      requiredBrandBookPieces: ['colour', 'photography'],
      defaultPlanKind: 'single-generation' as const,
      defaultPolishLevel: 'studio-clean' as const,
      compatibleMechanisms: ['object-as-metaphor' as const],
      defaultAspectRatios: ['4:5', '1:1'],
      expectsCopy: false,
      failureSignatures: ['The cap or closure drifts from the real product'],
    };
    expect(contentFamilyDefinitionSchema.parse(family).id).toBe('product-still-life');
    expect(
      contentFamilyDefinitionSchema.safeParse({ ...family, failureSignatures: [] }).success,
    ).toBe(false);
  });
});

describe('tasteShortcutSchema', () => {
  it('always discloses what the friendly name expands to', () => {
    const shortcut = {
      id: 'printed-editorial',
      version: 1,
      label: 'Printed editorial',
      summary: 'Riso-adjacent print feel with a hard type hierarchy.',
      expandsTo: {
        presets: [{ id: 'club-night-poster', version: 2 }],
        skills: [],
        styles: [{ id: 'risograph-print', version: 1 }],
      },
      ownership: 'first-party' as const,
    };
    expect(tasteShortcutSchema.parse(shortcut).expandsTo.presets).toHaveLength(1);
    expect(
      tasteShortcutSchema.safeParse({
        ...shortcut,
        expandsTo: { ...shortcut.expandsTo, presets: [] },
      }).success,
    ).toBe(false);
  });
});
