import { afterEach, describe, expect, it } from 'bun:test';
import { cleanup, fireEvent, waitFor } from '@testing-library/react';
import { render } from '@/i18n/__tests__/render';

import { Sidebar, SidebarProvider } from './sidebar';

// PP-DT-H-sidebar-hover-pushes-page (deep test 2026-10-31, lane H): hovering the collapsed app
// sidebar moved the whole page right (content x 43.5 -> 217.5). The panel expands over the page on
// hover, as designed, but the spacer that reserves the sidebar's width and --app-sidebar-width
// (what every fixed full-height surface offsets by) followed the hover too. They follow the pinned
// state only: the page moves when the sidebar is pinned open, never on a hover. It added +0.30 to
// +1.40 to lane E's CLS readings and moved a pill out from under lane C's pointer.

afterEach(cleanup);

function renderShell(defaultOpen: boolean) {
  const view = render(
    <SidebarProvider defaultOpen={defaultOpen}>
      <Sidebar collapsible="icon">
        <nav>Home</nav>
      </Sidebar>
      <main>page</main>
    </SidebarProvider>,
  );
  const group = view.container.querySelector('[data-side]');
  const panel = view.container.querySelector('[data-sidebar="sidebar"]')?.parentElement;
  const spacer = group?.firstElementChild;
  if (!(group instanceof HTMLElement) || !(panel instanceof HTMLElement)) {
    throw new Error('the sidebar did not render its group and panel');
  }
  if (!(spacer instanceof HTMLElement)) throw new Error('the sidebar rendered no spacer');
  return { group, panel, spacer };
}

const reservedWidth = () => document.documentElement.style.getPropertyValue('--app-sidebar-width');

describe('hovering the collapsed sidebar', () => {
  it('expands the panel over the page and leaves the page where it is', async () => {
    const { group, panel, spacer } = renderShell(false);
    const before = reservedWidth();
    expect(before).toBe('var(--shell-sidebar-w-icon)');

    fireEvent.mouseEnter(panel);
    await waitFor(() => expect(group.getAttribute('data-state')).toBe('expanded'));

    expect(reservedWidth()).toBe(before);
    expect(group.getAttribute('data-pinned')).toBe('collapsed');
    // The spacer's expanded width answers to the pinned state, never to the hover one.
    expect(spacer.className).toContain('group-data-[pinned=expanded]:w-(--sidebar-width)');
    expect(spacer.className).not.toContain('group-data-[state=expanded]:w-(--sidebar-width)');
  });

  it('makes room for the sidebar when it is pinned open', () => {
    const { group } = renderShell(true);
    expect(group.getAttribute('data-pinned')).toBe('expanded');
    expect(reservedWidth()).toBe('var(--shell-sidebar-w)');
  });
});
