import { withSource } from '@ui-sdk/react/observe';
import '../testDom';
import { afterEach, describe, expect, it, mock } from 'bun:test';
import type { WatchmanUiBlock } from '@continuum/contracts';
import { act, cleanup, fireEvent, screen } from '@testing-library/react';
import { createAgent } from '@ui-sdk/react/agent';
import { render } from '@/i18n/__tests__/render';

mock.module('@/components/ui/SafeMarkdownLazy', () => ({
  SafeMarkdown: ({ content }: { content: string }) => <p>{content}</p>,
}));
const { WatchmanCard, isHumanActionSource } = await import('./WatchmanCards');
const approval: Extract<WatchmanUiBlock, { type: 'approval' }> = {
  id: 'approval-card',
  type: 'approval',
  proposal_id: '11111111-1111-4111-8111-111111111111',
  operation_id: 'render-confirm-7',
  version: 3,
  summary: 'Render the approved launch creative',
  facts: [
    { label: 'Asset version', value: 'Launch creative, revision 9' },
    { label: 'Maximum cost', value: '$2.00' },
  ],
  expires_at: '2099-01-01T00:00:00Z',
};
afterEach(cleanup);

describe('trusted generative Watchman cards', () => {
  it('shows material facts and sends the exact versioned decision', async () => {
    const action = mock(async () => undefined);
    render(<WatchmanCard block={approval} canManage onAction={action} />);
    expect(screen.getByText('Launch creative, revision 9')).toBeTruthy();
    // React tests model a mouse source explicitly; real trusted-event attribution needs browser acceptance.
    await act(async () => {
      withSource('mouse', () => fireEvent.click(screen.getByRole('button', { name: 'Approve' })));
    });
    expect(action).toHaveBeenCalledWith({
      type: 'decide_approval',
      proposal_id: approval.proposal_id,
      operation_id: 'render-confirm-7',
      expected_version: 3,
      decision: 'approve',
    });
  });
  it('refuses UI agent confirmation without a person', async () => {
    const action = mock(async () => undefined);
    const agent = createAgent();
    render(<WatchmanCard block={approval} canManage onAction={action} />);
    let result: Awaited<ReturnType<typeof agent.act>> | undefined;
    await act(async () => {
      result = await agent.act({ steps: [{ ref: 'Approve', action: 'press' }] });
    });
    expect(result?.ok).toBe(false);
    expect(action).not.toHaveBeenCalled();
    expect(isHumanActionSource('agent')).toBe(false);
    expect(isHumanActionSource('programmatic')).toBe(false);
    expect(isHumanActionSource('virtual')).toBe(true);
  });
  it('does not offer an expired or read-only approval', () => {
    render(
      <WatchmanCard
        block={{ ...approval, expires_at: '2020-01-01T00:00:00Z' }}
        canManage={false}
        onAction={async () => undefined}
      />,
    );
    const approve = screen.getByRole('button', { name: 'Approve' });
    expect(
      approve.getAttribute('aria-disabled') === 'true' || approve.hasAttribute('disabled'),
    ).toBe(true);
    expect(screen.getByText(/This approval expired/)).toBeTruthy();
  });
});
