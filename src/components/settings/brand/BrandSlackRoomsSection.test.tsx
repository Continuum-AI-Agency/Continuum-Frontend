import { afterEach, beforeEach, describe, expect, it, mock } from 'bun:test';
import type { ApiRenderDeliveryDestination, RenderApprovalDestination } from '@continuum/contracts';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, waitFor } from '@testing-library/react';
import { ApiError } from '@/lib/api/errors';

// The brand admin's Slack rooms. The two reads are mocked at the API-client boundary — the join
// between them, the readiness line and the retire refusal are what this file is about.

const BRAND = '00000000-0000-4000-8000-000000000010';
const OPS_ID = '00000000-0000-4000-8000-000000000001';
const CLIENT_ID = '00000000-0000-4000-8000-000000000002';

const room = (
  id: string,
  channelName: string,
  role: ApiRenderDeliveryDestination['role'] = 'ops',
  workspaceName: string | null = 'Agency',
): ApiRenderDeliveryDestination => ({
  id,
  role,
  channelId: `C${channelName}`,
  channelName,
  workspaceName,
});

const approvalRoom = (
  id: string,
  name: string,
  activeApprovers: number,
  requestedApprovers = 0,
): RenderApprovalDestination => ({
  id,
  platform: 'slack',
  role: 'ops',
  name,
  activeApprovers,
  requestedApprovers,
});

let rooms: ApiRenderDeliveryDestination[] = [];
let slackState: 'ready' | 'not_connected' | 'not_installed' = 'ready';
let roomsFailure: unknown = null;
let approvalRooms: RenderApprovalDestination[] | Error = [];
let retireFailure: unknown = null;

const listDeliveryDestinationsMock = mock(async (_brandId: string) => {
  if (roomsFailure) throw roomsFailure;
  return {
    slack: { state: slackState, workspaceName: 'Agency', destinations: rooms },
    meta: { connected: false, adAccountId: null, adAccountName: null },
  };
});
const retireMock = mock(async (destinationId: string) => {
  if (retireFailure) throw retireFailure;
  rooms = rooms.filter((item) => item.id !== destinationId);
});
const fetchApprovalDestinationsMock = mock(async (_brandId: string) => {
  if (approvalRooms instanceof Error) throw approvalRooms;
  return { destinations: approvalRooms };
});

mock.module('@/StudioCanvas/nodes/api-render/apiRendersApi', () => ({
  apiRendersApi: {
    listDeliveryDestinations: listDeliveryDestinationsMock,
    retireDeliveryDestination: retireMock,
    listSlackChannels: mock(async () => ({ workspaceName: 'Agency', channels: [] })),
    createDeliveryDestination: mock(async () => room(OPS_ID, 'renders')),
  },
}));
mock.module('@/lib/library/renderApprovals', () => ({
  fetchApprovalDestinations: fetchApprovalDestinationsMock,
  fetchDestinationApprovers: mock(async () => []),
  addDestinationApprover: mock(async () => ({})),
  activateDestinationApprover: mock(async () => ({})),
  revokeDestinationApprover: mock(async () => ({})),
}));

const showMock = mock(() => {});
mock.module('@/components/ui/ToastProvider', () => ({ useToast: () => ({ show: showMock }) }));

import { BrandSlackRoomsSection } from './BrandSlackRoomsSection';

const renderSection = (canManage = true) =>
  render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      <BrandSlackRoomsSection brandId={BRAND} canManage={canManage} />
    </QueryClientProvider>,
  );

beforeEach(() => {
  rooms = [room(OPS_ID, 'renders'), room(CLIENT_ID, 'client-review', 'client', 'Client Co')];
  slackState = 'ready';
  roomsFailure = null;
  retireFailure = null;
  approvalRooms = [
    approvalRoom(OPS_ID, 'renders', 2, 1),
    approvalRoom(CLIENT_ID, 'client-review', 0),
  ];
  listDeliveryDestinationsMock.mockClear();
  retireMock.mockClear();
  fetchApprovalDestinationsMock.mockClear();
  showMock.mockClear();
});

afterEach(cleanup);

