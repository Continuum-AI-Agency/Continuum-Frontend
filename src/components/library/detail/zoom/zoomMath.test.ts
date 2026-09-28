import { describe, expect, test } from 'bun:test';
import { fitContentRect } from '../annotationGeometry';
import {
  actualSizeScale,
  centerOn,
  clampView,
  FIT_VIEW,
  isCropped,
  MAX_ZOOM,
  panBy,
  visibleRegion,
  zoomAround,
  zoomedRect,
  zoomPercent,
  zoomToBox,
} from './zoomMath';

const container = { width: 1000, height: 500 };
const natural = { width: 2000, height: 1000 };
const fit = fitContentRect(container, natural)!;

describe('zoomedRect', () => {
  test('the fit view is the object-contain rect', () => {
    expect(zoomedRect(fit, container, FIT_VIEW)).toEqual(fit);
  });

  test('doubling keeps the centre of the image at the centre of the viewport', () => {
    const rect = zoomedRect(fit, container, { scale: 2, cx: 0.5, cy: 0.5 });
    expect(rect).toEqual({ left: -500, top: -250, width: 2000, height: 1000 });
  });
});

describe('zoomAround', () => {
  test('the image point under the cursor stays under the cursor', () => {
    const anchor = { x: 250, y: 125 };
    const before = zoomedRect(fit, container, FIT_VIEW);
    const u = (anchor.x - before.left) / before.width;
    const next = zoomAround(FIT_VIEW, 3, anchor, fit, container);
    const after = zoomedRect(fit, container, next);
    expect((anchor.x - after.left) / after.width).toBeCloseTo(u, 9);
    expect(next.scale).toBe(3);
  });

  test('clamps the scale into the supported range', () => {
    expect(zoomAround(FIT_VIEW, 10_000, { x: 500, y: 250 }, fit, container).scale).toBe(MAX_ZOOM);
  });
});

describe('clampView', () => {
  test('an image no larger than the viewport is centred', () => {
    expect(clampView({ scale: 1, cx: 0.1, cy: 0.9 }, fit, container)).toEqual(FIT_VIEW);
  });

  test('a zoomed image cannot pan past its own edge', () => {
    const view = clampView({ scale: 4, cx: 0, cy: 1 }, fit, container);
    const rect = zoomedRect(fit, container, view);
    expect(rect.left).toBeCloseTo(0, 9);
    expect(rect.top + rect.height).toBeCloseTo(container.height, 9);
  });
});

describe('panBy', () => {
  test('dragging right by N px moves the image right by N px', () => {
    const start = { scale: 4, cx: 0.5, cy: 0.5 };
    const before = zoomedRect(fit, container, start);
    const after = zoomedRect(fit, container, panBy(start, 120, -40, fit, container));
    expect(after.left - before.left).toBeCloseTo(120, 9);
    expect(after.top - before.top).toBeCloseTo(-40, 9);
  });
});

describe('zoomToBox', () => {
  test('the marquee fills the viewport on its limiting axis, centred', () => {
    const box = { left: 100, top: 50, width: 200, height: 50 };
    const next = zoomToBox(FIT_VIEW, box, fit, container);
    expect(next.scale).toBeCloseTo(5, 9);
    const rect = zoomedRect(fit, container, next);
    // The marquee's centre, in image space, is now the viewport's centre.
    const u = (200 - fit.left) / fit.width;
    expect((container.width / 2 - rect.left) / rect.width).toBeCloseTo(u, 9);
  });

  test('a click-sized marquee zooms one step at the click', () => {
    expect(
      zoomToBox(FIT_VIEW, { left: 400, top: 200, width: 2, height: 2 }, fit, container).scale,
    ).toBe(2);
  });
});

describe('actual size and percent', () => {
  test('100% is one image pixel per CSS pixel', () => {
    const scale = actualSizeScale(fit, natural);
    expect(scale).toBe(2);
    expect(zoomPercent({ scale, cx: 0.5, cy: 0.5 }, fit, natural)).toBe(100);
    expect(zoomPercent(FIT_VIEW, fit, natural)).toBe(50);
  });
});

describe('visibleRegion', () => {
  test('fit shows the whole image; 4x shows a quarter of each axis', () => {
    expect(isCropped(visibleRegion(fit, container, FIT_VIEW))).toBe(false);
    const region = visibleRegion(fit, container, { scale: 4, cx: 0.5, cy: 0.5 });
    expect(region.width).toBeCloseTo(0.25, 9);
    expect(region.x).toBeCloseTo(0.375, 9);
    expect(isCropped(region)).toBe(true);
  });

  test('centerOn moves the visible region to the clicked point', () => {
    const view = centerOn({ scale: 4, cx: 0.5, cy: 0.5 }, { x: 0.8, y: 0.2 }, fit, container);
    const region = visibleRegion(fit, container, view);
    expect(region.x + region.width / 2).toBeCloseTo(0.8, 9);
    expect(region.y + region.height / 2).toBeCloseTo(0.2, 9);
  });
});
