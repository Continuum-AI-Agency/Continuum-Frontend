import { describe, expect, it } from 'bun:test';

import {
  AUTHORITY_RANK,
  AUTHORITY_SOURCES,
  creativeSpecV1Schema,
  NON_NEGOTIABLE_SOURCES,
  pinnedObjectRefSchema,
} from './creative-spec';
import type { SceneDirection } from './vocabulary';

const artDirection: SceneDirection = {
  heroSubject: 'A single ceramic pour-over cone',
  action: 'sits mid-brew with steam lifting off the bed',
  environment: 'a scarred oak counter beside a north-facing window',
  camera: {
    angle: 'eye-level',
    framing: 'close-up',
    lens: '90mm macro',
    lensBand: 'macro-detail',
    depthOfField: 'shallow-subject-isolated',
    compositionRule: 'rule-of-thirds',
    movement: null,
  },
  light: {
    direction: 'camera-left',
    quality: 'soft-window',
    shadow: 'a long soft shadow falling to the right of the cone',
    setup: 'natural-available-only',
    colourTemperature: 'overcast-cool',
    timeOfDay: 'early-morning',
  },
  palette: {
    dominant: 'bone white',
    support: 'weathered oak',
    accent: 'burnt orange',
    contrast: 'gentle',
    grade: 'neutral-untouched',
  },
};

const identityReference = {
  asset: {
    assetId: '3f9d1a4e-6c2b-4a11-9d3e-5b7c8a0f1e22',
    versionId: 'a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d',
  },
  role: 'preserve-product-identity' as const,
  strength: 'required' as const,
  focus: 'the cone and its ridging only',
  rightsNote: null,
};

const spec = {
  schemaVersion: 1 as const,
  identity: {
    brandId: '9c1e2b3a-4d5f-4061-8273-8495a6b7c8d9',
    brandBookVersion: 'bb-2026-07-01',
    preset: null,
    tasteShortcutId: null,
  },
  job: {
    audience: 'Home brewers who already own a grinder',
    audienceState: 'Owns the gear, has never used a paper filter',
    primaryMessage: 'A cleaner cup from the gear you already own',
    supportingProof: ['A cupping panel scored it two points higher'],
    desiredResponse: 'Buy a starter filter pack',
    funnelStage: 'consideration' as const,
  },
  delivery: {
    family: 'product-still-life' as const,
    preFormatId: null,
    placement: 'instagram-feed',
    aspectRatio: '4:5' as const,
    dimensions: null,
    respectPlatformSafeAreas: true,
  },
  concept: {
    singleIdea: 'The filter is the whole difference',
    mechanism: 'object-as-metaphor' as const,
    mechanismExecution: 'The paper cone is the only lit thing in an otherwise dim frame',
    dominantGesture: 'Steam rising through a lit paper edge',
    supportingDetails: ['A used filter folded on the counter'],
  },
  brand: { requestedPieces: null, campaignOverrides: [] },
  artDirection,
  polish: {
    level: 'crafted-natural' as const,
    devices: ['worn-product-surface' as const],
    forbidSignatures: ['uniform-creamy-bokeh' as const],
  },
  style: null,
  copy: {
    strategy: 'no-copy' as const,
    items: [],
    allowAdditionalText: false,
    typeRegisters: null,
  },
  references: [identityReference],
  constraints: [],
  payload: {
    family: 'product-still-life' as const,
    productName: 'Ceramic pour-over cone, 02 size',
    fidelity: 'ai-rendered-from-reference' as const,
    surface: 'a scarred oak counter',
    propBudget: 1,
    props: ['a folded used filter'],
    retouch: 'dust-and-blemish-only' as const,
    materialIsTheSubject: true,
    scaleCue: null,
  },
  generation: {
    candidateCount: 5,
    qualityTier: 'curation' as const,
    requiresHumanApproval: true,
  },
  freeformBrief: null,
};

