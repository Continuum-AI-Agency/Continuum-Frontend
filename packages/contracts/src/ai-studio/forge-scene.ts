import { z } from 'zod';
import type { ApiRenderInputValue, ApiRenderVariable } from './api-renders';

// The template parser's scene of one comp, and the vector painter that turns it into a picture —
// shared so the Backend (rasterised, the Exact preview and the sketch) and the browser (the Live
// preview, repainted per keystroke) draw exactly the same thing. Every number drawn here is the
// parser's: glyph outlines set by the template's own faces, corners through the full transform
// chain, the fit rig's own box. Pure: no network, no file, no pixels.

const pointSchema = z.tuple([z.number(), z.number()]);

/**
 * What a browser needs to lay out a NEW value of a text layer itself (py `aep_preview.py --kit`):
 * the one character and paragraph style setting a text collapses to, the box, the layer's matrix
 * before its rig, and the Paragraph Text Resize rig's controls when it has one.
 */
export const sceneTextKitSchema = z
  .object({
    font: z.string(),
    size: z.number(),
    tracking: z.number(),
    hscale: z.number(),
    fauxbold: z.boolean(),
    caps: z.number().int(),
    leading: z.number(),
    /** AE's paragraph justification code (7413 left, 7414 right, 7415 centre). */
    justify: z.number().int(),
    /** First-line, start and end indents. */
    indents: z.tuple([z.number(), z.number(), z.number()]),
    /** Box text: left, top, width, height, inset. Null: point text, its origin the first baseline. */
    box: z.tuple([z.number(), z.number(), z.number(), z.number(), z.number()]).nullable(),
    /** Layer space to comp space, `[a b c d e f]`, before the rig moves the block. */
    matrix: z.array(z.number()).length(6),
    rig: z
      .object({
        minchar: z.number(),
        maxline: z.number(),
        centering: z.number(),
        maxWidth: z.number().nullable(),
        anchor: z.boolean(),
        scale: z.boolean(),
        anchorPoint: pointSchema.nullable(),
        scaleValue: pointSchema.nullable(),
      })
      .passthrough()
      .optional(),
  })
  .passthrough();
export type SceneTextKit = z.infer<typeof sceneTextKitSchema>;

/**
 * One face as a browser lays text in it — never the face file. Per character: HarfBuzz's advance
 * (what line breaking measures), the unkerned advance glyphs are drawn at, and the outline in font
 * units, y up. `kern`: every pair whose shaped width is not the sum of its parts, in font units.
 */
export const sceneGlyphKitSchema = z
  .object({
    upem: z.number().positive(),
    ascender: z.number(),
    chars: z.record(z.string(), z.tuple([z.number(), z.number(), z.string()])),
    kern: z.record(z.string(), z.number()),
  })
  .passthrough();
export type SceneGlyphKit = z.infer<typeof sceneGlyphKitSchema>;

export const sceneLayerSchema = z
  .object({
    id: z.number(),
    name: z.string(),
    kind: z.string(),
    depth: z.number(),
    enabled: z.boolean(),
    guide: z.boolean(),
    opacity: z.number().nullable(),
    onscreen: z.boolean(),
    tier: z.string(),
    fill: z.string().nullable(),
    corners: z.array(pointSchema).length(4).nullable(),
    anchorAt: pointSchema.optional(),
    text: z
      .object({
        value: z.string(),
        fill: z.string().nullable(),
        paths: z.array(z.string()).optional(),
        overflow: z.boolean().optional(),
        lineCount: z.number().int().optional(),
        /** A sketch shapes each block once: its outlines by reference, placed by this matrix. */
        pathsRef: z.string().optional(),
        matrix: z.array(z.number()).length(6).optional(),
      })
      .passthrough()
      .optional(),
    shape: z.object({ path: z.enum(['rect', 'ellipse']), roundness: z.number() }).optional(),
    refs: z.array(z.object({ layer: z.string(), effect: z.string(), prop: z.string() })).optional(),
    driven: z.array(z.string()).optional(),
    fit: z
      .object({
        follow: z.number(),
        anchor: z.number().int().optional(),
        method: z.number().int().optional(),
        posFollow: z.boolean().optional(),
        padW: z.number().nullable().optional(),
        padH: z.number().nullable().optional(),
        clamp: z.number().nullable().optional(),
        scale: z.tuple([z.number(), z.number()]).optional(),
      })
      .optional(),
    asset: z
      .object({
        dataUri: z.string().optional(),
        embedded: z.string().optional(),
        /** The embedded footage's natural size, when the sender measured it: the fit rig's clamp. */
        width: z.number().optional(),
        height: z.number().optional(),
      })
      .passthrough()
      .nullable()
      .optional(),
    blendingMode: z.string().nullable().optional(),
    /** Comp-space mask paths, in AE's order. A forge older than masks sends none. */
    masks: z
      .array(
        z
          .object({
            mode: z.string(),
            inverted: z.boolean(),
            d: z.string(),
            feather: z.number(),
            opacity: z.number(),
            expansion: z.number(),
            driven: z.boolean(),
          })
          .passthrough(),
      )
      .optional(),
    trackMatte: z
      .object({ type: z.string().nullable(), layerId: z.number().nullable() })
      .optional(),
    isTrackMatte: z.boolean().optional(),
    /** A static Fill effect's colour: every opaque pixel of the layer, and of what it holds. */
    fillEffect: z.string().optional(),
    /** Enabled effects that draw something, by name — the ones a layout preview cannot. */
    effects: z.array(z.string()).optional(),
    /** A text rig the parser EVALUATED (Paragraph Text Resize), so the block is where AE puts it. */
    rig: z.object({ kind: z.string(), lines: z.number(), scale: z.number() }).optional(),
    /** Transform properties whose expressions the parser evaluated exactly, by match name. */
    evaluated: z.array(z.string()).optional(),
    /** The kit a text layer was asked for (`--kit`); null with `kitWhy` when it cannot have one. */
    kit: sceneTextKitSchema.nullable().optional(),
    kitWhy: z.string().optional(),
  })
  .passthrough();

