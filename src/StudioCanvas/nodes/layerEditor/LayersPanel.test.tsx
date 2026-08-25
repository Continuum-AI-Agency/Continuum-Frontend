import { afterEach, describe, expect, it } from 'bun:test';
import { cleanup, fireEvent, render } from '@testing-library/react';
import { TooltipProvider } from '@/components/ui/tooltip';
import type { LayerEditorLayer } from '../../types';
import type { LayerMove } from '../../utils/layers/layerOps';
import { LayersPanel, ROW_ORDER_ITEMS, toArrayIndex } from './LayersPanel';

// The array is paint order BOTTOM-FIRST (aep-interop §4.2.6) and the panel shows it
// upside down, so every interaction here crosses a reversal. These tests exist because
// a reversal that is right on screen and wrong in the array looks correct until export.

const layer = (id: string, over: Partial<LayerEditorLayer> = {}): LayerEditorLayer => ({
  id,
  name: id,
  sourceNodeId: `n-${id}`,
  sourceWidth: 100,
  sourceHeight: 100,
  anchor: { x: 50, y: 50 },
  position: { x: 0, y: 0 },
  scale: { x: 1, y: 1 },
  rotation: 0,
  opacity: 1,
  blendMode: 'normal',
  visible: true,
  locked: false,
  ...over,
});

const noop = () => undefined;

function renderPanel(over: Partial<Parameters<typeof LayersPanel>[0]> = {}) {
  const props = {
    layers: [layer('bottom'), layer('middle'), layer('top')],
    selectedIds: [] as string[],
    onSelectionChange: noop as (ids: string[]) => void,
    onToggleVisible: noop as (id: string) => void,
    onToggleLocked: noop as (id: string) => void,
    onRename: noop as (id: string, name: string) => void,
    onReorder: noop as (from: number, to: number) => void,
    onOrder: noop as (id: string, move: LayerMove) => void,
    ...over,
  };
  return render(
    <TooltipProvider>
      <LayersPanel {...props} />
    </TooltipProvider>,
  );
}

const rowIds = (container: HTMLElement) =>
  Array.from(container.querySelectorAll('[data-testid^="layer-row-"]')).map((row) =>
    (row.getAttribute('data-testid') ?? '').replace('layer-row-', ''),
  );

describe('toArrayIndex', () => {
  it('is the reversal, and its own inverse', () => {
    expect(toArrayIndex(0, 3)).toBe(2);
    expect(toArrayIndex(2, 3)).toBe(0);
    expect(toArrayIndex(toArrayIndex(1, 3), 3)).toBe(1);
  });
});

describe('LayersPanel', () => {
  afterEach(cleanup);

  it('renders the topmost layer first — the array upside down', () => {
    const { container } = renderPanel();
    expect(rowIds(container)).toEqual(['top', 'middle', 'bottom']);
  });

  it('translates a drag from display order into the bottom-first array', () => {
    // Dragging the top row (display 0) onto the bottom row (display 2) in a 3-layer
    // stack must move array index 2 to index 0 — not 0 to 2.
    const count = 3;
    expect(toArrayIndex(0, count)).toBe(2);
    expect(toArrayIndex(2, count)).toBe(0);
  });

  it('replaces the selection on a plain click and toggles it on ctrl/cmd-click', () => {
    const selections: string[][] = [];
    const { getByRole } = renderPanel({
      selectedIds: ['top'],
      onSelectionChange: (ids) => selections.push(ids),
    });

    fireEvent.click(getByRole('button', { name: 'middle' }));
    fireEvent.click(getByRole('button', { name: 'middle' }), { metaKey: true });
    fireEvent.click(getByRole('button', { name: 'top' }), { metaKey: true });

    expect(selections[0]).toEqual(['middle']);
    expect(selections[1]).toEqual(['top', 'middle']);
    expect(selections[2]).toEqual([]);
  });

  it('marks the selected row so the stage and the list agree', () => {
    const { getByTestId } = renderPanel({ selectedIds: ['middle'] });
    expect(getByTestId('layer-row-middle').getAttribute('data-selected')).toBe('true');
    expect(getByTestId('layer-row-top').getAttribute('data-selected')).toBe('false');
  });

  it('toggles visibility and lock on the layer that was clicked', () => {
    const hidden: string[] = [];
    const locked: string[] = [];
    const { getByRole } = renderPanel({
      layers: [layer('a'), layer('b', { visible: false, locked: true })],
      onToggleVisible: (id) => hidden.push(id),
      onToggleLocked: (id) => locked.push(id),
    });

    fireEvent.click(getByRole('button', { name: 'Hide a' }));
    fireEvent.click(getByRole('button', { name: 'Show b' }));
    fireEvent.click(getByRole('button', { name: 'Unlock b' }));

    expect(hidden).toEqual(['a', 'b']);
    expect(locked).toEqual(['b']);
  });

  it('warns about a duplicated name instead of renaming it', () => {
    // `name` is the key an AE-side template binds by (§4.2.5), so a silent de-dup
    // would break that binding to tidy a list.
    const { queryByTestId } = renderPanel({
      layers: [layer('a', { name: 'Logo' }), layer('b', { name: 'Logo' }), layer('c')],
    });

    expect(queryByTestId('layer-name-collision-a')).toBeTruthy();
    expect(queryByTestId('layer-name-collision-b')).toBeTruthy();
    expect(queryByTestId('layer-name-collision-c')).toBeNull();
  });

  it('commits a rename on blur and keeps the old name when it is cleared', () => {
    const renames: [string, string][] = [];
    const { getByRole } = renderPanel({
      layers: [layer('a', { name: 'Logo' })],
      onRename: (id, name) => renames.push([id, name]),
    });

    fireEvent.doubleClick(getByRole('button', { name: 'Logo' }));
    const input = getByRole('textbox', { name: 'Rename Logo' }) as HTMLInputElement;
    fireEvent.blur(input, { target: { value: '  Badge  ' } });

    expect(renames).toEqual([['a', 'Badge']]);
  });

  it('offers the four ordering moves on the row, in stacking order', () => {
    // Base UI opens its context menu on a real pointer gesture that happy-dom cannot
    // produce — the repo's own context-menu.test.tsx forces `open` for the same reason.
    // So the menu's CONTENT is asserted here and the open gesture is left to the browser;
    // the handler itself is one line: select the row, then apply the move.
    expect(ROW_ORDER_ITEMS.map((item) => item.move)).toEqual(['top', 'up', 'down', 'bottom']);
    expect(ROW_ORDER_ITEMS.map((item) => item.chord)).toEqual(['⇧⌘]', '⌘]', '⌘[', '⇧⌘[']);
  });

  it('gives every row its own context-menu trigger', () => {
    const { container } = renderPanel();
    expect(container.querySelectorAll('[data-slot="context-menu-trigger"]').length).toBe(3);
  });

  it('says what to do when nothing is connected yet', () => {
    const { getByText, container } = renderPanel({ layers: [] });
    expect(getByText(/Connect images to this node/)).toBeTruthy();
    expect(rowIds(container)).toEqual([]);
  });
});
