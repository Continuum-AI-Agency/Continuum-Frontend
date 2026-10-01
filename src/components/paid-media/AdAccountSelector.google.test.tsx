import { afterEach, beforeEach, describe, expect, it, mock } from 'bun:test';
import { cleanup, fireEvent, render, waitFor } from '@testing-library/react';

import { AdAccountSelector } from './AdAccountSelector';

mock.module('@/hooks/useBrandIntegrations', () => ({
  useBrandIntegrations: () => ({
    integrations: {
      googleAds: {
        accounts: [
          {
            integrationAccountId: 'ia-1',
            externalAccountId: '123-456-7890',
            name: 'Brand Google Ads',
          },
        ],
      },
    },
    isLoading: false,
    isError: false,
  }),
}));

global.ResizeObserver = class ResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
} as unknown as typeof ResizeObserver;

describe('AdAccountSelector (google-ads)', () => {
  const originalFetch = global.fetch;
  const mockSelect = mock(() => {});

  beforeEach(() => {
    mockSelect.mockClear();
    global.fetch = mock(
      async () => ({ ok: true, json: async () => ({ accounts: [] }) }) as Response,
    ) as unknown as typeof fetch;
  });

  afterEach(() => {
    global.fetch = originalFetch;
    cleanup();
  });

  it('surfaces Google Ads accounts and skips the Meta timeline fetch', async () => {
    render(
      <AdAccountSelector
        brandId="brand_123"
        platform="google-ads"
        selectedAccountId={null}
        onSelect={mockSelect}
      />,
    );

    await waitFor(() => {
      expect(mockSelect).toHaveBeenCalledWith('123-456-7890');
    });

    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('lets Jaina select Google Ads from the combined primary-account selector', async () => {
    const rendered = render(
      <AdAccountSelector
        brandId="brand_123"
        platform="all"
        selectedAccountId={null}
        onSelect={mockSelect}
        assignedAccountIds={['123-456-7890']}
      />,
    );
    await waitFor(() => expect(mockSelect).toHaveBeenCalledWith('123-456-7890'));
    expect(global.fetch).not.toHaveBeenCalled();
    fireEvent.click(rendered.getByRole('combobox'));
    fireEvent.click(rendered.getByRole('option', { name: /Brand Google Ads/ }));
    expect(mockSelect).toHaveBeenCalledWith('123-456-7890');
  });
});
