/**
 * The card is the last thing between a human and a Meta write, so what it must prove is
 * narrow: it shows the EXACT arguments that will run, and the button it offers reports
 * the approval id the resume is keyed on. A card that renders a friendly summary but
 * hands back the wrong id approves a different call than the one on screen.
 */

import { afterEach, describe, expect, it, mock } from 'bun:test';
import { jainaToolApprovalRequiredPayloadSchema } from '@continuum/contracts';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import type { ReactNode } from 'react';
import { JainaToolApprovalCard } from './JainaToolApprovalCard';

const fetchSummary = mock(() => Promise.resolve(null));
mock.module('@/lib/paid-media/audience-group-client', () => ({
  fetchAudienceGroupVersionSummary: fetchSummary,
}));

const approval = (overrides: Record<string, unknown> = {}) => ({
  approvalId: 'appr_1',
  toolCallId: 'call_1',
  toolName: 'pipeline_run',
  input: { pipeline_id: 'pipe_7', dry_run: false, inputs: { rows: 3 } },
  expiresAt: '2099-01-01T00:00:00.000Z',
  ...overrides,
});

const wrapper = ({ children }: { children: ReactNode }) => (
  <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
    {children}
  </QueryClientProvider>
);

afterEach(() => {
  cleanup();
  fetchSummary.mockClear();
});

