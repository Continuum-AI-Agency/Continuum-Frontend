import type { ApiRenderInputValue, ApiRenderVariable } from './api-renders';
import type { ForgeRenderLive } from './forge-render-preview';
import {
  paintScene,
  type Scene,
  type SceneGlyphKit,
  type SceneLayer,
  type ScenePicture,
  type SceneTextKit,
  transformPath,
} from './forge-scene';

// A text layer laid out in the browser, per keystroke, the way the template parser lays it out on
// the server: py_aep's calibrated composer (`resolvers/text_composition.py`, fixture-verified
// against After Effects' own layout caches) for the breaks and baselines, `aep_preview.py` for
// where each line sits, and `svg/text.py outline_runs` for how its glyphs are drawn. Each function
// names the one it ports; a difference between them is a bug here, not a choice.

const JUSTIFY_LEFT = 7413;
const JUSTIFY_RIGHT = 7414;
const JUSTIFY_CENTER = 7415;
const FAUX_BOLD_ADVANCE = 0.027;
const SMALL_CAPS_SCALE = 0.7;
/** What the composer refuses outright (`_check_envelope`); anything outside the kit is refused too. */
const REFUSED = /[\t ]|\p{M}|[֐-ࣿיִ-﷿ﹰ-﻿]/u;

type Matrix = readonly number[];

/** `a · b`: apply `b` first — py_aep's `Affine.multiply`. */
const multiply = (a: Matrix, b: Matrix): number[] => [
  (a[0] as number) * (b[0] as number) + (a[2] as number) * (b[1] as number),
  (a[1] as number) * (b[0] as number) + (a[3] as number) * (b[1] as number),
  (a[0] as number) * (b[2] as number) + (a[2] as number) * (b[3] as number),
  (a[1] as number) * (b[2] as number) + (a[3] as number) * (b[3] as number),
  (a[0] as number) * (b[4] as number) + (a[2] as number) * (b[5] as number) + (a[4] as number),
  (a[1] as number) * (b[4] as number) + (a[3] as number) * (b[5] as number) + (a[5] as number),
];

const apply = (m: Matrix, x: number, y: number): [number, number] => [
  (m[0] as number) * x + (m[2] as number) * y + (m[4] as number),
  (m[1] as number) * x + (m[3] as number) * y + (m[5] as number),
];

const round2 = (v: number) => Math.round(v * 100) / 100;
const isLower = (ch: string) => ch !== ch.toUpperCase() && ch === ch.toLowerCase();

/**
 * The Paragraph Text Resize rig's Source Text expression, line for line — including its quirk
 * (`aep_preview._paragraph_wrap`): the length test runs before the line has anything in it, so a
 * first word longer than `minchar - 1` counts an EMPTY line that is never written.
 */
export function paragraphWrap(text: string, minchar: number, maxline: number): string {
  let limit = Math.trunc(minchar);
  for (;;) {
    let count = 0;
    let out = '';
    let line = '';
    for (const word of text.split(' ')) {
      if (`${line} ${word}`.length > limit) {
        if (out !== '') out += '\r';
        out += line;
        count += 1;
        line = word;
      } else {
        if (line !== '') line += ' ';
        line += word;
      }
    }
    if (line !== '') {
      if (out !== '') out += '\r';
      out += line;
      count += 1;
    }
    limit += 1;
    if (!(count > maxline)) return out;
  }
}

/**
 * Per-character advances of one same-style stretch (`text_composition._shape_stretch`): HarfBuzz's
 * advance plus the pair kerning into the next character, then faux bold, small caps, horizontal
 * scale and tracking. Null when a character is outside the face or the case map changes length.
 */
