import { describe, expect, test } from 'bun:test';
import type { LayerEditorLayer } from '../../types';
import type { Frame } from './frameModel';
import {
  alignLayers,
  createLayer,
  duplicateLayer,
  duplicateNames,
  flipLayers,
  moveLayer,
  nudgeLayers,
  removeLayers,
  reorderLayers,
} from './layerOps';
import { layerBounds } from './layerTransform';

const FRAME: Frame = { width: 1000, height: 1000 };

const box = (id: string, patch: Partial<LayerEditorLayer> = {}): LayerEditorLayer => ({
  id,
  name: id,
  sourceNodeId: `n-${id}`,
  sourceWidth: 100,
  sourceHeight: 100,
  anchor: { x: 50, y: 50 },
  position: { x: 500, y: 500 },
  scale: { x: 1, y: 1 },
  rotation: 0,
  opacity: 1,
  blendMode: 'normal',
  visible: true,
  locked: false,
  ...patch,
});

const ids = (layers: readonly LayerEditorLayer[]): string[] => layers.map((layer) => layer.id);

describe('createLayer', () => {
  test('anchors on the SOURCE centre and lands on the frame centre', () => {
    const layer = createLayer({
      sourceNodeId: 'n1',
      name: 'Hero',
      sourceWidth: 800,
      sourceHeight: 400,
      frame: { width: 2048, height: 2048 },
    });
    expect(layer.anchor).toEqual({ x: 400, y: 200 });
    expect(layer.position).toEqual({ x: 1024, y: 1024 });
    expect(layer.scale).toEqual({ x: 1, y: 1 });
    expect(layer.rotation).toBe(0);
    expect(layer.opacity).toBe(1);
    expect(layer.blendMode).toBe('normal');
  });

  test('contains an oversized source, and never enlarges a small one', () => {
    const big = createLayer({
      sourceNodeId: 'n',
      name: 'big',
      sourceWidth: 4096,
      sourceHeight: 2048,
      frame: { width: 2048, height: 2048 },
    });
    expect(big.scale).toEqual({ x: 0.5, y: 0.5 });

    const small = createLayer({
      sourceNodeId: 'n',
      name: 'small',
      sourceWidth: 100,
      sourceHeight: 100,
      frame: { width: 2048, height: 2048 },
    });
    expect(small.scale).toEqual({ x: 1, y: 1 });
  });

  test('the id is opaque and independent of the name', () => {
    const a = createLayer({ sourceNodeId: 'n', name: 'same', sourceWidth: 10, sourceHeight: 10, frame: FRAME });
    const b = createLayer({ sourceNodeId: 'n', name: 'same', sourceWidth: 10, sourceHeight: 10, frame: FRAME });
    expect(a.id).not.toBe(b.id);
    expect(a.name).toBe(b.name);
  });
});

describe('ordering — the array IS the z axis', () => {
  const stack = [box('a'), box('b'), box('c')];

  test('up moves LATER in the array (towards the viewer)', () => {
    expect(ids(moveLayer(stack, 'a', 'up'))).toEqual(['b', 'a', 'c']);
    expect(ids(moveLayer(stack, 'c', 'down'))).toEqual(['a', 'c', 'b']);
  });

  test('top and bottom go the whole way', () => {
    expect(ids(moveLayer(stack, 'a', 'top'))).toEqual(['b', 'c', 'a']);
    expect(ids(moveLayer(stack, 'c', 'bottom'))).toEqual(['c', 'a', 'b']);
  });

  test('moving past an end is a no-op, not a wrap', () => {
    expect(ids(moveLayer(stack, 'c', 'up'))).toEqual(['a', 'b', 'c']);
    expect(ids(moveLayer(stack, 'a', 'down'))).toEqual(['a', 'b', 'c']);
    expect(ids(moveLayer(stack, 'missing', 'top'))).toEqual(['a', 'b', 'c']);
  });

  test('never mutates the input', () => {
    moveLayer(stack, 'a', 'top');
    expect(ids(stack)).toEqual(['a', 'b', 'c']);
  });

  test('reorderLayers is the panel drag, by index', () => {
    expect(ids(reorderLayers(stack, 0, 2))).toEqual(['b', 'c', 'a']);
    expect(ids(reorderLayers(stack, 2, 0))).toEqual(['c', 'a', 'b']);
  });
});

