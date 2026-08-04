// Maps a brand's palette/typography to the burned-in caption style. Pure (no DOM,
// no server imports) so it runs in the library RSC, in components, and in the
// splice worker, and unit-tests cleanly. Colors are drop-in; the brand font family
// is best-effort (the worker can only render it if the device resolves the family).

export type CaptionStyle = {
  textColor: string;
  highlightColor: string;
  outlineColor: string;
  // Brand display family, best-effort. Prepended to the renderer's system stack;
  // silently falls back when the family isn't available to the OffscreenCanvas.
  fontFamily?: string;
  fontWeight?: number;
  fontSizeFrac?: number;
  outlineWidthFrac?: number;
  position?: CaptionPosition;
  backgroundColor?: string;
  backgroundOpacity?: number;
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