function advances(text: string, kit: SceneTextKit, face: SceneGlyphKit): number[] | null {
  const shaped = kit.caps === 1 || kit.caps === 2 ? text.toUpperCase() : text;
  if (shaped.length !== text.length) return null;
  const scale = kit.size / face.upem;
  const out: number[] = [];
  for (let i = 0; i < shaped.length; i++) {
    const glyph = face.chars[shaped[i] as string];
    if (!glyph) return null;
    const kern = i + 1 < shaped.length ? (face.kern[shaped.slice(i, i + 2)] ?? 0) : 0;
    let advance = (glyph[0] + kern) * scale;
    if (kit.fauxbold) advance += FAUX_BOLD_ADVANCE * kit.size;
    if (kit.caps === 1 && isLower(text[i] as string)) advance *= SMALL_CAPS_SCALE;
    out.push(advance * kit.hscale + (kit.tracking / 1000) * kit.size);
  }
  return out;
}

const widthOf = (text: string, kit: SceneTextKit, face: SceneGlyphKit): number | null => {
  const each = advances(text, kit, face);
  return each ? each.reduce((sum, v) => sum + v, 0) : null;
};

class Unsupported extends Error {}

function width(text: string, kit: SceneTextKit, face: SceneGlyphKit): number {
  const w = widthOf(text, kit, face);
  if (w === null) throw new Unsupported('a character is not in the face');
  return w;
}

/** Greedy word fit (`text_composition._break_paragraph`); the length of each produced line. */
function breakParagraph(
  paragraph: string,
  limit: number,
  firstLimit: number,
  kit: SceneTextKit,
  face: SceneGlyphKit,
): number[] {
  if (!paragraph) return [0];
  const lengths: number[] = [];
  let rest = paragraph;
  let current = firstLimit;
  while (rest) {
    let take = 0;
    while (take < rest.length) {
      const nextSpace = rest.indexOf(' ', take);
      let candidateEnd = nextSpace === -1 ? rest.length : nextSpace;
      const candidate = rest.slice(0, candidateEnd).replace(/ +$/, '');
      if (width(candidate, kit, face) > current) break;
      while (candidateEnd < rest.length && rest[candidateEnd] === ' ') candidateEnd += 1;
      take = candidateEnd;
      if (nextSpace === -1) break;
    }
    if (take === 0) {
      // A token wider than the line wraps at the character level.
      take = 1;
      while (
        take < rest.length &&
        rest[take] !== ' ' &&
        width(rest.slice(0, take + 1), kit, face) <= current
      )
        take += 1;
    }
    lengths.push(take);
    rest = rest.slice(take);
    current = limit;
  }
  return lengths;
}

type Line = { start: number; end: number; text: string; x: number; y: number; width: number };

/** Box text (`compose_lines` + `aep_preview._lines`, box branch): AE's breaks, baselines, clip. */
function boxLines(
  raw: string,
  kit: SceneTextKit,
  face: SceneGlyphKit,
): { lines: Line[]; overflow: boolean } {
  const [left, top, boxWidth, boxHeight, inset] = kit.box as NonNullable<SceneTextKit['box']>;
  const [firstIndent, startIndent, endIndent] = kit.indents;
  const limit = boxWidth - 2 * inset - startIndent - endIndent;
  const body = raw.endsWith('\r') ? raw.slice(0, -1) : raw;
  const spans: [number, number][] = [];
  let offset = 0;
  for (const paragraph of body.split('\r')) {
    const lengths = breakParagraph(paragraph, limit, limit - firstIndent, kit, face);
    lengths.forEach((length, n) => {
      const end = offset + length + (n === lengths.length - 1 ? 1 : 0);
      spans.push([offset, end]);
      offset = end;
    });
  }
  // The inset shrinks the usable width but does not shift the first baseline; faux bold raises
  // the ascent by half its advance bump.
  const baselines: number[] = [];
  let y = 0;
  spans.forEach((_, n) => {
    y +=
      n === 0
        ? (face.ascender + (kit.fauxbold ? FAUX_BOLD_ADVANCE / 2 : 0)) * kit.size
        : kit.leading;
    baselines.push(y);
  });
  const kept = baselines.filter((b) => b <= boxHeight).length;
  const usable = boxWidth - 2 * inset;
  const lines = spans.slice(0, kept).map(([s, e], n) => {
    const text = raw.slice(s, e).replace(/\r+$/, '');
    // AE excludes trailing spaces from the fit, so they must not shift a centred line.
    const fit = text.replace(/ +$/, '');
    const w = fit ? width(fit, kit, face) : 0;
    let x = left + inset;
    if (kit.justify === JUSTIFY_CENTER) x += usable / 2 - w / 2;
    else if (kit.justify === JUSTIFY_RIGHT) x += usable - w;
    return {
      start: s,
      end: s + text.length,
      text,
      x: round2(x),
      y: round2(top + (baselines[n] as number)),
      width: round2(w),
    };
  });
  return { lines, overflow: kept < spans.length };
}

