import { afterEach, beforeEach, describe, expect, it, mock } from 'bun:test';
import { cleanup, fireEvent, waitFor } from '@testing-library/react';
import type React from 'react';
import { render } from '@/i18n/__tests__/render';

import { AdAccountSelector } from './AdAccountSelector';

// PP-DT-E-home-setup-mode-mcc-mismatch, the Scale half (deep test 2026-10-31, lane E, low). The
// picker's Google list also reads the brand's integration summary, whose googleAds bucket carries
// The Sound Vault's Google Ads manager (status "manager"): the picker offered "Cont Sandbox" as
// an ad account and auto-selected it. A manager runs no campaigns, so it is never offered.

const manager = {
  assignmentId: 'a-1',
  integrationAccountId: 'i-1',
  name: 'Cont Sandbox',
  alias: null,
  externalAccountId: '4990471415',
  status: 'manager',
  linkedAt: null,
  providerIntegrationId: 'p-1',
  type: 'ads_customer',
  settings: null,
  ownerUserId: null,
};
const client = {
  ...manager,
  assignmentId: 'a-2',
  integrationAccountId: 'i-2',
  name: 'Easy Fit',
  externalAccountId: '5251780631',
  status: null,
};

let googleAccounts: unknown[] = [];
mock.module('@/hooks/useBrandIntegrations', () => ({
  useBrandIntegrations: () => ({
    integrations: { googleAds: { accounts: googleAccounts } },
    isLoading: false,
    isError: false,
    refresh: () => Promise.resolve(),
  }),
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

const onSelect = mock((_id: string) => {});

beforeEach(() => onSelect.mockClear());
afterEach(cleanup);

describe('AdAccountSelector on Google Ads', () => {
  it('never offers or picks a Google Ads manager', async () => {
    googleAccounts = [manager];
    const { findByRole, queryByText } = render(
      <AdAccountSelector
        brandId="brand-1"
        onSelect={onSelect}
        platform="google-ads"
        selectedAccountId={null}
      />,
    );
    await findByRole('link', { name: /connect ad account/i });
    expect(onSelect).not.toHaveBeenCalled();
    expect(queryByText('Cont Sandbox')).toBeNull();
  });

  it('picks the client account beside a manager, and lists only it', async () => {
    googleAccounts = [manager, client];
    const { findByRole, queryByText } = render(
      <AdAccountSelector
        brandId="brand-1"
        onSelect={onSelect}
        platform="google-ads"
        selectedAccountId={null}
      />,
    );
    await waitFor(() => expect(onSelect).toHaveBeenCalledWith('5251780631'));
    expect(onSelect).not.toHaveBeenCalledWith('4990471415');
    fireEvent.click(await findByRole('combobox'));
    expect(queryByText('Cont Sandbox')).toBeNull();
  });
});
