import { describe, expect, it } from 'bun:test';

import {
  type ArtDirection,
  artDirectionSchema,
  gradeArtDirection,
  renderArtDirection,
  summarizeArtDirection,
} from '../creative/art-direction';
import { countCodePoints } from './limits';
import {
  ALWAYS_FORBIDDEN_SIGNATURES,
  artStyleDefinitionSchema,
  comparePolish,
  extendedCameraDirectionSchema,
  POLISH_LEVEL_OBSERVABLE,
  POLISH_LEVELS,
  POLISH_RANK,
  polishDirectionSchema,
  REALISM_DEVICE_PROFILE,
  REALISM_DEVICES,
  realismDeviceDefinitionSchema,
  type SceneDirection,
  STYLE_MECHANISM_BUCKETS,
  sceneDirectionSchema,
  styleMechanismsSchema,
  styleSelectionSchema,
} from './vocabulary';

const validStyle = {
  id: 'soviet-constructivist-poster',
  version: 1,
  label: 'Soviet constructivist poster',
  summary: 'Diagonal photomontage agitprop built for legibility at street distance.',
  era: { label: '1920s–1930s', startYear: 1920, endYear: 1935 },
  originRegion: 'Soviet Union',
  visualMechanisms: {
    composition: [
      'Composition organised on a steep diagonal axis rather than a horizontal grid',
      "Worm's-eye angle on the figure so the subject reads as monumental",
    ],
    palette: ['Two or three flat spot colours — oxide red, black, and unbleached paper cream'],
    typography: ['Heavy geometric slab and grotesque display type set on the same diagonal'],
    texture: ['Lithographic flat colour with visible registration offset and paper tooth'],
    motif: ['Recurring megaphone, gear, and raised-arm silhouettes cut from photographs'],
  },
  defaultPolishLevel: 'crafted-natural' as const,
  notThis: [
    'Not Art Deco — deco is symmetrical, ornamental and luxury-facing',
    'Not generic "propaganda poster" WWII American realism',
  ],
  sensitivity: 'political-ideology' as const,
  sensitivityNote:
    'Carries a specific political endorsement. Usable as a compositional grammar only, with the ideological content removed and a human acknowledgement recorded.',
  requiresReview: true,
  hardFailures: [
    'Invented or garbled Cyrillic lettering',
    'Reproduction of state insignia, hammer-and-sickle, or a leader likeness',
  ],
  pairsWellWith: ['typography-led', 'event-promotion'],
  conflictsWith: ['product-still-life'],
  provenance: 'Mechanisms extracted from period lithography; no third-party prompt text reused.',
};

