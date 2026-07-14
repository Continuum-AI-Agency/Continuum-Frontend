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

/** Sizing envelope for the generator nodes (nanoGen). 16:9 lands on the classic 400x225. */
export const GENERATOR_NODE_BOUNDS = {
  minWidth: 200,
  minHeight: 200,
  fallbackWidth: 400,
} as const;

// Every freshly created generator node covers the same canvas AREA, whatever its
// shape — so a portrait node reads as a portrait of the same weight rather than a
// tower. 400x225 is the 16:9 node the canvas has always drawn.
const GENERATOR_NODE_AREA = { width: 400, height: 225 } as const;

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

export function snapNodeDimensionsToAspectRatio({
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
 * The style a generator node is BORN with: its aspect ratio, at the canvas's default
 * scale. The three copies of `{ width: 400, height: 225 }` that used to be stamped at
 * node creation are all this function now.
 */
export function generatorNodeStyle(aspectRatio?: string): NodeDimensions {
  return snapNodeDimensionsToAspectRatio({
    aspectRatio,
    currentWidth: GENERATOR_NODE_AREA.width,
    currentHeight: GENERATOR_NODE_AREA.height,
    ...GENERATOR_NODE_BOUNDS,
  });
}
