// The caption preset catalog: one value picks a whole look plus its motion.
//
// A preset is a VALUE, not a branch. There is no `switch (presetId)` anywhere in the
// renderer — drawCaptions takes a resolved CaptionStyle and knows nothing about preset ids.
//
// The six ids are fixed by the FROZEN action registry
// (`packages/contracts/src/ai-studio/action-registry.ts`, `video.subtitles.config.preset`),
// so this file maps designs onto those ids rather than inventing its own vocabulary.
//
// Resolution is BY VALUE. `presetId` is stored as provenance so the UI can show which chip
// is active, but the persisted `captionStyle` blob is the truth: if the numbers below change
// in a later release, already-rendered projects must not silently change with them. Same
// discipline as the frozen SIG1 literal in generationSignature.

import { isRegistrableCaptionFont } from './captionFonts';
import type { BrandStyleInput, CaptionStyle } from './clipCaptionStyle';
import { buildCaptionStyle, DEFAULT_CAPTION_STYLE, resolveCaptionStyle } from './clipCaptionStyle';

/**
 * Structurally identical to captionCues' BuildCaptionCuesOptions, declared here rather than
 * imported: captionCues already imports this directory, and a type-only duplicate of three
 * optional numbers is cheaper than a module cycle. `captionPresets.test.ts` pins the two
 * together by feeding a preset's grouping straight into groupWordsIntoCues.
 */
export type CaptionGrouping = {
  maxWordsPerCue?: number;
  maxCueDurationSec?: number;
  maxGapSec?: number;
};

export type CaptionPreset = {
  id: CaptionPresetId;
  label: string;
  /** One line, shown under the gallery thumbnail. */
  description: string;
  /** Crosses the worker boundary. Structured-cloneable data only. */
  style: CaptionStyle;
  /** Consumed by groupWordsIntoCues on the main thread. NEVER sent to the worker. */
  grouping: CaptionGrouping;
  /** Which face must be registered before the first draw. */
  fontFamily?: string;
  /** Whether brand colours may replace this preset's own. */
  brandAware?: boolean;
};

export const CAPTION_PRESET_IDS = ['classic', 'pop', 'pulse', 'glide', 'fusion', 'boxed'] as const;
export type CaptionPresetId = (typeof CAPTION_PRESET_IDS)[number];

export const DEFAULT_CAPTION_PRESET_ID: CaptionPresetId = 'classic';

/**
 * Every yFrac except `classic`'s sits at 0.55-0.59.
 *
 * That is not taste. Meta publishes its 9:16 safe zone (Business Help Centre 980593475366490)
 * as 14% top / 35% bottom / 6% sides, and TikTok's and YouTube Shorts' measured templates
 * agree within a few percent — so the universal band is yFrac 0.15 to 0.65, and 0.88 puts a
 * caption block underneath the like/comment/share rail on all three platforms.
 *
 * `classic` keeps 0.88 anyway, deliberately: it is the compatibility preset, and moving it
 * would shift the captions of every project that re-renders.
 */
const SAFE_BAND_NOTE = 'yFrac 0.55-0.59 clears the Reels/TikTok/Shorts bottom reserve';

