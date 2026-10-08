import { type ApiRenderFitVerdict, clipPx, type PixelBox } from './api-render-fit';
import type { ApiRenderInputValue } from './api-renders';
import { layoutText } from './forge-live-text';
import type { ForgeRenderLive } from './forge-render-preview';
import {
  ancestorsOf,
  fittedRect,
  isPainted,
  opacityOf,
  pathsBox,
  quadBox,
  type SceneBox,
  type SceneLayer,
} from './forge-scene';

// Does a row's value still fit the design? Asked of the Live kit — the template's own scene, glyph
// outlines and fit rigs — so the answer is arithmetic, per keystroke in the browser and again at
// preflight on the server. No model: on production (2026-09-29) every text fail the judge caught
// was a value running past its panel or into the next line, and that is geometry.
//
// Every flag is a DELTA against the designer's own layout. A bleed, an overlap or a cover the
// authored row already has is the design; only what the new value adds is reported.

/** Whole pixels — the forge's own rounding; nothing smaller is anyone's to act on. */
const MIN_PX = 1;
/** What the Paragraph Text Resize rig drives; evaluated by the parser when `rig` is set. */
const RIG_PROPS = ['ADBE Text Document', 'ADBE Anchor Point', 'ADBE Scale'];
const EDGES = ['left', 'top', 'right', 'bottom'] as const;

type Box = SceneBox | PixelBox;
type Edges = [number, number, number, number];
type Covers = ApiRenderFitVerdict['covers'];
type LiveVariable = ForgeRenderLive['variables'][number];

const area = (b: Box) => Math.max(0, b[2] - b[0]) * Math.max(0, b[3] - b[1]);
const overlap = (a: Box, b: Box) =>
  area([Math.max(a[0], b[0]), Math.max(a[1], b[1]), Math.min(a[2], b[2]), Math.min(a[3], b[3])]);
const contains = (outer: Box, inner: Box) =>
  inner[0] >= outer[0] - MIN_PX &&
  inner[1] >= outer[1] - MIN_PX &&
  inner[2] <= outer[2] + MIN_PX &&
  inner[3] <= outer[3] + MIN_PX;
const worst = (px: Edges) => Math.max(...px);
const round3 = (n: number) => Math.round(n * 1000) / 1000;

/** An expression moves this row and the parser could not evaluate it: its corners are authored. */
const unsettled = (layer: SceneLayer) => {
  const done = new Set([...(layer.evaluated ?? []), ...(layer.rig ? RIG_PROPS : [])]);
  return (layer.driven ?? []).some((prop) => !done.has(prop));
};

/** A row's drawn extent: a text's ink, anything else its box. Null when nothing is drawn. */
const extentOf = (layer: SceneLayer): SceneBox | null => {
  if (layer.kind === 'text') return pathsBox(layer.text?.paths ?? []);
  return layer.corners ? quadBox(layer.corners) : null;
};

/**
 * Zero-width characters draw nothing and no face carries them; a field blanked with one (a common
 * way to empty a slot) is an empty line, not a character the layout must refuse.
 */
const ZERO_WIDTH = /[\u200B-\u200D\u2060\uFEFF]/g;

const textOf = (value: ApiRenderInputValue | undefined): string | null =>
  typeof value === 'string'
    ? value.replace(ZERO_WIDTH, '')
    : typeof value === 'number'
      ? String(value)
      : null;

/** The kinds that write a layer's content; a `show_…` toggle bound to the same layer does not. */
const WRITES = new Set(['text', 'number', 'image', 'video']);

/** Pixels past each edge of `bound` the new extent adds over the authored one. */
function addedClip(next: Box, authored: Box | null, bound: Box): Edges {
  const now = clipPx(next as PixelBox, bound as PixelBox);
  const was = authored ? clipPx(authored as PixelBox, bound as PixelBox) : [0, 0, 0, 0];
  return now.map((px, k) => Math.max(0, px - (was[k] as number))) as Edges;
}

/** "runs off the right edge of the canvas (26 px)", naming every edge it leaves. */
function offCanvasWords(px: Edges): string {
  const edges = EDGES.flatMap((edge, k) => (px[k] >= MIN_PX ? [{ edge, px: px[k] }] : []));
  const names = edges.map((e) => e.edge).join(' and ');
  const by = edges.map((e) => `${e.px} px`).join(', ');
  return `runs off the ${names} edge${edges.length > 1 ? 's' : ''} of the canvas (${by})`;
}

type Frame = {
  authored: readonly SceneLayer[];
  row: readonly SceneLayer[];
  canvas: PixelBox;
  labelOf: (layer: SceneLayer) => string;
  keyOf: (layer: SceneLayer) => string;
};

