// Independent physical oracles for the combination bench: FFmpeg decodes and plain pixel/PCM
// arithmetic. Nothing here imports editor or compositor code, so a shared product defect cannot
// also bend the oracle that grades it.

import { execFileSync } from 'node:child_process';

export type Rect = { x: number; y: number; w: number; h: number };
export type Box = { left: number; top: number; right: number; bottom: number };

const ffmpeg = (args: string[]) =>
  execFileSync('ffmpeg', ['-v', 'error', ...args], { maxBuffer: 256_000_000 });

/**
 * The frame on screen at `sec`: the last frame that starts at or before it. FFmpeg's `-ss` alone
 * returns the first frame starting at or after the time — one frame late between frame starts —
 * so the quarter second up to `sec` is decoded, trimmed on presentation time and reversed.
 */
const shownAt = (file: string, sec: number, filter: string): Buffer => {
  // A still (or time zero) has one frame; trimming on presentation time would drop it.
  if (sec <= 0)
    return ffmpeg(['-i', file, '-frames:v', '1', '-vf', filter, '-f', 'rawvideo', 'pipe:1']);
  const from = Math.max(0, sec - 0.25);
  return ffmpeg([
    '-ss',
    from.toFixed(4),
    '-i',
    file,
    '-vf',
    `trim=end=${(sec - from + 0.0005).toFixed(4)},${filter},reverse`,
    '-frames:v',
    '1',
    '-f',
    'rawvideo',
    'pipe:1',
  ]);
};

/** One RGB24 frame scaled to w×h: the frame on screen at `sec`, or the first frame / a still. */
export const decodeRgb = (file: string, w: number, h: number, sec?: number): Buffer =>
  sec === undefined
    ? ffmpeg([
        '-i',
        file,
        '-frames:v',
        '1',
        '-vf',
        `scale=${w}:${h}:flags=bilinear,format=rgb24`,
        '-f',
        'rawvideo',
        'pipe:1',
      ])
    : shownAt(file, sec, `scale=${w}:${h}:flags=bilinear,format=rgb24`);

/** A source frame framed like a full-frame `cover` clip (scale to fill, centre-crop), on screen at `sec`. */
export const decodeCover = (file: string, w: number, h: number, sec: number): Buffer =>
  shownAt(
    file,
    sec,
    `scale=${w}:${h}:force_original_aspect_ratio=increase:flags=bilinear,crop=${w}:${h},format=rgb24`,
  );

/** One channel of the whole file as 48 kHz float PCM. */
export const pcm = (file: string, channel: number): Float32Array => {
  const bytes = ffmpeg([
    '-i',
    file,
    '-af',
    `pan=mono|c0=c${channel}`,
    '-ar',
    '48000',
    '-f',
    'f32le',
    'pipe:1',
  ]);
  return new Float32Array(
    bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength),
  );
};

/** Mean absolute RGB error over every byte; Infinity when the frames differ in size. */
export const mae = (a: Buffer, b: Buffer): number => {
  if (a.length !== b.length) return Number.POSITIVE_INFINITY;
  let sum = 0;
  for (let i = 0; i < a.length; i += 1) sum += Math.abs(a[i]! - b[i]!);
  return sum / a.length;
};

/** Mean absolute RGB error inside a rectangle of a w-wide RGB24 frame. */
export const maeIn = (a: Buffer, b: Buffer, w: number, rect: Rect): number => {
  let sum = 0;
  let n = 0;
  for (let y = rect.y; y < rect.y + rect.h; y += 1)
    for (let x = rect.x; x < rect.x + rect.w; x += 1) {
      const i = (y * w + x) * 3;
      sum +=
        Math.abs(a[i]! - b[i]!) + Math.abs(a[i + 1]! - b[i + 1]!) + Math.abs(a[i + 2]! - b[i + 2]!);
      n += 3;
    }
  return n === 0 ? 0 : sum / n;
};

/** Mean of all bytes inside a rectangle — a picture's energy (0 is black or empty). */
export const energyIn = (a: Buffer, w: number, rect: Rect): number => {
  let sum = 0;
  let n = 0;
  for (let y = rect.y; y < rect.y + rect.h; y += 1)
    for (let x = rect.x; x < rect.x + rect.w; x += 1) {
      const i = (y * w + x) * 3;
      sum += a[i]! + a[i + 1]! + a[i + 2]!;
      n += 3;
    }
  return n === 0 ? 0 : sum / n;
};

