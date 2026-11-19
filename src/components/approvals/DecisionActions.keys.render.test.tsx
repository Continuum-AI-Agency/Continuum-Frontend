import { afterEach, beforeEach, describe, expect, it, mock } from 'bun:test';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent } from '@testing-library/react';
import { render } from '@/i18n/__tests__/render';
import type { RuleAction } from '@/lib/approvals/types';

// PP-DT-C-approvals-enter-on-any-control-approves (deep test 2026-10-31, lane C, persona 3):
// Approvals binds Enter and "a" on the WINDOW to "approve the focused action", skipping only
// inputs, textareas and contenteditable. Enter is how a keyboard user activates the control they
// focused — the item's menu, the keyboard-shortcuts help, the queue view toggle, a sidebar link —
// and the handler turned each of those into an approval that executes against the ad platform,
// with no confirm and no undo. Held down, Enter auto-repeats and approves item after item as the
// queue advances.
//
// The transport is the only fake: approveAction is what the edge call would be, counted.

const approveAction = mock(async () => ({ ok: true }));
mock.module('@/lib/approvals/client', () => ({
  approveAction,
  rejectAction: mock(async () => ({ ok: true })),
  getAction: mock(async () => ({})),
  listActions: mock(async () => ({ actions: [], total: 0 })),
  getDryRunMode: mock(async () => ({ dryRun: false })),
}));

const { DecisionActions } = await import('./DecisionActions');

const action: RuleAction = {
  id: 'ra-1',
  status: 'PENDING',
  action_type: 'PAUSE_ADSET',
  scope_type: 'ADSET',
  scope_id: 'adset-1',
  action_payload: {},
  rule_name: 'CPA guard',
  created_at: '2026-10-31T10:00:00.000Z',
};

function renderWithOutsideControls() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      <button type="button" aria-label="Keyboard shortcuts">
        ?
      </button>
      <button type="button" aria-haspopup="menu" aria-label="More actions">
        …
      </button>
      <a href="/scale">Performance +</a>
      <DecisionActions action={action} brandId="brand-1" onAdvance={() => {}} />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  approveAction.mockClear();
});

afterEach(() => {
  cleanup();
});

describe('Approvals — global approve keys', () => {
  it('Enter on a focused button activates that button, it does not approve', async () => {
    const { getByLabelText } = renderWithOutsideControls();
    const help = getByLabelText('Keyboard shortcuts');
    help.focus();
    fireEvent.keyDown(help, { key: 'Enter' });
    await Promise.resolve();
    expect(approveAction).not.toHaveBeenCalled();
  });

  it('Enter on the item menu trigger does not approve', async () => {
    const { getByLabelText } = renderWithOutsideControls();
    const menu = getByLabelText('More actions');
    menu.focus();
    fireEvent.keyDown(menu, { key: 'Enter' });
    await Promise.resolve();
    expect(approveAction).not.toHaveBeenCalled();
  });

  it('"a" typed with a link focused does not approve', async () => {
    const { getByText } = renderWithOutsideControls();
    const link = getByText('Performance +');
    link.focus();
    fireEvent.keyDown(link, { key: 'a' });
    await Promise.resolve();
    expect(approveAction).not.toHaveBeenCalled();
  });

  it('an auto-repeated Enter (key held down) never approves', async () => {
    renderWithOutsideControls();
    fireEvent.keyDown(document.body, { key: 'Enter', repeat: true });
    await Promise.resolve();
    expect(approveAction).not.toHaveBeenCalled();
  });

  it('Enter with nothing focused still approves the focused action (the shortcut stays)', async () => {
    renderWithOutsideControls();
    fireEvent.keyDown(document.body, { key: 'Enter' });
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(approveAction).toHaveBeenCalledTimes(1);
  });
});