/** What one text layer's new value adds on top of the designer's layout, in words. */
function textProblems(
  index: number,
  ownIds: ReadonlySet<number>,
  frame: Frame,
): { problems: string[]; clippedPx: Edges | null; covers: Covers; box: SceneBox | null } {
  const { authored, row, canvas, labelOf } = frame;
  const was = authored[index] as SceneLayer;
  const now = row[index] as SceneLayer;
  const ink = extentOf(now);
  const inkWas = extentOf(was);
  const problems: string[] = [];
  if (now.text?.overflow && !was.text?.overflow)
    problems.push('is too long for its text box — its last lines are dropped');
  if (!ink) return { problems, clippedPx: null, covers: [], box: null };

  const offCanvas = addedClip(ink, inkWas, canvas);
  if (worst(offCanvas) >= MIN_PX) problems.push(offCanvasWords(offCanvas));

  const ancestors = new Set(ancestorsOf(row, index));
  const covers: Covers = [];
  const panels: { layer: SceneLayer; box: SceneBox }[] = [];
  row.forEach((other, j) => {
    // The same variable's other layers (a shadow, a stroke copy) move with it by design.
    if (j === index || ownIds.has(other.id) || ancestors.has(j)) return;
    if (!isPainted(row, j) || other.isTrackMatte || unsettled(other)) return;
    const box = extentOf(other);
    if (!box) return;
    const boxWas = extentOf(authored[j] as SceneLayer);
    const added = overlap(ink, box) - (inkWas && boxWas ? overlap(inkWas, boxWas) : 0);
    const noticeable = added >= Math.max(4, 0.01 * area(ink));
    if (other.kind === 'text') {
      if (!noticeable) return;
      problems.push(`collides with ${labelOf(other)}`);
      covers.push({
        key: frame.keyOf(other),
        label: labelOf(other),
        coverage: round3(overlap(ink, box) / Math.max(1, area(box))),
      });
      return;
    }
    // A row that held the authored ink whole is the design either way — an overlay above it, or
    // the panel under it, and a panel is where a longer value runs out of room.
    if (inkWas && contains(box, inkWas)) {
      const plate = j > index && (other.kind === 'shape' || other.kind === 'solid');
      if (plate && area(box) < 0.9 * area(canvas)) panels.push({ layer: other, box });
      return;
    }
    // AE stacks the first row on top: an earlier row covers this one — when it is opaque where
    // its box says. A raster's box is not its pixels (a speaker cutout's corners run over the name
    // while the picture there is transparent), so only a shape or solid counts as a cover.
    // ponytail: a panel a PSD import made as a raster is not a cover; upgrade by sampling the
    // kit's embedded footage alpha over the overlap.
    const opaque = other.kind === 'shape' || other.kind === 'solid';
    if (j < index && opaque && noticeable && opacityOf(row, j) >= 0.5)
      problems.push(`is covered by ${labelOf(other)}`);
  });

  // The innermost panel is the one the text reads as sitting in.
  const panel = panels.sort((a, b) => area(a.box) - area(b.box))[0];
  if (panel) {
    const past = worst(addedClip(ink, inkWas, panel.box));
    if (past >= MIN_PX) problems.push(`runs ${past} px past ${labelOf(panel.layer)}`);
  }

  // A mask on the layer, or on a precomp holding it, cuts whatever leaves it.
  for (const owner of [index, ...ancestors]) {
    for (const mask of row[owner]?.masks ?? []) {
      if (mask.mode !== 'ADD' || mask.inverted || mask.driven) continue;
      const box = pathsBox([mask.d]);
      if (!box || !inkWas || !contains(box, inkWas)) continue;
      const past = worst(addedClip(ink, inkWas, box));
      if (past >= MIN_PX)
        problems.push(`is cut ${past} px by the mask on ${(row[owner] as SceneLayer).name}`);
    }
  }
  return { problems, clippedPx: offCanvas, covers, box: ink };
}

const blank = (key: string, subject: 'text' | 'media') => ({
  key,
  subject,
  shapeClass: null,
  box: null,
  clippedPx: null,
  insideFraction: null,
  scale: null,
  covers: [],
  unknownReason: null,
});

function textVerdict(
  variable: LiveVariable,
  indices: number[],
  unlaid: ReadonlyMap<number, string>,
  frame: Frame,
): ApiRenderFitVerdict {
  const ownIds = new Set(variable.layerIds);
  const problems = new Set<string>();
  const whys = new Set<string>();
  const covers: Covers = [];
  let clippedPx: Edges | null = null;
  let box: SceneBox | null = null;
  for (const index of indices) {
    const why = unlaid.get(index);
    if (why) {
      whys.add(why);
      continue;
    }
    const found = textProblems(index, ownIds, frame);
    for (const problem of found.problems) problems.add(problem);
    covers.push(...found.covers);
    clippedPx ??= found.clippedPx;
    box ??= found.box;
  }
  const at = blank(variable.key, 'text');
  if (problems.size)
    return { ...at, state: 'clipped', box, clippedPx, covers, why: [...problems].join('; ') };
  if (whys.size)
    return { ...at, state: 'unknown', unknownReason: 'unlaid', why: [...whys].join('; ') };
  return {
    ...at,
    state: 'ok',
    box,
    clippedPx,
    why: indices.length ? 'fits where the design puts it' : 'not drawn at the instant checked',
  };
}