/** Pixels whose summed |RGB| difference exceeds `threshold`, with their bounding box. */
export const changeMask = (
  a: Buffer,
  b: Buffer,
  w: number,
  h: number,
  threshold = 90,
): { mask: Uint8Array; count: number; box: Box | null } => {
  const mask = new Uint8Array(w * h);
  let count = 0;
  let left = w;
  let top = h;
  let right = -1;
  let bottom = -1;
  for (let p = 0; p < w * h; p += 1) {
    const i = p * 3;
    const d =
      Math.abs(a[i]! - b[i]!) + Math.abs(a[i + 1]! - b[i + 1]!) + Math.abs(a[i + 2]! - b[i + 2]!);
    if (d <= threshold) continue;
    mask[p] = 1;
    count += 1;
    const x = p % w;
    const y = (p - x) / w;
    if (x < left) left = x;
    if (x > right) right = x;
    if (y < top) top = y;
    if (y > bottom) bottom = y;
  }
  return { mask, count, box: count === 0 ? null : { left, top, right, bottom } };
};

/** Pixels changed by more than `threshold` inside `rect`, as a fraction of the rect. */
export const changedFraction = (
  a: Buffer,
  b: Buffer,
  w: number,
  rect: Rect,
  threshold = 30,
): number => {
  let changed = 0;
  for (let y = rect.y; y < rect.y + rect.h; y += 1)
    for (let x = rect.x; x < rect.x + rect.w; x += 1) {
      const i = (y * w + x) * 3;
      const d =
        Math.abs(a[i]! - b[i]!) + Math.abs(a[i + 1]! - b[i + 1]!) + Math.abs(a[i + 2]! - b[i + 2]!);
      if (d > threshold) changed += 1;
    }
  return changed / Math.max(1, rect.w * rect.h);
};

const channel = (value: number) => {
  const c = value / 255;
  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
};
/** WCAG 2.x relative luminance of an sRGB pixel. */
export const luminance = (r: number, g: number, b: number): number =>
  0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
/** WCAG contrast ratio, ≥ 1. */
export const contrast = (l1: number, l2: number): number =>
  (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);

const median = (values: number[]): number => {
  if (values.length === 0) return 0;
  const sorted = values.toSorted((x, y) => x - y);
  return sorted[Math.floor(sorted.length / 2)]!;
};

/**
 * How readable one text layer is, from the frame with it and the same frame without it.
 * The glyph mask is what the text changed. WCAG 1.4.3 treats a narrow outline as part of the
 * letter, so the letter's contrast is the better of its light end (the 95th-percentile luminance
 * of the mask: the fill of light type) and its dark end (the 5th percentile: a thin outline, or the
 * fill of dark type), each against the median luminance of what the mask covers. A thin outline is
 * a minority of glyph pixels, so a quartile would read the fill twice and miss the border.
 * `marginFrac` is the safe area every glyph must keep.
 */
export const readability = (
  withText: Buffer,
  withoutText: Buffer,
  w: number,
  h: number,
  marginFrac = 0.02,
) => {
  const { mask, count, box } = changeMask(withText, withoutText, w, h);
  const front: number[] = [];
  const behind: number[] = [];
  for (let p = 0; p < mask.length; p += 1) {
    if (!mask[p]) continue;
    const i = p * 3;
    front.push(luminance(withText[i]!, withText[i + 1]!, withText[i + 2]!));
    behind.push(luminance(withoutText[i]!, withoutText[i + 1]!, withoutText[i + 2]!));
  }
  const back = median(behind);
  const sorted = front.toSorted((x, y) => x - y);
  const at = (q: number) =>
    sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * q))] ?? back;
  const light = contrast(at(0.95), back);
  const dark = contrast(at(0.05), back);
  const ratio = count === 0 ? 1 : Math.max(light, dark);
  const mx = Math.round(w * marginFrac);
  const my = Math.round(h * marginFrac);
  const inside =
    box !== null && box.left >= mx && box.top >= my && box.right < w - mx && box.bottom < h - my;
  return { count, areaFrac: count / (w * h), box, contrast: ratio, light, dark, inside };
};

