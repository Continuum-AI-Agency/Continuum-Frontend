// The `formats` section, against Verne's REAL measured geometry.
//
// The fixture below is not invented: the four formats are the real adaptation set
// (mailing, story, postIG, postFB) and `photoAspect` is VERNE_PHOTO_RATIO_CURVE verbatim —
// the curve `render_pieza.py` reproduces to the pixel on ten finished pieces. A fixture I
// designed would only prove that I can write a schema matching my own object; this one
// proves the schema can hold geometry a renderer already trusts.

import { describe, expect, it } from 'bun:test';
import { interp, VERNE_HEADLINE_ZONE, VERNE_PHOTO_RATIO_CURVE } from './image-analysis';
import {
  DESIGN_SECTION_LABELS,
  DESIGN_SECTIONS,
  type DesignFormatsContent,
  designFormatsContentSchema,
  designMeasuredCurveSchema,
  designSafeZoneSchema,
  designSectionSchema,
  isGateableSection,
  readDesignCurve,
  sectionForSourceGroup,
} from './sections';

const VERNE_FORMATS: DesignFormatsContent = {
  baseWidth: 1080,
  formats: [
    // aspect 0.485 — the mailing piece, headline in the top-right of the photo.
    { id: 'mailing', width: 600, height: 1237, safeZone: { ...VERNE_HEADLINE_ZONE } },
    // aspect 0.5625 — story.
    { id: 'story', width: 1080, height: 1920, safeZone: { ...VERNE_HEADLINE_ZONE } },
    // aspect 0.799 — postIG.
    { id: 'postIG', width: 1080, height: 1351, safeZone: { ...VERNE_HEADLINE_ZONE } },
    // aspect 1.0 — postFB. T3/T4 put NO text over the photo; null says so out loud.
    { id: 'postFB', width: 1080, height: 1080, safeZone: null },
  ],
  curves: {
    photoAspect: {
      unit: 'ratio',
      points: VERNE_PHOTO_RATIO_CURVE.map(([x, y]) => [x, y] as [number, number]),
    },
    headerBand: {
      unit: 'fraction',
      points: [
        [0.5625, 0.14],
        [1.0, 0.09],
      ],
    },
  },
};

describe('designSectionSchema', () => {
  it('accepts formats as a section', () => {
    expect(designSectionSchema.safeParse('formats').success).toBe(true);
    expect(DESIGN_SECTIONS).toContain('formats');
  });

  it('gives every section a label', () => {
    for (const section of DESIGN_SECTIONS) {
      expect(DESIGN_SECTION_LABELS[section]).toBeTruthy();
    }
    expect(Object.keys(DESIGN_SECTION_LABELS).length).toBe(DESIGN_SECTIONS.length);
  });

  it('gates formats, because measured geometry is checkable against the render', () => {
    expect(isGateableSection('formats')).toBe(true);
  });

  it('routes a Formats source group to the formats card', () => {
    expect(sectionForSourceGroup('Formats')).toBe('formats');
    expect(sectionForSourceGroup('Adaptations')).toBe('formats');
  });
});

describe('designFormatsContentSchema', () => {
  it('round-trips the real Verne geometry', () => {
    const parsed = designFormatsContentSchema.parse(VERNE_FORMATS);
    expect(parsed).toEqual(VERNE_FORMATS);
    expect(parsed.formats.length).toBe(4);
    expect(parsed.formats[3].safeZone).toBeNull();
  });

  it('defaults curves to empty rather than undefined', () => {
    const parsed = designFormatsContentSchema.parse({
      baseWidth: 1080,
      formats: [{ id: 'postFB', width: 1080, height: 1080, safeZone: null }],
    });
    expect(parsed.curves).toEqual({});
  });

  it('rejects a duplicate format id', () => {
    const dupe = {
      ...VERNE_FORMATS,
      formats: [VERNE_FORMATS.formats[0], { ...VERNE_FORMATS.formats[1], id: 'mailing' }],
    };
    expect(designFormatsContentSchema.safeParse(dupe).success).toBe(false);
  });

  it('rejects a fractional baseWidth — it is the one honest pixel here', () => {
    expect(designFormatsContentSchema.safeParse({ ...VERNE_FORMATS, baseWidth: 0.5 }).success).toBe(
      false,
    );
  });
});

describe('designSafeZoneSchema', () => {
  it('accepts the measured headline zone', () => {
    expect(designSafeZoneSchema.parse({ ...VERNE_HEADLINE_ZONE })).toEqual({
      x0: 0.45,
      y0: 0,
      x1: 1,
      y1: 0.45,
    });
  });

  it('rejects a zone outside 0..1', () => {
    expect(designSafeZoneSchema.safeParse({ x0: 0.45, y0: 0, x1: 1.4, y1: 0.45 }).success).toBe(
      false,
    );
    expect(designSafeZoneSchema.safeParse({ x0: -0.1, y0: 0, x1: 1, y1: 0.45 }).success).toBe(
      false,
    );
  });

  it('rejects a zone expressed in pixels', () => {
    expect(designSafeZoneSchema.safeParse({ x0: 486, y0: 0, x1: 1080, y1: 608 }).success).toBe(
      false,
    );
  });

  it('rejects a zone with no area', () => {
    expect(designSafeZoneSchema.safeParse({ x0: 0.5, y0: 0, x1: 0.5, y1: 0.45 }).success).toBe(
      false,
    );
  });
});

describe('designMeasuredCurveSchema', () => {
  it('rejects a curve with fewer than two points', () => {
    expect(
      designMeasuredCurveSchema.safeParse({ unit: 'ratio', points: [[1, 2.224]] }).success,
    ).toBe(false);
    expect(designMeasuredCurveSchema.safeParse({ unit: 'ratio', points: [] }).success).toBe(false);
  });

  it('rejects points that are not ascending by aspect', () => {
    expect(
      designMeasuredCurveSchema.safeParse({
        unit: 'ratio',
        points: [
          [1.0, 2.224],
          [0.485, 1.567],
        ],
      }).success,
    ).toBe(false);
  });

  it('rejects a pixel value in a fraction curve', () => {
    // A 194px header band on a 1080 canvas. The fraction is 0.18; the pixel is the bug.
    const bad = designMeasuredCurveSchema.safeParse({
      unit: 'fraction',
      points: [
        [0.5625, 194],
        [1.0, 97],
      ],
    });
    expect(bad.success).toBe(false);
    if (!bad.success) {
      expect(bad.error.issues[0].message).toContain('fractions of baseWidth');
    }
  });

  it('allows the same magnitudes in a ratio curve', () => {
    expect(
      designMeasuredCurveSchema.safeParse({ unit: 'ratio', points: VERNE_PHOTO_RATIO_CURVE })
        .success,
    ).toBe(true);
  });
});

describe('readDesignCurve', () => {
  it('is the same interpolator the hard-coded curves already use', () => {
    const curve = designFormatsContentSchema.parse(VERNE_FORMATS).curves.photoAspect;
    const aspect = 1080 / 1351;
    expect(readDesignCurve(curve, aspect)).toBe(interp(aspect, VERNE_PHOTO_RATIO_CURVE));
  });

  it('clamps outside the measured range instead of extrapolating', () => {
    const curve = designFormatsContentSchema.parse(VERNE_FORMATS).curves.photoAspect;
    expect(readDesignCurve(curve, 0.1)).toBe(1.567);
    expect(readDesignCurve(curve, 9)).toBe(2.224);
  });
});
