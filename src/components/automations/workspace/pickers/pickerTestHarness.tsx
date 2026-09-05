// Test support for the automation action pickers. Not a spec — no `.test.`
// suffix, so the runner never collects it.
//
// The shared happy-dom setup installs the globals its existing specs needed.
// Radix Select walks up to HTMLFormElement, Radix focus-scope constructs a
// MutationObserver on open, and Popper measures with a ResizeObserver, so all
// three are lifted off the happy-dom window here rather than mutating the
// shared setup file.

import { fireEvent, screen } from '@testing-library/react';
import type { PickerSource, PickerSourceState } from './pickerSource';

type LiftedGlobals = {
  MutationObserver?: typeof MutationObserver;
  HTMLFormElement?: typeof HTMLFormElement;
  ResizeObserver?: typeof ResizeObserver;
};

export function installPickerDomGlobals(): void {
  const happyDomWindow = globalThis.window as unknown as LiftedGlobals;
  const testGlobals = globalThis as LiftedGlobals;
  if (typeof testGlobals.MutationObserver !== 'function') {
    testGlobals.MutationObserver = happyDomWindow.MutationObserver;
  }
  if (typeof testGlobals.HTMLFormElement !== 'function') {
    testGlobals.HTMLFormElement = happyDomWindow.HTMLFormElement;
  }
  if (typeof testGlobals.ResizeObserver !== 'function') {
    testGlobals.ResizeObserver = class {
      observe() {}
      unobserve() {}
      disconnect() {}
    } as unknown as typeof ResizeObserver;
  }
}

/** A picker data source that answers from a fixed list — no network, no module
 *  mock, so nothing leaks into a sibling spec. */
export function stubSource<TItem>(state: Partial<PickerSourceState<TItem>>): PickerSource<TItem> {
  return () => ({
    items: state.items ?? [],
    isLoading: state.isLoading ?? false,
    isError: state.isError ?? false,
  });
}

/** Base UI's Select opens on `click`, not on the bare `pointerdown` Radix used —
 *  the migration left every picker spec unable to see its own options. */
export function openSelect(name: string): void {
  fireEvent.click(screen.getByRole('combobox', { name }));
}

/** Base UI commits a Select item on Enter. Its pointer path needs a real pointer
 *  capture happy-dom does not synthesize, so a click on the option is inert. */
export function chooseOption(name: string | RegExp): void {
  const option = screen.getByRole('option', { name });
  fireEvent.keyDown(option, { key: 'Enter' });
  fireEvent.keyUp(option, { key: 'Enter' });
}
