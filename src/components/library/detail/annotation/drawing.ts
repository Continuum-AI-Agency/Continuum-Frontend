// Pure geometry and history for the review draw tools (arrow, line, box,
// freehand). Shapes are normalized 0..1 against the media's intrinsic frame —
// the same space the stage's content rect maps — so a mark re-renders exactly
// where it was drawn at any stage size, on an image or a paused video frame.

import { type DrawingShape, type DrawingTool, MAX_DRAWING_SHAPES } from '@continuum/contracts';
import {
  isMeaningfulBox,
  type NormalizedBox,
  type NormalizedPoint,
  normalizedBoxFromPoints,
} from '../annotationGeometry';

export const DRAWING_COLORS = [
  '#EF4444',
  '#F59E0B',
  '#22C55E',
  '#3B82F6',
  '#A855F7',
  '#FFFFFF',
] as const;
export const DEFAULT_DRAWING_COLOR = DRAWING_COLORS[0];

// A drag shorter than this (in normalized units) is a click, not a stroke.
const MIN_STROKE = 0.01;

export function shapeFromDrag(
  tool: Exclude<DrawingTool, 'freehand'>,
  from: NormalizedPoint,
  to: NormalizedPoint,
  color: string,
): DrawingShape | null {
  if (tool === 'box') {
    const box = normalizedBoxFromPoints(from, to);
    return isMeaningfulBox(box) ? { tool, color, ...box } : null;
  }
  if (Math.hypot(to.x - from.x, to.y - from.y) < MIN_STROKE) return null;
  return { tool, color, from, to };
}

export function freehandShape(points: NormalizedPoint[], color: string): DrawingShape | null {
  const deduped = points.filter(
    (point, index) =>
      index === 0 || point.x !== points[index - 1]?.x || point.y !== points[index - 1]?.y,
  );
  return deduped.length >= 2 ? { tool: 'freehand', color, points: deduped.slice(0, 1024) } : null;
}

function shapePoints(shape: DrawingShape): NormalizedPoint[] {
  if (shape.tool === 'box') {
    return [
      { x: shape.x, y: shape.y },
      { x: shape.x + shape.width, y: shape.y + shape.height },
    ];
  }
  if (shape.tool === 'freehand') return shape.points;
  return [shape.from, shape.to];
}

export function shapesBounds(shapes: readonly DrawingShape[]): NormalizedBox {
  const points = shapes.flatMap(shapePoints);
  if (points.length === 0) return { x: 0, y: 0, width: 0, height: 0 };
  const xs = points.map((point) => point.x);
  const ys = points.map((point) => point.y);
  const x = Math.min(...xs);
  const y = Math.min(...ys);
  return { x, y, width: Math.max(...xs) - x, height: Math.max(...ys) - y };
}

// Where a drawing's thread number sits: the start of its first mark, which is
// where the reviewer's hand went down.
export function shapesAnchor(shapes: readonly DrawingShape[]): NormalizedPoint {
  const first = shapes[0];
  if (!first) return { x: 0, y: 0 };
  return shapePoints(first)[0] ?? { x: 0, y: 0 };
}

// The two barbs of an arrowhead at `to`, in pixel space so the head keeps its
// shape on a non-square frame.
export function arrowHead(
  from: { x: number; y: number },
  to: { x: number; y: number },
  size: number,
): [{ x: number; y: number }, { x: number; y: number }] {
  const angle = Math.atan2(to.y - from.y, to.x - from.x);
  const spread = Math.PI / 7;
  return [
    { x: to.x - size * Math.cos(angle - spread), y: to.y - size * Math.sin(angle - spread) },
    { x: to.x - size * Math.cos(angle + spread), y: to.y - size * Math.sin(angle + spread) },
  ];
}

// Undo/redo over the marks of one draft: drawing clears the redo stack, as in
// every editor people already know.
export type DrawingHistory = { shapes: DrawingShape[]; redo: DrawingShape[] };
export type DrawingHistoryAction =
  | { type: 'add'; shape: DrawingShape }
  | { type: 'undo' }
  | { type: 'redo' }
  | { type: 'clear' };

export const EMPTY_DRAWING: DrawingHistory = { shapes: [], redo: [] };

export function drawingHistoryReducer(
  state: DrawingHistory,
  action: DrawingHistoryAction,
): DrawingHistory {
  switch (action.type) {
    case 'add':
      return state.shapes.length >= MAX_DRAWING_SHAPES
        ? state
        : { shapes: [...state.shapes, action.shape], redo: [] };
    case 'undo': {
      const last = state.shapes.at(-1);
      return last ? { shapes: state.shapes.slice(0, -1), redo: [last, ...state.redo] } : state;
    }
    case 'redo': {
      const [next, ...rest] = state.redo;
      return next ? { shapes: [...state.shapes, next], redo: rest } : state;
    }
    case 'clear':
      return EMPTY_DRAWING;
  }
}