export const forgeSceneSchema = z
  .object({
    ok: z.literal(true),
    comp: z
      .object({
        name: z.string(),
        width: z.number().int().positive(),
        height: z.number().int().positive(),
      })
      .passthrough(),
    at: z.number(),
    layers: z.array(sceneLayerSchema),
    unknown: z.array(z.object({ what: z.string(), why: z.string() }).passthrough()).optional(),
    /** The faces the layers' kits set in, by PostScript name (`--kit` only). */
    glyphs: z.record(z.string(), sceneGlyphKitSchema).optional(),
  })
  .passthrough();

export type Scene = z.infer<typeof forgeSceneSchema>;
export type SceneLayer = Scene['layers'][number];

/** The animation sketch as forge answers it: frames of scene rows, outlines and stills shared. */
export const forgeSketchSchema = z
  .object({
    ok: z.literal(true),
    comp: forgeSceneSchema.shape.comp,
    frames: z
      .array(
        z
          .object({
            at: z.number(),
            layers: z.array(sceneLayerSchema),
            unknown: forgeSceneSchema.shape.unknown,
          })
          .passthrough(),
      )
      .min(1),
    paths: z.record(z.string(), z.array(z.string())).default({}),
    assets: z.record(z.string(), z.string()).default({}),
    window: z.tuple([z.number(), z.number()]),
    fps: z.number().positive(),
  })
  .passthrough();
export type Sketch = z.infer<typeof forgeSketchSchema>;

type Point = [number, number];
export type SceneBox = [number, number, number, number];

/** Every absolute pair of a path through `[a b c d e f]` — the outlines the parser writes. */
export function transformPath(d: string, [a, b, c, dd, e, f]: readonly number[]): string {
  const numbers: number[] = [];
  const skeleton = d.replace(/-?\d+(?:\.\d+)?(?:e[-+]?\d+)?/gi, (n) => {
    numbers.push(Number(n));
    return '\u0000';
  });
  const r = (v: number) => String(Math.round(v * 100) / 100);
  const moved: string[] = [];
  for (let k = 0; k + 1 < numbers.length; k += 2) {
    const x = numbers[k] as number;
    const y = numbers[k + 1] as number;
    moved.push(r(a * x + c * y + (e as number)), r(b * x + dd * y + (f as number)));
  }
  let at = 0;
  return skeleton.replace(/\u0000/g, () => moved[at++] ?? '0');
}

/** Each sketch frame as the scene a still would have been: outlines placed, stills restored. */
export function sketchScenes(sketch: Sketch): Scene[] {
  return sketch.frames.map((frame) => ({
    ok: true as const,
    comp: sketch.comp,
    at: frame.at,
    unknown: frame.unknown,
    layers: frame.layers.map((layer) => {
      const text = layer.text;
      const shared = text?.pathsRef ? sketch.paths[text.pathsRef] : undefined;
      const ref = (layer.asset as { ref?: unknown } | null | undefined)?.ref;
      return {
        ...layer,
        ...(text && shared && text.matrix
          ? {
              text: {
                ...text,
                paths: shared.map((d) => transformPath(d, text.matrix as number[])),
              },
            }
          : {}),
        ...(typeof ref === 'string' && sketch.assets[ref]
          ? { asset: { ...layer.asset, dataUri: sketch.assets[ref] } }
          : {}),
      };
    }),
  }));
}

