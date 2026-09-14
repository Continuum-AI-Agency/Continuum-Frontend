import { afterEach, beforeEach, describe, expect, it, mock } from 'bun:test';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, waitFor } from '@testing-library/react';

const OFF = {
  enabled: false,
  destination: null,
  channelId: null,
  channelName: null,
  connectionId: null,
};

let settings: Record<string, unknown> = OFF;

const getMock = mock(() => Promise.resolve(settings));
const saveMock = mock((_brandId: string, body: { destination: string; channelId?: string }) =>
  Promise.resolve({
    enabled: true,
    destination: body.destination,
    channelId: body.channelId ?? null,
    channelName: body.channelId ? 'paid-media' : null,
    connectionId: body.destination === 'dm' ? 'conn-1' : null,
  }),
);
const disableMock = mock(() => Promise.resolve());
const channelsMock = mock(() =>
  Promise.resolve({
    channels: [
      { id: 'C0PAID', name: 'paid-media', isPrivate: false, isMember: false },
      { id: 'C0LOCK', name: 'exec', isPrivate: true, isMember: false },
    ],
  }),
);
const showMock = mock(() => {});

mock.module('@/lib/api/optimizerNotifications.client', () => ({
  getOptimizerNotificationSettings: getMock,
  saveOptimizerNotificationSettings: saveMock,
  disableOptimizerNotifications: disableMock,
  listSlackChannels: channelsMock,
}));

mock.module('@/components/ui/ToastProvider', () => ({
  useToast: () => ({ show: showMock }),
}));

import { OptimizerNotificationsSection } from './OptimizerNotificationsSection';

const BRAND = '00000000-0000-4000-8000-000000000010';

const renderSection = () =>
  render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      <OptimizerNotificationsSection brandId={BRAND} brandName="Acme" />
    </QueryClientProvider>,
  );

beforeEach(() => {
  settings = OFF;
  for (const m of [getMock, saveMock, disableMock, channelsMock, showMock]) m.mockClear();
});

afterEach(cleanup);

describe('OptimizerNotificationsSection', () => {
  it('is off until the user turns it on, and does not list channels unasked', async () => {
    const { findByRole } = renderSection();
    const toggle = await findByRole('switch', { name: 'Optimizer Slack notifications' });

    expect((toggle as HTMLInputElement).getAttribute('aria-checked')).toBe('false');
    // A workspace listing is a Slack round trip; browsing settings must not pay for it.
    expect(channelsMock).not.toHaveBeenCalled();
  });

  it('subscribes to a DM without asking the client which Slack account that is', async () => {
    const { findByRole } = renderSection();
    fireEvent.click(await findByRole('switch', { name: 'Optimizer Slack notifications' }));

    await waitFor(() => expect(saveMock).toHaveBeenCalled());
    // No connection id on the wire: the Backend resolves the caller's own identity, so
    // one user can never route another user's DMs.
    expect(saveMock.mock.calls[0]?.[1]).toEqual({ destination: 'dm' });
  });

  it('saves the channel the user picks, by id', async () => {
    settings = {
      enabled: true,
      destination: 'channel',
      channelId: null,
      channelName: null,
      connectionId: null,
    };
    const { findByRole, findByText } = renderSection();

    fireEvent.click(await findByRole('combobox', { name: 'Slack channel' }));
    fireEvent.click(await findByText('#paid-media'));

    await waitFor(() => expect(saveMock).toHaveBeenCalled());
    expect(saveMock.mock.calls[0]?.[1]).toEqual({
      destination: 'channel',
      channelId: 'C0PAID',
      channelName: 'paid-media',
    });
  });

  it('switching off deletes the subscription rather than saving a disabled one', async () => {
    settings = {
      enabled: true,
      destination: 'dm',
      channelId: null,
      channelName: null,
      connectionId: 'conn-1',
    };
    const { findByRole } = renderSection();
    fireEvent.click(await findByRole('switch', { name: 'Optimizer Slack notifications' }));

    await waitFor(() => expect(disableMock).toHaveBeenCalledWith(BRAND));
    expect(saveMock).not.toHaveBeenCalled();
  });
});
