/**
 * DestinationApproversPanel against a mocked approvals client: requested approvers lead and are
 * activated in one click, active ones are revoked, revoked ones stay listed and can come back, a
 * brand member or a platform id is added, and a backend refusal is shown in its own words.
 */

import { afterEach, beforeEach, expect, mock, test } from 'bun:test';
import type {
  AddDestinationApproverRequest,
  DestinationApprover,
  RenderApprovalDestination,
} from '@continuum/contracts';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import {
  chooseOption,
  installPickerDomGlobals,
  openSelect,
} from '@/components/automations/workspace/pickers/pickerTestHarness';

installPickerDomGlobals();

const BRAND = '22222222-2222-4222-8222-222222222222';
const MEMBER = '55555555-5555-4555-8555-555555555551';
const ROOM: RenderApprovalDestination = {
  id: '77777777-7777-4777-8777-777777777771',
  platform: 'slack',
  role: 'client',
  name: 'client-review',
  activeApprovers: 1,
  requestedApprovers: 1,
};

const approver = (
  id: string,
  status: DestinationApprover['status'],
  fields: Partial<DestinationApprover> = {},
): DestinationApprover => ({
  id,
  brandId: BRAND,
  destinationId: ROOM.id,
  userId: null,
  platform: 'slack',
  platformUserId: null,
  altPlatformUserId: null,
  displayName: null,
  status,
  addedBy: null,
  createdAt: '2026-09-15T10:00:00.000Z',
  updatedAt: '2026-09-15T10:00:00.000Z',
  ...fields,
});

const ASKING = approver('88888888-8888-4888-8888-888888888881', 'requested', {
  platformUserId: 'U_CLIENT',
  displayName: 'Marta (client)',
});
const ACTIVE = approver('88888888-8888-4888-8888-888888888882', 'active', { userId: MEMBER });
const GONE = approver('88888888-8888-4888-8888-888888888883', 'revoked', {
  platformUserId: 'U_OLD',
  displayName: 'Old approver',
});

// The backend's rows: every write lands here, so the refetch after it reads the change back.
let store: DestinationApprover[] = [];
const write = (next: DestinationApprover) => {
  store = store.some((item) => item.id === next.id)
    ? store.map((item) => (item.id === next.id ? next : item))
    : [...store, next];
  return next;
};
const transition = (approverId: string, status: DestinationApprover['status']) =>
  write({ ...store.find((item) => item.id === approverId)!, status });

const fetchDestinationApprovers = mock(async (_destinationId: string) => store);
const activateDestinationApprover = mock(async (_destinationId: string, approverId: string) =>
  transition(approverId, 'active'),
);
const revokeDestinationApprover = mock(async (_destinationId: string, approverId: string) =>
  transition(approverId, 'revoked'),
);
const addDestinationApprover = mock(
  async (_destinationId: string, body: AddDestinationApproverRequest) =>
    write(
      approver(`88888888-8888-4888-8888-88888888888${store.length + 1}`, 'active', {
        userId: body.userId ?? null,
        platformUserId: body.platformUserId ?? null,
        displayName: body.displayName ?? null,
      }),
    ),
);

mock.module('@/lib/library/renderApprovals', () => ({
  fetchRenderApprovals: async () => [],
  decideRenderApproval: async () => {
    throw new Error('not in this test');
  },
  fetchApprovalDestinations: async () => ({ destinations: [ROOM] }),
  fetchDestinationApprovers,
  addDestinationApprover,
  activateDestinationApprover,
  revokeDestinationApprover,
}));
mock.module('@/lib/library/commentAuthors', () => ({
  fetchBrandAuthors: async () =>
    new Map([
      [MEMBER, { name: null, email: 'ana@vivo47.com' }],
      ['55555555-5555-4555-8555-555555555552', { name: null, email: 'leo@vivo47.com' }],
    ]),
}));
mock.module('@/lib/supabase/client', () => ({
  createSupabaseBrowserClient: () => ({}),
}));

import { DestinationApproversPanel } from './DestinationApproversPanel';

beforeEach(() => {
  store = [ASKING, ACTIVE, GONE];
});
afterEach(() => {
  cleanup();
  for (const fn of [
    fetchDestinationApprovers,
    activateDestinationApprover,
    revokeDestinationApprover,
    addDestinationApprover,
  ])
    fn.mockClear();
});

const renderPanel = () =>
  render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      <DestinationApproversPanel brandId={BRAND} destination={ROOM} />
    </QueryClientProvider>,
  );

const names = (list: HTMLElement) =>
  within(list)
    .getAllByRole('listitem')
    .map((item) => item.querySelector('span')?.textContent);

