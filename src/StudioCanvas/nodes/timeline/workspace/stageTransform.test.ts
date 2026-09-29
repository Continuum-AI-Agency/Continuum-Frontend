import { describe, expect, it } from 'bun:test';
import type { EditorTransform } from '@continuum/contracts';
import { dragTransform } from './stageTransform';

const frame = { width: 1000, height: 500 };
const start: EditorTransform = {
  position: { x: 0.3, y: 0.3, unit: 'normalized' },
  scaleX: -1,
  scaleY: 0.5,
  rotationDeg: 0,
  rotateXDeg: 0,
  rotateYDeg: 0,
  perspective: 0,
  anchorX: 0.5,
  anchorY: 0.5,
  opacity: 1,
};
const centre = { x: 300, y: 150 };

describe('dragTransform', () => {
  it('moves in normalized units, shift-locks the axis and snaps to the centre line', () => {
    const moved = dragTransform({
      gesture: 'move',
      start,
      startPointer: centre,
      pointer: { x: 496, y: 170 },
      frame,
      shift: true,
    });
    expect(moved.transform.position).toEqual({ x: 0.5, y: 0.3, unit: 'normalized' });
    expect(moved.guides).toEqual({ x: true, y: false });
  });

  it('scales uniformly about the centre, keeping the flip and clamping', () => {
    const doubled = dragTransform({
      gesture: 'scale',
      start,
      startPointer: { x: 400, y: 150 },
      pointer: { x: 300, y: 350 },
      frame,
      shift: false,
    });
    expect(doubled.transform.scaleX).toBe(-2);
    expect(doubled.transform.scaleY).toBe(1);

    const huge = dragTransform({
      gesture: 'scale',
      start,
      startPointer: { x: 301, y: 150 },
      pointer: { x: 900, y: 150 },
      frame,
      shift: false,
    });
    expect(huge.transform.scaleX).toBe(-8);
  });

  it('rotates by the pointer angle delta and snaps to 15 degrees with shift', () => {
    const turned = dragTransform({
      gesture: 'rotate',
      start,
      startPointer: { x: 300, y: 50 },
      pointer: { x: 400, y: 160 },
      frame,
      shift: true,
    });
    expect(turned.transform.rotationDeg).toBe(90);
  });
});
