import { describe, expect, it } from 'bun:test';
import { render } from '@testing-library/react';
import * as React from 'react';

import {
  SidebarGroupAction,
  SidebarGroupLabel,
  SidebarMenuAction,
  SidebarMenuButton,
  SidebarMenuSubButton,
  SidebarProvider,
} from './sidebar';

// The Base UI migration rebuilt these five on `useRender`, which takes the ref as a
// parameter rather than a JSX prop. Dropping it compiles and renders fine, but every
// Base UI trigger (Menu, Tooltip, Popover) resolves its anchor element through that
// ref — so an anchorless trigger is how the brand switcher and the sidebar tooltips
// silently stopped working.
describe('sidebar primitives forward their ref', () => {
  const cases: Array<[string, (ref: React.Ref<never>) => React.ReactElement]> = [
    ['SidebarMenuButton', (ref) => <SidebarMenuButton ref={ref}>Brand</SidebarMenuButton>],
    ['SidebarMenuAction', (ref) => <SidebarMenuAction ref={ref} />],
    ['SidebarMenuSubButton', (ref) => <SidebarMenuSubButton ref={ref} />],
    ['SidebarGroupLabel', (ref) => <SidebarGroupLabel ref={ref} />],
    ['SidebarGroupAction', (ref) => <SidebarGroupAction ref={ref} />],
  ];

  for (const [name, renderWithRef] of cases) {
    it(`${name} attaches the forwarded ref to its element`, () => {
      const ref = React.createRef<HTMLElement>();

      render(<SidebarProvider>{renderWithRef(ref as React.Ref<never>)}</SidebarProvider>);

      expect(ref.current).not.toBeNull();
      expect(ref.current?.tagName).toBeTruthy();
    });
  }
});