/** Point text (`aep_preview._lines`, point branch): the authored lines, the origin on the first baseline. */
function pointLines(raw: string, kit: SceneTextKit, face: SceneGlyphKit): Line[] {
  const body = /[\r\n]$/.test(raw) ? raw.slice(0, -1) : raw;
  const lines: Line[] = [];
  let offset = 0;
  let y = 0;
  for (const line of body.split(/\r\n|\r|\n/)) {
    const w = line ? width(line, kit, face) : 0;
    const x = kit.justify === JUSTIFY_LEFT ? 0 : kit.justify === JUSTIFY_CENTER ? -w / 2 : -w;
    lines.push({
      start: offset,
      end: offset + line.length,
      text: line,
      x: round2(x),
      y: round2(y),
      width: round2(w),
    });
    y += kit.leading;
    offset += line.length + 1;
  }
  return lines;
}

/**
 * Every glyph of every line, in font units, and where it is planted (`_runs` + `outline_runs`): one
 * run per line — a set text has one style — at the line's AE-exact x, the pen walking UNKERNED
 * advances plus tracking, the way the server draws it.
 */
function planted(lines: readonly Line[], kit: SceneTextKit, face: SceneGlyphKit) {
  const scale = kit.size / face.upem;
  const spacing = (kit.tracking / 1000) * kit.size;
  const glyphs: { d: string; at: number[] }[] = [];
  for (const line of lines) {
    let pen = line.x;
    for (const ch of line.text) {
      const glyph = face.chars[ch];
      if (glyph?.[2]) glyphs.push({ d: glyph[2], at: [scale, 0, 0, -scale, pen, line.y] });
      pen += (glyph?.[1] ?? 0) * scale + spacing;
    }
  }
  return glyphs;
}

/** The rig's Anchor Point and Scale expressions (`aep_preview._rig_map`), from the block's own ink. */
function rigShift(
  layerPaths: readonly string[],
  rig: NonNullable<SceneTextKit['rig']>,
): { shift: number[] | null; k: number } {
  const numbers = layerPaths.flatMap((d) => d.match(/-?\d+(?:\.\d+)?/g)?.map(Number) ?? []);
  if (numbers.length < 2 || !rig.anchorPoint) return { shift: null, k: 1 };
  const xs = numbers.filter((_, i) => i % 2 === 0);
  const ys = numbers.filter((_, i) => i % 2 === 1);
  const top = Math.min(...ys);
  const height = Math.max(...ys) - top;
  const inkWidth = Math.max(...xs) - Math.min(...xs);
  const [ax, ay] = rig.anchorPoint;
  const ny = rig.anchor
    ? (({ 1: top, 2: top + height / 2, 3: top + height } as Record<number, number>)[
        rig.centering
      ] ?? ay)
    : ay;
  let k = 1;
  if (rig.scale && rig.maxWidth && rig.scaleValue) {
    const drawn = (inkWidth * rig.scaleValue[0]) / 100;
    if (drawn > rig.maxWidth) k = rig.maxWidth / drawn;
  }
  return { shift: [k, 0, 0, k, ax - k * ax, ay - k * ny], k };
}

