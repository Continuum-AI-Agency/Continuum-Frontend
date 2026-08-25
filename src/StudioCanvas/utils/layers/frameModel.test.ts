import { describe, expect, test } from 'bun:test';
import type { LayerEditorLayer } from '../../types';
import {
  clampFrame,
  DEFAULT_FRAME,
  FRAME_MAX_SIZE,
  FRAME_MIN_SIZE,
  fitScale,
  readFrame,
  snapToGrid,
  writeFrame,
} from './frameModel';
import { layerBounds } from './layerTransform';

describe('clampFrame', () => {
  test('holds the 100..4096 envelope and rounds to whole pixels', () => {
    expect(clampFrame({ width: 12, height: 99_999 })).toEqual({
      width: FRAME_MIN_SIZE,
      height: FRAME_MAX_SIZE,
    });
    expect(clampFrame({ width: 1023.6, height: 511.2 })).toEqual({ width: 1024, height: 511 });
  });

  test('a non-finite dimension falls back to the default rather than NaN', () => {
    expect(clampFrame({ width: Number.NaN, height: 800 })).toEqual({ width: 2048, height: 800 });
  });
});

describe('readFrame', () => {
  test('`frame` is authoritative', () => {
    expect(readFrame({ frame: { width: 1000, height: 500 } })).toEqual({ width: 1000, height: 500 });
  });

  test("today's contracts seed (flat frameWidth + aspectRatio 1:1) reads 2048 square", () => {
    expect(readFrame({ layers: [], frameWidth: 2048, frameHeight: 2048, aspectRatio: '1:1' })).toEqual(
      DEFAULT_FRAME,
    );
  });

  test('a node created as 9:16 opens PORTRAIT, not square', () => {
    // createNodeData('layerEditor', { aspectRatio: '9:16' }) is a supported contracts
    // path; opening it square would silently letterbox everything the user places.
    expect(readFrame({ aspectRatio: '9:16' })).toEqual({ width: 1152, height: 2048 });
    expect(readFrame({ aspectRatio: '16:9' })).toEqual({ width: 2048, height: 1152 });
  });

  test('missing or malformed data is 2048 square', () => {
    expect(readFrame({})).toEqual(DEFAULT_FRAME);
    expect(readFrame(undefined)).toEqual(DEFAULT_FRAME);
    expect(readFrame({ frame: { width: 'wide' } as unknown as number })).toEqual(DEFAULT_FRAME);
  });
});

describe('writeFrame', () => {
  test('keeps aspectRatio in step so the node box follows the document', () => {
    expect(writeFrame(2048, 1152)).toEqual({
      frame: { width: 2048, height: 1152 },
      aspectRatio: '16:9',
    });
  });

  test('clamps like clampFrame, and simplifies the ratio of the CLAMPED size', () => {
    expect(writeFrame(9000, 4500)).toEqual({
      frame: { width: 4096, height: 4096 },
      aspectRatio: '1:1',
    });
  });

  test('writes the frame and NOTHING else — resizing must not move a layer', () => {
    // position is composition PIXELS, not a fraction of the frame (aep-interop §4.2.1).
    // The whole point of that decision is this property.
    expect(Object.keys(writeFrame(1000, 500)).sort()).toEqual(['aspectRatio', 'frame']);

    const layer: LayerEditorLayer = {
      id: 'l',
      name: 'l',
      sourceNodeId: 'n',
      sourceWidth: 400,
      sourceHeight: 400,
      anchor: { x: 200, y: 200 },
      position: { x: 300, y: 300 },
      scale: { x: 1, y: 1 },
      rotation: 0,
      opacity: 1,
      blendMode: 'normal',
      visible: true,
      locked: false,
    };
    const before = layerBounds(layer);
    writeFrame(4096, 1024);
    expect(layerBounds(layer)).toEqual(before);
  });
});

describe('snapToGrid', () => {
  test('rounds to the nearest multiple', () => {
    expect(snapToGrid(103, 16)).toBe(96);
    expect(snapToGrid(105, 16)).toBe(112);
  });

  test('a zero or negative grid disables snapping instead of dividing by it', () => {
    expect(snapToGrid(103, 0)).toBe(103);
    expect(snapToGrid(103, -8)).toBe(103);
  });
});

describe('fitScale', () => {
  test('shrinks to fit and never enlarges past 1:1', () => {
    expect(fitScale({ width: 2048, height: 2048 }, { width: 1024, height: 4000 })).toBe(0.5);
    expect(fitScale({ width: 100, height: 100 }, { width: 1000, height: 1000 })).toBe(1);
  });
});
