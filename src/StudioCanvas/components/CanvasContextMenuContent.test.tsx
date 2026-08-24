// The canvas menu's content is pure props — no store, no ReactFlowProvider. It only
// needs a ContextMenu root because Base UI's Popup reads the root's open state, so the
// wrapper here mirrors src/components/ui/context-menu.test.tsx. Submenu ROWS live behind
// a hover, so this pins the top-level items and the submenu triggers.
import { afterEach, describe, expect, it, mock } from 'bun:test';
import { cleanup, fireEvent, render } from '@testing-library/react';

import { ContextMenu, ContextMenuTrigger } from '@/components/ui/context-menu';
import { CanvasContextMenuContent } from './CanvasContextMenuContent';

afterEach(() => {
  cleanup();
});

function renderMenu(overrides: { hasSelection?: boolean } = {}) {
  const props = {
    addNodeAtPointer: mock(() => {}),
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

  // PINNED BUG (Radix leftover): the four `onSelect` items are inert under Base UI.
  // Base UI's Menu.Item has no `onSelect` prop — MenuItem.js spreads unknown props
  // straight onto its <div>, so React binds this to the DOM *text-selection* event and
  // a click never reaches the handler. Radix fired onSelect on activation; Base UI does
  // not. `Clear Canvas` uses onClick and works, which is the contrast below.
  it('does NOT open the load-workflow dialog when Load Workflow is clicked', () => {
    const { getByText, props } = renderMenu();

    fireEvent.click(getByText('Load Workflow'));

    expect(props.openLoadWorkflow).toHaveBeenCalledTimes(0);
  });

  it('leaves the other onSelect items inert too', () => {
    const { getByText, props } = renderMenu({ hasSelection: true });

    fireEvent.click(getByText('Import from Instagram'));
    fireEvent.click(getByText('Save selection as starter'));
    fireEvent.click(getByText('Enforce brand book on selection'));

    expect(props.openInstagram).toHaveBeenCalledTimes(0);
    expect(props.openSaveStarter).toHaveBeenCalledTimes(0);
    expect(props.enforceBrandBookOnSelection).toHaveBeenCalledTimes(0);
  });
});
