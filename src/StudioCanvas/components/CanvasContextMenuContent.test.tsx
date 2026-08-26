// cmdk needs `window.SyntaxError` (it constructs one while parsing its own value keys) and
// happy-dom does not put it on `window`. Same shim as command.filter.test.tsx.
(globalThis as unknown as { window: { SyntaxError: typeof SyntaxError } }).window.SyntaxError =
  SyntaxError;

// The canvas menu's content is pure props — no store, no ReactFlowProvider. It only
// needs a ContextMenu root because Base UI's Popup reads the root's open state, so the
// wrapper here mirrors src/components/ui/context-menu.test.tsx. Submenu rows live behind
// a hover, so this pins the top-level items and the triggers; Add Node's own contract is
// AddNodeCommandPalette.test.tsx.
import { afterEach, describe, expect, it, mock } from 'bun:test';
import { cleanup, fireEvent, render } from '@testing-library/react';

import { ContextMenu, ContextMenuTrigger } from '@/components/ui/context-menu';
import { ADD_NODE_GROUPS } from './addNodeCatalog';
import { CanvasContextMenuContent } from './CanvasContextMenuContent';

afterEach(() => {
  cleanup();
});

function renderMenu(overrides: { hasSelection?: boolean } = {}) {
  const props = {
    addNode: mock(() => {}),
    onAddNodeOpenChange: mock(() => {}),
    openLoadWorkflow: mock(() => {}),
    openInstagram: mock(() => {}),
    openSaveStarter: mock(() => {}),
    enforceBrandBookOnSelection: mock(() => {}),
    clearCanvas: mock(() => {}),
    hasSelection: overrides.hasSelection ?? false,
    interactionMode: 'select' as const,
    setInteractionMode: mock(() => {}),
    zoomIn: mock(() => {}),
    zoomOut: mock(() => {}),
    fitView: mock(() => {}),
  };

  const view = render(
    <ContextMenu open>
      <ContextMenuTrigger>canvas</ContextMenuTrigger>
      <CanvasContextMenuContent {...props} />
    </ContextMenu>,
  );

  return { ...view, props };
}

const TOP_LEVEL_LABELS = [
  'Canvas Actions',
  'Add Node',
  'Load Workflow',
  'Import from Instagram',
  'Save selection as starter',
  'Enforce brand book on selection',
  'View and Interaction',
  'Clear Canvas',
];

describe('CanvasContextMenuContent', () => {
  it('renders every top-level entry by its visible label', () => {
    const { getByText } = renderMenu();

    for (const label of TOP_LEVEL_LABELS) {
      expect(getByText(label)).toBeDefined();
    }
  });

  it('disables the selection-only items when nothing is selected', () => {
    const { getByText } = renderMenu({ hasSelection: false });

    for (const label of ['Save selection as starter', 'Enforce brand book on selection']) {
      const item = getByText(label).closest('[role="menuitem"]');
      expect(item).not.toBeNull();
      expect(item?.getAttribute('aria-disabled')).toBe('true');
    }
  });

  it('enables the selection-only items when a selection exists', () => {
    const { getByText } = renderMenu({ hasSelection: true });

    for (const label of ['Save selection as starter', 'Enforce brand book on selection']) {
      const item = getByText(label).closest('[role="menuitem"]');
      expect(item).not.toBeNull();
      expect(item?.getAttribute('aria-disabled')).not.toBe('true');
    }
  });

  it('clears the canvas when Clear Canvas is clicked', () => {
    const { getByText, props } = renderMenu();

    fireEvent.click(getByText('Clear Canvas'));

    expect(props.clearCanvas).toHaveBeenCalledTimes(1);
  });

  // Add Node is a submenu again — the hover tree the product owner asked back for — with
  // the search box on top of it. Enter on the trigger is the deterministic way to open it
  // here; the browser opens it on hover (studio-node-palette-bench proves that path).
  it('opens Add Node as a submenu holding the search box and one category submenu per group', () => {
    const { getByText, getByTestId, props } = renderMenu();
    const trigger = getByText('Add Node').closest('[data-slot]');

    expect(trigger?.getAttribute('data-slot')).toBe('context-menu-sub-trigger');

    fireEvent.keyDown(getByText('Add Node'), { key: 'Enter' });

    expect(props.onAddNodeOpenChange).toHaveBeenCalledWith(true);
    const palette = getByTestId('add-node-palette');
    expect(palette.querySelector('[data-testid="add-node-palette-input"]')).not.toBeNull();
    const categories = Array.from(
      palette.querySelectorAll('[data-slot="context-menu-sub-trigger"]'),
    ).map((el) => el.textContent?.trim());
    expect(categories).toEqual(ADD_NODE_GROUPS.map((section) => section.label));
  });

  it('adds the node a category row is clicked for, with its model', () => {
    const { getByText, props } = renderMenu();

    fireEvent.keyDown(getByText('Add Node'), { key: 'Enter' });
    fireEvent.keyDown(getByText('Video'), { key: 'Enter' });
    fireEvent.click(getByText('Pixverse V6'));

    expect(props.addNode).toHaveBeenCalledTimes(1);
    expect(props.addNode.mock.calls[0]).toEqual(['videoGen', { model: 'pixverse-v6' }]);
  });

  // WAS A LIVE BUG (Radix leftover): Base UI's Menu.Item has no `onSelect`, so all four of
  // these were inert in production — React bound the prop to the DOM text-selection event
  // and a click never reached the handler. The fix is in the shared ui/context-menu
  // wrapper, which now translates onSelect to onClick; this is the canvas-side proof.
  it('opens the load-workflow dialog when Load Workflow is clicked', () => {
    const { getByText, props } = renderMenu();

    fireEvent.click(getByText('Load Workflow'));

    expect(props.openLoadWorkflow).toHaveBeenCalledTimes(1);
  });

  it('fires the other onSelect items too', () => {
    const { getByText, props } = renderMenu({ hasSelection: true });

    fireEvent.click(getByText('Import from Instagram'));
    fireEvent.click(getByText('Save selection as starter'));
    fireEvent.click(getByText('Enforce brand book on selection'));

    expect(props.openInstagram).toHaveBeenCalledTimes(1);
    expect(props.openSaveStarter).toHaveBeenCalledTimes(1);
    expect(props.enforceBrandBookOnSelection).toHaveBeenCalledTimes(1);
  });

  it('leaves the selection-only items inert while nothing is selected', () => {
    const { getByText, props } = renderMenu({ hasSelection: false });

    fireEvent.click(getByText('Save selection as starter'));
    fireEvent.click(getByText('Enforce brand book on selection'));

    expect(props.openSaveStarter).toHaveBeenCalledTimes(0);
    expect(props.enforceBrandBookOnSelection).toHaveBeenCalledTimes(0);
  });
});
