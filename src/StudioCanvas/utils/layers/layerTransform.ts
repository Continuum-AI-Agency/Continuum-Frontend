import type { LayerEditorLayer } from '../../types';

/**
 * The one place the Layer Editor's coordinate model lives.
 *
 * `docs/research/aep-interop.md` §4.3 is BINDING here and this file is where it is
 * honoured: a layer's `position` is where its `anchor` lands in COMPOSITION pixels
 * (origin top-left, +y down), the `anchor` is in the layer's OWN source pixels, and
 * rotation and per-axis scale pivot on the anchor — never on the frame centre.
 *
 * `applyCanvasTransform` in `utils/render/effectSpec.ts` deliberately does the opposite
 * (frame centre, fraction-of-frame offsets, one scalar scale). That is right for a
 * single clip filling a frame and wrong for N independently placed layers: a
 * frame-centre pivot swings a corner logo across the canvas when you rotate it. §4.6
 * names reusing it as the one line Design B had to revise.
 *
 * `applyLayerTransform` (canvas) and `layerTransformCss` (DOM) are the SAME four ops in
 * the same order, so the stage preview is the export. That pairing is the existing
 * `applyCanvasTransform` / `clipEffectsToCss` pattern — keeping them adjacent is what
 * stops preview and export from drifting.
 */

export interface Point {
  x: number;
  y: number;
}

export interface Rect {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

const DEG_TO_RAD = Math.PI / 180;

/** A scale of exactly 0 has no inverse; hit-testing would divide by it. */
const NON_ZERO = 1e-6;

/**
 * Put the ctx origin ON the layer's anchor point, oriented and scaled.
 *
 * Call inside a `save()`/`restore()` pair and then draw the source at
 * `(-anchor.x, -anchor.y)`: after this the origin IS the anchor, which is the whole
 * mechanism by which rotation and scale pivot on it.
 */
export function applyLayerTransform(
  ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
  layer: LayerEditorLayer,
): void {
  ctx.translate(layer.position.x, layer.position.y);
  // +y down makes a positive canvas rotation CLOCKWISE, which is what §4.3 stores.
  if (layer.rotation) ctx.rotate(layer.rotation * DEG_TO_RAD);
  ctx.scale(layer.scale.x, layer.scale.y);
}

/**
 * The identical transform as CSS, for the stage preview.
 *
 * The element must be `position:absolute; left:0; top:0;` sized to the SOURCE pixels
 * with `transform-origin: 0 0` — then this string composes to exactly the matrix
 * `applyLayerTransform` builds. The trailing `translate(-anchor)` is the CSS spelling
 * of drawing at `(-anchor.x, -anchor.y)`.
 */
export function layerTransformCss(layer: LayerEditorLayer): string {
  return [
    `translate(${layer.position.x}px, ${layer.position.y}px)`,
    `rotate(${layer.rotation}deg)`,
    `scale(${layer.scale.x}, ${layer.scale.y})`,
    `translate(${-layer.anchor.x}px, ${-layer.anchor.y}px)`,
  ].join(' ');
}

/** A point in the layer's own source pixels, in composition pixels. */
export function sourceToComposition(layer: LayerEditorLayer, point: Point): Point {
  const dx = (point.x - layer.anchor.x) * layer.scale.x;
  const dy = (point.y - layer.anchor.y) * layer.scale.y;
  const radians = layer.rotation * DEG_TO_RAD;
  const cos = Math.cos(radians);
  const sin = Math.sin(radians);
  return {
    x: layer.position.x + dx * cos - dy * sin,
    y: layer.position.y + dx * sin + dy * cos,
  };
}

/**
 * Rotate a VECTOR by `-degrees`. Undoes only the rotation — not the scale, not the
 * translation — which is what the resize gizmo needs to read a pointer delta in the
 * layer's own axes.
 */
export function unrotate(vector: Point, degrees: number): Point {
  const radians = -degrees * DEG_TO_RAD;
  const cos = Math.cos(radians);
  const sin = Math.sin(radians);
  return { x: vector.x * cos - vector.y * sin, y: vector.x * sin + vector.y * cos };
}

/** The inverse. Hit-testing asks "which source pixel is under this cursor?". */
export function compositionToSource(layer: LayerEditorLayer, point: Point): Point {
  const px = point.x - layer.position.x;
  const py = point.y - layer.position.y;
  const radians = -layer.rotation * DEG_TO_RAD;
  const cos = Math.cos(radians);
  const sin = Math.sin(radians);
  const rx = px * cos - py * sin;
  const ry = px * sin + py * cos;
  const sx = Math.abs(layer.scale.x) < NON_ZERO ? NON_ZERO : layer.scale.x;
  const sy = Math.abs(layer.scale.y) < NON_ZERO ? NON_ZERO : layer.scale.y;
  return { x: layer.anchor.x + rx / sx, y: layer.anchor.y + ry / sy };
}

/** The source rect's four corners in composition pixels, clockwise from top-left. */
export function layerCorners(layer: LayerEditorLayer): [Point, Point, Point, Point] {
  const w = layer.sourceWidth;
  const h = layer.sourceHeight;
  return [
    sourceToComposition(layer, { x: 0, y: 0 }),
    sourceToComposition(layer, { x: w, y: 0 }),
    sourceToComposition(layer, { x: w, y: h }),
    sourceToComposition(layer, { x: 0, y: h }),
  ];
}

/**
 * The axis-aligned bounding box of the PLACED layer, in composition pixels.
 *
 * Alignment, snapping and the selection outline all measure this rather than
 * `position`: `position` is where the anchor sits, and aligning anchors instead of
 * edges would put a rotated layer's visible edge anywhere but the one you asked for.
 */
export function layerBounds(layer: LayerEditorLayer): Rect {
  const corners = layerCorners(layer);
  const xs = corners.map((corner) => corner.x);
  const ys = corners.map((corner) => corner.y);
  return {
    left: Math.min(...xs),
    top: Math.min(...ys),
    right: Math.max(...xs),
    bottom: Math.max(...ys),
  };
}

/** The union of several bounds. Empty input yields a zero rect at the origin. */
export function unionBounds(rects: readonly Rect[]): Rect {
  if (rects.length === 0) return { left: 0, top: 0, right: 0, bottom: 0 };
  return {
    left: Math.min(...rects.map((rect) => rect.left)),
    top: Math.min(...rects.map((rect) => rect.top)),
    right: Math.max(...rects.map((rect) => rect.right)),
    bottom: Math.max(...rects.map((rect) => rect.bottom)),
  };
}

/** Is this composition point inside the layer's placed quad? */
export function hitTestLayer(layer: LayerEditorLayer, point: Point): boolean {
  const local = compositionToSource(layer, point);
  return (
    local.x >= 0 && local.x <= layer.sourceWidth && local.y >= 0 && local.y <= layer.sourceHeight
  );
}

/**
 * The topmost layer under a composition point, or null.
 *
 * Iterates the array BACKWARDS because array order is paint order bottom-first: the
 * last painted layer is the one the cursor is on. Invisible and locked layers are not
 * selectable — a locked layer you can still grab is not locked.
 */
export function layerAtPoint(
  layers: readonly LayerEditorLayer[],
  point: Point,
): LayerEditorLayer | null {
  for (let index = layers.length - 1; index >= 0; index -= 1) {
    const layer = layers[index];
    if (!layer.visible || layer.locked) continue;
    if (hitTestLayer(layer, point)) return layer;
  }
  return null;
}
