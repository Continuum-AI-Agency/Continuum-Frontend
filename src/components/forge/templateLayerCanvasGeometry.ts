import type { AuthoringEditableLayer, AuthoringLayerEdit } from './authoringTemplateLayerTypes';

export type CanvasPoint = { x: number; y: number };
export type CanvasRect = { left: number; top: number; right: number; bottom: number };
export type CanvasLayerFrame = {
  layer: AuthoringEditableLayer;
  position: [number, number];
  rotation: number;
  scale: [number, number];
  bounds: CanvasRect;
};
export type ResizeHandle = 'n' | 'ne' | 'e' | 'se' | 's' | 'sw' | 'w' | 'nw';
export type CanvasAlignment = 'left' | 'center-x' | 'right' | 'top' | 'center-y' | 'bottom';
export type CanvasGuides = { x?: number; y?: number };

const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));
const center = (rect: CanvasRect): CanvasPoint => ({
  x: (rect.left + rect.right) / 2,
  y: (rect.top + rect.bottom) / 2,
});

export function normalizeSelection(
  ids: readonly number[],
  layers: readonly AuthoringEditableLayer[],
  compId: number | null,
) {
  if (compId === null) return [];
  const valid = new Set(
    layers.filter((layer) => layer.compId === compId).map((layer) => layer.layerId),
  );
  return [...new Set(ids)].filter((id) => valid.has(id));
}

export function toggleSelection(ids: readonly number[], id: number, additive: boolean) {
  if (!additive) return [id];
  return ids.includes(id) ? ids.filter((entry) => entry !== id) : [...ids, id];
}

export function unionBounds(rects: readonly CanvasRect[]): CanvasRect | null {
  const usable = usableSnapRects(rects);
  if (!usable.length) return null;
  return {
    left: Math.min(...usable.map((rect) => rect.left)),
    top: Math.min(...usable.map((rect) => rect.top)),
    right: Math.max(...usable.map((rect) => rect.right)),
    bottom: Math.max(...usable.map((rect) => rect.bottom)),
  };
}

export function usableSnapRects(rects: readonly (CanvasRect | null | undefined)[]): CanvasRect[] {
  return rects.filter((rect): rect is CanvasRect => !!rect &&
    [rect.left, rect.top, rect.right, rect.bottom].every(Number.isFinite) &&
    rect.right > rect.left && rect.bottom > rect.top);
}

export function canvasGestureAllowed(
  frames: readonly CanvasLayerFrame[],
  kind: 'move' | 'resize' | 'rotate' | 'align',
) {
  if (!frames.length) return false;
  return frames.every(({ layer }) => {
    if (layer.parentId || !layer.position || layer.transformLocks.position) return false;
    if (kind === 'resize') return !!layer.scale && !layer.transformLocks.scale;
    if (kind === 'rotate') return layer.rotation !== null && !layer.transformLocks.rotation;
    return true;
  });
}

export function moveFrames(
  frames: readonly CanvasLayerFrame[],
  dx: number,
  dy: number,
): AuthoringLayerEdit[] {
  if (!canvasGestureAllowed(frames, 'move')) return [];
  return frames.map(({ layer, position }) => ({
    compId: layer.compId,
    layerId: layer.layerId,
    x: clamp(position[0] + dx, -100_000, 100_000),
    y: clamp(position[1] + dy, -100_000, 100_000),
  }));
}

function anchors(rect: CanvasRect, axis: 'x' | 'y') {
  return axis === 'x'
    ? [rect.left, (rect.left + rect.right) / 2, rect.right]
    : [rect.top, (rect.top + rect.bottom) / 2, rect.bottom];
}

