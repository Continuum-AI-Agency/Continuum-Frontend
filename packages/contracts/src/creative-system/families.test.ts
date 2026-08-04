import { describe, expect, it } from 'bun:test';

import {
  CONTENT_FAMILIES,
  type ContentFamily,
  familyPayloadSchema,
  shotListSchema,
  shotSchema,
} from './families';

const camera = {
  angle: 'eye-level' as const,
  framing: 'medium' as const,
  lens: '35mm environmental',
  lensBand: 'wide-environmental' as const,
  depthOfField: 'moderate' as const,
  compositionRule: 'rule-of-thirds' as const,
  movement: 'handheld-follow' as const,
};

const light = {
  direction: 'camera-left' as const,
  quality: 'soft-window' as const,
  shadow: 'a soft shadow running away from the window',
  setup: 'natural-available-only' as const,
  colourTemperature: 'neutral-daylight' as const,
  timeOfDay: 'afternoon' as const,
};

const shot = {
  index: 1,
  beatRole: 'hook' as const,
  durationMs: 1_800,
  subjectAction: 'lifts the kettle and starts the pour',
  camera,
  light,
  transitionIn: 'hard-cut' as const,
  onScreenText: ['Stop scalding your coffee'],
  audioCue: 'kettle hiss, no music',
};

/**
 * One valid payload per family. These double as the required-field ledger: every key is
 * required (nullable is not optional), so removing any one of them must fail.
 */
const payloads: Record<ContentFamily, Record<string, unknown>> = {
  'campaign-key-visual': {
    family: 'campaign-key-visual',
    campaignIdea: 'The filter is the whole difference',
    adaptationSet: ['1:1', '9:16'],
    productPresence: 'hero',
  },
  'product-still-life': {
    family: 'product-still-life',
    productName: 'Ceramic pour-over cone, 02 size',
    fidelity: 'ai-rendered-from-reference',
    surface: 'a scarred oak counter',
    propBudget: 1,
    props: ['a folded used filter'],
    retouch: 'dust-and-blemish-only',
    materialIsTheSubject: true,
    scaleCue: null,
  },
  'editorial-illustration': {
    family: 'editorial-illustration',
    metaphor: 'A funnel that filters noise out of a signal',
    medium: 'cut-paper-collage',
    abstractionLevel: 'symbolic',
  },
  'creator-ugc': {
    family: 'creator-ugc',
    creatorArchetype: 'A home barista who films in their own kitchen',
    captureDevice: 'front-facing-phone',
    setting: 'a small rented kitchen at breakfast',
    permittedImperfections: ['unstyled-background-clutter', 'auto-white-balance-drift'],
    speaksToCamera: true,
    hookFrame: 'Holds up two cups and says one of them is wrong',
    productInUse: true,
    disclosureRequired: true,
  },
  'carousel-infographic': {
    family: 'carousel-infographic',
    slideCount: 6,
    sharedSystem: 'One accent colour, one type size, one rule per slide',
    perSlideDelta: 'Each slide swaps only the numeral and its caption',
    argument: 'process',
    hasResolutionSlide: true,
  },
  'typography-led': {
    family: 'typography-led',
    statement: 'BREW SLOWER',
    letterformRole: 'type-as-object',
    typeRegisters: 2,
    legibilityFloor: 'must-read-at-thumbnail',
  },
  packaging: {
    family: 'packaging',
    packFormat: 'Folded carton, 200g valve bag',
    view: 'three-quarter',
    material: 'Uncoated kraft board',
    finish: 'Matte varnish with a spot gloss on the wordmark',
    regulatoryZones: ['Net weight and roast date panel'],
  },
  'event-promotion': {
    family: 'event-promotion',
    eventKind: 'Late-night cupping session',
    printFormat: 'A2',
    printProcess: 'risograph',
    typeRegisters: 2,
    ephemera: ['Edition mark', 'Barcode block'],
    presentAsScan: true,
  },
  'portrait-character': {
    family: 'portrait-character',
    subjectKind: 'invented-person',
    identityLocks: ['Silver hoop in the left ear'],
    wardrobe: 'A worn indigo apron over a plain tee',
    expression: 'Mid-sentence, unposed',
    consentBasis: null,
  },
  'motion-storyboard': {
    family: 'motion-storyboard',
    totalDurationMs: 12_000,
    shots: [shot, { ...shot, index: 2, beatRole: 'payoff' }],
    continuityLocks: ['The same chipped mug appears in every shot'],
    aspectRatio: '9:16',
  },
  'icon-illustration-system': {
    family: 'icon-illustration-system',
    assetCount: 12,
    sharedGeometry: 'Every mark is built on a 24-unit grid with 2-unit corners',
    strokeBehaviour: 'Uniform 2-unit stroke, no tapering',
    gridSize: 24,
  },
  'pattern-texture': {
    family: 'pattern-texture',
    repeatKind: 'half-drop',
    motifs: ['coffee cherry', 'filter cone'],
    scaleIntent: 'Reads as texture at arm length, as motif up close',
  },
  'spatial-environment': {
    family: 'spatial-environment',
    spaceKind: 'A twelve-seat corner cafe',
    humanScale: 'implied',
    materials: ['end-grain oak', 'unglazed terracotta'],
    signagePresent: false,
  },
  'brand-identity-exploration': {
    family: 'brand-identity-exploration',
    markKind: 'symbol-plus-wordmark',
    conceptRoute: 'The cone reduced to a single filled triangle',
    isExplorationOnly: true,
  },
  'short-form-explainer': {
    family: 'short-form-explainer',
    totalDurationMs: 24_000,
    shots: [shot, { ...shot, index: 2, beatRole: 'payoff' }],
    openLoop: 'One of these cups is undrinkable and you cannot see which',
    captionsBurnedIn: true,
    aspectRatio: '9:16',
  },
};

