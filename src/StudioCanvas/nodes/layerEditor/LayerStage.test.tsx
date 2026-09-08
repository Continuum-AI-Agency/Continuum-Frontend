import { afterEach, describe, expect, it } from 'bun:test';
import { act, cleanup, fireEvent, render } from '@testing-library/react';
import type { LayerEditorLayer } from '../../types';
import { LayerStage } from './LayerStage';

/**
 * The stage's pointer contract.
 *
 * Every gesture in the editor runs through `runDrag`, and until this file existed no test
 * in the repo failed if dragging stopped working entirely — the pure arithmetic under it
 * is well covered, the wiring that calls the arithmetic was not covered at all.
 *
 * happy-dom reports a zero `getBoundingClientRect`, and `fitScale` returns 1 for a
 * zero-sized viewport, so composition pixels and client pixels are the same number here.
 * That is a convenience, not an assumption the component makes.
 */

const PointerEventCtor = (window as unknown as { PointerEvent: typeof PointerEvent }).PointerEvent;

const layer = (id: string, over: Partial<LayerEditorLayer> = {}): LayerEditorLayer => ({
  id,
  name: id,
  sourceNodeId: `n-${id}`,
  sourceWidth: 100,
  sourceHeight: 100,
  anchor: { x: 50, y: 50 },
  // Anchor-centred at (100,100) with a 100x100 source: the quad is (50,50)-(150,150).
  position: { x: 100, y: 100 },
  scale: { x: 1, y: 1 },
  rotation: 0,
  opacity: 1,
  blendMode: 'normal',
  visible: true,
  locked: false,
  ...over,
});

interface Calls {
  begin: number;
  cancel: number;
  previews: LayerEditorLayer[][];
  selections: string[][];
}

function renderStage(over: Partial<Parameters<typeof LayerStage>[0]> = {}) {
  const calls: Calls = { begin: 0, cancel: 0, previews: [], selections: [] };
  const layers = over.layers ?? [layer('a')];
  const sources =
    over.sources ?? new Map(layers.map((entry) => [entry.id, `blob:${entry.id}`] as const));

  // Nothing here is typechecked: tsconfig excludes `**/*.test.*`. This file went on
  // passing a `snapGrid` prop that had been renamed away, with snapping silently disabled
  // in every case below, and no gate said a word. Prop names are therefore load-bearing
  // by hand — when a LayerStage prop changes, this list has to be edited with it.
  const view = render(
    <LayerStage
      frame={{ width: 512, height: 512 }}
      layers={layers}
      sources={sources}
      selectedIds={over.selectedIds ?? ['a']}
      onSelectionChange={(ids) => calls.selections.push(ids)}
      onBegin={() => {
        calls.begin += 1;
      }}
      onPreview={(next) => calls.previews.push(next)}
      onCancel={() => {
        calls.cancel += 1;
      }}
      snapEnabled={over.snapEnabled ?? false}
      {...over}
    />,
  );

  const frame = view.getByTestId('layer-frame');
  return { calls, frame, view };
}

/**
 * A native pointer event, so the element-level listeners `runDrag` installs receive it.
 *
 * Dispatched inside `act` because these bypass React's synthetic system entirely: the
 * listeners call `setGuides`/`setReadout` directly, and without act the assertions run
 * against a DOM React has not re-rendered yet.
 */
const pointer = (type: string, x: number, y: number) =>
  new PointerEventCtor(type, { pointerId: 1, clientX: x, clientY: y, bubbles: true, button: 0 });

const dispatch = (element: Element, type: string, x: number, y: number) => {
  act(() => {
    element.dispatchEvent(pointer(type, x, y));
  });
};

const press = (element: Element, x: number, y: number) =>
  fireEvent.pointerDown(element, { pointerId: 1, clientX: x, clientY: y, button: 0 });

const positionOf = (layers: LayerEditorLayer[], id: string) =>
  layers.find((entry) => entry.id === id)?.position;

afterEach(cleanup);

describe('a press that never moves is not a drag', () => {
  it('selects without opening a history entry', () => {
    const { calls, frame } = renderStage();

    press(frame, 100, 100);
    dispatch(frame, 'pointerup', 100, 100);

    expect(calls.selections.at(-1)).toEqual(['a']);
    // The bug this pins: `onBegin` used to fire on pointer-down, so clicking ten layers
    // to look at them banked ten entries and Cmd+Z ten times changed nothing visible.
    expect(calls.begin).toBe(0);
    expect(calls.previews).toHaveLength(0);
  });

  it('ignores travel under the threshold', () => {
    const { calls, frame } = renderStage();

    press(frame, 100, 100);
    dispatch(frame, 'pointermove', 101, 101);
    dispatch(frame, 'pointerup', 101, 101);

    expect(calls.begin).toBe(0);
  });
});

