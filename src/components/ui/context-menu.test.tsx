import { describe, expect, it } from 'bun:test';
import { render } from '@testing-library/react';

import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuLabel,
  ContextMenuPortal,
  ContextMenuTrigger,
} from './context-menu';

// Base UI's GroupLabel reads MenuGroupContext and THROWS when it is absent, so a
// bare <ContextMenuLabel> takes the whole menu down the moment it opens. Radix
// tolerated it, and 24 call sites were written against Radix — every StudioCanvas
// node menu, the planner menus, the optimizer adset menu. This asserts the label
// can stand alone, because that is how all of them use it.
describe('ContextMenuLabel', () => {
  it('renders outside an explicit group without throwing', () => {
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
  });

  it('still labels the menu it belongs to', () => {
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
  });
});
