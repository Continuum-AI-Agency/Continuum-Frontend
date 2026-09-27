import { describe, expect, it } from 'bun:test';
import {
  arrowHead,
  drawingHistoryReducer,
  EMPTY_DRAWING,
  freehandShape,
  shapeFromDrag,
  shapesAnchor,
  shapesBounds,
} from './drawing';

const red = '#EF4444';

describe('shapeFromDrag', () => {
  it('turns a drag into a normalized box in any drag direction', () => {
    expect(shapeFromDrag('box', { x: 0.75, y: 0.5 }, { x: 0.25, y: 0.125 }, red)).toEqual({
      tool: 'box',
      color: red,
      x: 0.25,
      y: 0.125,
      width: 0.5,
      height: 0.375,
    });
  });

  it('keeps arrow and line direction', () => {
    expect(shapeFromDrag('arrow', { x: 0.1, y: 0.1 }, { x: 0.5, y: 0.2 }, red)).toEqual({
      tool: 'arrow',
      color: red,
      from: { x: 0.1, y: 0.1 },
      to: { x: 0.5, y: 0.2 },
    });
  });

  it('reads a click as no shape', () => {
    expect(shapeFromDrag('line', { x: 0.1, y: 0.1 }, { x: 0.101, y: 0.1 }, red)).toBeNull();
    expect(shapeFromDrag('box', { x: 0.1, y: 0.1 }, { x: 0.1, y: 0.1 }, red)).toBeNull();
  });
});

describe('freehandShape', () => {
  it('drops repeated points and refuses a dot', () => {
    expect(
      freehandShape(
        [
          { x: 0, y: 0 },
          { x: 0, y: 0 },
        ],
        red,
      ),
    ).toBeNull();
    expect(
      freehandShape(
        [
          { x: 0, y: 0 },
          { x: 0, y: 0 },
          { x: 0.2, y: 0.1 },
        ],
        red,
      )?.points,
    ).toHaveLength(2);
  });
});

describe('bounds and anchor', () => {
  const shapes = [
    { tool: 'arrow' as const, color: red, from: { x: 0.3, y: 0.4 }, to: { x: 0.8, y: 0.2 } },
    { tool: 'box' as const, color: red, x: 0.1, y: 0.5, width: 0.1, height: 0.3 },
  ];
  it('covers every mark', () => {
    const bounds = shapesBounds(shapes);
    expect(bounds.x).toBeCloseTo(0.1);
    expect(bounds.y).toBeCloseTo(0.2);
    expect(bounds.width).toBeCloseTo(0.7);
    expect(bounds.height).toBeCloseTo(0.6);
  });
  it('anchors at the first mark start', () => {
    expect(shapesAnchor(shapes)).toEqual({ x: 0.3, y: 0.4 });
  });
});

describe('arrowHead', () => {
  it('puts both barbs behind the tip', () => {
    const [left, right] = arrowHead({ x: 0, y: 0 }, { x: 100, y: 0 }, 10);
    expect(left.x).toBeLessThan(100);
    expect(right.x).toBeLessThan(100);
    expect(left.y).toBeCloseTo(-right.y);
  });
});

describe('drawingHistoryReducer', () => {
  const a = { tool: 'line' as const, color: red, from: { x: 0, y: 0 }, to: { x: 1, y: 1 } };
  const b = { ...a, color: '#FFFFFF' };

  it('undoes and redoes in order, and a new mark clears redo', () => {
    let state = drawingHistoryReducer(EMPTY_DRAWING, { type: 'add', shape: a });
    state = drawingHistoryReducer(state, { type: 'add', shape: b });
    state = drawingHistoryReducer(state, { type: 'undo' });
    expect(state.shapes).toEqual([a]);
    state = drawingHistoryReducer(state, { type: 'redo' });
    expect(state.shapes).toEqual([a, b]);
    state = drawingHistoryReducer(state, { type: 'undo' });
    state = drawingHistoryReducer(state, { type: 'add', shape: a });
    expect(state.redo).toEqual([]);
  });

  it('ignores undo on an empty drawing', () => {
    expect(drawingHistoryReducer(EMPTY_DRAWING, { type: 'undo' })).toBe(EMPTY_DRAWING);
  });
});
