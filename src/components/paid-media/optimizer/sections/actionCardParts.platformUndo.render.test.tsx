import { afterEach, describe, expect, it, mock } from 'bun:test';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, waitFor } from '@testing-library/react';

// Activity's Undo on a Google write (G4): it goes through optimizer-apply-action-revert — the
// platform's own check first, the write only on confirm — because the Meta revert edge answers
// 409 for any other platform. A Meta row keeps its own dialog.
const sent: Record<string, unknown>[] = [];
const respond = (dryRun: boolean) => ({
  ok: true,
  dryRun,
  runId: '9a9a9a9a-0000-4000-8000-000000000001',
  result: {
    status: dryRun ? 'would_revert' : 'reverted',
    audit_id: AUDIT,
    revert_audit_id: dryRun ? null : '9a9a9a9a-0000-4000-8000-000000000002',
    kind: 'set_budget',
    ref: null,
    restores: { minor: 80000, currency: 'MXN' },
  },
});
const realData = await import('../useOptimizerData');
mock.module('../useOptimizerData', () => ({
  ...realData,
  useRevertOptimizerAction: () => ({
    mutateAsync: async (body: Record<string, unknown>) => {
      sent.push(body);
      return respond(body.dryRun === true);
    },
    isPending: false,
  }),
}));

const { ActionRevertControl } = await import('./actionCardParts');

const AUDIT = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const PORTFOLIO = '5aaf5931-7407-4940-aab6-52e914bced45';

const row = (over: Record<string, unknown>) =>
  ({
    id: AUDIT,
    ts: '2026-10-16T10:00:00Z',
    family: 'money',
    op: 'budget',
    portfolio_id: PORTFOLIO,
    portfolio_name: 'Test — Google Ads (Easy Fit)',
    entity_id: '20249528111',
    before: { minor: 80000 },
    after: { minor: 80100 },
    reversible: true,
    reverted_by: null,
    ...over,
  }) as never;

function mount(value: unknown) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <ActionRevertControl
        brandId="6f597f42-b5b5-4b9a-baa5-9a4d9fdb9b64"
        currency="MXN"
        row={value as never}
      />
    </QueryClientProvider>,
  );
}

afterEach(() => {
  cleanup();
  sent.length = 0;
});

describe("ActionRevertControl — a Google write's Undo in Activity", () => {
  it('checks with the platform first, then writes the undo on confirm, by the audit id', async () => {
    const view = mount(row({ receipt: { platform: 'google_ads', requestId: 'req-1' } }));
    fireEvent.click(view.getByTestId('activity-platform-undo'));
    await waitFor(() => expect(sent).toHaveLength(1));
    expect(sent[0]).toEqual({ portfolio_id: PORTFOLIO, audit_id: AUDIT, dryRun: true });
    expect((await view.findByText(/validate_only ok/)).textContent).toContain(
      'Google checked the undo',
    );
    expect(view.getByText(/Back to/).textContent).toContain('800');
    fireEvent.click(view.getByTestId('activity-platform-undo-confirm'));
    await waitFor(() => expect(sent).toHaveLength(2));
    expect(sent[1]).toEqual({ portfolio_id: PORTFOLIO, audit_id: AUDIT, dryRun: false });
    expect((await view.findByText(/Undone\./)).textContent).toContain('recorded in Activity');
  });

  it('keeps the Meta dialog for a Meta row, and offers nothing for a row already undone', () => {
    const meta = mount(row({ receipt: { fbtrace_id: 'fb-1' } }));
    expect(meta.queryByTestId('activity-platform-undo')).toBeNull();
    cleanup();
    const undone = mount(
      row({
        receipt: { platform: 'google_ads' },
        reverted_by: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
      }),
    );
    expect(undone.queryByTestId('activity-platform-undo')).toBeNull();
  });
});