describe('familyPayloadSchema', () => {
  it('covers every declared family with no extras', () => {
    expect(Object.keys(payloads).sort()).toEqual([...CONTENT_FAMILIES].sort());
  });

  it('parses a valid payload for every family and keeps the discriminator', () => {
    for (const family of CONTENT_FAMILIES) {
      const parsed = familyPayloadSchema.parse(payloads[family]);
      expect(parsed.family).toBe(family);
    }
  });

  it('treats every declared key as required — dropping any one of them fails', () => {
    for (const family of CONTENT_FAMILIES) {
      const payload = payloads[family];
      for (const key of Object.keys(payload)) {
        const { [key]: _dropped, ...withoutKey } = payload;
        expect(familyPayloadSchema.safeParse(withoutKey).success).toBe(false);
      }
    }
  });

  it('rejects a family nobody agreed on', () => {
    expect(() =>
      familyPayloadSchema.parse({
        ...payloads['product-still-life'],
        family: 'brand-identity-logo',
      }),
    ).toThrow();
  });

  it('rejects a key borrowed from a sibling family', () => {
    expect(() =>
      familyPayloadSchema.parse({ ...payloads['typography-led'], propBudget: 2 }),
    ).toThrow();
  });
});

describe('product-still-life', () => {
  it('refuses props beyond the declared budget', () => {
    expect(() =>
      familyPayloadSchema.parse({
        ...payloads['product-still-life'],
        propBudget: 1,
        props: ['a folded used filter', 'a scale', 'a timer'],
      }),
    ).toThrow();
  });

  it('accepts a packshot with a zero budget and no props', () => {
    const parsed = familyPayloadSchema.parse({
      ...payloads['product-still-life'],
      propBudget: 0,
      props: [],
    });
    expect(parsed.family).toBe('product-still-life');
  });
});

describe('creator-ugc', () => {
  it('refuses a UGC brief with no permitted imperfection', () => {
    expect(() =>
      familyPayloadSchema.parse({ ...payloads['creator-ugc'], permittedImperfections: [] }),
    ).toThrow();
  });

  it('refuses an imperfection expressed as prose', () => {
    expect(() =>
      familyPayloadSchema.parse({
        ...payloads['creator-ugc'],
        permittedImperfections: ['a bit messy'],
      }),
    ).toThrow();
  });
});

describe('portrait-character', () => {
  it('requires a consent basis for a real person', () => {
    expect(() =>
      familyPayloadSchema.parse({
        ...payloads['portrait-character'],
        subjectKind: 'real-person',
        consentBasis: null,
      }),
    ).toThrow();

    const released = familyPayloadSchema.parse({
      ...payloads['portrait-character'],
      subjectKind: 'real-person',
      consentBasis: 'Model release on file, signed 2026-04-02.',
    });
    expect(released.family).toBe('portrait-character');
  });

  it('lets an invented subject carry no consent record', () => {
    expect(familyPayloadSchema.parse(payloads['portrait-character']).family).toBe(
      'portrait-character',
    );
  });
});

describe('shotSchema', () => {
  it('states camera and light in the same grammar a scene direction uses', () => {
    const parsed = shotSchema.parse(shot);
    expect(parsed.camera.framing).toBe('medium');
    expect(parsed.light.setup).toBe('natural-available-only');
  });

  it('refuses a shot that leaves its camera movement unstated', () => {
    expect(() => shotSchema.parse({ ...shot, camera: { ...camera, movement: null } })).toThrow();
  });

  it('rejects unknown keys', () => {
    expect(() => shotSchema.parse({ ...shot, vibe: 'energetic' })).toThrow();
  });
});

describe('shotListSchema', () => {
  it('requires a sequence to open on a hook', () => {
    expect(() => shotListSchema.parse([{ ...shot, beatRole: 'context' }])).toThrow();
  });

  it('rejects duplicate shot indices', () => {
    expect(() => shotListSchema.parse([shot, { ...shot, beatRole: 'payoff' }])).toThrow();
  });
});
