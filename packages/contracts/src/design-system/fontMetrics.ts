// A font's advance widths, read from its own tables — the measure a planner can take on a server.
//
// The browser measures type with `ctx.measureText`; a Backend planner has no canvas. Before this
// it guessed half an em a character, so it planned lines and glyph boxes the renderer did not
// draw. The renderer draws with kerning and ligatures OFF (`font-kerning:none`,
// `font-variant-ligatures:none`), so a run's width is exactly the sum of its glyphs' `hmtx`
// advances — which is all this reads. Pure and dependency-free, like `media/font-names.ts`.
//
// TrueType and CFF OpenType only. WOFF/WOFF2 return null: their tables are compressed, and the
// faces a planner measures are fetched as TTF (Google Fonts' css2 API answers a server with TTF).

import type { MeasureText, TextStyle } from './placement';

export interface FontMetrics {
  readonly upem: number;
  readonly ascender: number;
  readonly descender: number;
  /** Cap height in font units; ~0.7 em when the file does not state one (OS/2 v1). */
  readonly capHeight: number;
  /** The advance of one character in font units; `.notdef`'s for a character the face lacks. */
  readonly advance: (char: string) => number;
}

const TRUETYPE = 0x00010000;
const TRUE_TAG = 0x74727565;
const OTTO_TAG = 0x4f54544f;
const tag = (text: string) =>
  ((text.charCodeAt(0) << 24) |
    (text.charCodeAt(1) << 16) |
    (text.charCodeAt(2) << 8) |
    text.charCodeAt(3)) >>>
  0;

/** The glyph a code point maps to, from a format 4 (BMP) or format 12 (full range) subtable. */
function cmapLookup(view: DataView, at: number): ((codePoint: number) => number) | null {
  const format = view.getUint16(at);
  if (format === 4) {
    const segments = view.getUint16(at + 6) / 2;
    const ends = at + 14;
    const starts = ends + segments * 2 + 2;
    const deltas = starts + segments * 2;
    const offsets = deltas + segments * 2;
    return (codePoint) => {
      if (codePoint > 0xffff) return 0;
      for (let i = 0; i < segments; i += 1) {
        if (view.getUint16(ends + i * 2) < codePoint) continue;
        const start = view.getUint16(starts + i * 2);
        if (start > codePoint) return 0;
        const delta = view.getInt16(deltas + i * 2);
        const offset = view.getUint16(offsets + i * 2);
        if (offset === 0) return (codePoint + delta) & 0xffff;
        const glyph = view.getUint16(offsets + i * 2 + offset + (codePoint - start) * 2);
        return glyph === 0 ? 0 : (glyph + delta) & 0xffff;
      }
      return 0;
    };
  }
  if (format === 12) {
    const groups = view.getUint32(at + 12);
    return (codePoint) => {
      for (let i = 0; i < groups; i += 1) {
        const group = at + 16 + i * 12;
        const start = view.getUint32(group);
        if (codePoint < start) return 0;
        if (codePoint <= view.getUint32(group + 4))
          return view.getUint32(group + 8) + codePoint - start;
      }
      return 0;
    };
  }
  return null;
}

/** The metrics of a TTF/OTF file, or null for anything this cannot read. */
export function readFontMetrics(input: Uint8Array | ArrayBuffer): FontMetrics | null {
  const bytes = input instanceof Uint8Array ? input : new Uint8Array(input);
  if (bytes.length < 12) return null;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const version = view.getUint32(0);
  if (version !== TRUETYPE && version !== TRUE_TAG && version !== OTTO_TAG) return null;
  const tables = new Map<number, number>();
  for (let i = 0; i < view.getUint16(4); i += 1) {
    const at = 12 + i * 16;
    if (at + 16 > bytes.length) return null;
    tables.set(view.getUint32(at), view.getUint32(at + 8));
  }
  const head = tables.get(tag('head'));
  const hhea = tables.get(tag('hhea'));
  const hmtx = tables.get(tag('hmtx'));
  const cmap = tables.get(tag('cmap'));
  if (head === undefined || hhea === undefined || hmtx === undefined || cmap === undefined)
    return null;
  try {
    const upem = view.getUint16(head + 18);
    const hMetrics = view.getUint16(hhea + 34);
    // Windows Unicode full range, then Windows BMP, then any Unicode subtable.
    let lookup: ((codePoint: number) => number) | null = null;
    let rank = 99;
    for (let i = 0; i < view.getUint16(cmap + 2); i += 1) {
      const record = cmap + 4 + i * 8;
      const platform = view.getUint16(record);
      const encoding = view.getUint16(record + 2);
      const order =
        platform === 3 && encoding === 10
          ? 0
          : platform === 3 && encoding === 1
            ? 1
            : platform === 0
              ? 2
              : 99;
      if (order >= rank) continue;
      const found = cmapLookup(view, cmap + view.getUint32(record + 4));
      if (found) {
        lookup = found;
        rank = order;
      }
    }
    if (!lookup || hMetrics === 0) return null;
    const glyphOf = lookup;
    const os2 = tables.get(tag('OS/2'));
    const capHeight =
      os2 !== undefined && view.getUint16(os2) >= 2
        ? view.getInt16(os2 + 88)
        : Math.round(upem * 0.7);
    const cache = new Map<string, number>();
    return {
      upem,
      ascender: view.getInt16(hhea + 4),
      descender: view.getInt16(hhea + 6),
      capHeight,
      advance: (char) => {
        let width = cache.get(char);
        if (width === undefined) {
          const glyph = glyphOf(char.codePointAt(0) ?? 0);
          width = view.getUint16(hmtx + Math.min(glyph, hMetrics - 1) * 4);
          cache.set(char, width);
        }
        return width;
      },
    };
  } catch {
    // A table offset past the end of the file: not a font this can read.
    return null;
  }
}

/** A run's width in font units: the sum of its advances, as the renderer lays it with kerning off. */
export const runUnits = (metrics: FontMetrics, text: string): number => {
  let units = 0;
  for (const char of text) units += metrics.advance(char);
  return units;
};

/**
 * `MeasureText` over real files, one per weight — the planner's stand-in for `ctx.measureText`,
 * so `breakLines` breaks on the server where the renderer will.
 */
export const measureWithFonts =
  (faces: { readonly bold: FontMetrics; readonly light: FontMetrics }): MeasureText =>
  (text: string, style: TextStyle) => {
    const metrics = style.weight === 'bold' ? faces.bold : faces.light;
    return (runUnits(metrics, text) / metrics.upem) * style.sizePx;
  };