describe('a drag moves the layer', () => {
  it('begins once and previews the move', () => {
    const { calls, frame } = renderStage();

    press(frame, 100, 100);
    dispatch(frame, 'pointermove', 140, 130);
    dispatch(frame, 'pointermove', 180, 160);
    dispatch(frame, 'pointerup', 180, 160);

    expect(calls.begin).toBe(1);
    expect(calls.previews.length).toBeGreaterThanOrEqual(2);
    // Deltas are measured from the ORIGINAL document each frame, not accumulated, so the
    // last preview is the whole gesture: (180,160) - (100,100) added to (100,100).
    expect(positionOf(calls.previews.at(-1) as LayerEditorLayer[], 'a')).toEqual({
      x: 180,
      y: 160,
    });
  });

  it('stops previewing once the pointer is released', () => {
    const { calls, frame } = renderStage();

    press(frame, 100, 100);
    dispatch(frame, 'pointermove', 150, 150);
    dispatch(frame, 'pointerup', 150, 150);
    const settled = calls.previews.length;

    dispatch(frame, 'pointermove', 300, 300);
    expect(calls.previews).toHaveLength(settled);
  });
});

describe('a gesture can be abandoned', () => {
  it('Escape mid-drag cancels it and detaches', () => {
    const { calls, frame } = renderStage();

    press(frame, 100, 100);
    dispatch(frame, 'pointermove', 150, 150);
    fireEvent.keyDown(window, { key: 'Escape' });

    expect(calls.cancel).toBe(1);

    const settled = calls.previews.length;
    dispatch(frame, 'pointermove', 300, 300);
    expect(calls.previews).toHaveLength(settled);
  });

  it('pointercancel cancels it — the touch case that used to strand the layer', () => {
    const { calls, frame } = renderStage();

    press(frame, 100, 100);
    dispatch(frame, 'pointermove', 150, 150);
    dispatch(frame, 'pointercancel', 150, 150);

    expect(calls.cancel).toBe(1);

    // Without this teardown the layer followed a pointer that never reported up again.
    const settled = calls.previews.length;
    dispatch(frame, 'pointermove', 400, 400);
    expect(calls.previews).toHaveLength(settled);
  });

  it('a press that never became a drag has nothing to cancel', () => {
    const { calls, frame } = renderStage();

    press(frame, 100, 100);
    fireEvent.keyDown(window, { key: 'Escape' });

    expect(calls.cancel).toBe(0);
  });
});

describe('selection', () => {
  it('clears when empty space is pressed', () => {
    const { calls, frame } = renderStage();

    press(frame, 400, 400);
    expect(calls.selections.at(-1)).toEqual([]);
  });

  it('a layer with no pixels does not swallow the click', () => {
    const under = layer('under');
    const over = layer('over');
    const { calls, frame } = renderStage({
      layers: [under, over],
      // `over` paints last and covers `under`, but its upstream node was disconnected so
      // it has no source. It used to hit-test anyway: an invisible rectangle eating every
      // click meant for the layer beneath it.
      sources: new Map([['under', 'blob:under']]),
      selectedIds: [],
    });

    press(frame, 100, 100);
    expect(calls.selections.at(-1)).toEqual(['under']);
  });
});

