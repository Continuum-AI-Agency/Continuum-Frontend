import { describe, expect, it } from 'bun:test';
import {
  templateFamilyForLibraryFormat,
  templateFontStatuses,
  templateParseFontFamilies,
  templateParseRatios,
  templateParseSchema,
  templateSlotSchema,
} from './template-source';

// A trimmed real parse of ngr-base_promotopexit.AEP, produced by
// `aep_geometry.py library` and cross-checked against translations/render/out/ngr_aep_meta.json.
const REAL_PARSE = {
  parser: 'py_aep@0.14.0',
  sourceFamily: 'after_effects',
  appVersion: '26.3x87',
  comps: [
    {
      name: 'DPLV 1080x1440',
      width: 1080,
      height: 1440,
      frameRate: 29.970001,
      durationSec: 15.015015,
      layerCount: 29,
      isTop: true,
      isDelivery: true,
    },
    { name: 'FLECHA', width: 1203, height: 1233, layerCount: 1, isTop: false, isDelivery: false },
  ],
  ratios: [
    { ratio: '3:4', width: 1080, height: 1440, comps: ['DPLV 1080x1440'] },
    { ratio: '9:16', width: 1080, height: 1920, comps: ['DPLV 1080x1920'] },
    { ratio: '1200x628', width: 1200, height: 628, comps: ['DPLV 1200X628'] },
  ],
  slots: [
    {
      key: 'text__hasta',
      name: 'HASTA',
      kind: 'text',
      origin: 'direct',
      driver: 'static',
      comps: ['DPLV 1080x1440', 'DPLV 1200X628'],
      layerIds: [12, 44],
      charBudget: 5,
      sample: 'HASTA',
    },
    {
      key: 'image__logo-png',
      name: 'LOGO.png',
      kind: 'image',
      origin: 'direct',
      driver: 'expression',
      comps: ['DPLV 1080x1440'],
      layerIds: [9],
    },
  ],
  fonts: [
    { family: 'DuplicateSlab-Medium', layers: 14 },
    { family: 'HeadingNow-36CompBold', layers: 53 },
  ],
  staticText: [{ value: 'HASTA', font: 'HeadingNow-36CompBold', comp: 'DPLV 1080x1440' }],
  warnings: [],
};

describe('templateParseSchema', () => {
  it('accepts a real py_aep parse', () => {
    const parsed = templateParseSchema.parse(REAL_PARSE);
    expect(parsed.appVersion).toBe('26.3x87');
    expect(parsed.comps.filter((comp) => comp.isDelivery)).toHaveLength(1);
  });

  // The rational trap: AEP stores frame rate as a dividend/divisor pair, and reading the
  // dividend alone yields a plausible-looking six-digit number. Nothing downstream would
  // notice, so the schema has to.
  it('refuses an undivided frame rate', () => {
    const bad = {
      ...REAL_PARSE,
      comps: [{ ...REAL_PARSE.comps[0], frameRate: 2997000 }],
    };
    expect(templateParseSchema.safeParse(bad).success).toBe(false);
  });

  it('refuses a slot kind the render contract cannot express', () => {
    expect(templateSlotSchema.safeParse({ ...REAL_PARSE.slots[0], kind: 'colour' }).success).toBe(
      false,
    );
  });
});

describe('denormalized columns', () => {
  it('derives sorted, deduped font families and ratios', () => {
    const parse = templateParseSchema.parse(REAL_PARSE);
    expect(templateParseFontFamilies(parse)).toEqual([
      'DuplicateSlab-Medium',
      'HeadingNow-36CompBold',
    ]);
    expect(templateParseRatios(parse)).toEqual(['1200x628', '3:4', '9:16']);
  });
});

describe('templateFontStatuses', () => {
  // After Effects reports a PostScript name; a font store keys on whatever the uploader's
  // file said. An exact match reports every font missing, and a pre-flight that always fails
  // is one nobody reads.
  it('matches across case, spaces, hyphens and underscores', () => {
    const statuses = templateFontStatuses(
      [
        { family: 'HeadingNow-36CompBold', layers: 53 },
        { family: 'DuplicateSlab-Medium', layers: 14 },
      ],
      ['heading now 36compbold'],
    );
    expect(statuses.map((s) => [s.family, s.held])).toEqual([
      ['HeadingNow-36CompBold', true],
      ['DuplicateSlab-Medium', false],
    ]);
  });

  it('reports every font absent when the brand holds none', () => {
    expect(templateFontStatuses([{ family: 'Impact', layers: 3 }], [])).toEqual([
      { family: 'Impact', layers: 3, held: false },
    ]);
  });
});

describe('templateFamilyForLibraryFormat', () => {
  it('claims only the families something can actually read', () => {
    expect(templateFamilyForLibraryFormat('after_effects')).toBe('after_effects');
    expect(templateFamilyForLibraryFormat('after_effects_package')).toBe('after_effects_package');
    // A PSD is a project file, but nothing parses one yet. A permanently-pending template
    // card reads as broken, not as not-yet-built.
    expect(templateFamilyForLibraryFormat('design_source')).toBeNull();
    expect(templateFamilyForLibraryFormat('document')).toBeNull();
    expect(templateFamilyForLibraryFormat('raster_image')).toBeNull();
  });
});
