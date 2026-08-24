import { afterEach, describe, expect, it, mock } from 'bun:test';
import { cleanup, fireEvent, render } from '@testing-library/react';

import {
  ContextMenu,
  ContextMenuCheckboxItem,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuLabel,
  ContextMenuPortal,
  ContextMenuTrigger,
} from './context-menu';

afterEach(cleanup);

// Base UI mounts a portalled positioner per render; on a machine running several
// benches at once the first one in a file can take longer than bun's 5s default.
const RENDER_TIMEOUT_MS = 30_000;

// Base UI's GroupLabel reads MenuGroupContext and THROWS when it is absent, so a
// bare <ContextMenuLabel> takes the whole menu down the moment it opens. Radix
// tolerated it, and 24 call sites were written against Radix — every StudioCanvas
// node menu, the planner menus, the optimizer adset menu. This asserts the label
// can stand alone, because that is how all of them use it.
describe('ContextMenuLabel', () => {
  it(
    'renders outside an explicit group without throwing',
    () => {
      expect(() =>
        render(
          <ContextMenu open>
            <ContextMenuTrigger>open me</ContextMenuTrigger>
            <ContextMenuPortal>
              <ContextMenuContent>
                <ContextMenuLabel>Image Generator</ContextMenuLabel>
                <ContextMenuItem>Run Node</ContextMenuItem>
              </ContextMenuContent>
            </ContextMenuPortal>
          </ContextMenu>,
        ),
      ).not.toThrow();
    },
    RENDER_TIMEOUT_MS,
  );

  it(
    'still labels the menu it belongs to',
    () => {
      const { getByText } = render(
        <ContextMenu open>
          <ContextMenuTrigger>open me</ContextMenuTrigger>
          <ContextMenuPortal>
            <ContextMenuContent>
              <ContextMenuLabel>Image Generator</ContextMenuLabel>
              <ContextMenuItem>Run Node</ContextMenuItem>
            </ContextMenuContent>
          </ContextMenuPortal>
        </ContextMenu>,
      );

      expect(getByText('Image Generator')).toBeDefined();
    },
    RENDER_TIMEOUT_MS,
  );
});

// Base UI's Menu.Item activates on `onClick` and has no `onSelect` at all. A `<div>` DOES
// have a DOM text-selection event of that name, so React accepted the prop, TypeScript
// accepted the prop, the item rendered — and the handler never ran. That shipped: Load
// Workflow, Import from Instagram, Save selection as starter and Enforce brand book were
// all dead in production, along with ~60 sibling call sites written the same way.
//
// The wrapper translates onSelect to onClick. These tests fail the moment it stops.
describe('item activation', () => {
  function renderItem(props: Record<string, unknown>, label = 'Do the thing') {
    return render(
      <ContextMenu open>
        <ContextMenuTrigger>open me</ContextMenuTrigger>
        <ContextMenuPortal>
          <ContextMenuContent>
            <ContextMenuItem {...props}>{label}</ContextMenuItem>
          </ContextMenuContent>
        </ContextMenuPortal>
      </ContextMenu>,
    );
  }

  it(
    'fires onSelect when the item is clicked',
    () => {
      const onSelect = mock(() => {});
      const { getByText } = renderItem({ onSelect });

      fireEvent.click(getByText('Do the thing'));

      expect(onSelect).toHaveBeenCalledTimes(1);
    },
    RENDER_TIMEOUT_MS,
  );

  it(
    'still fires onClick',
    () => {
      const onClick = mock(() => {});
      const { getByText } = renderItem({ onClick });

      fireEvent.click(getByText('Do the thing'));

      expect(onClick).toHaveBeenCalledTimes(1);
    },
    RENDER_TIMEOUT_MS,
  );

  it(
    'fires both when a call site passes both',
    () => {
      const onClick = mock(() => {});
      const onSelect = mock(() => {});
      const { getByText } = renderItem({ onClick, onSelect });

      fireEvent.click(getByText('Do the thing'));

      expect(onClick).toHaveBeenCalledTimes(1);
      expect(onSelect).toHaveBeenCalledTimes(1);
    },
    RENDER_TIMEOUT_MS,
  );

  it(
    'fires neither on a disabled item',
    () => {
      const onClick = mock(() => {});
      const onSelect = mock(() => {});
      const { getByText } = renderItem({ onClick, onSelect, disabled: true });

      fireEvent.click(getByText('Do the thing'));

      expect(onClick).toHaveBeenCalledTimes(0);
      expect(onSelect).toHaveBeenCalledTimes(0);
    },
    RENDER_TIMEOUT_MS,
  );

  it(
    'translates onSelect on a checkbox item too',
    () => {
      const onSelect = mock(() => {});
      const { getByText } = render(
        <ContextMenu open>
          <ContextMenuTrigger>open me</ContextMenuTrigger>
          <ContextMenuPortal>
            <ContextMenuContent>
              <ContextMenuCheckboxItem checked={false} onSelect={onSelect}>
                Pan Mode
              </ContextMenuCheckboxItem>
            </ContextMenuContent>
          </ContextMenuPortal>
        </ContextMenu>,
      );

      fireEvent.click(getByText('Pan Mode'));

      expect(onSelect).toHaveBeenCalledTimes(1);
    },
    RENDER_TIMEOUT_MS,
  );
});
