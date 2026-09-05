/**
 * The card is the last thing between a human and a Meta write, so what it must prove is
 * narrow: it shows the EXACT arguments that will run, and the button it offers reports
 * the approval id the resume is keyed on. A card that renders a friendly summary but
 * hands back the wrong id approves a different call than the one on screen.
 */

import { afterEach, describe, expect, it, mock } from 'bun:test';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
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
});
