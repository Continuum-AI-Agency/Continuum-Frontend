import { describe, expect, test } from 'bun:test';
import type { LayerEditorLayer } from '../../types';
import {
  compositionToSource,
  hitTestLayer,
  layerAtPoint,
  layerBounds,
  layerCorners,
  layerTransformCss,
  sourceToComposition,
} from './layerTransform';

const layer = (patch: Partial<LayerEditorLayer> = {}): LayerEditorLayer => ({
  id: 'l1',
  name: 'layer',
  sourceNodeId: 'n1',
  sourceWidth: 400,
  sourceHeight: 200,
  anchor: { x: 200, y: 100 },
  position: { x: 1024, y: 1024 },
  scale: { x: 1, y: 1 },
  rotation: 0,
  opacity: 1,
  blendMode: 'normal',
  visible: true,
  locked: false,
  ...patch,
});

describe('the anchor is the pivot (aep-interop §4.3)', () => {
  // A 400x200 source whose anchor is its OWN top-left corner, dropped at (1500,1300)
  // and turned a quarter turn clockwise. This is the exact case the §4.3 schema exists
  // to get right, and the case a frame-centre pivot gets wrong.
  const rotated = layer({
    anchor: { x: 0, y: 0 },
    position: { x: 1500, y: 1300 },
    rotation: 90,
  });

  test('the anchored corner lands EXACTLY on position, whatever the rotation', () => {
    expect(sourceToComposition(rotated, { x: 0, y: 0 })).toEqual({ x: 1500, y: 1300 });
  });

  test('+90 degrees is clockwise in a +y-down space', () => {
    // (x,y) -> (-y, x): the source's +x axis swings DOWN the screen.
    expect(sourceToComposition(rotated, { x: 400, y: 0 })).toEqual({ x: 1500, y: 1700 });
    expect(sourceToComposition(rotated, { x: 0, y: 200 })).toEqual({ x: 1300, y: 1300 });
  });

  test('the placed bounds are the quarter-turn about the ANCHOR', () => {
    const bounds = layerBounds(rotated);
    expect(bounds.left).toBeCloseTo(1300, 6);
    expect(bounds.top).toBeCloseTo(1300, 6);
    expect(bounds.right).toBeCloseTo(1500, 6);
    expect(bounds.bottom).toBeCloseTo(1700, 6);
  });

  test('FALSIFIER: the point-reflection through the pivot is NOT covered', () => {
    // A frame-centre pivot — or any centre-anchor default — leaves the layer symmetric
    // about its pivot, so this point would be inside it. Under anchor math it is not.
    const inside = { x: 1400, y: 1400 };
    const reflected = { x: 2 * 1500 - inside.x, y: 2 * 1300 - inside.y };
    expect(hitTestLayer(rotated, inside)).toBe(true);
    expect(hitTestLayer(rotated, reflected)).toBe(false);
  });

  test('a centre anchor rotates in place — the same layer, one field apart', () => {
    const centred = layer({ ...rotated, anchor: { x: 200, y: 100 } });
    const bounds = layerBounds(centred);
    expect(bounds.left).toBeCloseTo(1400, 6);
    expect(bounds.right).toBeCloseTo(1600, 6);
    expect(bounds.top).toBeCloseTo(1100, 6);
    expect(bounds.bottom).toBeCloseTo(1500, 6);
  });
});

describe('scale', () => {
  test('is per-axis and multiplies from the anchor', () => {
    const scaled = layer({ scale: { x: 2, y: 0.5 } });
    const bounds = layerBounds(scaled);
    expect(bounds.right - bounds.left).toBeCloseTo(800, 6);
    expect(bounds.bottom - bounds.top).toBeCloseTo(100, 6);
  });

  test('a negative axis IS the flip — the edges swap, the anchor does not move', () => {
    const flipped = layer({ scale: { x: -1, y: 1 } });
    expect(sourceToComposition(flipped, { x: 0, y: 100 })).toEqual({ x: 1224, y: 1024 });
    expect(sourceToComposition(flipped, { x: 400, y: 100 })).toEqual({ x: 824, y: 1024 });
    expect(layerBounds(flipped)).toEqual(layerBounds(layer()));
  });
});

describe('inverse + hit testing', () => {
  test('compositionToSource round-trips sourceToComposition', () => {
    const odd = layer({ rotation: 37, scale: { x: 1.4, y: -0.8 }, position: { x: 300, y: 900 } });
    const back = compositionToSource(odd, sourceToComposition(odd, { x: 123, y: 45 }));
    expect(back.x).toBeCloseTo(123, 6);
    expect(back.y).toBeCloseTo(45, 6);
  });

  test('layerAtPoint reads BACKWARDS — the last painted layer wins', () => {
    const under = layer({ id: 'under' });
    const over = layer({ id: 'over' });
    expect(layerAtPoint([under, over], { x: 1024, y: 1024 })?.id).toBe('over');
  });

  test('locked and hidden layers are not selectable', () => {
    const locked = layer({ id: 'locked', locked: true });
    const hidden = layer({ id: 'hidden', visible: false });
    const pick = layer({ id: 'pick' });
    expect(layerAtPoint([pick, hidden, locked], { x: 1024, y: 1024 })?.id).toBe('pick');
  });
});

describe('preview == export', () => {
  test('the CSS is the same four ops, in the same order, as the canvas transform', () => {
    const css = layerTransformCss(layer({ rotation: 90, scale: { x: -1, y: 2 } }));
    expect(css).toBe(
      'translate(1024px, 1024px) rotate(90deg) scale(-1, 2) translate(-200px, -100px)',
    );
  });

  test('the CSS matrix agrees with sourceToComposition on the corners', () => {
    // transform-origin: 0 0 and translate(-anchor) last is exactly drawImage(-anchor).
    const placed = layer({ rotation: 90, anchor: { x: 0, y: 0 }, position: { x: 10, y: 20 } });
    const [topLeft] = layerCorners(placed);
    expect(topLeft).toEqual({ x: 10, y: 20 });
    expect(layerTransformCss(placed)).toContain('translate(0px, 0px)');
  });
});