describe('zoom and pan', () => {
  /**
   * NOT COVERED HERE: ctrl/⌘+wheel zoom-at-cursor.
   *
   * happy-dom's `WheelEvent` does not implement `ctrlKey` — it reads `undefined` even on
   * a directly constructed event — so the pinch branch cannot be expressed in this
   * environment. The arithmetic under it is `panDeltaForZoom`, unit-tested in
   * frameModel.test.ts; the branch that routes a pinch into it is real Chrome's job and
   * belongs in the Playwright gesture bench. The keyboard path below drives the same
   * state, so a broken zoom reducer still fails here.
   */
  const zoomOf = (view: ReturnType<typeof renderStage>['view']) =>
    view.getByTestId('layer-zoom-readout').textContent;

  const zoomPercent = (view: ReturnType<typeof renderStage>['view']) =>
    Number.parseInt(zoomOf(view) as string, 10);

  it('starts fitted', () => {
    const { view } = renderStage();
    expect(zoomOf(view)).toBe('100%');
  });

  it('Cmd+= zooms in and Cmd+- zooms back out', () => {
    const { view } = renderStage();

    fireEvent.keyDown(window, { key: '=', metaKey: true });
    const zoomedIn = zoomPercent(view);
    expect(zoomedIn).toBeGreaterThan(100);

    fireEvent.keyDown(window, { key: '-', metaKey: true });
    expect(zoomPercent(view)).toBe(100);
  });

  it('a plain wheel pans instead of zooming — a scroll is not a zoom', () => {
    const { view, frame } = renderStage();
    fireEvent.wheel(frame, { deltaY: -240 });
    expect(zoomOf(view)).toBe('100%');
  });

  it('the readout is a Fit button, not a label', () => {
    const { view } = renderStage();

    fireEvent.keyDown(window, { key: '=', metaKey: true });
    fireEvent.keyDown(window, { key: '=', metaKey: true });
    expect(zoomOf(view)).not.toBe('100%');

    fireEvent.click(view.getByTestId('layer-zoom-readout'));
    expect(zoomOf(view)).toBe('100%');
  });

  it('Cmd+0 fits', () => {
    const { view } = renderStage();
    fireEvent.keyDown(window, { key: '=', metaKey: true });
    expect(zoomOf(view)).not.toBe('100%');

    fireEvent.keyDown(window, { key: '0', metaKey: true });
    expect(zoomOf(view)).toBe('100%');
  });

  it('a layer is still grabbable after zooming', () => {
    const { calls, frame, view } = renderStage({ selectedIds: [] });
    fireEvent.keyDown(window, { key: '=', metaKey: true });
    expect(zoomPercent(view)).toBeGreaterThan(100);

    // The hit test divides by the CURRENT scale, read from the frame's live rect. A
    // stale scale here is the classic symptom: the gizmo sits where the layer used to be.
    press(frame, 100, 100);
    expect(calls.selections.at(-1)).toEqual(['a']);
  });
});

describe('alignment snapping reaches a real drag', () => {
  // The frame is 512x512 and the layer is 100x100 anchored at its centre, so its bounds
  // are position +/- 50. Dragging its centre to (259,100) puts the layer's centre 3px off
  // the frame's centre line at 256 — inside the 6px threshold.
  const nearCentre = { from: { x: 100, y: 100 }, to: { x: 259, y: 100 } };

  it('pulls the layer onto the frame centre line and draws the guide', () => {
    const { calls, frame, view } = renderStage({ snapEnabled: true });

    press(frame, nearCentre.from.x, nearCentre.from.y);
    dispatch(frame, 'pointermove', nearCentre.to.x, nearCentre.to.y);

    expect(positionOf(calls.previews.at(-1) as LayerEditorLayer[], 'a')).toEqual({
      x: 256,
      y: 100,
    });
    expect(view.queryAllByTestId('layer-guide-x')).toHaveLength(1);
  });

  it('FALSIFIER: with snapping off the same drag lands 3px short', () => {
    const { calls, frame, view } = renderStage({ snapEnabled: false });

    press(frame, nearCentre.from.x, nearCentre.from.y);
    dispatch(frame, 'pointermove', nearCentre.to.x, nearCentre.to.y);

    expect(positionOf(calls.previews.at(-1) as LayerEditorLayer[], 'a')).toEqual({
      x: 259,
      y: 100,
    });
    expect(view.queryAllByTestId('layer-guide-x')).toHaveLength(0);
  });

  it('clears the guide when the gesture ends', () => {
    const { frame, view } = renderStage({ snapEnabled: true });

    press(frame, nearCentre.from.x, nearCentre.from.y);
    dispatch(frame, 'pointermove', nearCentre.to.x, nearCentre.to.y);
    expect(view.queryAllByTestId('layer-guide-x')).toHaveLength(1);

    dispatch(frame, 'pointerup', nearCentre.to.x, nearCentre.to.y);
    expect(view.queryAllByTestId('layer-guide-x')).toHaveLength(0);
  });

  it('shows the position readout while dragging, and drops it after', () => {
    const { frame, view } = renderStage({ snapEnabled: true });

    press(frame, 100, 100);
    dispatch(frame, 'pointermove', 180, 160);
    expect(view.getByTestId('layer-readout').textContent).toContain('X 130');

    dispatch(frame, 'pointerup', 180, 160);
    expect(view.queryByTestId('layer-readout')).toBeNull();
  });
});