export function snapTranslation(
  moving: CanvasRect,
  dx: number,
  dy: number,
  targets: readonly CanvasRect[],
  tolerance: number,
): { dx: number; dy: number; guides: CanvasGuides } {
  const guides: CanvasGuides = {};
  const usableTargets = usableSnapRects(targets);
  const snapAxis = (axis: 'x' | 'y', delta: number) => {
    let nearest: { correction: number; guide: number } | null = null;
    const movingAnchors = anchors(moving, axis).map((value) => value + delta);
    for (const target of usableTargets) {
      for (const targetAnchor of anchors(target, axis)) {
        for (const movingAnchor of movingAnchors) {
          const correction = targetAnchor - movingAnchor;
          if (
            Math.abs(correction) <= tolerance &&
            (!nearest || Math.abs(correction) < Math.abs(nearest.correction))
          )
            nearest = { correction, guide: targetAnchor };
        }
      }
    }
    if (nearest) guides[axis] = nearest.guide;
    return delta + (nearest?.correction ?? 0);
  };
  return { dx: snapAxis('x', dx), dy: snapAxis('y', dy), guides };
}

export function snapPoint(point: CanvasPoint, targets: readonly CanvasRect[], tolerance: number) {
  const result = { ...point };
  const guides: CanvasGuides = {};
  for (const axis of ['x', 'y'] as const) {
    let nearest: { distance: number; value: number } | null = null;
    for (const target of targets) {
      for (const value of anchors(target, axis)) {
        const distance = Math.abs(point[axis] - value);
        if (distance <= tolerance && (!nearest || distance < nearest.distance))
          nearest = { distance, value };
      }
    }
    if (nearest) {
      result[axis] = nearest.value;
      guides[axis] = nearest.value;
    }
  }
  return { point: result, guides };
}

export function resizeFrames(
  frames: readonly CanvasLayerFrame[],
  bounds: CanvasRect,
  handle: ResizeHandle,
  point: CanvasPoint,
  keepAspect = false,
): AuthoringLayerEdit[] {
  if (!canvasGestureAllowed(frames, 'resize')) return [];
  const west = handle.includes('w');
  const east = handle.includes('e');
  const north = handle.includes('n');
  const south = handle.includes('s');
  const originX = west ? bounds.right : east ? bounds.left : center(bounds).x;
  const originY = north ? bounds.bottom : south ? bounds.top : center(bounds).y;
  let sx =
    west || east
      ? (point.x - originX) / (west ? bounds.left - originX : bounds.right - originX)
      : 1;
  let sy =
    north || south
      ? (point.y - originY) / (north ? bounds.top - originY : bounds.bottom - originY)
      : 1;
  sx = Math.max(0.01, sx);
  sy = Math.max(0.01, sy);
  if (keepAspect && (west || east) && (north || south)) sx = sy = Math.max(sx, sy);
  return frames.map(({ layer, position, scale }) => ({
    compId: layer.compId,
    layerId: layer.layerId,
    x: clamp(originX + (position[0] - originX) * sx, -100_000, 100_000),
    y: clamp(originY + (position[1] - originY) * sy, -100_000, 100_000),
    scale: [clamp(scale[0] * sx, -10_000, 10_000), clamp(scale[1] * sy, -10_000, 10_000)],
  }));
}

export function normalizeAngle(degrees: number) {
  return ((((degrees + 180) % 360) + 360) % 360) - 180;
}

export function rotateFrames(
  frames: readonly CanvasLayerFrame[],
  pivot: CanvasPoint,
  angleDelta: number,
  snapDegrees = 0,
): AuthoringLayerEdit[] {
  if (!canvasGestureAllowed(frames, 'rotate')) return [];
  const delta = snapDegrees > 0 ? Math.round(angleDelta / snapDegrees) * snapDegrees : angleDelta;
  const radians = (delta * Math.PI) / 180;
  const cos = Math.cos(radians);
  const sin = Math.sin(radians);
  return frames.map(({ layer, position, rotation }) => {
    const x = position[0] - pivot.x;
    const y = position[1] - pivot.y;
    return {
      compId: layer.compId,
      layerId: layer.layerId,
      x: clamp(pivot.x + x * cos - y * sin, -100_000, 100_000),
      y: clamp(pivot.y + x * sin + y * cos, -100_000, 100_000),
      rotation: clamp(rotation + delta, -36_000, 36_000),
    };
  });
}

