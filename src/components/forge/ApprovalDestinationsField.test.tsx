/**
 * ApprovalDestinationsField against a mocked approvals client: the brand's Slack and WhatsApp
 * rooms with their approver counts, a controlled multi-select, the zero-approver warning, the
 * no-rooms explanation, and "Manage approvers" opening that room's panel.
 */

import { afterEach, expect, mock, test } from 'bun:test';
import type { RenderApprovalDestination } from '@continuum/contracts';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { useState } from 'react';

const BRAND = '22222222-2222-4222-8222-222222222222';
const SLACK_ROOM: RenderApprovalDestination = {
  id: '77777777-7777-4777-8777-777777777771',
  platform: 'slack',
  role: 'client',
  name: 'client-review',
  activeApprovers: 2,
  requestedApprovers: 1,
};
const WHATSAPP_ROOM: RenderApprovalDestination = {
  id: '77777777-7777-4777-8777-777777777772',
  platform: 'whatsapp',
  role: 'client',
  name: 'Vivo47 approvals',
  activeApprovers: 0,
  requestedApprovers: 0,
};

let rooms: RenderApprovalDestination[] = [SLACK_ROOM, WHATSAPP_ROOM];
let defaultDestinationIds: string[] | undefined;
const fetchApprovalDestinations = mock(async (_brandId: string) => ({
  destinations: rooms,
  defaultDestinationIds,
}));
const fetchDestinationApprovers = mock(async (_destinationId: string) => []);

mock.module('@/lib/library/renderApprovals', () => ({
  fetchRenderApprovals: async () => [],
  decideRenderApproval: async () => {
    throw new Error('not in this test');
  },
  fetchApprovalDestinations,
  fetchDestinationApprovers,
  addDestinationApprover: async () => {
    throw new Error('not in this test');
  },
  activateDestinationApprover: async () => {
    throw new Error('not in this test');
  },
  revokeDestinationApprover: async () => {
    throw new Error('not in this test');
  },
}));
mock.module('@/lib/library/commentAuthors', () => ({
  fetchBrandAuthors: async () => new Map(),
}));
mock.module('@/lib/supabase/client', () => ({
  createSupabaseBrowserClient: () => ({}),
}));

import { ApprovalDestinationsField } from './ApprovalDestinationsField';

afterEach(() => {
  cleanup();
  rooms = [SLACK_ROOM, WHATSAPP_ROOM];
  defaultDestinationIds = undefined;
  fetchApprovalDestinations.mockClear();
  fetchDestinationApprovers.mockClear();
});

const picked: string[][] = [];
function Harness() {
  const [value, setValue] = useState<string[]>([]);
  return (
    <ApprovalDestinationsField
      brandId={BRAND}
      value={value}
      onChange={(next) => {
        picked.push(next);
        setValue(next);
      }}
    />
  );
}

const renderField = () =>
  render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      <Harness />
    </QueryClientProvider>,
  );

/** The room row's control: a shadcn Checkbox renders a button, not an <input>. */
const roomBox = (name: RegExp) => screen.getByRole('checkbox', { name });
const isChecked = (box: Element) => box.getAttribute('aria-checked') === 'true';
/** Click the row the way a person does — on its label, never on the control inside it. */
const clickRoom = (label: string) => fireEvent.click(screen.getByText(label));

test('lists each room with its platform and approver count, and selects several', async () => {
  picked.length = 0;
  renderField();
  const slack = await screen.findByRole('checkbox', { name: /#client-review/ });
  const whatsapp = roomBox(/Vivo47 approvals/);
  expect(fetchApprovalDestinations).toHaveBeenCalledWith(BRAND);
  expect(screen.getAllByLabelText('Slack')).toHaveLength(1);
  expect(screen.getAllByLabelText('WhatsApp')).toHaveLength(1);
  expect(screen.getByText('2 approvers · 1 asking')).toBeTruthy();
  expect(screen.getByText('no approvers yet')).toBeTruthy();

  clickRoom('#client-review');
  expect(isChecked(slack)).toBe(true);
  expect(screen.queryAllByRole('status')).toHaveLength(0);

  // A room nobody can approve in still receives the package: a warning, never a refusal.
  clickRoom('Vivo47 approvals');
  expect(picked).toEqual([[SLACK_ROOM.id], [SLACK_ROOM.id, WHATSAPP_ROOM.id]]);
  expect(screen.getByRole('status').textContent).toContain(
    'Nobody can approve in Vivo47 approvals',
  );

  clickRoom('#client-review');
  expect(picked.at(-1)).toEqual([WHATSAPP_ROOM.id]);
});

test('a brand with no rooms is told its ads are approved in Forge, and where rooms come from', async () => {
  rooms = [];
  renderField();
  const empty = await screen.findByText(/wait under Approvals on this page/);
  expect(empty.textContent).toContain('until a brand member approves them');
  expect(empty.textContent).toContain('Slack');
  expect(empty.textContent).toContain('WhatsApp groups are added by a Continuum operator');
  expect(screen.queryAllByRole('checkbox')).toHaveLength(0);
});

test('Manage approvers opens that room’s approver panel and closes it again', async () => {
  renderField();
  const manage = await screen.findByRole('button', {
    name: 'Manage approvers for Vivo47 approvals',
  });
  fireEvent.click(manage);
  expect(await screen.findByRole('group', { name: 'Approvers for Vivo47 approvals' })).toBeTruthy();
  await waitFor(() => expect(fetchDestinationApprovers).toHaveBeenCalledWith(WHATSAPP_ROOM.id));
  expect(manage.getAttribute('aria-expanded')).toBe('true');

  fireEvent.click(manage);
  expect(screen.queryAllByRole('group', { name: 'Approvers for Vivo47 approvals' })).toHaveLength(
    0,
  );
});

test('pre-selects the rooms this brand last asked in', async () => {
  picked.length = 0;
  defaultDestinationIds = [WHATSAPP_ROOM.id];
  renderField();
  const whatsapp = await screen.findByRole('checkbox', { name: /Vivo47 approvals/ });
  await waitFor(() => expect(isChecked(whatsapp)).toBe(true));
  expect(isChecked(roomBox(/#client-review/))).toBe(false);
});

test('clearing every room stays cleared — the default does not argue back', async () => {
  picked.length = 0;
  defaultDestinationIds = [WHATSAPP_ROOM.id];
  renderField();
  const whatsapp = await screen.findByRole('checkbox', { name: /Vivo47 approvals/ });
  await waitFor(() => expect(isChecked(whatsapp)).toBe(true));

  clickRoom('Vivo47 approvals');
  await waitFor(() => expect(isChecked(whatsapp)).toBe(false));
  // A re-seed here would silently put the render back into a room the person just took it out of.
  expect(picked.at(-1)).toEqual([]);
});
