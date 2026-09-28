// Pure zoom/pan math for the still viewer. A view is stored in the image's own
// normalized space — `scale` is a multiple of the object-contain fit, (cx, cy) is
// the image point at the centre of the viewport — so two stills of different sizes
// can share one view in compare and stay on the same spot. Everything the stage
// draws (the image, pins, marks) is placed against `zoomedRect`, so annotations
// scale with the zoom for free.

import type { CssRect, NormalizedBox, Size } from '../annotationGeometry';

export type ZoomView = { scale: number; cx: number; cy: number };

export const FIT_VIEW: ZoomView = { scale: 1, cx: 0.5, cy: 0.5 };
export const MIN_ZOOM = 0.25;
export const MAX_ZOOM = 64;
// A marquee smaller than this is a click, which zooms in one step instead.
export const MIN_MARQUEE_PX = 8;

const clamp = (value: number, low: number, high: number) => Math.min(high, Math.max(low, value));

export function zoomedRect(fit: CssRect, container: Size, view: ZoomView): CssRect {
  const width = fit.width * view.scale;
  const height = fit.height * view.scale;
  return {
    left: container.width / 2 - view.cx * width,
    top: container.height / 2 - view.cy * height,
    width,
    height,
  };
}

// An axis smaller than the viewport is centred; a larger one may pan only until
// its edge meets the viewport's edge.
function clampAxis(center: number, contentPx: number, viewportPx: number): number {
  const half = viewportPx / 2 / contentPx;
  return half >= 0.5 ? 0.5 : clamp(center, half, 1 - half);
}

export function clampView(view: ZoomView, fit: CssRect, container: Size): ZoomView {
  const scale = clamp(view.scale, MIN_ZOOM, MAX_ZOOM);
  return {
    scale,
    cx: clampAxis(view.cx, fit.width * scale, container.width),
    cy: clampAxis(view.cy, fit.height * scale, container.height),
  };
}

/** Zoom to `nextScale`, keeping the image point under `anchor` (container px) still. */
export function zoomAround(
  view: ZoomView,
  nextScale: number,
  anchor: { x: number; y: number },
  fit: CssRect,
  container: Size,
): ZoomView {
  const rect = zoomedRect(fit, container, view);
  const u = (anchor.x - rect.left) / rect.width;
  const v = (anchor.y - rect.top) / rect.height;
  const scale = clamp(nextScale, MIN_ZOOM, MAX_ZOOM);
  const width = fit.width * scale;
  const height = fit.height * scale;
  return clampView(
    {
      scale,
      cx: (container.width / 2 - (anchor.x - u * width)) / width,
      cy: (container.height / 2 - (anchor.y - v * height)) / height,
    },
    fit,
    container,
  );
}

/** Marquee zoom: the dragged box (container px) fills the viewport. */
export function zoomToBox(view: ZoomView, box: CssRect, fit: CssRect, container: Size): ZoomView {
  const rect = zoomedRect(fit, container, view);
  const centre = { x: box.left + box.width / 2, y: box.top + box.height / 2 };
  if (box.width < MIN_MARQUEE_PX && box.height < MIN_MARQUEE_PX) {
    return zoomAround(view, view.scale * 2, centre, fit, container);
  }
  const factor = Math.min(
    container.width / Math.max(box.width, 1),
    container.height / Math.max(box.height, 1),
  );
  return clampView(
    {
      scale: view.scale * factor,
      cx: (centre.x - rect.left) / rect.width,
      cy: (centre.y - rect.top) / rect.height,
    },
    fit,
    container,
  );
}

export function panBy(
  view: ZoomView,
  dx: number,
  dy: number,
  fit: CssRect,
  container: Size,
): ZoomView {
  return clampView(
    {
      ...view,
      cx: view.cx - dx / (fit.width * view.scale),
      cy: view.cy - dy / (fit.height * view.scale),
    },
    fit,
    container,
  );
}

/** The view centred on a normalized image point (the mini map's click). */
export function centerOn(
  view: ZoomView,
  point: { x: number; y: number },
  fit: CssRect,
  container: Size,
): ZoomView {
  return clampView({ ...view, cx: point.x, cy: point.y }, fit, container);
}

/** The scale at which one image pixel is one CSS pixel. */
export function actualSizeScale(fit: CssRect, natural: Size): number {
  return natural.width / fit.width;
}

export function zoomPercent(view: ZoomView, fit: CssRect, natural: Size): number {
  return Math.round((view.scale * fit.width * 100) / natural.width);
}

/** The part of the image inside the viewport, normalized — the mini map's box. */
export function visibleRegion(fit: CssRect, container: Size, view: ZoomView): NormalizedBox {
  const rect = zoomedRect(fit, container, view);
  const x0 = clamp(-rect.left / rect.width, 0, 1);
  const y0 = clamp(-rect.top / rect.height, 0, 1);
  const x1 = clamp((container.width - rect.left) / rect.width, 0, 1);
  const y1 = clamp((container.height - rect.top) / rect.height, 0, 1);
  return { x: x0, y: y0, width: x1 - x0, height: y1 - y0 };
}

/** Whether any of the image is off screen, which is when a mini map earns its place. */
export function isCropped(region: NormalizedBox): boolean {
  return region.width < 0.999 || region.height < 0.999;
}
