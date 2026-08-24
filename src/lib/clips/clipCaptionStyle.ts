// Maps a brand's palette/typography to the burned-in caption style. Pure (no DOM,
// no server imports) so it runs in the library RSC, in components, and in the
// splice worker, and unit-tests cleanly.
//
// Every field below the original block is optional and additive, and every absent value
// resolves to exactly what the renderer did before presets existed — which is what makes
// the `classic` preset a byte-for-byte golden for the whole refactor.
//
// Two axes that look alike and must stay apart:
//   ACTIVE   — the word being spoken RIGHT NOW. `highlightColor` + `activeWordMode`,
//              live only while t is inside [word.startSec, word.endSec).
//   EMPHASIS — the word is SEMANTICALLY important. `emphasis.*` + `word.emphasis`,
//              for the word's whole life.
// `highlightColor` keeps its existing meaning; do not repurpose it for emphasis. The loud
// presets set `activeWordMode: 'none'` precisely so the two signals never fight.

import type { CaptionAnimation } from './captionAnimation';

/** Louder treatment for words the selector marked semantically important. */
export type CaptionEmphasis = {
  /** Fill for emphasised words. Falls back to highlightColor. */
  color?: string;
  /** Steady-state multiplier applied ON TOP of any entry animation. */
  scale?: number;
  /** 100..900. Needs a VARIABLE face registered with a weight range, or it is a no-op. */
  weight?: number;
};

/** Drop shadow under both the stroke and the fill. Fractions of the resolved font px. */
export type CaptionShadow = { color: string; blurFrac: number; offsetYFrac: number };

export type CaptionStyle = {
  textColor: string;
  highlightColor: string;
  outlineColor: string;
  // Display family. Only renders when a matching face is registered on this thread's
  // FontFaceSet — see captionFonts.ts. An unregistered family falls back to the system
  // stack, which is why the UI reports brand-font availability instead of guessing.
  fontFamily?: string;
  fontWeight?: number;
  fontSizeFrac?: number;
  outlineWidthFrac?: number;
  position?: CaptionPosition;
  backgroundColor?: string;
  backgroundOpacity?: number;

  /** Provenance only. Resolution is BY VALUE: the persisted style blob is the truth, so a
   *  later preset-table edit never silently re-renders an existing project. */
  presetId?: string;
  /** Canvas has no text-transform; applied at draw time, BEFORE measuring. */
  uppercase?: boolean;
  /** Overrides the renderer's 1.25 line-height constant. */
  lineHeightFactor?: number;
  /** 'line' is the historical per-line fillRect. 'word' is one pill per word. */
  backgroundMode?: 'none' | 'line' | 'word';
  /** roundRect radius as a fraction of the font px. 0 keeps the square fillRect. */
  backgroundRadiusFrac?: number;
  /** 'fill' is the historical highlightColor swap. */
  activeWordMode?: 'fill' | 'box' | 'none';
  /** Pill colour behind the spoken word; only read when activeWordMode is 'box'. */
  activeBoxColor?: string;
  shadow?: CaptionShadow;
  animation?: CaptionAnimation;
  emphasis?: CaptionEmphasis;
};

export type CaptionPosition = { xFrac: number; yFrac: number };
export type CaptionStyleOverride = Partial<CaptionStyle>;

export const DEFAULT_CAPTION_STYLE: CaptionStyle = {
  textColor: '#ffffff',
  highlightColor: '#ffd400',
  outlineColor: '#000000',
  fontSizeFrac: 0.055,
  outlineWidthFrac: 0.18,
  position: { xFrac: 0.5, yFrac: 0.88 },
};

// Structural input (not the server-only BrandStyle type) so this module stays free
// of "use server" imports and safe to bundle anywhere.
export type BrandStyleInput = {
  colors: string[];
  typography: { primary: string | null };
};

export function resolveCaptionStyle(
  base: CaptionStyle | undefined,
  override?: CaptionStyleOverride,
): CaptionStyle {
  const position = {
    ...DEFAULT_CAPTION_STYLE.position,
    ...base?.position,
    ...override?.position,
  };
  return {
    ...DEFAULT_CAPTION_STYLE,
    ...base,
    ...override,
    position: {
      xFrac: position.xFrac ?? DEFAULT_CAPTION_STYLE.position!.xFrac,
      yFrac: position.yFrac ?? DEFAULT_CAPTION_STYLE.position!.yFrac,
    },
  };
}

const HEX = /^#?([0-9a-f]{6}|[0-9a-f]{3})$/i;
// Above this relative luminance the brand color is too pale to read over bright
// video, so the highlight falls back to the default. Tunable.
const PALE_HIGHLIGHT_LUMINANCE = 0.75;

function expandHex(hex: string): string {
  const h = hex.trim().toLowerCase().replace('#', '');
  return h.length === 3
    ? h
        .split('')
        .map((c) => c + c)
        .join('')
    : h;
}

function normalizeHex(hex: string): string {
  return `#${expandHex(hex)}`;
}

// WCAG relative luminance (0 = black, 1 = white).
function relativeLuminance(hex: string): number {
  const h = expandHex(hex);
  const channel = (offset: number): number => {
    const v = parseInt(h.slice(offset, offset + 2), 16) / 255;
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(0) + 0.7152 * channel(2) + 0.0722 * channel(4);
}

export function buildCaptionStyle(brandStyle: BrandStyleInput | null | undefined): CaptionStyle {
  if (!brandStyle) return DEFAULT_CAPTION_STYLE;

  const fontFamily = brandStyle.typography.primary?.trim() || undefined;
  const primary = brandStyle.colors.find((c) => typeof c === 'string' && HEX.test(c));

  if (!primary) {
    return fontFamily ? { ...DEFAULT_CAPTION_STYLE, fontFamily } : DEFAULT_CAPTION_STYLE;
  }

  const highlightColor =
    relativeLuminance(primary) > PALE_HIGHLIGHT_LUMINANCE
      ? DEFAULT_CAPTION_STYLE.highlightColor
      : normalizeHex(primary);

  return { ...DEFAULT_CAPTION_STYLE, highlightColor, fontFamily };
}
