import { afterEach, beforeEach, describe, expect, it, mock } from 'bun:test';
import { cleanup, fireEvent, render, waitFor } from '@testing-library/react';

const listMock = mock(() =>
  Promise.resolve({
    connections: [
      {
        id: '00000000-0000-4000-8000-000000000001',
        userId: '00000000-0000-4000-8000-000000000002',
        platform: 'slack' as const,
        workspaceId: 'workspace_1',
        platformUserId: 'platform_user_1',
        displayName: 'Alex in Slack',
        status: 'active' as const,
        destination: { threadId: 'thread_1' },
        preferredBrandIds: [],
        lastVerifiedAt: '2026-07-26T12:00:00.000Z',
        createdAt: '2026-07-26T12:00:00.000Z',
        updatedAt: '2026-07-26T12:00:00.000Z',
      },
    ],
  }),
);
const preferenceMock = mock(() => Promise.resolve());
const revokeMock = mock(() => Promise.resolve());
const showMock = mock(() => {});

mock.module('@/lib/api/chatConnections.client', () => ({
  listChatConnections: listMock,
  setPreferredChatConnection: preferenceMock,
  revokeChatConnection: revokeMock,
}));

mock.module('@/components/ui/ToastProvider', () => ({
  useToast: () => ({ show: showMock }),
}));

import { ChatConnectionsSection } from './ChatConnectionsSection';

beforeEach(() => {
  listMock.mockClear();
  preferenceMock.mockClear();
  revokeMock.mockClear();
  showMock.mockClear();
});

afterEach(cleanup);

describe('ChatConnectionsSection', () => {
  it('shows route readiness and lets the user choose a brand preference', async () => {
    const { findByText, getByRole } = render(
      <ChatConnectionsSection brandId="00000000-0000-4000-8000-000000000010" brandName="Acme" />,
    );

    expect(await findByText('Alex in Slack')).toBeTruthy();
    expect(await findByText('Routable')).toBeTruthy();

    fireEvent.click(getByRole('button', { name: /Use for this brand/i }));
    await waitFor(() => {
      expect(preferenceMock).toHaveBeenCalledWith(
        '00000000-0000-4000-8000-000000000010',
        '00000000-0000-4000-8000-000000000001',
      );
    });
  });
});
