import { afterEach, describe, expect, test } from 'bun:test';
import { cleanup, render, screen } from '@testing-library/react';

import { Sheet, SheetContent, SheetTitle } from '@/components/ui/sheet';

global.MutationObserver = window.MutationObserver;

afterEach(cleanup);

describe('Sheet', () => {
  test('keeps the application visible while side content is open', () => {
    render(
      <Sheet open>
        <SheetContent>
          <SheetTitle>Trends</SheetTitle>
          <p>Current trend signals</p>
        </SheetContent>
      </Sheet>,
    );

    expect(screen.getByRole('dialog', { name: 'Trends' })).toBeTruthy();
    expect(document.querySelector('[data-slot="sheet-overlay"]')).toBeNull();
  });
});
