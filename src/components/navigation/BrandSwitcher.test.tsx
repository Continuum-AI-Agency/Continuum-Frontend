import { afterEach, beforeEach, describe, expect, it, mock } from 'bun:test';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import * as React from 'react';

// happy-dom ships no ResizeObserver, and Base UI's positioner constructs one while the
// popover opens — without it the popover throws instead of mounting, which reads as a
// broken switcher rather than a missing browser API. Guarded so it defers to a real one.
if (typeof globalThis.ResizeObserver !== 'function') {
  globalThis.ResizeObserver = class {
    observe(): void {}
    unobserve(): void {}
    disconnect(): void {}
  } as unknown as typeof globalThis.ResizeObserver;
}

const switchBrand = mock(async (_brandId: string) => ({
  switched: true,
  prevBrandId: 'brand-a',
  redirected: false,
}));

const brandSummaries = [
  { id: 'brand-a', name: 'Alpha Coffee', completed: true, logoUrl: null, isPending: false },
  { id: 'brand-b', name: 'Beta Bakery', completed: true, logoUrl: null, isPending: false },
  { id: 'brand-c', name: 'Gamma Garage', completed: true, logoUrl: null, isPending: true },
];

mock.module('@/components/providers/ActiveBrandProvider', () => ({
  useActiveBrandContext: () => ({
    activeBrandId: 'brand-a',
    brandSummaries,
    isSwitching: false,
  }),
}));

mock.module('@/hooks/useSwitchBrand', () => ({
  useSwitchBrand: () => switchBrand,
}));

mock.module('@/app/(post-auth)/settings/actions', () => ({
  createBrandProfileAction: mock(async () => {}),
}));

const { BrandSwitcher } = await import('./BrandSwitcher');
const { SidebarProvider } = await import('@/components/ui/sidebar');

function renderSwitcher() {
  return render(
    <SidebarProvider>
      <BrandSwitcher />
    </SidebarProvider>,
  );
}

async function openSwitcher() {
  fireEvent.click(screen.getByLabelText('Switch brand'));
  await waitFor(() => expect(screen.getByPlaceholderText('Search brands...')).toBeTruthy());
}

describe('BrandSwitcher', () => {
  beforeEach(() => {
    switchBrand.mockClear();
  });

  // No global auto-cleanup in this suite: without it, a previous file's mounted tree
  // stays in the document and the popover queries below resolve against stale markup.
  afterEach(cleanup);

  it('opens the brand list from the sidebar trigger', async () => {
    renderSwitcher();
    await openSwitcher();

    expect(screen.getByText('Beta Bakery')).toBeTruthy();
    expect(screen.getByText('Gamma Garage')).toBeTruthy();
  });

  // A menu popup runs its own typeahead and preventDefault()s character keys before
  // cmdk's input receives them. Keeping the list out of a menu is what makes search work.
  it('does not nest the brand list inside a menu popup', async () => {
    renderSwitcher();
    await openSwitcher();

    const input = screen.getByPlaceholderText('Search brands...');
    expect(input.closest('[role="menu"]')).toBeNull();
  });

  it('filters the list as the user searches', async () => {
    // Scoped to the list: the trigger also renders the active brand's name.
    const listedBrands = () =>
      Array.from(document.querySelectorAll('[cmdk-item]')).map((item) => item.textContent ?? '');

    renderSwitcher();
    await openSwitcher();
    expect(listedBrands().some((label) => label.includes('Alpha Coffee'))).toBe(true);

    fireEvent.change(screen.getByPlaceholderText('Search brands...'), {
      target: { value: 'Beta' },
    });

    await waitFor(() =>
      expect(listedBrands().some((label) => label.includes('Alpha Coffee'))).toBe(false),
    );
    expect(listedBrands().some((label) => label.includes('Beta Bakery'))).toBe(true);
  });

  it('switches to the brand that was clicked', async () => {
    renderSwitcher();
    await openSwitcher();

    fireEvent.click(screen.getByText('Beta Bakery'));

    await waitFor(() => expect(switchBrand).toHaveBeenCalledTimes(1));
    expect(switchBrand.mock.calls[0]?.[0]).toBe('brand-b');
  });

  it('does not offer a pending invite as a switch target', async () => {
    renderSwitcher();
    await openSwitcher();

    const pendingRow = screen.getByText('Gamma Garage').closest('[cmdk-item]');
    expect(pendingRow?.getAttribute('aria-disabled')).toBe('true');

    fireEvent.click(screen.getByText('Gamma Garage'));

    expect(switchBrand).not.toHaveBeenCalled();
  });
});