/** The laid-out text layer, or why this value cannot be laid out in the browser. */
export type LiveTextResult = { layer: SceneLayer } | { why: string };

/**
 * One text layer holding `value`, as the parser's scene row would carry it: glyph outlines in comp
 * space, lines, overflow, the box's corners, and the rig's own record. `layer` is the kit's row.
 */
export function layoutText(
  layer: SceneLayer,
  value: string,
  face: SceneGlyphKit | undefined,
): LiveTextResult {
  const kit = layer.kit;
  if (!kit) return { why: layer.kitWhy ?? 'no layout kit' };
  if (!face) return { why: `face ${kit.font} was not sent` };
  if (REFUSED.test(value))
    return { why: 'tabs, no-break spaces, marks and right-to-left text are the server’s' };
  let text = value.replace(/\r\n|\n/g, '\r');
  // The rig re-wraps the value the row set, once, before anything is composed (`_apply_rigs`).
  if (kit.rig) text = paragraphWrap(text, kit.rig.minchar, kit.rig.maxline);
  const raw = `${text}\r`;
  const base = { ...layer, text: { ...(layer.text ?? { fill: null }), value: text } } as SceneLayer;
  const rigRecord = (scale: number) =>
    kit.rig
      ? { rig: { kind: 'Paragraph Text Resize', lines: text.split(/\r|\n/).length, scale } }
      : {};
  if (!raw.trim()) {
    return {
      layer: {
        ...base,
        text: { ...base.text, value: text, paths: [], lines: [], lineCount: 0, overflow: false },
        corners: null,
        tier: 'unknown',
        why: "the layer's text is empty — nothing was composed",
        ...rigRecord(1),
      } as SceneLayer,
    };
  }
  try {
    const { lines, overflow } = kit.box
      ? boxLines(raw, kit, face)
      : { lines: pointLines(raw, kit, face), overflow: false };
    const glyphs = planted(
      lines.filter((line) => line.text),
      kit,
      face,
    );
    let matrix: number[] = [...kit.matrix];
    let k = 1;
    if (kit.rig && (kit.rig.anchor || kit.rig.scale)) {
      const moved = rigShift(
        glyphs.map((g) => transformPath(g.d, g.at)),
        kit.rig,
      );
      if (moved.shift) matrix = multiply(matrix, moved.shift);
      k = moved.k;
    }
    const box = kit.box
      ? kit.box.slice(0, 4)
      : [
          Math.min(...lines.map((line) => line.x)),
          -kit.leading,
          Math.max(...lines.map((line) => line.width)),
          kit.leading * Math.max(1, lines.length),
        ];
    const [l, t, w, h] = box as [number, number, number, number];
    const corners = [
      apply(matrix, l, t),
      apply(matrix, l + w, t),
      apply(matrix, l + w, t + h),
      apply(matrix, l, t + h),
    ].map(([x, y]) => [round2(x), round2(y)] as [number, number]);
    return {
      layer: {
        ...base,
        text: {
          ...base.text,
          value: text,
          paths: glyphs.map((g) => transformPath(g.d, multiply(matrix, g.at))),
          lines: lines.map((line) => ({ text: line.text, width: line.width })),
          lineCount: lines.length,
          overflow,
        },
        corners,
        ...rigRecord(Math.round(k * 10000) / 10000),
      } as SceneLayer,
    };
  } catch (error) {
    if (error instanceof Unsupported) return { why: error.message };
    throw error;
  }
}

type LiveVariable = Pick<ApiRenderVariable, 'key' | 'label' | 'kind' | 'reserved'>;

const TEXT_KINDS = new Set(['text', 'number']);

