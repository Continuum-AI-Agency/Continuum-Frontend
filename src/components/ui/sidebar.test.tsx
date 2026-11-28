import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { act, cleanup, fireEvent, screen } from '@testing-library/react';
import * as React from 'react';
import { render } from '@/i18n/__tests__/render';

import {
  Sidebar,
  SidebarGroupAction,
  SidebarGroupLabel,
  SidebarMenuAction,
  SidebarMenuButton,
  SidebarMenuSubButton,
  SidebarProvider,
  useSidebar,
} from './sidebar';

// The Base UI migration rebuilt these five on `useRender`, which takes the ref as a
// parameter rather than a JSX prop. Dropping it compiles and renders fine, but every
// Base UI trigger (Menu, Tooltip, Popover) resolves its anchor element through that
// ref — so an anchorless trigger is how the brand switcher and the sidebar tooltips
// silently stopped working.
describe('sidebar primitives forward their ref', () => {
  // No global auto-cleanup in this suite; leaving trees mounted leaks into other files.
  afterEach(cleanup);

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

// Reported from an iPhone: the open sheet had no visible close button and no scrim,
// and picking a page left it covering the screen.
describe('mobile sidebar sheet', () => {
  const realMatchMedia = window.matchMedia;
  beforeEach(() => {
    window.matchMedia = ((query: string) => ({
      matches: query.includes('max-width'),
      media: query,
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
    })) as unknown as typeof window.matchMedia;
  });
  afterEach(() => {
    cleanup();
    window.matchMedia = realMatchMedia;
  });

  let sidebar: ReturnType<typeof useSidebar>;
  function Probe() {
    sidebar = useSidebar();
    return null;
  }

  function renderOpenSheet() {
    render(
      <SidebarProvider>
        <Probe />
        <Sidebar>
          <a href="#settings">Settings</a>
        </Sidebar>
      </SidebarProvider>,
    );
    act(() => sidebar.setOpenMobile(true));
  }

  it('starts closed', () => {
    render(
      <SidebarProvider>
        <Probe />
      </SidebarProvider>,
    );
    expect(sidebar.isMobile).toBe(true);
    expect(sidebar.openMobile).toBe(false);
  });

  it('shows a close button and a scrim', () => {
    renderOpenSheet();
    expect(document.querySelector('[data-sidebar="mobile-close"]')).not.toBeNull();
    expect(document.querySelector('[data-slot="sheet-overlay"]')).not.toBeNull();
  });

  it('the close button closes it', () => {
    renderOpenSheet();
    fireEvent.click(document.querySelector('[data-sidebar="mobile-close"]') as Element);
    expect(sidebar.openMobile).toBe(false);
  });

  it('picking a link closes it', () => {
    renderOpenSheet();
    fireEvent.click(screen.getByText('Settings'));
    expect(sidebar.openMobile).toBe(false);
  });
});