describe('alignLayers', () => {
  // One 100x100 box at (200,200) and one at (800,800), both anchored centre, so their
  // bounds are 150..250 and 750..850.
  const a = box('a', { position: { x: 200, y: 200 } });
  const b = box('b', { position: { x: 800, y: 800 } });
  const both = [a, b];

  test('a single selection aligns to the FRAME, on all six edges', () => {
    const only = [a];
    const at = (edge: Parameters<typeof alignLayers>[2]) =>
      layerBounds(alignLayers(only, ['a'], edge, FRAME)[0]);

    expect(at('left').left).toBeCloseTo(0, 6);
    expect(at('right').right).toBeCloseTo(1000, 6);
    expect(at('center').left).toBeCloseTo(450, 6);
    expect(at('top').top).toBeCloseTo(0, 6);
    expect(at('bottom').bottom).toBeCloseTo(1000, 6);
    expect(at('middle').top).toBeCloseTo(450, 6);
  });

  test('a multi selection aligns to the SELECTION bbox — the outermost layer holds still', () => {
    const aligned = alignLayers(both, ['a', 'b'], 'left', FRAME);
    expect(layerBounds(aligned[0]).left).toBeCloseTo(150, 6);
    expect(layerBounds(aligned[1]).left).toBeCloseTo(150, 6);
    // and only x moved
    expect(aligned[1].position.y).toBe(800);
  });

  test('aligns EDGES, not anchors — a rotated layer lands on its visible edge', () => {
    // Anchored at its own top-left and turned 90 degrees: position and the visible left
    // edge are 100px apart, so an implementation that moved `position` to 0 would be off
    // by exactly that.
    const rotated = box('r', {
      anchor: { x: 0, y: 0 },
      position: { x: 500, y: 500 },
      rotation: 90,
    });
    const aligned = alignLayers([rotated], ['r'], 'left', FRAME)[0];
    expect(layerBounds(aligned).left).toBeCloseTo(0, 6);
    expect(aligned.position.x).toBeCloseTo(100, 6);
  });

  test('a locked layer is never moved', () => {
    const locked = box('locked', { position: { x: 200, y: 200 }, locked: true });
    const aligned = alignLayers([locked], ['locked'], 'left', FRAME)[0];
    expect(aligned.position).toEqual({ x: 200, y: 200 });
  });
});

describe('nudge and flip', () => {
  test('nudge moves every selected layer by the same delta', () => {
    const moved = nudgeLayers([box('a'), box('b')], ['a'], 1, -10);
    expect(moved[0].position).toEqual({ x: 501, y: 490 });
    expect(moved[1].position).toEqual({ x: 500, y: 500 });
  });

  test('flip is a NEGATED SCALE — there is no flip field to drift from it', () => {
    const flipped = flipLayers([box('a')], ['a'], 'x')[0];
    expect(flipped.scale).toEqual({ x: -1, y: 1 });
    expect('flipH' in flipped).toBe(false);
    expect(flipLayers([flipped], ['a'], 'x')[0].scale).toEqual({ x: 1, y: 1 });
    expect(flipLayers([box('a')], ['a'], 'y')[0].scale).toEqual({ x: 1, y: -1 });
  });
});

describe('remove, duplicate and names', () => {
  test('remove skips locked layers', () => {
    const layers = [box('a'), box('locked', { locked: true })];
    expect(ids(removeLayers(layers, ['a', 'locked']))).toEqual(['locked']);
  });

  test('a duplicate lands directly above its original with a fresh id', () => {
    const next = duplicateLayer([box('a'), box('b')], 'a');
    expect(next).toHaveLength(3);
    expect(next[1].name).toBe('a copy');
    expect(next[1].id).not.toBe('a');
    expect(next[1].position).toEqual({ x: 524, y: 524 });
    expect(ids(next)[2]).toBe('b');
  });

  test('colliding names are REPORTED, never corrected — name is an AE join key', () => {
    const layers = [box('1', { name: 'Logo' }), box('2', { name: 'Logo' }), box('3', { name: 'BG' })];
    expect([...duplicateNames(layers)]).toEqual(['Logo']);
    // and nothing renamed itself
    expect(layers.map((layer) => layer.name)).toEqual(['Logo', 'Logo', 'BG']);
  });
});