describe('JainaToolApprovalCard', () => {
  it('renders the tool label and every proposed argument', () => {
    render(
      <JainaToolApprovalCard
        approval={approval()}
        optimisticDecision={null}
        isStreaming={false}
        onDecide={() => {}}
      />,
      { wrapper },
    );

    expect(screen.getByText('Run pipeline')).toBeTruthy();
    expect(screen.getByText('pipeline_id')).toBeTruthy();
    expect(screen.getByText('pipe_7')).toBeTruthy();
    expect(screen.getByText('dry_run')).toBeTruthy();
    expect(screen.getByText('false')).toBeTruthy();
    // Nested values stay readable as compact JSON rather than vanishing.
    expect(screen.getByText('{"rows":3}')).toBeTruthy();
  });

  it('falls back to the tool name when it has no label', () => {
    render(
      <JainaToolApprovalCard
        approval={approval({ toolName: 'some_future_gated_tool' })}
        optimisticDecision={null}
        isStreaming={false}
        onDecide={() => {}}
      />,
      { wrapper },
    );
    expect(screen.getByText('some_future_gated_tool')).toBeTruthy();
  });

  it('reports the approval it is showing, for both decisions', () => {
    const onDecide = mock(() => {});
    const pending = approval();

    render(
      <JainaToolApprovalCard
        approval={pending}
        optimisticDecision={null}
        isStreaming={false}
        onDecide={onDecide}
      />,
      { wrapper },
    );

    fireEvent.click(screen.getByRole('button', { name: 'Approve' }));
    expect(onDecide).toHaveBeenCalledTimes(1);
    expect(onDecide.mock.calls[0]).toEqual([pending, 'approve'] as never);

    fireEvent.click(screen.getByRole('button', { name: 'Deny' }));
    expect(onDecide.mock.calls[1]).toEqual([pending, 'deny'] as never);
  });

  it('states why a call cannot run and offers no approval, only a dismiss', () => {
    const onDecide = mock(() => {});
    const reason =
      "This ad set optimizes for purchases made in a message conversation (Meta's MESSAGING_PURCHASE_CONVERSION goal), and Jaina can't create ad sets with that goal yet, so it can't make this copy. It can be duplicated in Ads Manager.";
    const blocked = approval({
      toolName: 'duplicate_meta_entity',
      input: {
        level: 'adset',
        source_entity_id: '120',
        optimization_goal: 'MESSAGING_PURCHASE_CONVERSION',
      },
      preview: {
        subject: 'Duplicate adset 120 as a PAUSED copy',
        rows: [{ field: 'status', before: 'ACTIVE', after: 'PAUSED' }],
        blocked: reason,
      },
    });
    expect(jainaToolApprovalRequiredPayloadSchema.safeParse(blocked).success).toBe(true);

    render(
      <JainaToolApprovalCard
        approval={blocked}
        optimisticDecision={null}
        isStreaming={false}
        onDecide={onDecide}
      />,
      { wrapper },
    );

    expect(screen.getByRole('note').textContent).toBe(reason);
    expect(screen.queryByRole('button', { name: 'Approve' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Dismiss' }));
    expect(onDecide.mock.calls[0]).toEqual([blocked, 'deny'] as never);
  });

  it('retires the buttons the moment a decision is in flight', () => {
    render(
      <JainaToolApprovalCard
        approval={approval()}
        optimisticDecision="approve"
        isStreaming
        onDecide={() => {}}
      />,
      { wrapper },
    );

    expect(screen.queryByRole('button', { name: 'Approve' })).toBeNull();
    expect(screen.getByText('Approved')).toBeTruthy();
  });

  it('says nothing ran, and offers no buttons, once the approval has expired', () => {
    render(
      <JainaToolApprovalCard
        approval={approval({ expiresAt: '2020-01-01T00:00:00.000Z' })}
        optimisticDecision={null}
        isStreaming={false}
        onDecide={() => {}}
      />,
      { wrapper },
    );

    expect(screen.queryByRole('button', { name: 'Approve' })).toBeNull();
    expect(screen.getByText('Expired')).toBeTruthy();
    expect(screen.getByText(/expired, so nothing ran/i)).toBeTruthy();
  });

  it('reads the audience group manifest only for an audience publish', async () => {
    fetchSummary.mockImplementation(() =>
      Promise.resolve({ name: 'Warm site visitors', memberCount: 4 } as never),
    );

    render(
      <JainaToolApprovalCard
        approval={approval({
          toolName: 'audience_group_publish',
          input: { group_version_id: 'agv_1', content_hash: 'c'.repeat(64) },
        })}
        optimisticDecision={null}
        isStreaming={false}
        onDecide={() => {}}
      />,
      { wrapper },
    );

    expect(screen.getByText('Publish audience group to Meta')).toBeTruthy();
    expect(await screen.findByText('Warm site visitors — 4 audiences')).toBeTruthy();
    // The raw input stays on screen beside the friendly name — it is what actually runs.
    expect(screen.getByText('agv_1')).toBeTruthy();
  });

  // ── the before -> after table ──────────────────────────────────────────────
  //
  // Parsed through the VENDORED contract rather than hand-typed: the wire schema is the
  // only thing that says `preview` survives the trip, and a hand-built object would keep
  // passing after the contract dropped the field.

  const withPreview = jainaToolApprovalRequiredPayloadSchema.parse({
    approvalId: 'appr_2',
    toolCallId: 'call_2',
    toolName: 'pause_meta_entity',
    input: { entity_id: '120210', expected_status: 'ACTIVE' },
    expiresAt: '2099-01-01T00:00:00.000Z',
    preview: {
      subject: 'Ad set 120210 · Summer Sale',
      rows: [
        { field: 'daily_budget', before: 40, after: 50, changePct: 25, unit: 'USD' },
        { field: 'status', before: 'ACTIVE', after: 'PAUSED' },
      ],
    },
  });

  it('renders every preview row as before -> after, with a signed change rate', () => {
    render(
      <JainaToolApprovalCard
        approval={withPreview}
        optimisticDecision={null}
        isStreaming={false}
        onDecide={() => {}}
      />,
      { wrapper },
    );

    expect(screen.getByText('Pause campaign / ad set / ad')).toBeTruthy();

    // Scoped to the table: `ACTIVE` is also the prior in the exact-input list below it,
    // and a page-wide lookup would pass on the wrong element.
    const table = within(screen.getByRole('table'));
    expect(table.getByText('Ad set 120210 · Summer Sale')).toBeTruthy();
    expect(table.getByText('Field')).toBeTruthy();
    expect(table.getByText('Change')).toBeTruthy();

    expect(table.getByText('daily_budget')).toBeTruthy();
    expect(table.getByText('40 USD')).toBeTruthy();
    expect(table.getByText('50 USD')).toBeTruthy();
    expect(table.getByText('+25.0%')).toBeTruthy();

    // A status flip has no rate, so the Change cell carries an arrow, never a fake 0%.
    expect(table.getByText('status')).toBeTruthy();
    expect(table.getByText('ACTIVE')).toBeTruthy();
    expect(table.getByText('PAUSED')).toBeTruthy();
    expect(table.getByText('→')).toBeTruthy();
  });

  it('keeps the exact input on the card, collapsed, when a preview is shown', () => {
    const { container } = render(
      <JainaToolApprovalCard
        approval={withPreview}
        optimisticDecision={null}
        isStreaming={false}
        onDecide={() => {}}
      />,
      { wrapper },
    );

    const disclosure = container.querySelector('details');
    expect(disclosure).toBeTruthy();
    // Collapsed, not removed — the arguments are what the approval actually authorises.
    expect(disclosure?.hasAttribute('open')).toBe(false);
    const list = within(disclosure as HTMLElement);
    expect(list.getByText('Exact input')).toBeTruthy();
    expect(list.getByText('entity_id')).toBeTruthy();
    expect(list.getByText('120210')).toBeTruthy();
    expect(list.getByText('expected_status')).toBeTruthy();
    expect(list.getByText('ACTIVE')).toBeTruthy();
  });

  it('renders exactly as before for a frame that carries no preview', () => {
    const { container } = render(
      <JainaToolApprovalCard
        approval={approval()}
        optimisticDecision={null}
        isStreaming={false}
        onDecide={() => {}}
      />,
      { wrapper },
    );

    expect(container.querySelector('table')).toBeNull();
    expect(container.querySelector('details')).toBeNull();
    // The definition list is still open on the card, exactly as it was.
    expect(screen.getByText('pipeline_id')).toBeTruthy();
    expect(screen.getByText('pipe_7')).toBeTruthy();
  });

  it('leaves the definition list standing when the manifest read is refused', async () => {
    fetchSummary.mockImplementation(() => Promise.reject(new Error('permission denied')));

    render(
      <JainaToolApprovalCard
        approval={approval({
          toolName: 'audience_group_publish',
          input: { group_version_id: 'agv_2' },
        })}
        optimisticDecision={null}
        isStreaming={false}
        onDecide={() => {}}
      />,
      { wrapper },
    );

    expect(screen.getByText('agv_2')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Approve' })).toBeTruthy();
  });

  // ── a card that offers a choice of approval (change_meta_budget_bid) ───────
  //
  // Ramiro's no-cap rule: the card states every change and offers apply OR pause-for-review.
  // Parsed through the vendored contract, like the preview above.

  const budgetCard = jainaToolApprovalRequiredPayloadSchema.parse({
    approvalId: 'appr_3',
    toolCallId: 'call_3',
    toolName: 'change_meta_budget_bid',
    input: {
      changes: [
        {
          entity_id: '120201',
          level: 'adset',
          entity_name: 'Prospecting · Broad',
          field: 'daily_budget',
          expected_current_minor_units: 10000,
          new_minor_units: 15000,
          currency: 'MXN',
        },
        {
          entity_id: '120202',
          level: 'adset',
          entity_name: 'Retargeting',
          field: 'daily_budget',
          expected_current_minor_units: 20000,
          new_minor_units: 10000,
          currency: 'MXN',
        },
      ],
      affected_adset_ids_for_review: [
        { adset_id: '120201', name: 'Prospecting · Broad', expected_status: 'ACTIVE' },
        { adset_id: '120202', name: 'Retargeting', expected_status: 'PAUSED' },
      ],
      reason: 'Move budget to the cheaper ad set.',
      idempotency_key: 'key-0000-0003',
    },
    expiresAt: '2099-01-01T00:00:00.000Z',
    preview: {
      subject: '2 changes · Move budget to the cheaper ad set.',
      rows: [
        {
          field: 'Daily budget · Prospecting · Broad',
          before: '$100 MXN',
          after: '$150 MXN',
          changePct: 50,
          difference: '+$50.00 MXN',
        },
        {
          field: 'Daily budget · Retargeting',
          before: '$200 MXN',
          after: '$100 MXN',
          changePct: -50,
          difference: '-$100 MXN',
        },
      ],
    },
  });

  const renderBudget = (onDecide: (...args: unknown[]) => void = () => {}) =>
    render(
      <JainaToolApprovalCard
        approval={budgetCard}
        optimisticDecision={null}
        isStreaming={false}
        onDecide={onDecide}
      />,
      { wrapper },
    );

  it('states how many budgets change, and every entity with before, after and difference', () => {
    renderBudget();
    expect(screen.getByText('Change budgets and bids')).toBeTruthy();
    expect(screen.getByText(/You are about to change 2 budgets\./)).toBeTruthy();

    const table = within(screen.getByRole('table'));
    expect(table.getByText('Entity')).toBeTruthy();
    expect(table.getByText('Difference')).toBeTruthy();
    expect(table.getByText('Daily budget · Prospecting · Broad')).toBeTruthy();
    // The first row's before and the second row's after are both $100 MXN.
    expect(table.getAllByText('$100 MXN')).toHaveLength(2);
    expect(table.getByText('$150 MXN')).toBeTruthy();
    expect(table.getByText('+$50.00 MXN (+50.0%)')).toBeTruthy();
    expect(table.getByText('-$100 MXN (-50.0%)')).toBeTruthy();
  });

  it('names the ad sets a pause for review would stop, and the one it leaves alone', () => {
    renderBudget();
    expect(screen.getByText(/Pausing for review changes no budget or bid/)).toBeTruthy();
    const list = within(screen.getByRole('list'));
    expect(list.getByText('Prospecting · Broad')).toBeTruthy();
    expect(list.getByText(/already paused, left as it is/)).toBeTruthy();
  });

  it('offers apply, pause for review and reject — each an approve with its choice, or a deny', () => {
    const onDecide = mock(() => {});
    renderBudget(onDecide);

    expect(screen.queryByRole('button', { name: 'Approve' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Apply changes' }));
    expect(onDecide.mock.calls[0]).toEqual([budgetCard, 'approve', undefined, 'apply'] as never);

    fireEvent.click(screen.getByRole('button', { name: 'Pause these ad sets for review' }));
    expect(onDecide.mock.calls[1]).toEqual([
      budgetCard,
      'approve',
      undefined,
      'pause_for_review',
    ] as never);

    fireEvent.click(screen.getByRole('button', { name: 'Reject' }));
    expect(onDecide.mock.calls[2]).toEqual([budgetCard, 'deny'] as never);
  });

  it('retires all three buttons once a decision is in flight', () => {
    render(
      <JainaToolApprovalCard
        approval={budgetCard}
        optimisticDecision="approve"
        isStreaming
        onDecide={() => {}}
      />,
      { wrapper },
    );
    expect(screen.queryByRole('button', { name: 'Apply changes' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Pause these ad sets for review' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Reject' })).toBeNull();
  });
});