/** A value as the row sets it (`preview.ts textRow`): text and numbers; anything else leaves it authored. */
const textOf = (value: ApiRenderInputValue | undefined): string | null =>
  typeof value === 'string' ? value : typeof value === 'number' ? String(value) : null;

/**
 * The kit's scene holding one row: every text layer a text variable writes, laid out again from
 * the row's value. A layer the browser cannot lay out comes back in `unlaid`, by variable label and
 * why — its picture would be the kit's text, not the row's, so a caller must not show it as live.
 */
export function liveScene<V extends LiveVariable>(
  scene: Scene,
  args: {
    variables: readonly V[];
    values: Readonly<Record<string, ApiRenderInputValue>>;
    layersOf: (variable: V) => ReadonlySet<number>;
  },
): { scene: Scene; unlaid: string[] } {
  const wanted = new Map<number, { value: string; label: string }>();
  for (const variable of args.variables) {
    if (variable.reserved || !TEXT_KINDS.has(variable.kind)) continue;
    const value = textOf(args.values[variable.key]);
    if (value === null) continue;
    for (const id of args.layersOf(variable)) wanted.set(id, { value, label: variable.label });
  }
  const unlaid = new Set<string>();
  const layers = scene.layers.map((layer) => {
    const want = layer.kind === 'text' ? wanted.get(layer.id) : undefined;
    if (!want) return layer;
    const laid = layoutText(
      layer,
      want.value,
      layer.kit ? scene.glyphs?.[layer.kit.font] : undefined,
    );
    if ('why' in laid) {
      unlaid.add(`${want.label}: ${laid.why}`);
      return layer;
    }
    return laid.layer;
  });
  return { scene: { ...scene, layers }, unlaid: [...unlaid] };
}

type Pin = { assetId: string; versionId?: string };

/** The Library picture a slot value names: its first pin, or null. */
export const livePinOf = (value: ApiRenderInputValue | undefined): Pin | null => {
  const pin = Array.isArray(value) ? value[0] : value;
  return pin && typeof pin === 'object' && 'assetId' in pin ? pin : null;
};

/** One key per picture as the Live preview fetches it: the asset, its version, still or frame. */
export const livePictureKey = (pin: Pin, kind: string): string =>
  `${pin.assetId}:${pin.versionId ?? 'head'}:${kind}`;

export type LivePaint = {
  svg: string;
  /** Labels whose text runs past its box. */
  overflows: string[];
  /** Text the browser could not lay out, by label and why: the picture would not be this row's. */
  unlaid: string[];
  notes: string[];
};

/**
 * One row painted from a Live kit: its text laid out, its colours and pictures in place — what
 * the Render tab shows per keystroke and what `forge:preview:live:bench` grades. `pictures` holds
 * the row's Library pictures by `livePictureKey`; one not there yet leaves its slot empty.
 */
export function paintLive(
  kit: ForgeRenderLive,
  values: Readonly<Record<string, ApiRenderInputValue>>,
  pictures: ReadonlyMap<string, ScenePicture | null>,
): LivePaint {
  const layersOf = (variable: ForgeRenderLive['variables'][number]) => new Set(variable.layerIds);
  const { scene, unlaid } = liveScene(kit.scene, { variables: kit.variables, values, layersOf });
  const notes = new Set(kit.notes);
  const { svg, overflows } = paintScene(scene, {
    variables: kit.variables,
    values,
    layersOf,
    // Continuum's own slot shows the brand's mark, as the render will.
    picture: (variable) => {
      if (variable.reserved) return kit.brandMark;
      const pin = livePinOf(values[variable.key]);
      return pin ? (pictures.get(livePictureKey(pin, variable.kind)) ?? null) : null;
    },
    footage: (layer) =>
      layer.asset?.dataUri && layer.asset.width && layer.asset.height
        ? { uri: layer.asset.dataUri, width: layer.asset.width, height: layer.asset.height }
        : null,
    notes,
  });
  return { svg, overflows, unlaid, notes: [...notes] };
}
