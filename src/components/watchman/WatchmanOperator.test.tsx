import { withSource } from '@ui-sdk/react/observe';
import './testDom';
import { afterEach, describe, expect, it, mock } from 'bun:test';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, screen, waitFor } from '@testing-library/react';
import { render } from '@/i18n/__tests__/render';
import { ApiError } from '@/lib/api/errors';

const BRAND = '11111111-1111-4111-8111-111111111111';
const WM1 = '22222222-2222-4222-8222-222222222222';
const WM2 = '33333333-3333-4333-8333-333333333333';
const PROPOSAL = '44444444-4444-4444-8444-444444444444';
const stamp = '2026-11-26T10:00:00Z';
const profile = (id: string, name: string, role: string) => ({
  id,
  brand_id: BRAND,
  name,
  role,
  execution_lane: role === 'performance' ? 'paid' : 'organic',
  instructions: `${name} owns ${role} work.`,
  timezone: 'UTC',
  status: 'active',
});
const readiness = {
  state: 'ready',
  checked_at: stamp,
  checks: ['worker', 'runtime', 'credential', 'account', 'budget', 'entitlement'].map((key) => ({
    key,
    status: 'ready',
    reason: null,
    recovery_action: null,
  })),
};
const teammate = (id: string, name: string, role: string) => ({
  profile: profile(id, name, role),
  lifecycle: 'working',
  readiness,
  budget: { month_spend_usd: 1, budget_usd: 25, state: 'green' },
  active_work_count: 1,
  waiting_count: 0,
  last_activity_at: stamp,
});
const attention = {
  id: PROPOSAL,
  watchman_id: WM1,
  type: 'approval',
  title: 'Review Friday creative',
  detail: 'One exact render is waiting.',
  created_at: stamp,
  conversation_id: 'launch-thread',
  block: {
    id: 'approval-card',
    type: 'approval',
    proposal_id: PROPOSAL,
    operation_id: 'exact-render-1',
    version: 7,
    summary: 'Render revision 9',
    facts: [{ label: 'Asset', value: 'Launch revision 9' }],
    expires_at: '2099-01-01T00:00:00Z',
  },
};
let canManage = true;
let failSend = false;
let firstSetup = false;
let historyFailure: number | undefined;
let dashboardFailure: number | undefined;
let privateHistory = false;
let restoringSetup = false;
const setupCalls: Array<Record<string, unknown>> = [];
const sent: Array<Record<string, unknown>> = [];
const conversations: string[] = [];
const clients: QueryClient[] = [];
mock.module('@/lib/watchman/api', () => ({
  manageWatchman: async (_brand: string, input: Record<string, unknown>) => {
    if (input.action !== 'create') return {};
    setupCalls.push(input);
    firstSetup = false;
    return {
      watchman_id: WM1,
      status: 'paused',
      setup: {
        request_id: WM1,
        brand_id: BRAND,
        watchman_id: WM1,
        version: 2,
        status: 'failed',
        completed_stages: ['principal', 'teammate'],
        readiness: null,
        error: 'Credential setup interrupted',
        updated_at: stamp,
      },
    };
  },
  interactWatchman: async (input: Record<string, unknown>) => {
    sent.push(input);
    if (failSend) throw new ApiError('Temporarily unavailable', 503, 'unavailable');
    return {
      id: 'reply-1',
      conversation_id: input.conversation_id,
      watchman_id: input.watchman_id,
      sequence: 2,
      created_at: stamp,
      blocks: [{ id: 'receipt', type: 'text', text: 'Assignment saved for follow-up.' }],
    };
  },
  watchmanReads: {
    dashboard: async () => {
      if (dashboardFailure)
        throw new ApiError('Dashboard access denied', dashboardFailure, 'forbidden');
      return {
        brand_id: BRAND,
        generated_at: stamp,
        can_manage: canManage,
        partial: false,
        issues: [],
        teammates: firstSetup
          ? []
          : [teammate(WM1, 'Scout', 'content'), teammate(WM2, 'Analyst', 'performance')],
        work: [],
        needs_you: [attention],
      };
    },
    conversation: async (_brand: string, id: string, conversation: string) => {
      conversations.push(id);
      if (historyFailure)
        throw new ApiError('History unavailable', historyFailure, 'history_error');
      return {
        conversation_id: conversation,
        watchman_id: id,
        version: 0,
        events: [],
        messages: privateHistory
          ? [
              {
                id: 'private-message',
                conversation_id: conversation,
                watchman_id: id,
                sequence: 1,
                created_at: stamp,
                blocks: [{ id: 'private-block', type: 'text', text: 'Private launch strategy' }],
              },
            ]
          : [],
      };
    },
    setup: async () =>
      restoringSetup
        ? {
            input: {
              request_id: WM1,
              kind: 'organic',
              role: 'content',
              name: 'Original teammate',
              instructions: 'Original durable brief',
              first_assignment: 'Draft the plan',
              timezone: 'UTC',
              budget_usd_month: 25,
            },
            setup: {
              request_id: WM1,
              brand_id: BRAND,
              watchman_id: WM1,
              version: 2,
              status: 'failed',
              completed_stages: ['principal', 'teammate'],
              readiness: null,
              error: 'Credential setup interrupted',
              updated_at: stamp,
            },
          }
        : null,
  },
  watchmanQueryKeys: {
    all: (brand: string) => ['watchman', brand],
    part: (brand: string, part: string, id?: string) => ['watchman', brand, part, id ?? null],
  },
}));
mock.module('@/components/ui/SafeMarkdownLazy', () => ({
  SafeMarkdown: ({ content }: { content: string }) => <p>{content}</p>,
}));
const { WatchmanOperator } = await import('./WatchmanOperator');
const mount = () => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  clients.push(client);
  return render(
    <QueryClientProvider client={client}>
      <WatchmanOperator brandId={BRAND} />
    </QueryClientProvider>,
  );
};
afterEach(() => {
  cleanup();
  clients.splice(0).forEach((client) => client.clear());
  canManage = true;
  failSend = false;
  firstSetup = false;
  historyFailure = undefined;
  dashboardFailure = undefined;
  privateHistory = false;
  restoringSetup = false;
  setupCalls.length = 0;
  sent.length = 0;
  conversations.length = 0;
  window.localStorage.clear();
  window.history.replaceState(null, '', '/');
});

