import { getAspectRatioValue, simplifyAspectRatio } from '@continuum/contracts';

/**
 * The composition frame, and the one accessor pair that reads and writes it.
 *
 * `LayerEditorNodeData.frame` (`types/index.ts`) is the authoritative shape per
 * aep-interop §4.3. Contracts' `baseNodeData` currently seeds the older flat
 * `frameWidth`/`frameHeight` alongside an `aspectRatio` (`workflow-graph.ts`), and
 * contracts is frozen for this wave — so `readFrame` resolves both and `writeFrame` is
 * the only writer, which keeps `aspectRatio` in step so the node's box on the canvas
 * follows the document it holds.
 */

export interface Frame {
  width: number;
  height: number;
}

/** aep-interop §4.3: 2048x2048 by default. */
export const FRAME_DEFAULT_SIZE = 2048;
export const FRAME_MIN_SIZE = 100;
export const FRAME_MAX_SIZE = 4096;

export const DEFAULT_FRAME: Frame = { width: FRAME_DEFAULT_SIZE, height: FRAME_DEFAULT_SIZE };

/** Named frames for the size control. Long edge 2048 so nothing is born clipped. */
export const FRAME_PRESETS: readonly { label: string; frame: Frame }[] = [
  { label: 'Square 1:1', frame: { width: 2048, height: 2048 } },
  { label: 'Portrait 4:5', frame: { width: 1638, height: 2048 } },
  { label: 'Story 9:16', frame: { width: 1152, height: 2048 } },
  { label: 'Landscape 16:9', frame: { width: 2048, height: 1152 } },
  { label: 'Wide 1.91:1', frame: { width: 2048, height: 1072 } },
];

const clampSize = (value: number): number =>
  Math.min(FRAME_MAX_SIZE, Math.max(FRAME_MIN_SIZE, Math.round(value)));

export function clampFrame(frame: { width: number; height: number }): Frame {
  const width = Number.isFinite(frame.width) ? clampSize(frame.width) : FRAME_DEFAULT_SIZE;
  const height = Number.isFinite(frame.height) ? clampSize(frame.height) : FRAME_DEFAULT_SIZE;
  return { width, height };
}

const isFrameLike = (value: unknown): value is { width: number; height: number } =>
  typeof value === 'object' &&
  value !== null &&
  typeof (value as { width?: unknown }).width === 'number' &&
  typeof (value as { height?: unknown }).height === 'number';

/**
 * The document's frame.
 *
 * `frame` wins. Falling back to `aspectRatio` rather than straight to 2048x2048 matters
 * because `createNodeData('layerEditor', { aspectRatio: '9:16' })` is a supported
 * contracts path: a node asked for portrait must not open square.
 */
export function readFrame(data: Record<string, unknown> | undefined | null): Frame {
  const stored = (data as { frame?: unknown } | undefined | null)?.frame;
  if (isFrameLike(stored)) return clampFrame(stored);

  const declared = (data as { aspectRatio?: unknown } | undefined | null)?.aspectRatio;
  const ratio = getAspectRatioValue(typeof declared === 'string' ? declared : undefined);
  return ratio >= 1
    ? clampFrame({ width: FRAME_DEFAULT_SIZE, height: FRAME_DEFAULT_SIZE / ratio })
    : clampFrame({ width: FRAME_DEFAULT_SIZE * ratio, height: FRAME_DEFAULT_SIZE });
}

/**
 * The node-data patch for a frame change. The ONLY writer of `frame`.
 *
 * `aspectRatio` rides along because `nodeStyleFor` sizes the node box from it — without
 * it a 16:9 document would sit in a square node that crops its own preview.
 */
export function writeFrame(width: number, height: number): { frame: Frame; aspectRatio: string } {
  const frame = clampFrame({ width, height });
  return { frame, aspectRatio: simplifyAspectRatio(frame.width, frame.height) };
}

/** Snap-to-grid. `grid <= 0` disables it rather than dividing by zero. */
export function snapToGrid(value: number, grid: number): number {
  if (!Number.isFinite(grid) || grid <= 0) return value;
  return Math.round(value / grid) * grid;
}

export const DEFAULT_SNAP_GRID = 16;

/** The scale that fits `frame` inside `viewport`, never enlarging past 1:1. */
export function fitScale(frame: Frame, viewport: { width: number; height: number }): number {
  if (viewport.width <= 0 || viewport.height <= 0) return 1;
  return Math.min(1, viewport.width / frame.width, viewport.height / frame.height);
}