describe('alt-drag leaves the original behind', () => {
  const altPress = (element: Element, x: number, y: number) =>
    fireEvent.pointerDown(element, {
      pointerId: 1,
      clientX: x,
      clientY: y,
      button: 0,
      altKey: true,
    });

  it('drags a copy and keeps the original where it was', () => {
    const { calls, frame } = renderStage({ selectedIds: ['a'] });

    altPress(frame, 100, 100);
    dispatch(frame, 'pointermove', 200, 100);

    const preview = calls.previews.at(-1) as LayerEditorLayer[];
    expect(preview).toHaveLength(2);

    // The original has not moved...
    expect(positionOf(preview, 'a')).toEqual({ x: 100, y: 100 });
    // ...and the copy — a different id, directly above it — carries the drag.
    const copy = preview.find((entry) => entry.id !== 'a');
    expect(copy).toBeDefined();
    expect(copy?.position).toEqual({ x: 200, y: 100 });
    expect(calls.selections.at(-1)).toEqual([copy?.id]);
  });

  it('is ONE undo step for the copy and its move together', () => {
    const { calls, frame } = renderStage({ selectedIds: ['a'] });

    altPress(frame, 100, 100);
    dispatch(frame, 'pointermove', 200, 100);
    dispatch(frame, 'pointerup', 200, 100);

    // `begin` banks the document WITHOUT the copy, so a single Cmd+Z takes back both.
    expect(calls.begin).toBe(1);
  });

  it('a plain drag still moves the original and adds nothing', () => {
    const { calls, frame } = renderStage({ selectedIds: ['a'] });

    press(frame, 100, 100);
    dispatch(frame, 'pointermove', 200, 100);

    const preview = calls.previews.at(-1) as LayerEditorLayer[];
    expect(preview).toHaveLength(1);
    expect(positionOf(preview, 'a')).toEqual({ x: 200, y: 100 });
  });
});

describe('marquee selection', () => {
  // 'a' is at (100,100) so its quad is 50..150; 'far' is at (400,400), quad 350..450.
  const spread = () => [layer('a'), layer('far', { position: { x: 400, y: 400 } })];

  it('rubber-bands from empty space and catches what it touches', () => {
    const { calls, frame, view } = renderStage({ layers: spread(), selectedIds: [] });

    press(frame, 20, 20);
    dispatch(frame, 'pointermove', 200, 200);

    expect(view.queryByTestId('layer-marquee')).not.toBeNull();
    expect(calls.selections.at(-1)).toEqual(['a']);
  });

  it('catches both when it is dragged across both', () => {
    const { calls, frame } = renderStage({ layers: spread(), selectedIds: [] });

    press(frame, 20, 20);
    dispatch(frame, 'pointermove', 480, 480);

    expect(calls.selections.at(-1)).toEqual(['a', 'far']);
  });

  it('disappears when the drag ends, and the selection stays', () => {
    const { calls, frame, view } = renderStage({ layers: spread(), selectedIds: [] });

    press(frame, 20, 20);
    dispatch(frame, 'pointermove', 200, 200);
    dispatch(frame, 'pointerup', 200, 200);

    expect(view.queryByTestId('layer-marquee')).toBeNull();
    expect(calls.selections.at(-1)).toEqual(['a']);
  });

  it('a bare click on empty space still just deselects', () => {
    const { calls, frame, view } = renderStage({ layers: spread(), selectedIds: ['a'] });

    press(frame, 20, 20);
    dispatch(frame, 'pointerup', 20, 20);

    expect(calls.selections.at(-1)).toEqual([]);
    expect(view.queryByTestId('layer-marquee')).toBeNull();
  });
});