export const boxesDisjoint = (a: Box | null, b: Box | null): boolean =>
  a === null ||
  b === null ||
  a.right < b.left ||
  b.right < a.left ||
  a.bottom < b.top ||
  b.bottom < a.top;

/**
 * Where a layer's glyphs landed in an encoded frame: pixels within `pad` px of the composed glyph
 * box that differ from the frame without the layer (> 90 summed RGB) AND match the frame with it
 * (≤ 45). The second test drops pixels that only moved because the codec softened them (dust
 * specks, saturated chroma edges); a shifted glyph still moves the box, because its displaced
 * pixels match neither frame.
 */
export const boxNear = (
  encoded: Buffer,
  without: Buffer,
  withLayer: Buffer,
  w: number,
  h: number,
  near: Box,
  pad = 24,
): Box | null => {
  const left = Math.max(0, near.left - pad);
  const top = Math.max(0, near.top - pad);
  const right = Math.min(w - 1, near.right + pad);
  const bottom = Math.min(h - 1, near.bottom + pad);
  const diff = (x: Buffer, y: Buffer, i: number) =>
    Math.abs(x[i]! - y[i]!) + Math.abs(x[i + 1]! - y[i + 1]!) + Math.abs(x[i + 2]! - y[i + 2]!);
  let found: Box | null = null;
  for (let y = top; y <= bottom; y += 1)
    for (let x = left; x <= right; x += 1) {
      const i = (y * w + x) * 3;
      if (diff(encoded, without, i) <= 90 || diff(encoded, withLayer, i) > 45) continue;
      found = found
        ? {
            left: Math.min(found.left, x),
            top: Math.min(found.top, y),
            right: Math.max(found.right, x),
            bottom: Math.max(found.bottom, y),
          }
        : { left: x, top: y, right: x, bottom: y };
    }
  return found;
};

/** Width and height of a PNG from its IHDR chunk. */
export const pngSize = (png: Buffer): { width: number; height: number } => ({
  width: png.readUInt32BE(16),
  height: png.readUInt32BE(20),
});

export const boxDistance = (a: Box | null, b: Box | null): number =>
  a === null || b === null
    ? Number.POSITIVE_INFINITY
    : Math.max(
        Math.abs(a.left - b.left),
        Math.abs(a.top - b.top),
        Math.abs(a.right - b.right),
        Math.abs(a.bottom - b.bottom),
      );

/** Relative squared PCM error over the expected signal, plus its energy and length agreement. */
export const audioError = (actual: Float32Array, expected: Float32Array) => {
  const n = Math.min(actual.length, expected.length);
  let energy = 0;
  let delta = 0;
  for (let i = 0; i < n; i += 1) {
    energy += expected[i]! * expected[i]!;
    delta += (actual[i]! - expected[i]!) ** 2;
  }
  return {
    energy: energy / Math.max(1, n),
    relativeError: energy === 0 ? Number.POSITIVE_INFINITY : delta / energy,
    lengthMatches: Math.abs(actual.length - expected.length) <= 48_000 / 30,
  };
};

/** Fraction of cut times that land within `toleranceSec` of an independent onset. */
export const onsetAlignment = (
  cuts: readonly number[],
  onsets: readonly number[],
  toleranceSec: number,
) => {
  const misses = cuts.filter(
    (cut) => !onsets.some((onset) => Math.abs(onset - cut) <= toleranceSec + 1e-9),
  );
  return {
    fraction: cuts.length === 0 ? 0 : (cuts.length - misses.length) / cuts.length,
    misses,
  };
};

/** A grid collage panel's rectangle on the canvas (index order: row-major, two by two). */
export const gridCell = (index: number, w: number, h: number): Rect => {
  const cw = Math.floor(w / 2);
  const ch = Math.floor(h / 2);
  return { x: (index % 2) * cw, y: Math.floor(index / 2) * ch, w: cw, h: ch };
};

/** The retained native-export replay's exact decode: one frame scaled to 80×45, then RGB24. */
export const decodeSmall = (file: string, sec?: number): Buffer =>
  ffmpeg([
    ...(sec === undefined ? [] : ['-ss', String(sec)]),
    '-i',
    file,
    '-frames:v',
    '1',
    '-vf',
    'scale=80:45:flags=bilinear',
    '-f',
    'rawvideo',
    '-pix_fmt',
    'rgb24',
    'pipe:1',
  ]);
