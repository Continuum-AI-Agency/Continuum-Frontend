import { afterEach, beforeEach, describe, expect, it, mock } from 'bun:test';
import { cleanup, render, waitFor } from '@testing-library/react';
import type React from 'react';

import { AdAccountSelector } from './AdAccountSelector';

// The integration summary (/api/brand-integrations) is the request that held the label on
// "Loading accounts..." on beta. These tests keep it pending, or failed, and assert the
// picker renders from the accounts the page already knows.

type IntegrationsState = {
  integrations: unknown;
  isLoading: boolean;
  isError: boolean;
  refresh: () => Promise<void>;
};

const pendingIntegrations: IntegrationsState = {
  integrations: undefined,
  isLoading: true,
  isError: false,
  refresh: () => Promise.resolve(),
};
const mockUseBrandIntegrations = mock((): IntegrationsState => pendingIntegrations);

mock.module('@/hooks/useBrandIntegrations', () => ({
  useBrandIntegrations: () => mockUseBrandIntegrations(),
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

const VIVO_KNOWN = [
  { id: 'act_1164707387246066', name: 'Berna Pavón New' },
  { id: 'act_1779847382038564', name: 'VIVO47 MKT' },
];
const VIVO_ASSIGNED = VIVO_KNOWN.map((account) => account.id);

describe('AdAccountSelector with known accounts', () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    mockUseBrandIntegrations.mockImplementation(() => pendingIntegrations);
    // The timeline lookup never answers: nothing here may wait on it.
    global.fetch = mock(() => new Promise<Response>(() => {}));
  });

  afterEach(() => {
    global.fetch = originalFetch;
    cleanup();
  });

  it('dresses the trigger as the brand chip: initials, brand, account and platform marks', () => {
    const { getByRole, getByTestId } = render(
      <AdAccountSelector
        brandId="brand-vivo"
        selectedAccountId="act_1779847382038564"
        onSelect={() => {}}
        knownAccounts={VIVO_KNOWN}
        assignedAccountIds={VIVO_ASSIGNED}
        chip={{ brandName: 'Home Vivo47', platforms: ['meta', 'google_ads'] }}
      />,
    );

    const trigger = getByRole('combobox');
    expect(trigger.getAttribute('data-testid')).toBe('ad-account-chip');
    expect(trigger.textContent).toContain('HV');
    expect(trigger.textContent).toContain('Home Vivo47');
    expect(trigger.textContent).toContain('VIVO47 MKT');
    const marks = getByTestId('ad-account-chip-platforms');
    expect(
      [...marks.querySelectorAll('[data-platform]')].map((mark) =>
        mark.getAttribute('data-platform'),
      ),
    ).toEqual(['meta', 'google_ads']);
    expect(marks.textContent).toContain('Meta, Google');
  });

  it('shows the selected known account while the integration summary is still loading', () => {
    const { getByRole } = render(
      <AdAccountSelector
        brandId="brand-vivo"
        selectedAccountId="act_1779847382038564"
        onSelect={() => {}}
        knownAccounts={VIVO_KNOWN}
        assignedAccountIds={VIVO_ASSIGNED}
      />,
    );

    const trigger = getByRole('combobox');
    expect(trigger.textContent).toContain('VIVO47 MKT');
    expect(trigger.textContent).not.toContain('Loading accounts');
    expect(trigger.hasAttribute('disabled')).toBe(false);
  });

  it('auto-selects the preferred account through onAutoSelect, never as a person pick', async () => {
    const onSelect = mock((_id: string) => {});
    const onAutoSelect = mock((_id: string) => {});
    render(
      <AdAccountSelector
        brandId="brand-vivo"
        selectedAccountId={null}
        onSelect={onSelect}
        onAutoSelect={onAutoSelect}
        knownAccounts={VIVO_KNOWN}
        assignedAccountIds={VIVO_ASSIGNED}
        preferredAccountId="1779847382038564"
      />,
    );

    await waitFor(() => expect(onAutoSelect).toHaveBeenCalledWith('act_1779847382038564'));
    expect(onSelect).not.toHaveBeenCalled();
  });

  it('falls back to the first known account when the preferred one is not offered', async () => {
    const onAutoSelect = mock((_id: string) => {});
    render(
      <AdAccountSelector
        brandId="brand-vivo"
        selectedAccountId={null}
        onSelect={() => {}}
        onAutoSelect={onAutoSelect}
        knownAccounts={VIVO_KNOWN}
        preferredAccountId="act_not_assigned"
      />,
    );

    await waitFor(() => expect(onAutoSelect).toHaveBeenCalledWith('act_1164707387246066'));
  });

  it('keeps the picker when the integration summary fails but accounts are known', () => {
    mockUseBrandIntegrations.mockImplementation(() => ({
      ...pendingIntegrations,
      isLoading: false,
      isError: true,
    }));
    const { getByRole, queryByText } = render(
      <AdAccountSelector
        brandId="brand-vivo"
        selectedAccountId="act_1164707387246066"
        onSelect={() => {}}
        knownAccounts={VIVO_KNOWN}
      />,
    );

    expect(getByRole('combobox').textContent).toContain('Berna Pavón New');
    expect(queryByText('Connect ad account')).toBeNull();
  });

  it('without known accounts still reads "Loading accounts..." until something names one', () => {
    const { getByRole } = render(
      <AdAccountSelector brandId="brand-vivo" selectedAccountId={null} onSelect={() => {}} />,
    );

    const trigger = getByRole('combobox');
    expect(trigger.textContent).toContain('Loading accounts');
    expect(trigger.hasAttribute('disabled')).toBe(true);
  });
});
