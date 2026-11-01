import { afterEach, beforeEach, describe, expect, it, mock } from 'bun:test';
import { cleanup, render, waitFor } from '@testing-library/react';
import type React from 'react';

import { AdAccountSelector } from './AdAccountSelector';

// PP-DT-E-scale-header-phone-overlap (deep test 2026-10-31, lane E, low). On a brand with no ad
// account on the open platform, the Scale header's account picker turns into "Connect ad account"
// and a Retry. At 390 px the pair overflowed the picker's shrinkable slot and sat on the Optimizer /
// Campaigns switch (a tap on the switch landed on Retry). And the Retry was offered when the read
// had answered — with no account — where there is nothing to retry.

type Summary = {
  integrations: { facebook: { accounts: unknown[] } };
  isLoading: boolean;
  isError: boolean;
  refresh: () => Promise<void>;
};
const refresh = mock(() => Promise.resolve());
const answeredEmpty: Summary = {
  integrations: { facebook: { accounts: [] } },
  isLoading: false,
  isError: false,
  refresh,
};
let summary: Summary = answeredEmpty;

mock.module('@/hooks/useBrandIntegrations', () => ({
  useBrandIntegrations: () => summary,
}));

mock.module('next/link', () => ({
  __esModule: true,
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

global.ResizeObserver = class ResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
};

const originalFetch = global.fetch;
const timeline = (ok: boolean) =>
  mock(() =>
    Promise.resolve({ ok, json: () => Promise.resolve({ accounts: [] }) } as Response),
  ) as unknown as typeof fetch;

const CHIP = { brandName: 'Diésel', brandLogoUrl: null, platforms: [] };

beforeEach(() => {
  summary = answeredEmpty;
  refresh.mockClear();
  global.fetch = timeline(true);
});

afterEach(() => {
  global.fetch = originalFetch;
  cleanup();
});

describe('AdAccountSelector recovery', () => {
  it('offers Connect, and no Retry, when the read answered with no account', async () => {
    const { findByRole, queryByRole } = render(
      <AdAccountSelector brandId="brand-1" onSelect={() => {}} selectedAccountId={null} />,
    );
    await findByRole('link', { name: /connect ad account/i });
    await waitFor(() => expect(global.fetch).toHaveBeenCalled());
    expect(queryByRole('button', { name: 'Retry loading ad accounts' })).toBeNull();
  });

  it('offers Retry beside Connect when the account read failed', async () => {
    global.fetch = timeline(false);
    const { findByRole } = render(
      <AdAccountSelector brandId="brand-1" onSelect={() => {}} selectedAccountId={null} />,
    );
    await findByRole('link', { name: /connect ad account/i });
    expect(await findByRole('button', { name: 'Retry loading ad accounts' })).toBeTruthy();
  });

  it('offers Retry when the integration summary failed', async () => {
    summary = { ...answeredEmpty, isError: true };
    const { findByRole } = render(
      <AdAccountSelector brandId="brand-1" onSelect={() => {}} selectedAccountId={null} />,
    );
    expect(await findByRole('button', { name: 'Retry loading ad accounts' })).toBeTruthy();
  });

  it('in the Scale bar, Connect is its mark until the bar has room for the words', async () => {
    const { findByRole } = render(
      <AdAccountSelector
        brandId="brand-1"
        chip={CHIP}
        onSelect={() => {}}
        selectedAccountId={null}
      />,
    );
    const connect = await findByRole('link', { name: 'Connect ad account' });
    // The words are kept for assistive tech and shown only from the bar width the chip shows the
    // brand's name at (@[30rem]/scale-bar); narrower, the link is its plug mark alone.
    const words = Array.from(connect.querySelectorAll('span')).find(
      (span) => span.textContent === 'Connect ad account',
    );
    expect(words?.className ?? 'no span holds the words').toContain('sr-only');
    expect(words?.className ?? 'no span holds the words').toContain(
      '@[30rem]/scale-bar:not-sr-only',
    );
    // Nothing in the pair may be wider than its own slot: the slot shrinks, the pair with it.
    expect(connect.parentElement?.className).toContain('min-w-0');
  });
});