describe('BrandSlackRoomsSection', () => {
  it('shows a skeleton while the rooms are loading', () => {
    roomsFailure = null;
    listDeliveryDestinationsMock.mockImplementationOnce(() => new Promise(() => {}));
    const { getByRole } = renderSection();

    expect(getByRole('status', { name: 'Loading Slack rooms' })).toBeTruthy();
  });

  it('offers a retry when the rooms cannot be read', async () => {
    roomsFailure = new Error('upstream exploded');
    const { findByText, getByRole, findByRole } = renderSection();

    await findByText('Slack rooms could not be loaded');
    roomsFailure = null;
    fireEvent.click(getByRole('button', { name: /Retry/ }));

    expect(await findByRole('button', { name: 'Retire #renders' })).toBeTruthy();
  });

  it('tells a brand admin what to add when there is no room yet', async () => {
    rooms = [];
    approvalRooms = [];
    const { findByText, getByText } = renderSection();

    await findByText('No Slack room yet');
    expect(getByText(/Add the channel your team watches as an Ops room/)).toBeTruthy();
    expect(getByText(/Before renders and approvals can reach Slack: add a room/)).toBeTruthy();
  });

  it('lists each room with its role, workspace and the approvers who can decide there', async () => {
    const { findByText, getByRole, getByText } = renderSection();

    await findByText('#renders');
    const list = getByRole('list', { name: 'Slack rooms' });
    const [ops, client] = [...list.querySelectorAll('li')];
    expect(ops?.textContent).toContain('Ops');
    expect(ops?.textContent).toContain('Agency');
    // Joined on the room id: the count comes from the approvals read, the row from the rooms read.
    expect(ops?.textContent).toContain('2 approvers');
    expect(ops?.textContent).toContain('1 asking');
    expect(client?.textContent).toContain('Client');
    expect(client?.textContent).toContain('Client Co');
    expect(client?.textContent).toContain('no approvers yet');
    expect(getByText('Renders and approvals can reach Slack.')).toBeTruthy();
  });

  it('retires a room only after the confirm, then shows the refetched list', async () => {
    const { findByRole, getByRole, queryAllByText } = renderSection();

    fireEvent.click(await findByRole('button', { name: 'Retire #renders' }));
    expect(retireMock).not.toHaveBeenCalled();
    fireEvent.click(getByRole('button', { name: 'Retire room' }));

    await waitFor(() => expect(queryAllByText('#renders').length).toBe(0));
    expect(retireMock).toHaveBeenCalledWith(OPS_ID);
    expect(queryAllByText('#client-review').length).toBe(1);
  });

  it('names the pending approvals when the Backend refuses the retire', async () => {
    retireFailure = new ApiError(
      'chat_destination_has_pending_approvals',
      409,
      'chat_destination_has_pending_approvals',
      { pendingApprovals: 3 },
    );
    const { findByRole, getByRole, findByRole: findRole, queryAllByText } = renderSection();

    fireEvent.click(await findByRole('button', { name: 'Retire #renders' }));
    fireEvent.click(getByRole('button', { name: 'Retire room' }));

    const alert = await findRole('alert');
    expect(alert.textContent).toContain('3 approvals are still pending in #renders');
    // The room survives the refusal, and the dialog stops offering the button that cannot work.
    expect(queryAllByText('#renders').length).toBe(1);
    expect(getByRole('button', { name: 'Keep it' })).toBeTruthy();
  });

  it("falls back to the rooms read's own counts when the approvals read fails", async () => {
    approvalRooms = new Error('approvals down');
    rooms = [{ ...room(OPS_ID, 'renders'), activeApprovers: 4, requestedApprovers: 0 }];
    const { findByText, getByRole } = renderSection();

    await findByText('#renders');
    expect(getByRole('list', { name: 'Slack rooms' }).textContent).toContain('4 approvers');
    expect(getByRole('status').textContent).toBe('Renders and approvals can reach Slack.');
  });

  it('says approvers are unknown rather than zero when neither read could say', async () => {
    approvalRooms = new Error('approvals down');
    const { findByText, getByRole } = renderSection();

    await findByText('#renders');
    expect(getByRole('list', { name: 'Slack rooms' }).textContent).toContain('approvers unknown');
    // It must not claim a readiness it could not read.
    expect(getByRole('status').textContent).toBe(
      'Renders can reach Slack. Who may approve there could not be read — retry to check.',
    );
  });

  it('shows a viewer the rooms with no way to add or retire one', async () => {
    const { findByText, queryAllByRole } = renderSection(false);

    await findByText('#renders');
    expect(queryAllByRole('button', { name: /Retire/ }).length).toBe(0);
    expect(queryAllByRole('button', { name: /Add a room/ }).length).toBe(0);
    expect(queryAllByRole('button', { name: /Manage approvers/ }).length).toBe(0);
  });

  it('names exactly the missing step for a half-configured brand', async () => {
    approvalRooms = [
      approvalRoom(OPS_ID, 'renders', 0),
      approvalRoom(CLIENT_ID, 'client-review', 0),
    ];
    const { findByText, getByRole } = renderSection();

    // Awaiting a row first: the loading skeleton is itself a `role="status"`.
    await findByText('#renders');
    expect(getByRole('status').textContent).toBe(
      'Before renders and approvals can reach Slack: activate someone who can approve.',
    );
    // The unmet step is the control that fixes it — it opens the approver panel for a room.
    expect(getByRole('button', { name: /Activate an approver/ })).toBeTruthy();
  });

  it('sends a brand with no workspace to the install link instead of an add control', async () => {
    slackState = 'not_connected';
    rooms = [];
    approvalRooms = [];
    const { findByText, getByRole, queryAllByRole } = renderSection();

    await findByText(/Connect a Slack workspace to this brand first/);
    expect(queryAllByRole('button', { name: /Add a room/ }).length).toBe(0);
    expect(getByRole('link', { name: 'Connect Slack' }).getAttribute('href')).toContain(
      `brandId=${BRAND}`,
    );
    expect(getByRole('link', { name: /Connect a Slack workspace/ })).toBeTruthy();
  });
});