export const CAPTION_PRESETS: readonly CaptionPreset[] = [
  {
    id: 'classic',
    label: 'Classic',
    description: 'The original. Karaoke highlight, no motion.',
    brandAware: true,
    // Deep-equals DEFAULT_CAPTION_STYLE, asserted in the tests. This preset is the proof
    // that the animation refactor changed nothing for existing renders.
    style: { ...DEFAULT_CAPTION_STYLE, position: { ...DEFAULT_CAPTION_STYLE.position! } },
    grouping: { maxWordsPerCue: 6, maxCueDurationSec: 3.5, maxGapSec: 0.8 },
  },
  {
    id: 'pop',
    label: 'Pop',
    description: 'Heavy uppercase block. Each word pops as it lands.',
    fontFamily: 'Anton',
    style: {
      textColor: '#ffffff',
      // No karaoke recolour: emphasis carries all the colour this preset has.
      highlightColor: '#ffffff',
      outlineColor: '#000000',
      // Canvas strokes are CENTRED on the path and the fill paints over the inner half,
      // so the visible outline is half this number: 0.20 on a 119px font reads as ~12px,
      // inside the 8-12px band the reference styles use.
      outlineWidthFrac: 0.2,
      fontFamily: 'Anton',
      fontWeight: 400, // Anton ships one weight and is already black
      fontSizeFrac: 0.062,
      uppercase: true,
      lineHeightFactor: 1.08,
      position: { xFrac: 0.5, yFrac: 0.58 },
      shadow: { color: 'rgba(0,0,0,0.55)', blurFrac: 0.14, offsetYFrac: 0.05 },
      activeWordMode: 'none',
      animation: { kind: 'pop', durationSec: 0.18, amplitude: 0.28, anchor: 'word', reveal: 'cue' },
      emphasis: { color: '#ffd93d', scale: 1.1 },
    },
    grouping: { maxWordsPerCue: 6, maxCueDurationSec: 2.6, maxGapSec: 0.6 },
  },
  {
    id: 'pulse',
    label: 'Pulse',
    description: 'One to three words at a time, oversized, building word by word.',
    fontFamily: 'Montserrat',
    style: {
      textColor: '#ffffff',
      highlightColor: '#ffffff',
      outlineColor: '#000000',
      outlineWidthFrac: 0.22,
      fontFamily: 'Montserrat',
      fontWeight: 900,
      // 157px on 1080x1920. Three six-character words exceed the 0.9 wrap width, so this
      // preset stacks to 2-3 lines by design — BBC's guidance permits three lines on 9:16.
      fontSizeFrac: 0.082,
      uppercase: true,
      lineHeightFactor: 1.05,
      position: { xFrac: 0.5, yFrac: 0.55 }, // tallest block, needs the most headroom
      shadow: { color: 'rgba(0,0,0,0.5)', blurFrac: 0.1, offsetYFrac: 0.04 },
      activeWordMode: 'none',
      animation: { kind: 'pop', durationSec: 0.19, amplitude: 0.4, anchor: 'word', reveal: 'word' },
      emphasis: { color: '#39ff14', scale: 1.14 },
    },
    grouping: { maxWordsPerCue: 3, maxCueDurationSec: 1.4, maxGapSec: 0.35 },
  },
  {
    id: 'glide',
    label: 'Glide',
    description: 'Words rise and fade in. Sentence case, no outline.',
    fontFamily: 'Inter',
    brandAware: true,
    style: {
      textColor: '#ffffff',
      highlightColor: '#ffffff',
      outlineColor: 'rgba(0,0,0,0)',
      outlineWidthFrac: 0, // no stroke; the shadow does the legibility work
      fontFamily: 'Inter',
      fontWeight: 600,
      fontSizeFrac: 0.046,
      lineHeightFactor: 1.3,
      position: { xFrac: 0.5, yFrac: 0.58 },
      shadow: { color: 'rgba(0,0,0,0.7)', blurFrac: 0.2, offsetYFrac: 0.03 },
      activeWordMode: 'none',
      animation: {
        kind: 'floatIn',
        durationSec: 0.3,
        amplitude: 0.45,
        anchor: 'word',
        reveal: 'cue',
      },
      // Emphasis by WEIGHT, which is why Inter must be registered as a VARIABLE face.
      emphasis: { weight: 800 },
    },
    grouping: { maxWordsPerCue: 7, maxCueDurationSec: 3.2, maxGapSec: 0.8 },
  },
  {
    id: 'fusion',
    label: 'Fusion',
    description: 'Rounded panel behind the line. The spoken word gets a boxed highlight.',
    fontFamily: 'Inter',
    style: {
      textColor: '#ffffff',
      highlightColor: '#0b0b0f', // near-black glyphs on the yellow active pill
      outlineColor: 'rgba(0,0,0,0)',
      outlineWidthFrac: 0,
      fontFamily: 'Inter',
      fontWeight: 700,
      fontSizeFrac: 0.048,
      lineHeightFactor: 1.24,
      position: { xFrac: 0.5, yFrac: 0.58 },
      backgroundColor: '#0b0b0f',
      backgroundOpacity: 0.72,
      backgroundMode: 'line',
      backgroundRadiusFrac: 0.22,
      activeWordMode: 'box',
      activeBoxColor: '#ffd400',
      animation: {
        kind: 'scaleIn',
        durationSec: 0.22,
        amplitude: 0.16,
        anchor: 'cue',
        reveal: 'cue',
      },
      emphasis: { color: '#ffd400' },
    },
    grouping: { maxWordsPerCue: 6, maxCueDurationSec: 3.0, maxGapSec: 0.8 },
  },
  {
    id: 'boxed',
    label: 'Boxed',
    description: 'Monospace, each word in its own tinted box, building word by word.',
    fontFamily: 'JetBrains Mono',
    style: {
      textColor: '#d7ffe0',
      highlightColor: '#ffffff',
      outlineColor: 'rgba(0,0,0,0)',
      outlineWidthFrac: 0,
      fontFamily: 'JetBrains Mono',
      fontWeight: 700,
      fontSizeFrac: 0.038,
      lineHeightFactor: 1.4,
      position: { xFrac: 0.5, yFrac: 0.59 },
      backgroundColor: '#06120a',
      backgroundOpacity: 0.8,
      backgroundMode: 'word',
      backgroundRadiusFrac: 0.1,
      activeWordMode: 'fill',
      animation: { kind: 'none', anchor: 'word', reveal: 'word' },
      emphasis: { color: '#7dffa8' },
    },
    grouping: { maxWordsPerCue: 8, maxCueDurationSec: 3.5, maxGapSec: 0.9 },
  },
];

