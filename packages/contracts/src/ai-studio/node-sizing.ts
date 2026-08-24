// Node geometry for the AI Studio canvas.
//
// A generator node renders its output inside a fixed-ratio box. When the node's own
// box does not carry that ratio the image is CLIPPED — a 1:1 render in the 400x225
// default box lost its top and bottom, which read to users as an over-eager crop.
// The node is sized to its aspect ratio here, at creation and on every ratio change,
// so what the canvas shows is what the model returned.
//
// Lives in contracts because the agent write path (createNodeData / applyOps) must
// size a node exactly the way the browser does.

export interface SnapNodeDimensionsOptions {
  aspectRatio?: string;
  currentWidth?: unknown;
  currentHeight?: unknown;
  minWidth: number;
  minHeight: number;
  fallbackWidth: number;
}

export interface NodeDimensions {
  width: number;
  height: number;
}

/**
 * The sizing envelope of one generator family. `area` is the 16:9 box that family
 * has always drawn: every other ratio keeps that AREA, so a portrait node reads as a
 * portrait of the same weight rather than a tower. The minimums match the family's
 * own CSS `min-w`/`min-h` — a style below them would render at a size that no longer
 * carries the ratio, which is the bug this whole module exists to prevent.
 */
export interface GeneratorNodeBounds {
  minWidth: number;
  minHeight: number;
  fallbackWidth: number;
  area: NodeDimensions;
}

/** nanoGen. 16:9 lands on the classic 400x225. */
export const IMAGE_GENERATOR_NODE_BOUNDS: GeneratorNodeBounds = {
  minWidth: 200,
  minHeight: 200,
  fallbackWidth: 400,
  area: { width: 400, height: 225 },
};

/** videoGen / veoDirector / veoFast. 16:9 lands on the classic 512x288. */
export const VIDEO_GENERATOR_NODE_BOUNDS: GeneratorNodeBounds = {
  minWidth: 300,
  minHeight: 170,
  fallbackWidth: 512,
  area: { width: 512, height: 288 },
};

/** omniGen. Taller than the video family because the node carries a chat strip. */
export const OMNI_GENERATOR_NODE_BOUNDS: GeneratorNodeBounds = {
  minWidth: 320,
  minHeight: 260,
  fallbackWidth: 512,
  area: { width: 512, height: 360 },
};

/**
 * layerEditor. A layer document has a real frame ratio (2048x2048 by default), so the
 * node box carries it exactly the way a generator's does — a 9:16 document is born
 * portrait rather than in a square that crops the preview.
 */
export const LAYER_EDITOR_NODE_BOUNDS: GeneratorNodeBounds = {
  minWidth: 280,
  minHeight: 280,
  fallbackWidth: 380,
  area: { width: 380, height: 380 },
};

function toNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === 'string') {
    const trimmed = value.trim().toLowerCase();
    if (!trimmed) return null;
    const normalized = trimmed.endsWith('px') ? trimmed.slice(0, -2) : trimmed;
    const parsed = Number.parseFloat(normalized);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }

  return null;
}

function greatestCommonDivisor(a: number, b: number): number {
  let x = Math.abs(a);
  let y = Math.abs(b);
  while (y !== 0) {
    const temp = y;
    y = x % y;
    x = temp;
  }
  return x || 1;
}

export function simplifyAspectRatio(width: number, height: number): string {
  const safeWidth = Math.max(1, Math.round(width));
  const safeHeight = Math.max(1, Math.round(height));
  const divisor = greatestCommonDivisor(safeWidth, safeHeight);
  return `${safeWidth / divisor}:${safeHeight / divisor}`;
}

export function getAspectRatioValue(aspectRatio?: string): number {
  if (!aspectRatio) return 1;
  const match = aspectRatio.match(/^(\d+(?:\.\d+)?)\s*:\s*(\d+(?:\.\d+)?)$/);
  if (!match) return 1;

  const width = Number.parseFloat(match[1]);
  const height = Number.parseFloat(match[2]);
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
    return 1;
  }

  return width / height;
}

function snapOnce({
  aspectRatio,
  currentWidth,
  currentHeight,
  minWidth,
  minHeight,
  fallbackWidth,
}: SnapNodeDimensionsOptions): NodeDimensions {
  const ratio = getAspectRatioValue(aspectRatio);
  const safeRatio = ratio > 0 ? ratio : 1;

  const width = toNumber(currentWidth);
  const height = toNumber(currentHeight);

  const baselineWidth = width ?? fallbackWidth;
  const baselineHeight = height ?? Math.max(minHeight, baselineWidth / safeRatio);
  const area = Math.max(minWidth * minHeight, baselineWidth * baselineHeight);

  let snappedWidth = Math.sqrt(area * safeRatio);
  let snappedHeight = snappedWidth / safeRatio;

  if (snappedWidth < minWidth) {
    snappedWidth = minWidth;
    snappedHeight = snappedWidth / safeRatio;
  }

  if (snappedHeight < minHeight) {
    snappedHeight = minHeight;
    snappedWidth = snappedHeight * safeRatio;
  }

  return {
    width: Math.round(snappedWidth),
    height: Math.round(snappedHeight),
  };
}

/**
 * The node box for `aspectRatio` that preserves the area of the box it came from.
 *
 * Rounding to whole pixels moves the area slightly, so snapping the RESULT could land
 * a pixel away from the input. An aspect-locked NodeResizer re-snaps on every drag and
 * on every ratio change, so a one-pixel drift compounds — the function must be a fixed
 * point. It iterates until it repeats itself, which it does within two passes for every
 * ratio and envelope the canvas ships (asserted in node-sizing.test.ts).
 */
export function snapNodeDimensionsToAspectRatio(
  options: SnapNodeDimensionsOptions,
): NodeDimensions {
  let dimensions = snapOnce(options);

  for (let pass = 0; pass < 3; pass += 1) {
    const next = snapOnce({
      ...options,
      currentWidth: dimensions.width,
      currentHeight: dimensions.height,
    });
    if (next.width === dimensions.width && next.height === dimensions.height) break;
    dimensions = next;
  }

  return dimensions;
}

/**
 * The style a generator node is BORN with: its aspect ratio, at the canvas's default
 * scale. Every hardcoded `{ width: 400, height: 225 }` / `{ width: 512, height: 288 }`
 * / `{ width: 512, height: 360 }` that used to be stamped at node creation is this
 * function now — the canvas menu, the edge-drop menu, the planner starter flow and the
 * agent write path all size a node here.
 */
export function generatorNodeStyle(
  aspectRatio?: string,
  bounds: GeneratorNodeBounds = IMAGE_GENERATOR_NODE_BOUNDS,
): NodeDimensions {
  return snapNodeDimensionsToAspectRatio({
    aspectRatio,
    currentWidth: bounds.area.width,
    currentHeight: bounds.area.height,
    minWidth: bounds.minWidth,
    minHeight: bounds.minHeight,
    fallbackWidth: bounds.fallbackWidth,
  });
}
