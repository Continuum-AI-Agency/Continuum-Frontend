import { afterEach, describe, expect, it } from 'bun:test';
import { cleanup, render } from '@testing-library/react';

(globalThis as unknown as { window: { SyntaxError: typeof SyntaxError } }).window.SyntaxError =
  SyntaxError;

import { TooltipProvider } from '@/components/ui/tooltip';
import { HeldPill } from './HeldPill';

afterEach(cleanup);

function renderHeld(reason: string | null) {
  return render(
    <TooltipProvider>
      <HeldPill reason={reason} />
    </TooltipProvider>,
  );
}

describe('HeldPill', () => {
  it('renders nothing when the item was not held', () => {
    const { container } = renderHeld(null);
    expect(container.textContent).toBe('');
  });

  it('labels the CBO/lifetime freeze reason', () => {
    const { getByText } = renderHeld('unsupported_budget');
    expect(getByText('Held · CBO/lifetime')).toBeTruthy();
  });

  it('carries the warning indicator token and no hardcoded amber', () => {
    const { container, getByText } = renderHeld('no_conversions');
    expect(getByText('Held · no conversion signal')).toBeTruthy();
    expect(container.innerHTML).toContain('bg-warning');
    expect(container.innerHTML).not.toMatch(/amber-/);
  });

  it('exposes a focusable trigger so the hint tooltip is keyboard-reachable', () => {
    const { getByRole } = renderHeld('missing_window');
    expect(getByRole('button')).toBeTruthy();
  });
});