const BY_ID = new Map<string, CaptionPreset>(CAPTION_PRESETS.map((preset) => [preset.id, preset]));

export function isCaptionPresetId(value: unknown): value is CaptionPresetId {
  return typeof value === 'string' && BY_ID.has(value);
}

/** Falls back to `classic`, which is the compatibility preset in every sense. */
export function resolveCaptionPreset(id: string | undefined | null): CaptionPreset {
  return (id ? BY_ID.get(id) : undefined) ?? BY_ID.get(DEFAULT_CAPTION_PRESET_ID)!;
}

/**
 * The preset's style with the brand's palette folded in where the preset allows it, and
 * `presetId` stamped for provenance.
 *
 * Only `brandAware` presets take brand colour. A preset whose whole identity is "yellow on
 * white" must not quietly become "beige on white" because a brand's primary is beige.
 *
 * The brand's display family is applied ONLY when a real face is registered for it. Setting
 * an unresolvable family would put us straight back in the silent-Helvetica failure this
 * whole feature exists to end — callers surface it with `brandCaptionFontStatus` instead.
 */
export function applyCaptionPreset(
  preset: CaptionPreset,
  brand?: BrandStyleInput | null,
): CaptionStyle {
  const style: CaptionStyle = {
    ...preset.style,
    position: { ...preset.style.position! },
    presetId: preset.id,
  };
  if (!brand || !preset.brandAware) return style;

  const brandStyle = buildCaptionStyle(brand);
  // buildCaptionStyle already refuses a primary too pale to read over bright video
  // (relative luminance > 0.75) and falls back to the default highlight.
  style.highlightColor = brandStyle.highlightColor;
  if (isRegistrableCaptionFont(brandStyle.fontFamily)) {
    style.fontFamily = brandStyle.fontFamily;
  }
  return style;
}

/**
 * The style the renderer should actually draw: preset < stored style < per-cue override.
 *
 * Both the burn-in and the DOM preview call THIS, which is the whole point. The preview
 * used to build its own approximation — hardcoded bold/uppercase, a text-shadow standing in
 * for the stroke, no background — so a preset with a pill or a 900-weight face looked plainly
 * wrong in preview and right in export, and a preset gallery built on that would lie.
 *
 * The preset layer also covers the sparse case: a stored style of just `{presetId: 'pop'}`
 * resolves to the full preset rather than to bare defaults, so the two surfaces cannot
 * disagree about what a half-written style means.
 */
export function resolveStyleWithPreset(
  base: CaptionStyle | undefined,
  cueOverride?: Partial<CaptionStyle>,
): CaptionStyle {
  const preset = base?.presetId ? BY_ID.get(base.presetId) : undefined;
  const withPreset = preset ? { ...preset.style, ...base } : base;
  return resolveCaptionStyle(withPreset, cueOverride);
}

export type BrandCaptionFontStatus = {
  /** The family the brand asked for, or null when it names none. */
  family: string | null;
  /** True when a real WOFF2 is registered for it. */
  registered: boolean;
};

/**
 * Whether the brand's display face can actually be rendered.
 *
 * `brandStyle.typography.primary` is a family NAME, not a file. When it names something we
 * have no face for, the UI says so out loud — "brand font unavailable" — rather than
 * rendering Helvetica and letting everyone believe it worked.
 */
export function brandCaptionFontStatus(brand?: BrandStyleInput | null): BrandCaptionFontStatus {
  const family = brand?.typography?.primary?.trim() || null;
  return { family, registered: family !== null && isRegistrableCaptionFont(family) };
}

/** Every face a set of styles needs registered before their first draw. */
export function captionFontFamiliesFor(styles: readonly (CaptionStyle | undefined)[]): string[] {
  const families = styles
    .map((style) => style?.fontFamily)
    .filter((family): family is string => isRegistrableCaptionFont(family));
  return [...new Set(families)];
}

export { SAFE_BAND_NOTE };
