import { afterEach, beforeEach, describe, expect, it, mock } from 'bun:test';
import { cleanup, fireEvent, render, waitFor } from '@testing-library/react';
import type React from 'react';

import { AdAccountSelector } from './AdAccountSelector';
import { PAID_SETUP_CONNECT_HREF } from './paid-setup-diagnostics';

const mockRefresh = mock(() => Promise.resolve());

const defaultIntegrationsReturn = {
  integrations: {
    facebook: {
      accounts: [
        {
          integrationAccountId: 'integration-1',
          externalAccountId: 'act_9530520017061961',
          name: 'Parsed Inc',
        },
      ],
    },
  },
  isLoading: false,
  isError: false,
  refresh: mockRefresh,
};

const mockUseBrandIntegrations = mock(() => defaultIntegrationsReturn);

mock.module('@/hooks/useBrandIntegrations', () => ({
  useBrandIntegrations: (...args: unknown[]) => mockUseBrandIntegrations(...args),
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

describe('AdAccountSelector', () => {
  const originalFetch = global.fetch;
  const mockSelect = mock(() => {});

  beforeEach(() => {
    mockSelect.mockClear();
    mockRefresh.mockClear();
    mockUseBrandIntegrations.mockClear();
    mockUseBrandIntegrations.mockImplementation(() => defaultIntegrationsReturn);

    global.fetch = mock(() =>
      Promise.resolve({
        ok: true,
        json: () =>
          Promise.resolve({
            accounts: [
              { id: 'act_1034406624919675', name: 'SMB_PRACTIHOGAR_ARS' },
              { id: 'act_9530520017061961', name: 'Parsed Inc' },
            ],
          }),
      } as Response),
    );
  });

  afterEach(() => {
    global.fetch = originalFetch;
    cleanup();
  });

  it('fetches timeline accounts and auto-selects first merged account', async () => {
    render(
      <AdAccountSelector brandId="brand_123" selectedAccountId={null} onSelect={mockSelect} />,
    );

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith('/api/paid-media/timeline/accounts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ brandId: 'brand_123' }),
        cache: 'no-store',
      });
    });

    await waitFor(() => {
      expect(mockSelect).toHaveBeenCalledWith('act_1034406624919675');
    });
  });

  it('falls back to integration accounts when timeline accounts fetch fails', async () => {
    global.fetch = mock(() =>
      Promise.resolve({
        ok: false,
        json: () => Promise.resolve({ error: 'failed' }),
      } as Response),
    );

    render(
      <AdAccountSelector brandId="brand_123" selectedAccountId={null} onSelect={mockSelect} />,
    );

    await waitFor(() => {
      expect(mockSelect).toHaveBeenCalledWith('act_9530520017061961');
    });
  });

  it('shows a Connect + Retry recovery path when no ad accounts resolve', async () => {
    mockUseBrandIntegrations.mockImplementation(() => ({
      integrations: { facebook: { accounts: [] } },
      isLoading: false,
      isError: false,
      refresh: mockRefresh,
    }));

    global.fetch = mock(() =>
      Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ accounts: [] }),
      } as Response),
    );

    const { findByRole } = render(
      <AdAccountSelector brandId="brand_123" selectedAccountId={null} onSelect={mockSelect} />,
    );

    const connectLink = await findByRole('link', { name: /connect ad account/i });
    expect(connectLink.getAttribute('href')).toBe(PAID_SETUP_CONNECT_HREF);
    expect(mockSelect).not.toHaveBeenCalled();

    const retryButton = await findByRole('button', { name: 'Retry loading ad accounts' });
    fireEvent.click(retryButton);
    expect(mockRefresh).toHaveBeenCalledTimes(1);
  });

  // The merged list is [act_1034406624919675 (SMB), act_9530520017061961 (Parsed Inc)].
  // Only the second is assigned to the brand.

  it('with assignedAccountIds, auto-selects an ASSIGNED account and skips the unassigned first row', async () => {
    render(
      <AdAccountSelector
        brandId="brand_123"
        selectedAccountId={null}
        onSelect={mockSelect}
        assignedAccountIds={['act_9530520017061961']}
      />,
    );

    await waitFor(() => {
      expect(mockSelect).toHaveBeenCalledWith('act_9530520017061961');
    });
    // Never the unassigned account, even though it is first in the merged list.
    expect(mockSelect).not.toHaveBeenCalledWith('act_1034406624919675');
  });

  it('matches assigned ids prefix-insensitively (bare vs act_)', async () => {
    render(
      <AdAccountSelector
        brandId="brand_123"
        selectedAccountId={null}
        onSelect={mockSelect}
        assignedAccountIds={['9530520017061961']}
      />,
    );

    await waitFor(() => {
      expect(mockSelect).toHaveBeenCalledWith('act_9530520017061961');
    });
  });

  it('re-selects an assigned account when the current selection is not assigned (server-seeded foreign id)', async () => {
    render(
      <AdAccountSelector
        brandId="brand_123"
        selectedAccountId="act_1034406624919675"
        onSelect={mockSelect}
        assignedAccountIds={['act_9530520017061961']}
      />,
    );

    await waitFor(() => {
      expect(mockSelect).toHaveBeenCalledWith('act_9530520017061961');
    });
  });

  it('with an empty assigned set, shows the recovery path instead of the reachable superset', async () => {
    const { findByRole } = render(
      <AdAccountSelector
        brandId="brand_123"
        selectedAccountId={null}
        onSelect={mockSelect}
        assignedAccountIds={[]}
      />,
    );

    const connectLink = await findByRole('link', { name: /connect ad account/i });
    expect(connectLink.getAttribute('href')).toBe(PAID_SETUP_CONNECT_HREF);
    expect(mockSelect).not.toHaveBeenCalled();
  });

  it('leaves auto-select unchanged when assignedAccountIds is undefined (feature off)', async () => {
    render(
      <AdAccountSelector
        brandId="brand_123"
        selectedAccountId={null}
        onSelect={mockSelect}
        assignedAccountIds={undefined}
      />,
    );

    await waitFor(() => {
      expect(mockSelect).toHaveBeenCalledWith('act_1034406624919675');
    });
  });
});