function mediaVerdict(
  variable: LiveVariable,
  indices: number[],
  size: { w: number; h: number },
  frame: Frame,
): ApiRenderFitVerdict {
  const at = blank(variable.key, 'media');
  for (const index of indices) {
    const layer = frame.authored[index] as SceneLayer;
    const follow = frame.authored.find((candidate) => candidate.id === layer.fit?.follow);
    const box = fittedRect(layer, follow, { width: size.w, height: size.h });
    const { width, height } = layer.asset ?? {};
    const own = width && height ? fittedRect(layer, follow, { width, height }) : null;
    const past = addedClip(box, own, frame.canvas);
    if (worst(past) >= MIN_PX) {
      return {
        ...at,
        state: 'clipped',
        box: box.map((n) => Math.round(n * 100) / 100) as PixelBox,
        clippedPx: past,
        why: `the rig fits this ${size.w}x${size.h} picture so it ${offCanvasWords(past)}`,
      };
    }
  }
  return { ...at, state: 'ok', why: 'the rig fits this picture inside the canvas' };
}

/**
 * Every value in a row checked against one format's Live kit: each text variable the row sets,
 * and each rig-placed picture whose size `assetSize` knows (a slot with no rig is
 * `checkAssetSwap`'s). A variable the row leaves authored is not checked — the template already
 * renders it.
 */
export function checkLiveFit(args: {
  kit: ForgeRenderLive;
  values: Readonly<Record<string, ApiRenderInputValue>>;
  /** A picked picture's natural size; null when none is picked or it was never measured. */
  assetSize?: (variableKey: string) => { w: number; h: number } | null;
}): ApiRenderFitVerdict[] {
  const { scene } = args.kit;
  const authored = scene.layers;
  const variableOf = new Map<number, LiveVariable>();
  for (const variable of args.kit.variables) {
    if (!WRITES.has(variable.kind)) continue;
    for (const id of variable.layerIds) variableOf.set(id, variable);
  }

  // The row's scene: every text it sets laid out anew, so a neighbour sits where THIS row puts it.
  const unlaid = new Map<number, string>();
  const row = authored.map((layer, i) => {
    const variable = variableOf.get(layer.id);
    if (layer.kind !== 'text' || !variable || variable.reserved) return layer;
    const value = textOf(args.values[variable.key]);
    if (value === null) return layer;
    if (unsettled(layer)) {
      unlaid.set(i, 'an expression moves this text, so where it lands is the render’s to say');
      return layer;
    }
    const laid = layoutText(layer, value, layer.kit ? scene.glyphs?.[layer.kit.font] : undefined);
    if ('why' in laid) {
      unlaid.set(i, laid.why);
      return layer;
    }
    return laid.layer;
  });

  const frame: Frame = {
    authored,
    row,
    canvas: [0, 0, scene.comp.width, scene.comp.height],
    labelOf: (layer) => variableOf.get(layer.id)?.label ?? layer.name,
    keyOf: (layer) => variableOf.get(layer.id)?.key ?? `layer:${layer.id}`,
  };
  const verdicts: ApiRenderFitVerdict[] = [];
  for (const variable of args.kit.variables) {
    if (variable.reserved) continue;
    const indices = authored.flatMap((layer, i) =>
      variable.layerIds.includes(layer.id) && (isPainted(authored, i) || isPainted(row, i))
        ? [i]
        : [],
    );
    if (variable.kind === 'text' || variable.kind === 'number') {
      if (textOf(args.values[variable.key]) === null) continue;
      verdicts.push(textVerdict(variable, indices, unlaid, frame));
    } else if (variable.kind === 'image' || variable.kind === 'video') {
      const size = args.assetSize?.(variable.key) ?? null;
      const rigged = indices.filter((i) => authored[i]?.fit);
      if (size && rigged.length) verdicts.push(mediaVerdict(variable, rigged, size, frame));
    }
  }
  return verdicts;
}

const RANK = { clipped: 2, unknown: 1, ok: 0 } as const;

/**
 * One verdict per variable across every format a template renders: the worst state wins, and its
 * sentence names the formats that decided it — a badge that only clips in 16:9 says 16:9.
 */
export function worstFitByKey(
  formats: ReadonlyArray<{ format: string; verdicts: readonly ApiRenderFitVerdict[] }>,
): ApiRenderFitVerdict[] {
  const byKey = new Map<string, { verdict: ApiRenderFitVerdict; whys: string[] }>();
  for (const { format, verdicts } of formats) {
    for (const verdict of verdicts) {
      const held = byKey.get(verdict.key);
      const why = `${format}: ${verdict.why}`;
      if (!held || RANK[verdict.state] > RANK[held.verdict.state])
        byKey.set(verdict.key, { verdict, whys: [why] });
      else if (RANK[verdict.state] === RANK[held.verdict.state] && verdict.state !== 'ok')
        held.whys.push(why);
    }
  }
  return [...byKey.values()].map(({ verdict, whys }) => ({ ...verdict, why: whys.join('; ') }));
}
