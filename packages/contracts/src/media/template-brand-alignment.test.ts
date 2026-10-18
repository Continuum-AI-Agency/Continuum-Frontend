import { describe, expect, test } from 'bun:test';
import type { FontInventoryRow } from './fonts';
import { BRAND_ALIGNMENT_MIN_CHROMA, brandAlignmentEdits } from './template-brand-alignment';
import type { TemplateEditableLayer } from './template-layer-edits';

let nextLayerId = 1;
const textLayer = (
  name: string,
  font: string,
  fontSize: number,
  extra: Partial<TemplateEditableLayer> = {},
): TemplateEditableLayer => ({
  compId: 7,
  comp: 'Delivery',
  layerId: nextLayerId++,
  name,
  kind: 'text',
  visible: true,
  visibilityReason: null,
  textReason: null,
  text: name,
  font,
  fontSize,
  slotKeys: [],
  visibilitySlotKeys: [],
  ...extra,
});

const face = (
  family: string,
  postScriptName: string,
  weight: number,
  style: 'normal' | 'italic' = 'normal',
): FontInventoryRow => ({
  id: crypto.randomUUID(),
  family,
  familyKey: family.toLowerCase().replace(/[^a-z0-9]/g, ''),
  licenceScope: 'brand',
  brandId: '00000000-0000-4000-8000-000000000001',
  brandName: 'Easy Fit',
  postScriptName,
  winRegistryName: null,
  weight,
  style,
  format: 'otf',
  bytes: 1,
  sha256: 'x',
  source: 'upload',
  createdAt: '2026-10-13T00:00:00Z',
});

const brandFonts = [
  face('Barlow Condensed', 'BarlowCondensed-Regular', 400),
  face('Barlow Condensed', 'BarlowCondensed-Bold', 700),
  face('Barlow Condensed', 'BarlowCondensed-Italic', 400, 'italic'),
  face('Montserrat', 'Montserrat-Black', 900),
  face('Montserrat', 'Montserrat-Medium', 500),
];
const brand = {
  brandKit: {
    typography: { primary: 'Montserrat', secondary: 'Barlow Condensed' },
    colors: ['#E30613', '#1D1D1B', '#FFFFFF'],
  },
};

describe('brandAlignmentEdits', () => {
  test('the headline family takes the display face and every other family the body face', () => {
    const headline = textLayer('Headline', 'Sora-ExtraBold', 120);
    const kicker = textLayer('Kicker', 'Sora-Medium', 40);
    const body = textLayer('Body', 'Manrope-Regular', 32);
    const { edits, report } = brandAlignmentEdits({
      layers: [body, headline, kicker],
      fonts: brandFonts,
      brand,
    });
    const fontOf = (layer: TemplateEditableLayer) =>
      edits.layers.find((edit) => edit.layerId === layer.layerId)?.font;
    // Sora is set largest anywhere, so even its 40 px kicker is headline type.
    expect(fontOf(headline)).toBe('Montserrat-Black');
    expect(fontOf(kicker)).toBe('Montserrat-Medium');
    expect(fontOf(body)).toBe('BarlowCondensed-Regular');
    expect(report).toMatchObject({ display: 'Montserrat', body: 'Barlow Condensed', retyped: 3 });
  });

  test('italic stays italic and weight moves to the nearest held face', () => {
    const headline = textLayer('Headline', 'Sora-Black', 100);
    const italic = textLayer('Quote', 'Manrope-SemiBoldItalic', 30);
    const bold = textLayer('Price', 'Manrope-ExtraBold', 30);
    const { edits } = brandAlignmentEdits({
      layers: [headline, italic, bold],
      fonts: brandFonts,
      brand,
    });
    expect(edits.layers.find((edit) => edit.layerId === italic.layerId)?.font).toBe(
      'BarlowCondensed-Italic',
    );
    expect(edits.layers.find((edit) => edit.layerId === bold.layerId)?.font).toBe(
      'BarlowCondensed-Bold',
    );
  });

  test('a face the brand does not hold is named, and locked text is reported, not edited', () => {
    const headline = textLayer('Headline', 'Sora-Bold', 100);
    const animated = textLayer('Ticker', 'Manrope-Regular', 30, {
      textReason: 'Animated text must be edited in its source.',
    });
    const { edits, report } = brandAlignmentEdits({
      layers: [headline, animated],
      fonts: brandFonts.filter((font) => font.family !== 'Montserrat'),
      brand,
    });
    expect(edits.layers).toEqual([]);
    expect(report.skipped).toEqual([
      { layerName: 'Ticker', reason: 'Animated text must be edited in its source.' },
      { layerName: 'Headline', reason: 'Upload Montserrat to apply it' },
    ]);
  });

  test('a layer already on its brand face is left out', () => {
    const headline = textLayer('Headline', 'Montserrat-Black', 100);
    expect(
      brandAlignmentEdits({ layers: [headline], fonts: brandFonts, brand }).edits.layers,
    ).toEqual([]);
  });

  test('a brand with no typefaces keeps the template type: the shipped fallback is not its system', () => {
    const { edits, report } = brandAlignmentEdits({
      layers: [textLayer('Headline', 'Sora-Bold', 100)],
      fonts: brandFonts,
      brand: { brandKit: { colors: ['#E30613'] } },
    });
    expect(edits.layers).toEqual([]);
    expect(report.display).toBeNull();
  });

  test('neutral swatches are not recolour targets, unless the brand has nothing else', () => {
    const recolor = (colors: string[]) =>
      brandAlignmentEdits({ layers: [], fonts: [], brand: { brandKit: { colors } } }).edits.recolor;
    expect(recolor(['#E30613', '#1D1D1B', '#FFFFFF', '#0B0C15'])).toEqual({
      palette: ['#e30613'],
      minChroma: BRAND_ALIGNMENT_MIN_CHROMA,
    });
    expect(recolor(['#1D1D1B', '#FFFFFF'])?.palette).toEqual(['#1d1d1b', '#ffffff']);
    expect(recolor([])).toBeUndefined();
  });

  test('a design import keeps its design layer address, and edits cap at 64', () => {
    const many = Array.from({ length: 70 }, (_, index) =>
      textLayer(`Line ${index}`, 'Manrope-Regular', 20, { designLayerId: 900 + index }),
    );
    const { edits, report } = brandAlignmentEdits({
      layers: [textLayer('Headline', 'Sora-Bold', 100), ...many],
      fonts: brandFonts,
      brand,
    });
    expect(edits.layers).toHaveLength(64);
    expect(edits.layers[1]).toMatchObject({ designLayerId: 900 });
    expect(report.skipped).toHaveLength(7);
  });

  test('a design import layer with no design layer id is reported, not sent to refuse the save', () => {
    const addressed = textLayer('Title', 'Sora-Bold', 100, { designLayerId: 4 });
    const unaddressed = textLayer('Subtitle', 'Manrope-Regular', 30, { designLayerId: null });
    const { edits, report } = brandAlignmentEdits({
      layers: [addressed, unaddressed],
      fonts: brandFonts,
      brand,
      designImport: true,
    });
    expect(edits.layers).toEqual([
      { compId: 7, layerId: addressed.layerId, designLayerId: 4, font: 'Montserrat-Black' },
    ]);
    expect(report.skipped).toEqual([
      { layerName: 'Subtitle', reason: 'Retype this imported text in its design file' },
    ]);
    expect(edits.recolor?.palette).toEqual(['#e30613']);
  });
});