/* -------------------------------------------------------------------------- */
/*  Geometry                                                                  */
/* -------------------------------------------------------------------------- */

/** The bounds of glyph outlines. Every command the parser writes (M, C) carries absolute pairs. */
export function pathsBox(paths: readonly string[]): SceneBox | null {
  let box: SceneBox | null = null;
  for (const d of paths) {
    const numbers = d.match(/-?\d+(?:\.\d+)?(?:e-?\d+)?/gi)?.map(Number) ?? [];
    for (let i = 0; i + 1 < numbers.length; i += 2) {
      const x = numbers[i] as number;
      const y = numbers[i + 1] as number;
      box = box
        ? [Math.min(box[0], x), Math.min(box[1], y), Math.max(box[2], x), Math.max(box[3], y)]
        : [x, y, x, y];
    }
  }
  return box;
}

export function quadBox(corners: readonly Point[]): SceneBox {
  const xs = corners.map((p) => p[0]);
  const ys = corners.map((p) => p[1]);
  return [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)];
}

/** An SVG transform mapping the unit square onto a layer's four corners (TL, TR, BR, BL). */
export function unitMatrix(corners: readonly Point[]): string {
  const [o, x, , y] = corners as [Point, Point, Point, Point];
  const r = (v: number) => Math.round(v * 1000) / 1000;
  return `matrix(${r(x[0] - o[0])} ${r(x[1] - o[1])} ${r(y[0] - o[0])} ${r(y[1] - o[1])} ${r(o[0])} ${r(o[1])})`;
}

/* -------------------------------------------------------------------------- */
/*  The layer tree the scene flattens                                          */
/* -------------------------------------------------------------------------- */

/**
 * A row's precomp ancestors, nearest first. The scene lists a precomp's children right after it
 * at one more depth, so an ancestor is the closest earlier row one level up, and so on.
 */
export function ancestorsOf(layers: readonly SceneLayer[], index: number): number[] {
  const out: number[] = [];
  let depth = layers[index]?.depth ?? 0;
  for (let i = index - 1; i >= 0 && depth > 0; i--) {
    const row = layers[i] as SceneLayer;
    if (row.depth < depth) {
      out.push(i);
      depth = row.depth;
    }
  }
  return out;
}

/**
 * Whether AE draws this row at this instant: enabled, not a guide, not held at 0% (the control
 * solid idiom), on screen, measured — and the same of every precomp it sits in.
 */
export function isPainted(layers: readonly SceneLayer[], index: number): boolean {
  const visible = (row: SceneLayer) =>
    row.enabled && !row.guide && row.opacity !== 0 && row.onscreen;
  const row = layers[index];
  if (!row || row.kind === 'comp' || !row.corners || !visible(row)) return false;
  return ancestorsOf(layers, index).every((i) => visible(layers[i] as SceneLayer));
}

export function opacityOf(layers: readonly SceneLayer[], index: number): number {
  return [index, ...ancestorsOf(layers, index)].reduce(
    (alpha, i) => alpha * ((layers[i]?.opacity ?? 100) / 100),
    1,
  );
}

/* -------------------------------------------------------------------------- */
/*  Colour controllers                                                         */
/* -------------------------------------------------------------------------- */

const slug = (value: string) =>
  value
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');

export type ColourVariable = { key: string; label: string };
export type ColourReaders = Map<string, { index: number; scope: 'all' | 'shapes' }[]>;

/**
 * A colour column reaches the comp through a controller effect ("Key Color" on a null) and every
 * layer whose expression reads it. The match is by name, the way the render sets it: the effect's
 * name slugged against the variable's label or key. A `Fill` effect recolours everything under the
 * layer; a fill-colour override recolours shapes only.
 */
export function colourReaders(
  layers: readonly SceneLayer[],
  variables: readonly ColourVariable[],
): ColourReaders {
  const out: ColourReaders = new Map();
  layers.forEach((layer, index) => {
    for (const ref of layer.refs ?? []) {
      const effect = slug(ref.effect);
      const variable = variables.find(
        (candidate) => slug(candidate.label) === effect || slug(candidate.key) === effect,
      );
      if (!variable) continue;
      const scope = ref.prop.startsWith('ADBE Fill') ? 'all' : 'shapes';
      out.set(variable.key, [...(out.get(variable.key) ?? []), { index, scope }]);
    }
  });
  return out;
}