export function alignFrames(
  frames: readonly CanvasLayerFrame[],
  alignment: CanvasAlignment,
): AuthoringLayerEdit[] {
  if (!canvasGestureAllowed(frames, 'align') || frames.length < 2) return [];
  const group = unionBounds(frames.map((frame) => frame.bounds));
  if (!group) return [];
  return frames.map(({ layer, position, bounds }) => {
    let dx = 0;
    let dy = 0;
    if (alignment === 'left') dx = group.left - bounds.left;
    else if (alignment === 'center-x') dx = center(group).x - center(bounds).x;
    else if (alignment === 'right') dx = group.right - bounds.right;
    else if (alignment === 'top') dy = group.top - bounds.top;
    else if (alignment === 'center-y') dy = center(group).y - center(bounds).y;
    else dy = group.bottom - bounds.bottom;
    return {
      compId: layer.compId,
      layerId: layer.layerId,
      x: clamp(position[0] + dx, -100_000, 100_000),
      y: clamp(position[1] + dy, -100_000, 100_000),
    };
  });
}

/** Frame a measured selection without changing any document transform. */
export function frameCanvasSelection(view: { zoom: number; pan: CanvasPoint }, selection: CanvasRect, viewport: { width: number; height: number }, maxZoom = 4) {
  const width = selection.right - selection.left;
  const height = selection.bottom - selection.top;
  if (![view.zoom, view.pan.x, view.pan.y, width, height, viewport.width, viewport.height, maxZoom].every(Number.isFinite) ||
    view.zoom <= 0 || width <= 0 || height <= 0 || viewport.width <= 48 || viewport.height <= 48 || maxZoom < .25) return null;
  const zoom = clamp(view.zoom * Math.min((viewport.width - 48) / width, (viewport.height - 48) / height), .25, maxZoom);
  const selectionCenter = center(selection);
  return { zoom, pan: {
    x: viewport.width / 2 - (selectionCenter.x - view.pan.x) * zoom / view.zoom,
    y: viewport.height / 2 - (selectionCenter.y - view.pan.y) * zoom / view.zoom,
  } };
}


export type CanvasViewMeasurement = {
  width: number;
  height: number;
  matrix: { a: number; b: number; c: number; d: number; e: number; f: number };
};

/** Retain the center scene point when SVG fitting changes with the canvas viewport. */
export function retainCanvasViewOnResize(
  view: { zoom: number; pan: CanvasPoint },
  before: CanvasViewMeasurement,
  after: CanvasViewMeasurement,
) {
  const previous = before.matrix;
  const current = after.matrix;
  const determinant = previous.a * previous.d - previous.b * previous.c;
  const beforeScale = Math.hypot(previous.a, previous.b);
  const afterScale = Math.hypot(current.a, current.b);
  if (![view.zoom, view.pan.x, view.pan.y, before.width, before.height, after.width, after.height,
    ...Object.values(previous), ...Object.values(current)].every(Number.isFinite) ||
    view.zoom <= 0 || Math.min(before.width, before.height, after.width, after.height) <= 0 ||
    Math.abs(determinant) < 1e-12 || beforeScale <= 0 || afterScale <= 0) return null;
  const x = before.width / 2 - previous.e;
  const y = before.height / 2 - previous.f;
  const sceneX = (previous.d * x - previous.c * y) / determinant;
  const sceneY = (previous.a * y - previous.b * x) / determinant;
  const zoom = clamp(view.zoom * beforeScale / afterScale, .25, 4);
  const ratio = zoom / view.zoom;
  return { zoom, pan: {
    x: after.width / 2 - (current.a * sceneX + current.c * sceneY + current.e - view.pan.x) * ratio,
    y: after.height / 2 - (current.b * sceneX + current.d * sceneY + current.f - view.pan.y) * ratio,
  } };
}
