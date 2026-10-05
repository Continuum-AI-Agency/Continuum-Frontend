import { afterEach, describe, expect, it, mock } from 'bun:test';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';

// The real contract schemas and meter run; only the HTTP transport and server actions are replaced.

const GB = 1e9;
const NEAR_FULL = '00000000-0000-4000-8000-000000000001';
const ROOMY = '00000000-0000-4000-8000-000000000002';

const quotas: Record<string, { usedBytes: number; capacityBytes: number }> = {
  [NEAR_FULL]: { usedBytes: 9 * GB, capacityBytes: 10 * GB },
  [ROOMY]: { usedBytes: 40e6, capacityBytes: 100 * GB },
};

const requestMock = mock(
  async (options: { path: string; schema: { parse: (value: unknown) => unknown } }) => {
    if (options.path === '/drive/v1/whoami') {
      return options.schema.parse({
        userId: '00000000-0000-4000-8000-0000000000aa',
        brands: [
          { brandId: NEAR_FULL, name: 'Acme', folder: 'Acme', role: 'owner' },
          {
            brandId: ROOMY,
            name: 'StarCraft: Remastered',
            folder: 'StarCraft: Remastered',
            role: 'editor',
          },
        ],
      });
    }
    const brandId = new URL(options.path, 'http://x').searchParams.get('brandId') ?? '';
    const { usedBytes, capacityBytes } = quotas[brandId];
    return options.schema.parse({
      brandId,
      usedBytes,
      reservedBytes: 0,
      capacityBytes,
      availableBytes: capacityBytes - usedBytes,
    });
  },
);

mock.module('@/lib/api/http', () => ({ http: { request: requestMock } }));
mock.module('./actions', () => ({
  createAppTokenAction: mock(),
  listAppTokensAction: mock(async () => []),
  revokeAppTokenAction: mock(),
}));

import { DriveBrands } from './DriveBrands';

afterEach(cleanup);

const renderBrands = () =>
  render(
    <QueryClientProvider client={new QueryClient()}>
      <DriveBrands email="owner@example.com" />
    </QueryClientProvider>,
  );

describe('DriveBrands', () => {
  it('shows each brand’s storage, free space and mount location at a glance in one bounded list', async () => {
    renderBrands();
    const list = await screen.findByTestId('drive-brand-list');
    expect(list.className).toContain('overflow-y-auto');
    const roomy = list.querySelector(`[data-brand-id="${ROOMY}"]`) as HTMLElement;
    await waitFor(() =>
      expect(within(roomy).getByTestId('storage-quota-meter').textContent).toContain(
        '0 GB of 100 GB used',
      ),
    );
    const nearFull = list.querySelector(`[data-brand-id="${NEAR_FULL}"]`) as HTMLElement;
    await waitFor(() =>
      expect(within(nearFull).getByTestId('drive-free-space').textContent).toBe('1 GB90% used'),
    );
    expect(roomy.textContent).toContain('/dav/StarCraft: Remastered/');
    expect(within(roomy).getByRole('button', { name: 'Copy mount URL' })).toBeTruthy();
    expect(
      within(roomy)
        .getByRole('link', { name: /Open Library/ })
        .getAttribute('href'),
    ).toBe(`/library?brandId=${ROOMY}`);
  });

  it('opens a brand to its full numbers and encoded mount URL', async () => {
    renderBrands();
    const list = await screen.findByTestId('drive-brand-list');
    const roomy = list.querySelector(`[data-brand-id="${ROOMY}"]`) as HTMLElement;
    await waitFor(() => within(roomy).getByTestId('storage-quota-meter'));
    expect(within(roomy).queryByTestId('drive-mount-url')).toBeNull();

    fireEvent.click(within(roomy).getByTestId('settings-row-toggle'));

    const mountUrl = await within(roomy).findByTestId('drive-mount-url');
    expect(mountUrl.textContent).toEndWith('/dav/StarCraft%3A%20Remastered/');
    expect(roomy.textContent).toContain('40 MB');
    expect(roomy.textContent).toContain('/StarCraft: Remastered/');
  });

  it('"Upgrade storage" on a near-full brand opens the allowance explainer in place', async () => {
    renderBrands();
    const list = await screen.findByTestId('drive-brand-list');
    const nearFull = list.querySelector(`[data-brand-id="${NEAR_FULL}"]`) as HTMLElement;
    const upgrade = await within(nearFull).findByTestId('storage-quota-upgrade');
    expect(screen.queryByTestId('storage-allowance-explainer')).toBeNull();

    fireEvent.click(upgrade);

    const explainer = await screen.findByTestId('storage-allowance-explainer');
    expect(explainer.textContent).toContain('does not raise your allowance automatically');
  });
});