const sceneFixture: SceneDirection = {
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

describe('polish scale', () => {
  it('is ordinal from rawest to most finished', () => {
    expect(POLISH_LEVELS[0]).toBe('raw-amateur');
    expect(POLISH_LEVELS[POLISH_LEVELS.length - 1]).toBe('campaign-polished');
  });

  it('ranks every level uniquely and contiguously', () => {
    const ranks = POLISH_LEVELS.map((level) => POLISH_RANK[level]);
    expect(ranks).toEqual([0, 1, 2, 3, 4]);
  });

  it('compares by rank so a brand floor is checkable', () => {
    expect(comparePolish('raw-amateur', 'studio-clean')).toBeLessThan(0);
    expect(comparePolish('campaign-polished', 'documentary-candid')).toBeGreaterThan(0);
    expect(comparePolish('crafted-natural', 'crafted-natural')).toBe(0);
  });

  it('exposes a frozen rank table', () => {
    expect(Object.isFrozen(POLISH_RANK)).toBe(true);
  });
});

describe('always-forbidden slop signatures', () => {
  it('holds the invariants that survive even a fully polished brief', () => {
    expect([...ALWAYS_FORBIDDEN_SIGNATURES]).toEqual([
      'impossible-hands-or-fingers',
      'garbled-text-or-glyphs',
      'duplicated-limbs-or-objects',
      'hallucinated-logo-or-brandmark',
    ]);
  });

  it('is frozen so a caller cannot weaken the floor at runtime', () => {
    expect(Object.isFrozen(ALWAYS_FORBIDDEN_SIGNATURES)).toBe(true);
  });
});

describe('polishDirectionSchema', () => {
  it('accepts a level with no devices', () => {
    const parsed = polishDirectionSchema.parse({
      level: 'campaign-polished',
      devices: [],
      forbidSignatures: [],
    });
    expect(parsed.devices).toEqual([]);
  });

  it('accepts a raw brief with stacked devices', () => {
    const parsed = polishDirectionSchema.parse({
      level: 'raw-amateur',
      devices: ['direct-flash-falloff', 'handheld-micro-shake', 'unstyled-background-clutter'],
      forbidSignatures: ['uniform-creamy-bokeh'],
    });
    expect(parsed.devices).toHaveLength(3);
  });

  it('rejects an unknown device rather than passing prose through', () => {
    expect(() =>
      polishDirectionSchema.parse({
        level: 'raw-amateur',
        devices: ['gritty and authentic'],
        forbidSignatures: [],
      }),
    ).toThrow();
  });

  it('caps stacked devices so a brief cannot become a device dump', () => {
    expect(() =>
      polishDirectionSchema.parse({
        level: 'raw-amateur',
        devices: [
          'direct-flash-falloff',
          'handheld-micro-shake',
          'rolling-shutter-skew',
          'high-iso-sensor-grain',
          'blown-highlight-clipping',
          'crushed-shadow-detail',
          'mixed-colour-temperature-cast',
          'auto-white-balance-drift',
          'lens-smudge-veiling-flare',
        ],
        forbidSignatures: [],
      }),
    ).toThrow();
  });

  it('rejects unknown keys', () => {
    expect(() =>
      polishDirectionSchema.parse({
        level: 'raw-amateur',
        devices: [],
        forbidSignatures: [],
        vibe: 'gritty',
      }),
    ).toThrow();
  });
});

describe('realismDeviceDefinitionSchema', () => {
  const device = {
    id: 'direct-flash-falloff' as const,
    label: 'Direct on-camera flash falloff',
    cause:
      'A flash mounted at the lens axis lights the nearest surface far harder than anything behind it, so brightness drops off with the square of distance.',
    promptFragment:
      'lit by a direct on-camera flash, hot on the subject, background falling to black',
    observable:
      'Subject is over-lit and slightly blown; background is markedly darker; a hard-edged shadow sits close behind the subject.',
    maxPolishLevel: 'documentary-candid' as const,
    suitsFamilies: ['creator-ugc', 'event-promotion'],
    ruinsFamilies: ['product-still-life'],
  };

  it('accepts a device that names cause, fragment and observable', () => {
    expect(realismDeviceDefinitionSchema.parse(device).id).toBe('direct-flash-falloff');
  });

  it('rejects a device whose observable is too thin to check', () => {
    expect(() =>
      realismDeviceDefinitionSchema.parse({ ...device, observable: 'gritty' }),
    ).toThrow();
  });

  it('rejects a device with no stated physical cause', () => {
    expect(() => realismDeviceDefinitionSchema.parse({ ...device, cause: 'raw' })).toThrow();
  });
});

describe('artStyleDefinitionSchema', () => {
  it('accepts a fully specified style', () => {
    expect(artStyleDefinitionSchema.parse(validStyle).id).toBe('soviet-constructivist-poster');
  });

  it('rejects a colour swatch dressed as a style', () => {
    expect(() =>
      artStyleDefinitionSchema.parse({
        ...validStyle,
        visualMechanisms: {
          palette: ['Two or three flat spot colours — oxide red, black and paper cream'],
        },
      }),
    ).toThrow();
  });

  it('rejects a mechanism too short to be a production decision', () => {
    expect(() =>
      artStyleDefinitionSchema.parse({
        ...validStyle,
        visualMechanisms: { composition: ['Bold'], palette: ['Red'] },
      }),
    ).toThrow();
  });

  it('requires a default polish level so the taxonomy meets the polish axis', () => {
    const { defaultPolishLevel: _omitted, ...withoutPolish } = validStyle;
    expect(() => artStyleDefinitionSchema.parse(withoutPolish)).toThrow();
  });

  it('measures an emoji-heavy summary in code points, not UTF-16 units', () => {
    const summary = '🎨'.repeat(300);
    expect(summary.length).toBe(600);
    expect(artStyleDefinitionSchema.parse({ ...validStyle, summary }).summary).toBe(summary);
    expect(() =>
      artStyleDefinitionSchema.parse({ ...validStyle, summary: '🎨'.repeat(301) }),
    ).toThrow();
  });

  it('forces a sensitivity note and review flag when a sensitivity is declared', () => {
    expect(() =>
      artStyleDefinitionSchema.parse({
        ...validStyle,
        sensitivityNote: null,
      }),
    ).toThrow();

    expect(() =>
      artStyleDefinitionSchema.parse({
        ...validStyle,
        requiresReview: false,
      }),
    ).toThrow();
  });

  it('allows a benign style to omit the note', () => {
    const benign = artStyleDefinitionSchema.parse({
      ...validStyle,
      id: 'risograph-print',
      label: 'Risograph print',
      sensitivity: 'none' as const,
      sensitivityNote: null,
      requiresReview: false,
      hardFailures: [],
    });
    expect(benign.sensitivity).toBe('none');
  });

  it('enforces kebab-case ids', () => {
    expect(() => artStyleDefinitionSchema.parse({ ...validStyle, id: 'Soviet_Poster' })).toThrow();
  });

  it('requires at least one notThis so exclusions can be targeted', () => {
    expect(() => artStyleDefinitionSchema.parse({ ...validStyle, notThis: [] })).toThrow();
  });
});

describe('styleSelectionSchema', () => {
  it('pins an id and a version rather than a name', () => {
    const parsed = styleSelectionSchema.parse({
      styleId: 'soviet-constructivist-poster',
      styleVersion: 1,
      strength: 'flavour',
      sensitivityAcknowledgedBy: 'user-123',
    });
    expect(parsed.styleVersion).toBe(1);
  });

  it('allows a null acknowledgement so the compiler can be the one to refuse', () => {
    const parsed = styleSelectionSchema.parse({
      styleId: 'risograph-print',
      styleVersion: 1,
      strength: 'strong',
      sensitivityAcknowledgedBy: null,
    });
    expect(parsed.sensitivityAcknowledgedBy).toBeNull();
  });
});

describe('styleMechanismsSchema', () => {
  it('accepts a style that states two distinct buckets', () => {
    const parsed = styleMechanismsSchema.parse({
      composition: ['Strict modular grid with a single edge-to-edge bleed'],
      typography: ['Condensed grotesque set in two stepped sizes and nothing else'],
    });
    expect(parsed.texture).toEqual([]);
  });

  it('rejects a single-bucket entry however long the list is', () => {
    expect(() =>
      styleMechanismsSchema.parse({
        palette: [
          'Two flat spot colours with no gradient anywhere',
          'A single saturated red against black and off-white',
          'Paper cream reads as the third colour rather than as white',
        ],
      }),
    ).toThrow();
  });

  it('rejects a bucket nobody agreed on', () => {
    expect(() =>
      styleMechanismsSchema.parse({
        composition: ['Strict modular grid with a single edge-to-edge bleed'],
        vibe: ['Bold and revolutionary'],
      }),
    ).toThrow();
  });

  it('names exactly the buckets the schema carries', () => {
    expect([...STYLE_MECHANISM_BUCKETS]).toEqual([
      'composition',
      'palette',
      'typography',
      'texture',
      'motif',
    ]);
  });
});

describe('scene direction composed from ArtDirection', () => {
  it('is a structural superset, so an ArtDirection consumer accepts it unchanged', () => {
    const asArtDirection: ArtDirection = sceneFixture;
    expect(artDirectionSchema.parse(asArtDirection)).toBeDefined();
  });

  it('still renders through renderArtDirection on both targets', () => {
    const still = renderArtDirection(sceneFixture, { target: 'still-panel' });
    expect(still).toContain('close up');
    expect(still).toContain('eye level');
    expect(still).toContain('soft window');
    expect(still).toContain('bone white');
    expect(still).toContain('single-scene frame');

    const motion = renderArtDirection(sceneFixture, { target: 'veo-motion' });
    expect(motion).toContain('Motion:');
    expect(motion).toContain('One continuous shot');
  });

  it('still grades and summarizes through the existing helpers', () => {
    const grade = gradeArtDirection(sceneFixture);
    expect(typeof grade.score).toBe('number');
    expect(grade.buzzwords).toEqual([]);
    expect(summarizeArtDirection(sceneFixture).length).toBeGreaterThan(0);
  });

  it('is stricter than its base: an unknown key parses as ArtDirection and fails here', () => {
    const strayKey = { ...sceneFixture, vibe: 'gritty' };
    expect(artDirectionSchema.safeParse(strayKey).success).toBe(true);
    expect(sceneDirectionSchema.safeParse(strayKey).success).toBe(false);
  });

  it('keeps shot size in camera.framing rather than a second field', () => {
    expect(() =>
      extendedCameraDirectionSchema.parse({ ...sceneFixture.camera, shotSize: 'close-up' }),
    ).toThrow();
    expect(extendedCameraDirectionSchema.parse(sceneFixture.camera).framing).toBe('close-up');
  });
});

describe('POLISH_LEVEL_OBSERVABLE', () => {
  it('describes every level in terms a vision judge can score', () => {
    for (const level of POLISH_LEVELS) {
      const observable = POLISH_LEVEL_OBSERVABLE[level];
      expect(observable.length).toBeGreaterThan(0);
      expect(countCodePoints(observable)).toBeLessThanOrEqual(300);
    }
  });

  it('is frozen so a caller cannot rewrite the scoring criterion at runtime', () => {
    expect(Object.isFrozen(POLISH_LEVEL_OBSERVABLE)).toBe(true);
  });
});

describe('REALISM_DEVICE_PROFILE', () => {
  it('covers every device, so one cannot be added without a mechanism', () => {
    expect(Object.keys(REALISM_DEVICE_PROFILE).sort()).toEqual([...REALISM_DEVICES].sort());
  });

  it('states a mechanism and an evaluator cue short enough to become a hard check', () => {
    for (const device of REALISM_DEVICES) {
      const profile = REALISM_DEVICE_PROFILE[device];
      expect(profile.mechanism.length).toBeGreaterThan(0);
      expect(countCodePoints(profile.evaluatorCue)).toBeGreaterThanOrEqual(3);
      expect(countCodePoints(profile.evaluatorCue)).toBeLessThanOrEqual(300);
    }
  });

  it('writes every mechanism as a positive production fact', () => {
    const negations = [' not ', 'avoid ', 'without any', "don't", 'do not'];
    for (const device of REALISM_DEVICES) {
      const mechanism = REALISM_DEVICE_PROFILE[device].mechanism.toLowerCase();
      for (const negation of negations) {
        expect(mechanism.includes(negation)).toBe(false);
      }
    }
  });

  it('agrees with the corpus about where each device stops serving the brief', () => {
    expect(REALISM_DEVICE_PROFILE['direct-flash-falloff'].maxPolishLevel).toBe(
      'documentary-candid',
    );
    expect(REALISM_DEVICE_PROFILE['imperfect-skin-texture'].maxPolishLevel).toBe('studio-clean');
    for (const device of REALISM_DEVICES) {
      expect(POLISH_LEVELS).toContain(REALISM_DEVICE_PROFILE[device].maxPolishLevel);
    }
  });
});

describe('polish coherence', () => {
  it('refuses a campaign-polished brief that also asks for an imperfection', () => {
    expect(() =>
      polishDirectionSchema.parse({
        level: 'campaign-polished',
        devices: ['fingerprints-and-dust'],
        forbidSignatures: [],
      }),
    ).toThrow();
  });

  it('refuses a device whose ceiling sits below the requested level', () => {
    expect(REALISM_DEVICE_PROFILE['camcorder-scanlines'].maxPolishLevel).toBe('documentary-candid');
    expect(() =>
      polishDirectionSchema.parse({
        level: 'studio-clean',
        devices: ['camcorder-scanlines'],
        forbidSignatures: [],
      }),
    ).toThrow();
  });

  it('blocks a campaign-polished brief even for a device whose own ceiling reaches it', () => {
    expect(REALISM_DEVICE_PROFILE['crushed-shadow-detail'].maxPolishLevel).toBe(
      'campaign-polished',
    );
    expect(() =>
      polishDirectionSchema.parse({
        level: 'campaign-polished',
        devices: ['crushed-shadow-detail'],
        forbidSignatures: [],
      }),
    ).toThrow();
  });

  it('accepts a device sitting exactly at its ceiling', () => {
    const parsed = polishDirectionSchema.parse({
      level: 'crafted-natural',
      devices: ['worn-product-surface'],
      forbidSignatures: [],
    });
    expect(parsed.devices).toEqual(['worn-product-surface']);
  });

  it('refuses a device definition that disagrees with the profile ceiling', () => {
    const device = {
      id: 'camcorder-scanlines' as const,
      label: 'Camcorder scanlines',
      cause:
        'Interlaced tape capture writes alternating field lines that remain visible when the frame is held.',
      promptFragment: 'captured on interlaced tape with visible field lines',
      observable: 'Horizontal interlace lines across the frame with slight chroma bleed at edges.',
      maxPolishLevel: 'campaign-polished' as const,
      suitsFamilies: ['creator-ugc'],
      ruinsFamilies: ['product-still-life'],
    };
    expect(() => realismDeviceDefinitionSchema.parse(device)).toThrow();
    expect(
      realismDeviceDefinitionSchema.parse({ ...device, maxPolishLevel: 'documentary-candid' }).id,
    ).toBe('camcorder-scanlines');
  });
});