describe('creativeSpecV1Schema', () => {
  it('parses a complete v1 spec', () => {
    const parsed = creativeSpecV1Schema.parse(spec);
    expect(parsed.schemaVersion).toBe(1);
    expect(parsed.payload.family).toBe('product-still-life');
  });

  it('survives a serialize/parse round trip unchanged', () => {
    const first = creativeSpecV1Schema.parse(spec);
    const second = creativeSpecV1Schema.parse(JSON.parse(JSON.stringify(first)));
    expect(second).toEqual(first);
  });

  it('refuses a delivery family that disagrees with the payload', () => {
    const result = creativeSpecV1Schema.safeParse({
      ...spec,
      delivery: { ...spec.delivery, family: 'typography-led' },
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.some((issue) => issue.message.includes('must agree'))).toBe(true);
    }
  });

  it('refuses a reference-bound product fidelity with no identity reference', () => {
    const result = creativeSpecV1Schema.safeParse({ ...spec, references: [] });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(
        result.error.issues.some((issue) => issue.message.includes('identity-preserving')),
      ).toBe(true);
    }
  });

  it('accepts a freely rendered product with no reference at all', () => {
    const parsed = creativeSpecV1Schema.parse({
      ...spec,
      references: [],
      payload: { ...spec.payload, fidelity: 'ai-rendered-freely' as const },
    });
    expect(parsed.references).toEqual([]);
  });

  it('refuses exact copy carried by a no-copy strategy', () => {
    expect(
      creativeSpecV1Schema.safeParse({
        ...spec,
        copy: {
          ...spec.copy,
          items: [
            {
              role: 'price' as const,
              text: '$49.00',
              exact: true,
              case: 'as-written' as const,
              fixedLineBreaks: false,
              styleNote: null,
            },
          ],
        },
      }).success,
    ).toBe(false);
  });

  it('refuses a no-copy strategy for a family whose job depends on words', () => {
    const result = creativeSpecV1Schema.safeParse({
      ...spec,
      delivery: { ...spec.delivery, family: 'event-promotion' as const },
      payload: {
        family: 'event-promotion' as const,
        eventKind: 'warehouse club night',
        printFormat: 'A1' as const,
        printProcess: 'screenprint' as const,
        typeRegisters: 2,
        ephemera: ['barcode'],
        presentAsScan: true,
      },
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.some((issue) => issue.path.join('.') === 'copy.strategy')).toBe(
        true,
      );
    }
  });

  it('rejects an unknown top-level key', () => {
    expect(creativeSpecV1Schema.safeParse({ ...spec, vibe: 'premium' }).success).toBe(false);
  });

  it('rejects an unknown key nested inside the art direction', () => {
    expect(
      creativeSpecV1Schema.safeParse({
        ...spec,
        artDirection: { ...artDirection, filmStock: 'portra-400' },
      }).success,
    ).toBe(false);
  });

  it('bounds the freeform brief in code points', () => {
    const brief = '🌱'.repeat(12_000);
    expect(brief.length).toBe(24_000);
    expect(creativeSpecV1Schema.parse({ ...spec, freeformBrief: brief }).freeformBrief).toBe(brief);
    expect(
      creativeSpecV1Schema.safeParse({ ...spec, freeformBrief: '🌱'.repeat(12_001) }).success,
    ).toBe(false);
  });
});

describe('pinnedObjectRefSchema', () => {
  it('will not accept a name without a version', () => {
    expect(pinnedObjectRefSchema.safeParse({ id: 'club-night-poster' }).success).toBe(false);
    expect(pinnedObjectRefSchema.parse({ id: 'club-night-poster', version: 2 }).version).toBe(2);
  });
});

describe('authority precedence', () => {
  it('ranks sources by their declaration order, lowest first', () => {
    const ranks = AUTHORITY_SOURCES.map((source) => AUTHORITY_RANK[source]);
    expect(ranks).toEqual(AUTHORITY_SOURCES.map((_source, index) => index));
    expect(AUTHORITY_RANK['provider-default']).toBeLessThan(AUTHORITY_RANK['brand-preferred']);
    expect(AUTHORITY_RANK['user-explicit']).toBeLessThan(AUTHORITY_RANK['brand-hard']);
    expect(AUTHORITY_RANK.safety).toBe(AUTHORITY_SOURCES.length - 1);
  });

  it('names the sources a compiler may never trim to fit a provider', () => {
    expect([...NON_NEGOTIABLE_SOURCES]).toEqual(['brand-hard', 'safety', 'user-explicit']);
    expect(Object.isFrozen(NON_NEGOTIABLE_SOURCES)).toBe(true);
    expect(Object.isFrozen(AUTHORITY_RANK)).toBe(true);
  });
});
