import { describe, expect, it } from 'bun:test';

import { measureWithFonts, readFontMetrics, runUnits } from './fontMetrics';

/**
 * A minimal TrueType file: head, hhea, hmtx, OS/2 v2 and a format 4 cmap mapping 'A'..'C' to
 * glyphs 1..3. The real-file proof (Anton's hmtx against Render's metrics.json) is in the
 * typography bench, which runs where the font files are.
 */
function tinyFont(advances: number[], upem = 1000): Uint8Array {
  const table = (size: number) => new DataView(new ArrayBuffer(size));
  const head = table(54);
  head.setUint16(18, upem);
  const hhea = table(36);
  hhea.setInt16(4, 800);
  hhea.setInt16(6, -200);
  hhea.setUint16(34, advances.length);
  const hmtx = table(advances.length * 4);
  advances.forEach((advance, glyph) => hmtx.setUint16(glyph * 4, advance));
  const os2 = table(96);
  os2.setUint16(0, 2);
  os2.setInt16(88, 700);
  // cmap: one Windows BMP subtable, format 4, two segments ('A'..'C' → 1..3, and the 0xFFFF end).
  const cmap = table(4 + 8 + 16 + 4 * 2 * 2);
  cmap.setUint16(2, 1);
  cmap.setUint16(4, 3);
  cmap.setUint16(6, 1);
  cmap.setUint32(8, 12);
  const sub = 12;
  cmap.setUint16(sub, 4);
  cmap.setUint16(sub + 6, 4);
  const ends = sub + 14;
  cmap.setUint16(ends, 0x43);
  cmap.setUint16(ends + 2, 0xffff);
  const starts = ends + 4 + 2;
  cmap.setUint16(starts, 0x41);
  cmap.setUint16(starts + 2, 0xffff);
  const deltas = starts + 4;
  cmap.setInt16(deltas, 1 - 0x41);
  cmap.setInt16(deltas + 2, 1);
  const tables: [string, DataView][] = [
    ['OS/2', os2],
    ['cmap', cmap],
    ['head', head],
    ['hhea', hhea],
    ['hmtx', hmtx],
  ];
  const directory = 12 + tables.length * 16;
  const size = directory + tables.reduce((sum, [, view]) => sum + view.byteLength, 0);
  const out = new Uint8Array(size);
  const view = new DataView(out.buffer);
  view.setUint32(0, 0x00010000);
  view.setUint16(4, tables.length);
  let offset = directory;
  tables.forEach(([name, data], index) => {
    const at = 12 + index * 16;
    for (let i = 0; i < 4; i += 1) out[at + i] = name.charCodeAt(i);
    view.setUint32(at + 8, offset);
    view.setUint32(at + 12, data.byteLength);
    out.set(new Uint8Array(data.buffer), offset);
    offset += data.byteLength;
  });
  return out;
}

describe('readFontMetrics', () => {
  const font = tinyFont([500, 600, 700, 800]);

  it('reads upem, the vertical metrics and each character through the cmap', () => {
    const metrics = readFontMetrics(font);
    expect(metrics).not.toBeNull();
    expect(metrics?.upem).toBe(1000);
    expect(metrics?.ascender).toBe(800);
    expect(metrics?.descender).toBe(-200);
    expect(metrics?.capHeight).toBe(700);
    expect(['A', 'B', 'C'].map((char) => metrics?.advance(char))).toEqual([600, 700, 800]);
    // A character the face lacks takes .notdef's advance, as the renderer would.
    expect(metrics?.advance('Z')).toBe(500);
  });

  it('sums a run and measures it at a size, per weight', () => {
    const metrics = readFontMetrics(font)!;
    expect(runUnits(metrics, 'ABC')).toBe(2100);
    const wide = readFontMetrics(tinyFont([500, 1000, 1000, 1000]))!;
    const measure = measureWithFonts({ bold: wide, light: metrics });
    expect(measure('AB', { weight: 'light', sizePx: 100 })).toBeCloseTo(130);
    expect(measure('AB', { weight: 'bold', sizePx: 100 })).toBeCloseTo(200);
  });

  it('returns null for anything that is not a TTF/OTF', () => {
    expect(
      readFontMetrics(new Uint8Array([0x77, 0x4f, 0x46, 0x32, 0, 0, 0, 0, 0, 0, 0, 0])),
    ).toBeNull();
    expect(readFontMetrics(new Uint8Array(4))).toBeNull();
  });
});
