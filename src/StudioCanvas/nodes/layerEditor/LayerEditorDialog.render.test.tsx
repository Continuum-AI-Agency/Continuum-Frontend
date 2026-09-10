import { afterEach, describe, expect, it, mock } from 'bun:test';
import { act, cleanup, fireEvent, render } from '@testing-library/react';
import type { LayerEditorLayer } from '../../types';

/**
 * What the dialog hands the layers panel while a layer is being dragged.
 *
 * A drag dispatches one `preview` per pointer sample and re-renders the dialog. The panel
 * is the expensive child — N `useSortable` rows in a `DndContext`, each with a ContextMenu
 * and a Tooltip — so what matters is whether any of ITS inputs actually change. Render
 * COUNTS were the obvious thing to assert and are the wrong thing: a stubbed panel is not
 * memoised, so it re-renders with its parent no matter how disciplined the props are, and
 * the number says nothing.
 *
 * So the props themselves are captured. This caught a real regression: the source-URL map
 * was being rebuilt — and every stored asset re-signed — on every pointer sample, because
 * its effect was keyed on `doc.layers`, which is necessarily a new array whenever a layer
 * moves.
 */

interface PanelProps {
  layers: readonly LayerEditorLayer[];
  sources: ReadonlyMap<string, string>;
  selectedIds: readonly string[];
}

const seen: PanelProps[] = [];

mock.module('./LayersPanel', () => ({
  LayersPanel: (props: PanelProps) => {
    seen.push(props);
    return null;
  },
  toArrayIndex: (displayIndex: number, count: number) => count - 1 - displayIndex,
  ROW_ORDER_ITEMS: [],
}));

mock.module('./LayerInspector', () => ({ LayerInspector: () => null }));

const { LayerEditorDialog } = await import('./LayerEditorDialog');

const layer = (id: string, x = 100, y = 100): LayerEditorLayer => ({
  id,
  name: id,
  sourceNodeId: `n-${id}`,
  sourceWidth: 100,
  sourceHeight: 100,
  anchor: { x: 50, y: 50 },
  position: { x, y },
  scale: { x: 1, y: 1 },
  rotation: 0,
  opacity: 1,
  blendMode: 'normal',
  visible: true,
  locked: false,
});

const PointerEventCtor = (window as unknown as { PointerEvent: typeof PointerEvent }).PointerEvent;

function open() {
  seen.length = 0;
  const view = render(
    <LayerEditorDialog
      open
      onOpenChange={() => undefined}
      frame={{ width: 512, height: 512 }}
      // Placed apart on purpose: stacked at the same point, `layerAtPoint` picks the
      // topmost and the drag below would move 'b' while the assertion watched 'a'.
      layers={[layer('a', 100, 100), layer('b', 380, 380)]}
      sources={[
        { nodeId: 'n-a', ref: 'blob:a', name: 'a' },
        { nodeId: 'n-b', ref: 'blob:b', name: 'b' },
      ]}
      onPersist={() => undefined}
      onCompose={async () => undefined}
    />,
  );
  return { view, frame: view.getByTestId('layer-frame') };
}

/** Press first: that selects, which legitimately changes the panel's props exactly once. */
const pressLayer = (frame: Element) =>
  fireEvent.pointerDown(frame, { pointerId: 1, clientX: 100, clientY: 100, button: 0 });

const moveBy = (frame: Element, samples: number) => {
  for (let step = 1; step <= samples; step += 1) {
    act(() => {
      frame.dispatchEvent(
        new PointerEventCtor('pointermove', {
          pointerId: 1,
          clientX: 100 + step * 4,
          clientY: 100,
          bubbles: true,
        }),
      );
    });
  }
};

const drag = (frame: Element, samples: number) => {
  pressLayer(frame);
  moveBy(frame, samples);
};

afterEach(cleanup);

describe('a drag leaves the layers panel nothing to do', () => {
  it('keeps handing it the SAME source map', () => {
    const { frame } = open();
    pressLayer(frame);
    const before = seen.at(-1)?.sources;

    moveBy(frame, 20);

    // One identity across the whole gesture. A new Map per sample was rebuilding the
    // wired half and re-signing every stored asset, sixty times a second.
    expect(seen.at(-1)?.sources).toBe(before);
  });

  it('changes nothing the panel actually renders', () => {
    const { frame } = open();
    // Snapshotted AFTER the press: selecting the layer is a real change the panel must
    // see. What must not change is anything during the twenty samples that follow.
    pressLayer(frame);
    const before = seen.at(-1) as PanelProps;

    moveBy(frame, 20);
    const after = seen.at(-1) as PanelProps;

    const shown = (props: PanelProps) =>
      props.layers.map((entry) => [entry.id, entry.name, entry.visible, entry.locked].join('|'));
    expect(shown(after)).toEqual(shown(before));
    expect([...after.selectedIds]).toEqual([...before.selectedIds]);
  });

  it('FALSIFIER: the drag really did move a layer', () => {
    const { view, frame } = open();

    drag(frame, 10);

    const moved = view
      .getByTestId('layer-frame')
      .querySelector('img[data-layer-id="a"]') as HTMLElement | null;
    expect(moved?.style.transform ?? '').toContain('translate(140px');
  });
});

describe('the Library picker is reachable from Add layer', () => {
  const openWithBrand = (brandId?: string) => {
    seen.length = 0;
    return render(
      <LayerEditorDialog
        open
        onOpenChange={() => undefined}
        frame={{ width: 512, height: 512 }}
        layers={[layer('a', 100, 100)]}
        brandId={brandId}
        sources={[{ nodeId: 'n-a', ref: 'blob:a', name: 'a' }]}
        onPersist={() => undefined}
        onCompose={async () => undefined}
      />,
    );
  };

  it('offers both routes into a layer, and opens the picker', async () => {
    const view = openWithBrand('brand-1');

    fireEvent.click(view.getByRole('button', { name: 'Add layer' }));
    expect(await view.findByText('Upload an image…')).toBeDefined();
    const fromLibrary = await view.findByText('From the Library…');

    fireEvent.click(fromLibrary);
    // The picker is controlled by the editor: its own trigger button belongs to the
    // Library's media bin, not to this header.
    expect(await view.findByText('Add an image from the Library')).toBeDefined();
    // Narrowed to images — a stills compositor cannot place a clip.
    expect(view.queryByText('Add media from the Library')).toBeNull();
  });

  it('hides the Library route with no brand — uploads are stored per brand', async () => {
    const view = openWithBrand(undefined);

    fireEvent.click(view.getByRole('button', { name: 'Add layer' }));
    expect(await view.findByText('Upload an image…')).toBeDefined();
    expect(view.queryByText('From the Library…')).toBeNull();
  });
});
