import { afterEach, describe, expect, it, mock } from 'bun:test';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';

// The section's real grouping and row rendering run; the server-only reads and the two
// dialog buttons (router + toast) are replaced.

const META = '00000000-0000-4000-8000-0000000000a1';
const GOOGLE = '00000000-0000-4000-8000-0000000000a2';

mock.module('@/lib/integrations/ownedConnections', () => ({
  fetchOwnedConnections: async () => [
    {
      id: META,
      provider: 'meta',
      status: 'active',
      createdAt: '2026-09-02T12:00:00.000Z',
      identity: 'ads@acme.test',
    },
    {
      id: GOOGLE,
      provider: 'google_ads',
      status: 'needs_reauth',
      createdAt: '2026-08-15T12:00:00.000Z',
      identity: null,
    },
  ],
}));
mock.module('@/lib/integrations/grants', () => ({
  fetchMyConnectionGrants: async () =>
    ['Acme', 'Pizza Test', 'UP'].map((brandName, index) => ({
      integrationId: META,
      brandProfileId: `00000000-0000-4000-8000-00000000000${index}`,
      brandName,
      grantedAt: '2026-09-10T12:00:00.000Z',
    })),
}));
mock.module('@/components/integrations/ShareConnectionButton', () => ({
  ShareConnectionButton: ({ alreadyGrantedBrandIds }: { alreadyGrantedBrandIds: string[] }) => (
    <button type="button" data-granted={alreadyGrantedBrandIds.length}>
      Share
    </button>
  ),
}));
mock.module('@/components/integrations/RemoveConnectionButton', () => ({
  RemoveConnectionButton: () => <button type="button">Remove</button>,
}));

import { MyConnectionsSharingSection } from './MyConnectionsSharingSection';

afterEach(cleanup);

const renderSection = async () =>
  render(await MyConnectionsSharingSection({ userId: '00000000-0000-4000-8000-0000000000ff' }));

const row = (id: string) =>
  screen
    .getByTestId('connection-sharing-list')
    .querySelector(`[data-connection-id="${id}"]`) as HTMLElement;

describe('MyConnectionsSharingSection', () => {
  it('shows status, reach and connect date for each connection at a glance', async () => {
    await renderSection();

    const meta = row(META);
    expect(meta.textContent).toContain('Meta (Facebook & Instagram)');
    expect(meta.textContent).toContain('ads@acme.test');
    expect(meta.textContent).toContain('Active');
    expect(meta.textContent).toContain('3 brands');
    expect(meta.textContent).toContain('Acme, Pizza Test +1');
    expect(meta.textContent).toContain('Sep 2, 2026');
    expect(within(meta).getByText('Share').getAttribute('data-granted')).toBe('3');

    const google = row(GOOGLE);
    expect(google.textContent).toContain('Google Ads');
    expect(google.textContent).toContain('Needs reconnect');
    expect(google.textContent).toContain('Not shared');
  });

  it('opens a connection to every brand it is shared with', async () => {
    await renderSection();
    const meta = row(META);
    expect(meta.textContent).not.toContain('since');

    fireEvent.click(within(meta).getByTestId('settings-row-toggle'));

    const shared = await within(meta).findAllByText(/^since /);
    expect(shared).toHaveLength(3);
    expect(meta.textContent).toContain('UP');
  });
});
