// "Apply my design system": a template's own edits that set it in the brand's colours and type.
//
// COLOUR is handed to the forge as a palette, not as a per-layer map: only the forge measures every
// fill, effect leaf and gradient stop in the AEP, and its planner refuses a file it would leave half
// in the old colours. TYPE is decided here, from the layer list the Layers tab already reads: the
// family set largest is the template's headline face and takes the brand's display face; every
// other family takes the body face. A brand face the brand does not hold is named, never guessed.

import {
  type BrandTypeInputs,
  brandPaletteSwatches,
  resolveBrandType,
} from '../design-system/typeResolution';
import type { FontInventoryRow } from './fonts';
import type { TemplateEditableLayer } from './template-layer-edits';
import {
  type TemplateRevisionEdits,
  type TemplateRevisionLayerEdit,
  templateRevisionEditsSchema,
} from './template-revisions';

/**
 * Below this chroma (max − min channel, 0..1 — the forge's own measure) a colour is a neutral: the
 * template's whites, blacks and greys stay, and a brand swatch this grey is not a recolour target.
 * ponytail: one line for both sides, a calibration knob. The forge's scored default (0.008,
 * template-forge presets/palettes.json) moves a near-black ground like #0b0c15; "neutrals stay" does not.
 */
export const BRAND_ALIGNMENT_MIN_CHROMA = 0.1;
const MAX_LAYER_EDITS = 64;

export type BrandAlignmentSkip = { layerName: string; reason: string };
export type BrandAlignmentReport = {
  palette: string[];
  /** Null when the brand names no typefaces: the shipped fallback pair is not its design system. */
  display: string | null;
  body: string | null;
  retyped: number;
  skipped: BrandAlignmentSkip[];
};

const chroma = (hex: string): number => {
  const channels = [1, 3, 5].map((at) => Number.parseInt(hex.slice(at, at + 2), 16) / 255);
  return Math.max(...channels) - Math.min(...channels);
};

const familyKey = (family: string) => family.toLowerCase().replace(/[^a-z0-9]/g, '');

// Most specific first: "ExtraBold" must not read as "Bold", nor "ExtraLight" as "Light".
const WEIGHT_WORDS: ReadonlyArray<readonly [RegExp, number]> = [
  [/thin|hairline/i, 100],
  [/(extra|ultra)-?light/i, 200],
  [/light/i, 300],
  [/medium/i, 500],
  [/(semi|demi)-?bold/i, 600],
  [/(extra|ultra)-?bold/i, 800],
  [/black|heavy/i, 900],
  [/bold/i, 700],
];

function faceOf(postScriptName: string, fonts: readonly FontInventoryRow[]) {
  const held = fonts.find((font) => font.postScriptName === postScriptName);
  return {
    family: held ? familyKey(held.family) : familyKey(postScriptName.split('-')[0]!),
    weight: held?.weight ?? WEIGHT_WORDS.find(([word]) => word.test(postScriptName))?.[1] ?? 400,
    italic: held ? held.style === 'italic' : /italic|oblique/i.test(postScriptName),
  };
}

function nearestFace(
  fonts: readonly FontInventoryRow[],
  family: string,
  want: { weight: number; italic: boolean },
): FontInventoryRow | undefined {
  const candidates = fonts.filter(
    (font) =>
      font.postScriptName &&
      (familyKey(font.family) === familyKey(family) || font.familyKey === familyKey(family)),
  );
  const cost = (font: FontInventoryRow) => {
    const face = faceOf(font.postScriptName!, fonts);
    return Math.abs(face.weight - want.weight) + (face.italic === want.italic ? 0 : 1000);
  };
  return candidates.sort((left, right) => cost(left) - cost(right))[0];
}

export function brandAlignmentEdits(args: {
  layers: readonly TemplateEditableLayer[];
  /** The faces a revision can set: the brand's and the house's, with desktop PostScript names. */
  fonts: readonly FontInventoryRow[];
  brand: BrandTypeInputs;
  /**
   * A Photoshop or Illustrator import: its text is re-authored by design layer id, so a layer the
   * inventory gives no id cannot be retyped — and one such edit refuses the whole save.
   */
  designImport?: boolean;
}): { edits: TemplateRevisionEdits; report: BrandAlignmentReport } {
  const swatches = brandPaletteSwatches(args.brand).map((swatch) => swatch.hex);
  const chromatic = swatches.filter((hex) => chroma(hex) >= BRAND_ALIGNMENT_MIN_CHROMA);
  // A monochrome brand's accents become its greys: that IS its design system.
  const palette = (chromatic.length ? chromatic : swatches).slice(0, 12);

  const type = resolveBrandType(args.brand);
  const named = type.source !== 'fallback';
  const skipped: BrandAlignmentSkip[] = [];
  const text = args.layers.filter((layer) => layer.kind === 'text' && layer.font);
  for (const layer of text)
    if (layer.textReason) skipped.push({ layerName: layer.name, reason: layer.textReason });
  const editable = text.filter((layer) => !layer.textReason);

  const largest = new Map<string, number>();
  for (const layer of editable) {
    const family = faceOf(layer.font!, args.fonts).family;
    largest.set(family, Math.max(largest.get(family) ?? 0, layer.fontSize ?? 0));
  }
  const headline = [...largest].sort((left, right) => right[1] - left[1])[0]?.[0];

  const layers: TemplateRevisionLayerEdit[] = [];
  for (const layer of named ? editable : []) {
    if (args.designImport && layer.designLayerId == null) {
      skipped.push({
        layerName: layer.name,
        reason: 'Retype this imported text in its design file',
      });
      continue;
    }
    const current = faceOf(layer.font!, args.fonts);
    const family = current.family === headline ? type.display : type.body;
    const face = nearestFace(args.fonts, family, current);
    if (!face) {
      skipped.push({ layerName: layer.name, reason: `Upload ${family} to apply it` });
      continue;
    }
    if (face.postScriptName === layer.font) continue;
    if (layers.length === MAX_LAYER_EDITS) {
      skipped.push({ layerName: layer.name, reason: 'A variant changes at most 64 layers' });
      continue;
    }
    layers.push({
      compId: layer.compId,
      layerId: layer.layerId,
      ...(layer.designLayerId != null ? { designLayerId: layer.designLayerId } : {}),
      ...(layer.artboardId !== undefined ? { artboardId: layer.artboardId } : {}),
      font: face.postScriptName!,
    });
  }

  return {
    edits: templateRevisionEditsSchema.parse({
      layers,
      ...(palette.length ? { recolor: { palette, minChroma: BRAND_ALIGNMENT_MIN_CHROMA } } : {}),
    }),
    report: {
      palette,
      display: named ? type.display : null,
      body: named ? type.body : null,
      retyped: layers.length,
      skipped,
    },
  };
}