test('requested approvers lead, and one click activates them', async () => {
  renderPanel();
  const asking = await screen.findByRole('list', { name: 'Requested approvers' });
  expect(fetchDestinationApprovers).toHaveBeenCalledWith(ROOM.id);
  expect(screen.getByText('Asking to approve (1)')).toBeTruthy();
  expect(names(asking)).toEqual(['Marta (client) · U_CLIENT']);
  // A brand member is named by their email once the member list loads.
  await waitFor(() =>
    expect(names(screen.getByRole('list', { name: 'Active approvers' }))).toEqual([
      'ana@vivo47.com',
    ]),
  );
  expect(names(screen.getByRole('list', { name: 'Revoked approvers' }))).toEqual([
    'Old approver · U_OLD',
  ]);

  fireEvent.click(screen.getByRole('button', { name: 'Activate Marta (client)' }));
  await waitFor(() => expect(activateDestinationApprover).toHaveBeenCalledWith(ROOM.id, ASKING.id));
  await waitFor(() =>
    expect(screen.queryAllByRole('list', { name: 'Requested approvers' })).toHaveLength(0),
  );
  expect(names(screen.getByRole('list', { name: 'Active approvers' }))).toEqual([
    'Marta (client) · U_CLIENT',
    'ana@vivo47.com',
  ]);
});

test('revoking an active approver keeps them listed, and a revoked one can be activated again', async () => {
  renderPanel();
  fireEvent.click(await screen.findByRole('button', { name: /^Revoke / }));
  await waitFor(() => expect(revokeDestinationApprover).toHaveBeenCalledWith(ROOM.id, ACTIVE.id));
  await waitFor(() =>
    expect(
      screen.queryByRole('list', { name: 'Revoked approvers' })?.querySelectorAll('li').length,
    ).toBe(2),
  );
  expect(screen.getByText('Can approve (0)')).toBeTruthy();

  fireEvent.click(screen.getByRole('button', { name: 'Activate Old approver' }));
  await waitFor(() => expect(activateDestinationApprover).toHaveBeenCalledWith(ROOM.id, GONE.id));
});

/** The member picker is a Popover + Command combobox: open it, then click the row. */
async function pickMember(email: string) {
  fireEvent.click(screen.getByRole('combobox', { name: 'Brand member' }));
  fireEvent.click(await screen.findByRole('option', { name: new RegExp(email) }));
}

test('adds a brand member by user id, or someone in Slack by id with a display name', async () => {
  renderPanel();
  await screen.findByRole('list', { name: 'Active approvers' });
  const add = screen.getByRole<HTMLButtonElement>('button', { name: 'Add approver' });
  expect(add.disabled).toBe(true);

  await pickMember('leo@vivo47.com');
  fireEvent.click(add);
  await waitFor(() =>
    expect(addDestinationApprover).toHaveBeenCalledWith(ROOM.id, {
      userId: '55555555-5555-4555-8555-555555555552',
    }),
  );
  await waitFor(() =>
    expect(
      screen.queryByRole('list', { name: 'Active approvers' })?.querySelectorAll('li').length,
    ).toBe(2),
  );

  openSelect('Approver kind');
  chooseOption(/Someone in Slack by id/);
  fireEvent.change(screen.getByLabelText('Slack member id'), { target: { value: ' U_NEW ' } });
  fireEvent.change(screen.getByLabelText('Display name'), { target: { value: 'Nia' } });
  fireEvent.click(screen.getByRole('button', { name: 'Add approver' }));
  await waitFor(() =>
    expect(addDestinationApprover).toHaveBeenLastCalledWith(ROOM.id, {
      platformUserId: 'U_NEW',
      displayName: 'Nia',
    }),
  );
});

test('a refused change shows the backend’s reason', async () => {
  addDestinationApprover.mockImplementationOnce(async () => {
    throw new Error('That user is not a member of this brand.');
  });
  renderPanel();
  await screen.findByRole('list', { name: 'Active approvers' });
  fireEvent.click(screen.getByRole('combobox', { name: 'Brand member' }));
  // Ana already approves here, so she is not on offer — adding her again is not an add.
  expect(screen.queryByRole('option', { name: /ana@vivo47.com/ })).toBeNull();
  fireEvent.click(await screen.findByRole('option', { name: /leo@vivo47.com/ }));
  fireEvent.click(screen.getByRole('button', { name: 'Add approver' }));
  expect((await screen.findByRole('alert')).textContent).toBe(
    'That user is not a member of this brand.',
  );
});
