import { afterEach, describe, expect, it, mock } from 'bun:test';
import { cleanup, fireEvent, render } from '@testing-library/react';

(globalThis as unknown as { window: { SyntaxError: typeof SyntaxError } }).window.SyntaxError =
  SyntaxError;

import { TooltipProvider } from '@/components/ui/tooltip';
import { DataFreshnessChip, formatFreshness } from './DataFreshnessChip';

afterEach(cleanup);

const NOW = Date.parse('2026-07-19T14:32:00Z');
const minutesAgo = (n: number) => new Date(NOW - n * 60_000).toISOString();
// The rendered chip reads real Date.now() internally, so its fixtures are anchored on
// the wall clock (the pinned NOW is only for the pure formatFreshness assertions).
const realMinutesAgo = (n: number) => new Date(Date.now() - n * 60_000).toISOString();

function renderChip(props: Partial<Parameters<typeof DataFreshnessChip>[0]> = {}) {
  return render(
    <TooltipProvider>
      <DataFreshnessChip
        fetchedAt={realMinutesAgo(10)}
        onRefresh={() => {}}
        canRefresh={true}
        {...props}
      />
    </TooltipProvider>,
  );
}

describe('formatFreshness', () => {
  it('reads "just now" under a minute old', () => {
    expect(formatFreshness(minutesAgo(0), NOW)).toBe('Data as of just now');
  });

  it('reads a relative minute age under an hour', () => {
    expect(formatFreshness(minutesAgo(12), NOW)).toBe('Data as of 12m ago');
  });

  it('switches to a 24h wall clock at or beyond an hour', () => {
    const label = formatFreshness(minutesAgo(90), NOW);
    expect(label.startsWith('Data as of ')).toBe(true);
    expect(label).toMatch(/\d{2}:\d{2}/);
  });

  it('says the age is unknown when no read time is present (legacy cache hit)', () => {
    expect(formatFreshness(null, NOW)).toBe('cached · age unknown');
  });

  it('says the age is unknown when the read time is unparseable', () => {
    expect(formatFreshness('not-a-date', NOW)).toBe('cached · age unknown');
  });
});

describe('DataFreshnessChip', () => {
  it('renders the fresh age and an enabled refresh control', () => {
    const onRefresh = mock(() => {});
    const { getByText, getByRole } = renderChip({ fetchedAt: realMinutesAgo(3), onRefresh });
    expect(getByText('Data as of 3m ago')).toBeTruthy();
    const button = getByRole('button');
    expect(button.getAttribute('aria-disabled')).toBe('false');
    fireEvent.click(button);
    expect(onRefresh).toHaveBeenCalledTimes(1);
  });

  it('shows the unknown-age fallback rather than a fabricated time', () => {
    const { getByText } = renderChip({ fetchedAt: null });
    expect(getByText('cached · age unknown')).toBeTruthy();
  });

  it('marks refresh non-interactive during the cooldown and swallows the click', () => {
    const onRefresh = mock(() => {});
    const { getByRole } = renderChip({ canRefresh: false, onRefresh });
    const button = getByRole('button');
    expect(button.getAttribute('aria-disabled')).toBe('true');
    fireEvent.click(button);
    expect(onRefresh).not.toHaveBeenCalled();
  });

  it('narrates the in-flight refresh and offers no button', () => {
    const { getByText, queryByRole } = renderChip({ isRefreshing: true, canRefresh: false });
    expect(getByText('Refreshing…')).toBeTruthy();
    expect(queryByRole('button')).toBeNull();
  });

  it('uses the token type scale, never a px literal', () => {
    const { container } = renderChip();
    expect(container.innerHTML).toContain('text-2xs');
    expect(container.innerHTML).not.toMatch(/text-\[\d/);
  });
});
