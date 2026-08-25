import { describe, expect, test } from 'bun:test';
import type { LayerEditorLayer } from '../../types';
import {
  canRedo,
  canUndo,
  HISTORY_LIMIT,
  initialHistory,
  type LayerDoc,
  type LayerHistory,
  layerDocReducer,
} from './layerDocReducer';

const layer = (x: number): LayerEditorLayer => ({
  id: 'l',
  name: 'l',
  sourceNodeId: 'n',
  sourceWidth: 100,
  sourceHeight: 100,
  anchor: { x: 50, y: 50 },
  position: { x, y: 0 },
  scale: { x: 1, y: 1 },
  rotation: 0,
  opacity: 1,
  blendMode: 'normal',
  visible: true,
  locked: false,
});

const doc = (x: number): LayerDoc => ({ frame: { width: 2048, height: 2048 }, layers: [layer(x)] });

const at = (state: LayerHistory): number => state.present.layers[0].position.x;

const run = (state: LayerHistory, ...actions: Parameters<typeof layerDocReducer>[1][]) =>
  actions.reduce(layerDocReducer, state);

describe('commit / undo / redo', () => {
  test('undo walks back one commit at a time; redo walks forward', () => {
    let state = initialHistory(doc(0));
    state = run(state, { type: 'commit', doc: doc(1) }, { type: 'commit', doc: doc(2) });
    expect(at(state)).toBe(2);

    state = layerDocReducer(state, { type: 'undo' });
    expect(at(state)).toBe(1);
    state = layerDocReducer(state, { type: 'undo' });
    expect(at(state)).toBe(0);

    state = layerDocReducer(state, { type: 'redo' });
    expect(at(state)).toBe(1);
    expect(state.future).toHaveLength(1);
  });

  test('undo on an empty past and redo on an empty future are no-ops', () => {
    const fresh = initialHistory(doc(0));
    expect(layerDocReducer(fresh, { type: 'undo' })).toBe(fresh);
    expect(layerDocReducer(fresh, { type: 'redo' })).toBe(fresh);
    expect(canUndo(fresh)).toBe(false);
    expect(canRedo(fresh)).toBe(false);
  });

  test('a new commit after an undo drops the redo branch', () => {
    let state = initialHistory(doc(0));
    state = run(state, { type: 'commit', doc: doc(1) }, { type: 'undo' });
    expect(canRedo(state)).toBe(true);
    state = layerDocReducer(state, { type: 'commit', doc: doc(9) });
    expect(state.future).toHaveLength(0);
    expect(at(state)).toBe(9);
  });

  test('reset clears both stacks', () => {
    let state = initialHistory(doc(0));
    state = run(state, { type: 'commit', doc: doc(1) }, { type: 'undo' });
    state = layerDocReducer(state, { type: 'reset', doc: doc(7) });
    expect(state).toEqual({ present: doc(7), past: [], future: [] });
  });
});

describe(`the history is capped at ${HISTORY_LIMIT}`, () => {
  test('60 commits keep the newest 50, and the 51st undo is a no-op', () => {
    let state = initialHistory(doc(0));
    for (let step = 1; step <= 60; step += 1) {
      state = layerDocReducer(state, { type: 'commit', doc: doc(step) });
    }
    expect(state.past).toHaveLength(HISTORY_LIMIT);
    expect(at(state)).toBe(60);

    for (let step = 0; step < HISTORY_LIMIT; step += 1) {
      state = layerDocReducer(state, { type: 'undo' });
    }
    // The oldest retained entry is the document present at commit #10 — the 50 undos
    // walk 60 -> 10, and everything before that has fallen off the back.
    expect(at(state)).toBe(10);
    expect(canUndo(state)).toBe(false);

    const stuck = layerDocReducer(state, { type: 'undo' });
    expect(stuck).toBe(state);
  });
});

describe('a drag is ONE history entry', () => {
  test('begin + N previews collapses to a single undo step', () => {
    let state = initialHistory(doc(0));
    state = layerDocReducer(state, { type: 'begin' });
    for (let frame = 1; frame <= 100; frame += 1) {
      state = layerDocReducer(state, { type: 'preview', doc: doc(frame) });
    }
    expect(at(state)).toBe(100);
    expect(state.past).toHaveLength(1);

    state = layerDocReducer(state, { type: 'undo' });
    expect(at(state)).toBe(0);
  });

  test('preview alone never grows the past', () => {
    const state = layerDocReducer(initialHistory(doc(0)), { type: 'preview', doc: doc(5) });
    expect(state.past).toHaveLength(0);
    expect(at(state)).toBe(5);
  });
});