describe('a multi-selection transforms as one box', () => {
  const spread = () => [layer('a'), layer('b', { position: { x: 400, y: 400 } })];

  it('shows a group box with four corner handles — and no edge handles', () => {
    const { view } = renderStage({ layers: spread(), selectedIds: ['a', 'b'] });

    expect(view.queryByTestId('layer-group-box')).not.toBeNull();
    for (const corner of ['nw', 'ne', 'se', 'sw']) {
      expect(view.queryByTestId(`layer-group-resize-${corner}`)).not.toBeNull();
    }
    // Edge handles are deliberately absent: a non-uniform group scale cannot be
    // represented for a rotated member. See `scaleGroup`.
    for (const edge of ['n', 'e', 's', 'w']) {
      expect(view.queryByTestId(`layer-group-resize-${edge}`)).toBeNull();
    }
  });

  it('dragging a group corner scales every member', () => {
    const { calls, view } = renderStage({ layers: spread(), selectedIds: ['a', 'b'] });
    const handle = view.getByTestId('layer-group-resize-se');

    // Group bounds are 50..450. Dragging se from (450,450) to (850,850) doubles it.
    fireEvent.pointerDown(handle, { pointerId: 1, clientX: 450, clientY: 450, button: 0 });
    dispatch(handle, 'pointermove', 850, 850);

    const preview = calls.previews.at(-1) as LayerEditorLayer[];
    expect(preview.find((l) => l.id === 'a')?.scale).toEqual({ x: 2, y: 2 });
    expect(preview.find((l) => l.id === 'b')?.scale).toEqual({ x: 2, y: 2 });
  });

  it('a single selection keeps all eight handles and no group box', () => {
    const { view } = renderStage({ layers: spread(), selectedIds: ['a'] });

    expect(view.queryByTestId('layer-group-box')).toBeNull();
    expect(view.queryByTestId('layer-resize-n')).not.toBeNull();
    expect(view.queryByTestId('layer-resize-se')).not.toBeNull();
  });
});

describe('the gizmo is operable without a mouse', () => {
  it('exposes each handle as a labelled control', () => {
    const { view } = renderStage({ selectedIds: ['a'] });
    const handle = view.getByTestId('layer-resize-se');

    expect(handle.getAttribute('tabindex')).toBe('0');
    expect(handle.getAttribute('role')).toBe('button');
    expect(handle.getAttribute('aria-label')).toContain('bottom right');
  });

  it('an arrow key on a focused handle resizes the layer', () => {
    const { calls, view } = renderStage({ selectedIds: ['a'] });

    fireEvent.keyDown(view.getByTestId('layer-resize-se'), { key: 'ArrowRight' });

    expect(calls.begin).toBe(1);
    const next = (calls.previews.at(-1) as LayerEditorLayer[]).find((l) => l.id === 'a');
    // Resize was keyboard-impossible before: the only route to a size was typing a
    // percentage into the inspector.
    expect(next?.scale.x).toBeGreaterThan(1);
  });

  it('shift makes the step coarse', () => {
    const fine = renderStage({ selectedIds: ['a'] });
    fireEvent.keyDown(fine.view.getByTestId('layer-resize-se'), { key: 'ArrowRight' });
    const fineScale = (fine.calls.previews.at(-1) as LayerEditorLayer[])[0].scale.x;

    cleanup();

    const coarse = renderStage({ selectedIds: ['a'] });
    fireEvent.keyDown(coarse.view.getByTestId('layer-resize-se'), {
      key: 'ArrowRight',
      shiftKey: true,
    });
    const coarseScale = (coarse.calls.previews.at(-1) as LayerEditorLayer[])[0].scale.x;

    expect(coarseScale).toBeGreaterThan(fineScale);
  });

  it('brackets rotate from the grip', () => {
    const { calls, view } = renderStage({ selectedIds: ['a'] });

    fireEvent.keyDown(view.getByTestId('layer-rotate-handle'), { key: ']' });

    const next = (calls.previews.at(-1) as LayerEditorLayer[])[0];
    expect(next.rotation).toBeGreaterThan(0);

    fireEvent.keyDown(view.getByTestId('layer-rotate-handle'), { key: '[' });
    expect((calls.previews.at(-1) as LayerEditorLayer[])[0].rotation).toBeLessThan(0);
  });

  it('announces the selection once it is settled, and stays quiet mid-gesture', () => {
    const { frame, view } = renderStage({ selectedIds: ['a'] });
    expect(view.getByTestId('layer-announcement').textContent).toContain('x 100');

    press(frame, 100, 100);
    dispatch(frame, 'pointermove', 180, 160);
    // Sixty announcements a second is noise, not information.
    expect(view.getByTestId('layer-announcement').textContent).toBe('');
  });

  it('the stage names itself to assistive tech', () => {
    const { view } = renderStage();
    const stage = view.getByTestId('layer-stage');
    expect(stage.getAttribute('role')).toBe('application');
    expect(stage.getAttribute('aria-label')).toBe('Layer composition stage');
  });
});