describe('Watchman teammate workspace', () => {
  it('shows all teammates and switches the same work surface to the chosen owner', async () => {
    mount();
    const analyst = await screen.findByRole('button', { name: /Analyst/ });
    expect(screen.getByRole('button', { name: /Scout/, pressed: true })).toBeTruthy();
    fireEvent.click(analyst);
    await screen.findByText('Analyst owns performance work.');
    await waitFor(() => expect(conversations).toContain(WM2));
    expect(window.location.search).toContain(WM2);
  });
  it('sends the exact canonical operation and version when a person approves', async () => {
    mount();
    fireEvent.click(await screen.findByRole('button', { name: /Review Friday creative/ }));
    const approve = await screen.findByRole('button', { name: 'Approve' });
    withSource('mouse', () => fireEvent.click(approve));
    await waitFor(() => expect(sent).toHaveLength(1));
    expect(sent[0]).toMatchObject({
      brand_id: BRAND,
      watchman_id: WM1,
      conversation_id: 'launch-thread',
      action: {
        type: 'decide_approval',
        proposal_id: PROPOSAL,
        operation_id: 'exact-render-1',
        expected_version: 7,
        decision: 'approve',
      },
    });
  });
  it('lets a viewer follow work while keeping mutations unavailable', async () => {
    canManage = false;
    mount();
    await screen.findByText(/You can follow the work/);
    expect(screen.queryByRole('button', { name: 'Add teammate' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: /Review Friday creative/ }));
    const approval = await screen.findByRole('button', { name: 'Approve' });
    expect(
      approval.getAttribute('aria-disabled') === 'true' || approval.hasAttribute('disabled'),
    ).toBe(true);
  });
  it('retains failed input and reuses the request identity on retry', async () => {
    failSend = true;
    mount();
    const input = await screen.findByLabelText('Message your teammate');
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Send' }).hasAttribute('disabled')).toBe(false),
    );
    fireEvent.change(input, { target: { value: 'Investigate our conversions' } });
    fireEvent.click(screen.getByRole('button', { name: 'Send' }));
    await waitFor(() => expect(sent).toHaveLength(1));
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Send' }).hasAttribute('disabled')).toBe(false),
    );
    expect((input as HTMLTextAreaElement).value).toBe('Investigate our conversions');
    failSend = false;
    fireEvent.click(screen.getByRole('button', { name: 'Send' }));
    await waitFor(() => expect(sent).toHaveLength(2));
    expect(sent[1]?.request_id).toBe(sent[0]?.request_id);
  });
  it('keeps first setup and its retry visible when partial provisioning creates a roster row', async () => {
    firstSetup = true;
    mount();
    fireEvent.click(await screen.findByRole('button', { name: 'Continue' }));
    fireEvent.click(screen.getByRole('button', { name: 'Set up teammate' }));
    await screen.findByText('Credential setup interrupted');
    expect(screen.getByRole('button', { name: 'Set up teammate' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: /Scout/ })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Set up teammate' }));
    await waitFor(() => expect(setupCalls).toHaveLength(2));
    expect(setupCalls[1]?.create).toEqual(setupCalls[0]?.create);
  });
  it('reopens the durable setup from its URL even when a teammate row already exists', async () => {
    restoringSetup = true;
    window.history.replaceState(null, '', `/?setupRequest=${WM1}`);
    mount();
    await screen.findByDisplayValue('Original teammate');
    expect(screen.getByDisplayValue('Original durable brief')).toBeTruthy();
    expect(screen.queryByRole('button', { name: /Scout/ })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    await screen.findByRole('button', { name: /Scout/, pressed: true });
    expect(window.location.search).not.toContain('setupRequest');
  });
  for (const status of [401, 403]) {
    it(`clears cached private history and disables replies after a ${status}`, async () => {
      privateHistory = true;
      mount();
      await screen.findByText('Private launch strategy');
      const client = clients.at(-1);
      historyFailure = status;
      await client?.invalidateQueries({ queryKey: ['watchman', BRAND, 'conversation'] });
      await waitFor(() =>
        expect(screen.queryByText('Private launch strategy') === null).toBe(true),
      );
      expect(screen.getByRole('button', { name: 'Send' }).hasAttribute('disabled')).toBe(true);
      expect(
        client?.getQueryData(['watchman', BRAND, 'conversation', WM1, `watchman:${WM1}`]),
      ).toBeUndefined();
    });
  }
  it('retains cached history and the draft after a transient read failure', async () => {
    privateHistory = true;
    mount();
    await screen.findByText('Private launch strategy');
    const input = screen.getByLabelText('Message your teammate');
    fireEvent.change(input, { target: { value: 'Keep this draft' } });
    historyFailure = 503;
    await clients.at(-1)?.invalidateQueries({ queryKey: ['watchman', BRAND, 'conversation'] });
    await screen.findByRole('alert');
    expect(screen.getByText('Private launch strategy')).toBeTruthy();
    expect((input as HTMLTextAreaElement).value).toBe('Keep this draft');
  });
  it('clears all cached Watchman views after dashboard access is denied', async () => {
    privateHistory = true;
    mount();
    await screen.findByText('Private launch strategy');
    dashboardFailure = 403;
    await clients.at(-1)?.invalidateQueries({ queryKey: ['watchman', BRAND, 'dashboard'] });
    await waitFor(() => expect(screen.queryByText('Private launch strategy') === null).toBe(true));
    expect(
      clients
        .at(-1)
        ?.getQueriesData({ queryKey: ['watchman', BRAND] })
        .every(([, data]) => data === undefined),
    ).toBe(true);
  });
});