export const hexToRgb = (hex: string | null | undefined): [number, number, number] | null => {
  const match = /^#?([0-9a-f]{6})$/i.exec(String(hex ?? '').trim());
  if (!match) return null;
  const n = Number.parseInt(match[1] as string, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
};

export const rgbToHex = (rgb: readonly [number, number, number]): string =>
  `#${rgb.map((v) => Math.round(v).toString(16).padStart(2, '0')).join('')}`;

/** The colour a controller gives a layer: one its precomps (or itself) reads, when set; else null. */
export function controlledFill(
  layers: readonly SceneLayer[],
  index: number,
  readers: ColourReaders,
  colours: Readonly<Record<string, string | undefined>>,
): string | null {
  const layer = layers[index] as SceneLayer;
  for (const owner of [index, ...ancestorsOf(layers, index)]) {
    for (const [key, list] of readers) {
      const hit = list.find((reader) => reader.index === owner);
      const rgb = hexToRgb(colours[key]);
      if (hit && rgb && (hit.scope === 'all' || layer.kind === 'shape')) return rgbToHex(rgb);
    }
  }
  return null;
}

/** A static Fill effect on the layer or on the nearest precomp holding it. */
export function effectFill(layers: readonly SceneLayer[], index: number): string | null {
  for (const owner of [index, ...ancestorsOf(layers, index)]) {
    const fill = layers[owner]?.fillEffect;
    if (fill) return fill;
  }
  return null;
}

/** The colour a layer paints in: a controller's when one reaches it, a Fill effect's, else its own. */
export function fillOf(
  layers: readonly SceneLayer[],
  index: number,
  readers: ColourReaders,
  colours: Readonly<Record<string, string | undefined>>,
): string | null {
  const layer = layers[index] as SceneLayer;
  return (
    controlledFill(layers, index, readers, colours) ??
    effectFill(layers, index) ??
    layer.text?.fill ??
    layer.fill
  );
}

/* -------------------------------------------------------------------------- */
/*  Markup                                                                     */
/* -------------------------------------------------------------------------- */

const escapeAttr = (value: string) =>
  value.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');

/** A comp-sized drawing; `out` rasterises it smaller (a sketch frame) without redrawing it. */
export const svgDocument = (
  width: number,
  height: number,
  body: string,
  out: { width: number; height: number } = { width, height },
): string =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="${out.width}" height="${out.height}" viewBox="0 0 ${width} ${height}">${body}</svg>`;

/** One painted scene row as SVG, in the colour it paints in. Footage needs its pixels embedded. */
export function layerMarkup(layer: SceneLayer, fill: string | null, opacity: number): string {
  const alpha = opacity < 1 ? ` opacity="${Math.round(opacity * 1000) / 1000}"` : '';
  if (layer.kind === 'text') {
    const paths = layer.text?.paths ?? [];
    if (!paths.length || !fill) return '';
    // One path per layer: a glyph's counter is a second contour wound the other way, and it only
    // cuts a hole when it shares a path with the outline around it.
    return `<path d="${escapeAttr(paths.join(' '))}" fill="${fill}"${alpha}/>`;
  }
  if (!layer.corners) return '';
  const matrix = unitMatrix(layer.corners);
  if (layer.kind === 'file') {
    const href = layer.asset?.dataUri;
    return href
      ? `<g transform="${matrix}"${alpha}><image href="${escapeAttr(href)}" x="0" y="0" width="1" height="1" preserveAspectRatio="none"/></g>`
      : '';
  }
  if (!fill) return '';
  if (layer.kind === 'shape' && layer.shape?.path === 'ellipse') {
    return `<g transform="${matrix}"${alpha}><ellipse cx="0.5" cy="0.5" rx="0.5" ry="0.5" fill="${fill}"/></g>`;
  }
  if (layer.kind === 'shape' || layer.kind === 'solid') {
    const [x0, y0, x1, y1] = quadBox(layer.corners);
    const round = layer.shape?.roundness ?? 0;
    const rx =
      round > 0
        ? ` rx="${(round / Math.max(1, x1 - x0)).toFixed(4)}" ry="${(round / Math.max(1, y1 - y0)).toFixed(4)}"`
        : '';
    return `<g transform="${matrix}"${alpha}><rect x="0" y="0" width="1" height="1"${rx} fill="${fill}"/></g>`;
  }
  return '';
}

/**
 * Where a swapped picture lands, by the fit rig's own arithmetic: scaled to the followed layer's
 * box by the rig's method (2 width, 3 height, 4 contain, 5 cover, 6 stretch), capped at `clamp`
 * percent, and pinned by the anchor the 3x3 menu names to the followed layer's position.
 * Without a rig it fills the layer's own box, contained.
 */
export function fittedRect(
  layer: SceneLayer,
  follow: SceneLayer | undefined,
  image: { width: number; height: number },
): SceneBox {
  const fit = layer.fit;
  if (!fit || !follow?.corners) {
    const box = quadBox(
      layer.corners ?? [
        [0, 0],
        [0, 0],
        [0, 0],
        [0, 0],
      ],
    );
    const s = Math.min((box[2] - box[0]) / image.width, (box[3] - box[1]) / image.height);
    const w = image.width * s;
    const h = image.height * s;
    return [
      (box[0] + box[2] - w) / 2,
      (box[1] + box[3] - h) / 2,
      (box[0] + box[2] + w) / 2,
      (box[1] + box[3] + h) / 2,
    ];
  }
  const box = quadBox(follow.corners);
  const padW = fit.padW ?? 0;
  const padH = fit.padH ?? 0;
  const authored = (fit.scale?.[0] ?? 100) / 100;
  const w = (box[2] - box[0] + padW * 2) / image.width;
  const h = (box[3] - box[1] + padH * 2) / image.height;
  const cap = (fit.clamp ?? Number.POSITIVE_INFINITY) / 100;
  const pick = (method: number | undefined): [number, number] => {
    switch (method) {
      case 1:
        return [authored, authored];
      case 2:
        return [Math.min(authored * w, cap), Math.min(authored * w, cap)];
      case 3:
        return [Math.min(authored * h, cap), Math.min(authored * h, cap)];
      case 5: {
        const s = Math.min(authored * Math.max(w, h), cap);
        return [s, s];
      }
      case 6:
        return [Math.min(authored * w, cap), Math.min(authored * h, cap)];
      default: {
        const s = Math.min(authored * Math.min(w, h), cap);
        return [s, s];
      }
    }
  };
  const [sx, sy] = pick(fit.method);
  const width = image.width * sx;
  const height = image.height * sy;
  const anchor = fit.anchor ?? 5;
  const column = (anchor - 1) % 3;
  const row = Math.floor((anchor - 1) / 3);
  const origin: Point =
    fit.posFollow !== false && follow.anchorAt
      ? [
          follow.anchorAt[0] + [-padW, 0, padW][column]!,
          follow.anchorAt[1] + [-padH, 0, padH][row]!,
        ]
      : (layer.anchorAt ?? [(box[0] + box[2]) / 2, (box[1] + box[3]) / 2]);
  const x0 = origin[0] - (width * column) / 2;
  const y0 = origin[1] - (height * row) / 2;
  return [x0, y0, x0 + width, y0 + height];
}

/* -------------------------------------------------------------------------- */
/*  Compositing: masks, track mattes, blend modes                              */
/* -------------------------------------------------------------------------- */

/** AE blend modes the SVG renderer has an exact twin for. */
const BLEND: Record<string, string> = {
  MULTIPLY: 'multiply',
  SCREEN: 'screen',
  OVERLAY: 'overlay',
  SOFT_LIGHT: 'soft-light',
  HARD_LIGHT: 'hard-light',
  DARKEN: 'darken',
  LIGHTEN: 'lighten',
  COLOR_DODGE: 'color-dodge',
  COLOR_BURN: 'color-burn',
  DIFFERENCE: 'difference',
  EXCLUSION: 'exclusion',
  HUE: 'hue',
  SATURATION: 'saturation',
  COLOR: 'color',
  LUMINOSITY: 'luminosity',
};
/** Near enough to draw, never exact: said so in a note. */
const BLEND_NEAR: Record<string, string> = {
  ADD: 'screen',
  LINEAR_DODGE: 'screen',
  LIGHTER_COLOR: 'lighten',
  DARKER_COLOR: 'darken',
  CLASSIC_COLOR_DODGE: 'color-dodge',
  CLASSIC_COLOR_BURN: 'color-burn',
  CLASSIC_DIFFERENCE: 'difference',
  LINEAR_BURN: 'multiply',
};

type SceneMask = NonNullable<SceneLayer['masks']>[number];

/**
 * What AE does to a layer after drawing it, as SVG around its markup: its own masks and those of
 * every precomp holding it, then the track matte it reads, then its blend mode against what is
 * under it — AE's order. The definitions each needs are collected once per picture.
 *
 * ponytail: a blend reaches everything painted under the layer, not only its precomp's contents;
 * AE isolates a precomp unless its transformations are collapsed. Ceiling: a blended child of a
 * transparent precomp over a busy page mixes with the page; upgrade path is one isolated group
 * per precomp.
 */
export function createCompositor(
  layers: readonly SceneLayer[],
  args: { width: number; height: number; markupOf: (index: number) => string; notes: Set<string> },
) {
  const { width: w, height: h, notes } = args;
  const defs: string[] = [];
  const memo = new Map<string, string>();
  let next = 0;
  const region = `maskUnits="userSpaceOnUse" x="${-w}" y="${-h}" width="${3 * w}" height="${3 * h}"`;
  const frame = `M ${-w} ${-h} H ${2 * w} V ${2 * h} H ${-w} Z`;
  const cover = `<rect x="${-w}" y="${-h}" width="${3 * w}" height="${3 * h}" fill="#fff"/>`;

  const once = (key: string, build: (id: string) => string): string => {
    const hit = memo.get(key);
    if (hit) return hit;
    const id = `c${next++}`;
    defs.push(build(id));
    memo.set(key, id);
    return id;
  };
  const colourMatrix = (name: string, values: string) =>
    once(
      `matrix:${name}`,
      (id) => `<filter id="${id}"><feColorMatrix type="matrix" values="${values}"/></filter>`,
    );
  const blur = (sigma: number) =>
    once(
      `blur:${sigma}`,
      (id) =>
        `<filter id="${id}" filterUnits="userSpaceOnUse" x="${-w}" y="${-h}" width="${3 * w}" height="${3 * h}"><feGaussianBlur stdDeviation="${sigma}"/></filter>`,
    );

  /** A Fill effect on pixels: every opaque pixel becomes the colour, its alpha kept. */
  function fillFilter(hex: string): string {
    return once(
      `fill:${hex}`,
      (id) =>
        `<filter id="${id}" x="0" y="0" width="1" height="1"><feFlood flood-color="${hex}"/><feComposite in2="SourceAlpha" operator="in"/></filter>`,
    );
  }

  /** AE's mask modes on one layer, as one luminance mask: white keeps, black cuts. */
  function maskId(name: string, masks: readonly SceneMask[]): string {
    // A stack that opens with SUBTRACT or INTERSECT starts from the whole layer, not from nothing.
    const full = ['SUBTRACT', 'INTERSECT', 'DARKEN'].includes((masks[0] as SceneMask).mode);
    let body = full ? cover : '';
    for (const mask of masks) {
      const feather =
        mask.feather > 0 ? ` filter="url(#${blur(Math.round(mask.feather * 50) / 100)})"` : '';
      const alpha = mask.opacity < 100 ? ` fill-opacity="${Math.max(0, mask.opacity) / 100}"` : '';
      const inside = `<path d="${mask.d}"`;
      const outside = `<path fill-rule="evenodd" d="${frame} ${mask.d}"`;
      if (mask.mode === 'SUBTRACT')
        body += `${mask.inverted ? outside : inside} fill="#000"${alpha}${feather}/>`;
      else if (mask.mode === 'INTERSECT' || mask.mode === 'DARKEN')
        body += `${mask.inverted ? inside : outside} fill="#000"${alpha}${feather}/>`;
      else body += `${mask.inverted ? outside : inside} fill="#fff"${alpha}${feather}/>`;
      if (!['ADD', 'SUBTRACT', 'INTERSECT'].includes(mask.mode))
        notes.add(`${name}: mask mode ${mask.mode} approximated`);
      if (mask.expansion !== 0) notes.add(`${name}: mask expansion not drawn`);
      if (mask.driven) notes.add(`${name}: a mask an expression moves is drawn as authored`);
    }
    return once(
      `mask:${JSON.stringify(masks)}`,
      (id) => `<mask id="${id}" ${region}>${body}</mask>`,
    );
  }

  function withMasks(index: number, inner: string): string {
    let out = inner;
    for (const owner of [index, ...ancestorsOf(layers, index)]) {
      const row = layers[owner] as SceneLayer;
      if (row.masks?.length) out = `<g mask="url(#${maskId(row.name, row.masks)})">${out}</g>`;
    }
    return out;
  }

  /** The row a track matte names: same precomp, by id; a legacy matte is the row just above. */
  function matteOf(index: number): number | null {
    const matte = layers[index]?.trackMatte;
    if (!matte?.type || matte.type === 'NO_TRACK_MATTE') return null;
    const parent = ancestorsOf(layers, index)[0];
    const sibling = (j: number) => ancestorsOf(layers, j)[0] === parent;
    if (matte.layerId !== null) {
      let best: number | null = null;
      layers.forEach((row, j) => {
        if (
          row.id === matte.layerId &&
          sibling(j) &&
          (best === null || Math.abs(j - index) < Math.abs(best - index))
        )
          best = j;
      });
      return best;
    }
    const depth = layers[index]?.depth;
    for (let j = index - 1; j >= 0; j--) if (layers[j]?.depth === depth && sibling(j)) return j;
    return null;
  }

  function withMatte(index: number, inner: string): string {
    const j = matteOf(index);
    const type = layers[index]?.trackMatte?.type;
    if (j === null || !type) return inner;
    // The matte is drawn whether or not its own switch shows it; what it needs is to be on screen.
    const row = layers[j] as SceneLayer;
    const up =
      row.onscreen &&
      row.corners &&
      ancestorsOf(layers, j).every((a) => {
        const holder = layers[a] as SceneLayer;
        return holder.enabled && holder.onscreen && holder.opacity !== 0;
      });
    const shape = up ? withMasks(j, args.markupOf(j)) : '';
    const inverted = type.endsWith('INVERTED');
    const luma = type.startsWith('LUMA');
    const body = !inverted
      ? shape
      : `${cover}<g filter="url(#${luma ? colourMatrix('invert', '-1 0 0 0 1 0 -1 0 0 1 0 0 -1 0 1 0 0 0 1 0') : colourMatrix('black', '0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 1 0')})">${shape}</g>`;
    const alphaType = !inverted && !luma ? ' mask-type="alpha"' : '';
    const id = once(
      `matte:${index}:${type}`,
      (mid) => `<mask id="${mid}"${alphaType} ${region}>${body}</mask>`,
    );
    return `<g mask="url(#${id})">${inner}</g>`;
  }

  function withBlend(index: number, inner: string): string {
    const layer = layers[index] as SceneLayer;
    const mode = layer.blendingMode;
    if (!mode || mode === 'NORMAL') return inner;
    const css = BLEND[mode] ?? BLEND_NEAR[mode];
    if (!css) {
      notes.add(`${layer.name}: blend mode ${mode} not drawn`);
      return inner;
    }
    if (!BLEND[mode]) notes.add(`${layer.name}: blend mode ${mode} approximated`);
    return `<g style="mix-blend-mode:${css}">${inner}</g>`;
  }

  return {
    fillFilter,
    /** The row's markup with everything AE does to it after it is drawn. */
    paint(index: number): string {
      const inner = args.markupOf(index);
      return inner ? withBlend(index, withMatte(index, withMasks(index, inner))) : '';
    },
    defs: () => (defs.length ? `<defs>${defs.join('')}</defs>` : ''),
  };
}

export function imageMarkup(dataUri: string, rect: SceneBox, opacity: number): string {
  const alpha = opacity < 1 ? ` opacity="${Math.round(opacity * 1000) / 1000}"` : '';
  const r = (v: number) => Math.round(v * 100) / 100;
  return `<image href="${escapeAttr(dataUri)}" x="${r(rect[0])}" y="${r(rect[1])}" width="${r(rect[2] - rect[0])}" height="${r(rect[3] - rect[1])}" preserveAspectRatio="none"${alpha}/>`;
}

/* -------------------------------------------------------------------------- */
/*  The whole comp                                                             */
/* -------------------------------------------------------------------------- */

/** A picture ready to draw: a data URI and its natural size, which the fit rig's clamp reads. */
export type ScenePicture = { uri: string; width: number; height: number };

type PaintVariable = Pick<ApiRenderVariable, 'key' | 'label' | 'kind'>;

const colourOf = (value: ApiRenderInputValue | undefined): string | undefined =>
  typeof value === 'string' ? value : undefined;

/**
 * The whole comp drawn from the parser's scene, with nothing under it, as one SVG document: what
 * the Render tab's Live preview shows per keystroke, and what the Backend rasterises for the Exact
 * preview with no render and for every sketch frame. Pictures arrive resolved — a slot's by its
 * variable, embedded footage by its layer — so painting never waits.
 */
export function paintScene<V extends PaintVariable>(
  scene: Scene,
  args: {
    variables: readonly V[];
    values: Readonly<Record<string, ApiRenderInputValue>>;
    layersOf: (variable: V) => ReadonlySet<number>;
    /** A slot's picture for this row, or null to leave the slot empty. */
    picture: (variable: V) => ScenePicture | null;
    /** Authored footage under a fit rig, with its natural size; null draws it as authored. */
    footage: (layer: SceneLayer) => ScenePicture | null;
    notes: Set<string>;
    /** Draw this wide instead of at the comp's size — a sketch frame. */
    outputWidth?: number;
  },
): { svg: string; overflows: string[] } {
  const { variables, notes } = args;
  const layers = scene.layers;
  const colourVariables = variables.filter((v) => v.kind === 'color');
  const readers = colourReaders(layers, colourVariables);
  const colours = Object.fromEntries(
    colourVariables.map((v) => [v.key, colourOf(args.values[v.key])]),
  );
  const slotOf = new Map<number, V>();
  for (const variable of variables) {
    if (variable.kind === 'image' || variable.kind === 'video')
      for (const id of args.layersOf(variable)) slotOf.set(id, variable);
  }
  const { width, height } = scene.comp;
  // A slot's row picture, or authored footage under a fit rig, fitted the way the rig fits it.
  const pictures = new Map<number, string>();
  for (let i = 0; i < layers.length; i++) {
    const layer = layers[i] as SceneLayer;
    const variable = slotOf.get(layer.id);
    if (!variable && !(layer.fit && layer.asset?.dataUri)) continue;
    if (!isPainted(layers, i) && !layers.some((row) => row.trackMatte?.layerId === layer.id))
      continue;
    const picture = variable ? args.picture(variable) : args.footage(layer);
    if (!picture) continue;
    const follow = layers.find((candidate) => candidate.id === layer.fit?.follow);
    pictures.set(
      i,
      imageMarkup(picture.uri, fittedRect(layer, follow, picture), opacityOf(layers, i)),
    );
  }
  const compositor = createCompositor(layers, {
    width,
    height,
    notes,
    markupOf: (i) => {
      const layer = layers[i] as SceneLayer;
      const own =
        pictures.get(i) ??
        layerMarkup(layer, fillOf(layers, i, readers, colours), opacityOf(layers, i));
      // A Fill effect repaints a picture's opaque pixels too; vector marks already took its colour.
      const fill = layer.kind === 'file' ? effectFill(layers, i) : null;
      if (fill && own) return `<g filter="url(#${compositor.fillFilter(fill)})">${own}</g>`;
      // ponytail: layered Illustrator art has no pixels here (py_aep does not say which AI layer
      // an item is), but under a Fill effect its colour is known and its footage box is the
      // artwork's own bounds — a plate. Ceiling: a filled logo draws as its box; upgrade path is
      // rasterising the AI layer by its PDF optional-content group.
      const source = String(
        (layer.asset as { resolved?: unknown } | null | undefined)?.resolved ?? '',
      );
      if (!own && fill && layer.corners && /\.(ai|eps|pdf)$/i.test(source)) {
        notes.add(`${layer.name}: vector artwork drawn as its box, in its Fill colour`);
        const alpha = opacityOf(layers, i);
        return `<g transform="${unitMatrix(layer.corners)}"${alpha < 1 ? ` opacity="${alpha}"` : ''}><rect width="1" height="1" fill="${fill}"/></g>`;
      }
      return own;
    },
  });
  const overflows: string[] = [];
  const marks: string[] = [];
  const undrawnEffects: string[] = [];
  for (let i = layers.length - 1; i >= 0; i--) {
    const layer = layers[i] as SceneLayer;
    if (!isPainted(layers, i)) continue;
    const markup = compositor.paint(i);
    if (markup) marks.push(markup);
    else if (layer.kind === 'file')
      notes.add(`${layer.name} not drawn (${layer.asset?.embedded ?? 'no pixels'})`);
    else if (layer.kind === 'text')
      notes.add(`${layer.name}: type not drawn (${layer.why ?? 'no glyphs'})`);
    if (layer.effects?.length) undrawnEffects.push(`${layer.effects.join(', ')} on ${layer.name}`);
    if (layer.text?.overflow) {
      const owner = variables.find((v) => args.layersOf(v).has(layer.id));
      if (owner) overflows.push(owner.label);
    }
  }
  // Named, never a blanket caveat: which layer carries what the preview does not draw.
  if (undrawnEffects.length) {
    const shown = undrawnEffects.slice(0, 4).join('; ');
    const more = undrawnEffects.length > 4 ? ` and ${undrawnEffects.length - 4} more layers` : '';
    notes.add(`effects not drawn: ${shown}${more}`);
  }
  for (const item of scene.unknown ?? []) notes.add(`${item.what}: ${item.why}`);
  const scale = args.outputWidth ? Math.min(1, args.outputWidth / width) : 1;
  const out = { width: Math.round(width * scale), height: Math.round(height * scale) };
  return {
    svg: svgDocument(width, height, compositor.defs() + marks.join(''), out),
    overflows: [...new Set(overflows)],
  };
}
