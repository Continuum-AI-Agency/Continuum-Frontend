import { afterEach, beforeEach, describe, expect, it, mock } from 'bun:test';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';

// Spread the real module: mock.module replaces it for the whole process.
const realOptimizerData = await import('../../useOptimizerData');
type Sent = {
  portfolio_id: string;
  actions: unknown[];
  dryRun: boolean;
  recommendation_id?: string;
};
let sent: Sent[] = [];
let answerFor: (request: Sent) => unknown = () => null;
type UndoSent = { portfolio_id: string; audit_id: string; dryRun?: boolean };
let undoSent: UndoSent[] = [];
let undoAnswerFor: (request: UndoSent) => unknown = () => null;
mock.module('../../useOptimizerData', () => ({
  ...realOptimizerData,
  useApplyOptimizerActions: () => ({
    mutateAsync: async (request: Sent) => {
      sent.push(request);
      return answerFor(request);
    },
  }),
  useRevertOptimizerAction: () => ({
    mutateAsync: async (request: UndoSent) => {
      undoSent.push(request);
      return undoAnswerFor(request);
    },
  }),
}));

const { PlatformCardBody } = await import('./PlatformCardBody');
const fixtures = await import('./__fixtures__/platformCards');
const actions = await import('./__fixtures__/platformCardActions');

const result = (status: string, extra: Record<string, unknown> = {}) => ({
  ok: status !== 'refused',
  dryRun: true,
  results: [{ status, kind: 'set_budget', ...extra }],
});

const AUDIT_ID = '0f0f0f0f-0000-4000-8000-000000000001';

const undoEnvelope = (status: string, dryRun: boolean, extra: Record<string, unknown> = {}) => ({
  ok: status === 'would_revert' || status === 'reverted',
  dryRun,
  runId: '0c0c0c0c-0000-4000-8000-000000000001',
  result: {
    status,
    audit_id: AUDIT_ID,
    revert_audit_id: null,
    kind: 'set_budget',
    ref: null,
    restores: { minor: 117_900, currency: 'MXN' },
    ...extra,
  },
});

beforeEach(() => {
  sent = [];
  undoSent = [];
  answerFor = (request) => ({
    ...result(request.dryRun ? 'would_apply' : 'applied', {
      legs: [{ leg: null, status: request.dryRun ? 'would_apply' : 'applied', auditId: AUDIT_ID }],
    }),
    dryRun: request.dryRun,
  });
  undoAnswerFor = (request) =>
    undoEnvelope(request.dryRun ? 'would_revert' : 'reverted', request.dryRun ?? true);
});
afterEach(cleanup);

const target = (action: unknown, recommendationId?: string) => ({
  portfolioId: actions.PORTFOLIO_ID,
  action: action as typeof actions.RAISE_GOOGLE_BUDGET,
  ...(recommendationId ? { recommendationId } : {}),
});

describe('a Google write on a platform card', () => {
  it('previews with validate_only first, then writes only on confirm', async () => {
    render(
      <PlatformCardBody
        action={target(actions.RAISE_GOOGLE_BUDGET, '9b1f0c2e-1111-4222-8333-444455556666')}
        card={fixtures.GOOGLE_BUDGET_LIMITED}
      />,
    );
    const button = screen.getByTestId('platform-card-action');
    expect(button.textContent).toBe('Apply new budget');

    fireEvent.click(button);
    const dialog = await screen.findByTestId('platform-card-action-dialog');
    expect(within(dialog).getByRole('heading').textContent).toBe(
      'Change the campaign budget of "VIVO 47-EKATAR" on Google',
    );
    expect(within(dialog).getByTestId('platform-card-action-change').textContent).toBe(
      '1,179.00 MXN/day → 1,473.75 MXN/day',
    );
    const preview = await within(dialog).findByTestId('platform-card-action-preview');
    expect(preview.textContent).toContain('validate_only ok');
    expect(sent).toEqual([
      {
        portfolio_id: actions.PORTFOLIO_ID,
        actions: [actions.RAISE_GOOGLE_BUDGET],
        dryRun: true,
        recommendation_id: '9b1f0c2e-1111-4222-8333-444455556666',
      },
    ]);

    const confirm = within(dialog).getByTestId('platform-card-action-confirm') as HTMLButtonElement;
    await waitFor(() => expect(confirm.disabled).toBe(false));
    fireEvent.click(confirm);
    const done = await within(dialog).findByTestId('platform-card-action-result');
    expect(done.textContent).toBe('Done. The change is live and recorded in Activity.');
    expect(sent.map((request) => request.dryRun)).toEqual([true, false]);
  });

  it("shows Google's refusal in plain words and never offers to confirm it", async () => {
    answerFor = () =>
      result('refused', {
        reason: 'validate_only_error',
        detail: 'google:OPERATION_NOT_PERMITTED_FOR_CONTEXT request-id req-9',
      });
    render(
      <PlatformCardBody
        action={target(actions.PAUSE_GOOGLE_CAMPAIGN)}
        card={fixtures.GOOGLE_BUDGET_LIMITED}
      />,
    );
    fireEvent.click(screen.getByTestId('platform-card-action'));
    const preview = await screen.findByTestId('platform-card-action-preview');
    expect(preview.textContent).toBe(
      'Google refused it in its check: Google does not allow this change on this campaign. Nothing was written.',
    );
    expect(preview.getAttribute('data-tone')).toBe('refused');
    expect((screen.getByTestId('platform-card-action-confirm') as HTMLButtonElement).disabled).toBe(
      true,
    );
    expect(sent).toHaveLength(1);
  });

  it('says the optimizer could not be reached when the call throws', async () => {
    answerFor = () => {
      throw new Error('optimizer-apply-actions unreachable');
    };
    render(
      <PlatformCardBody
        action={target(actions.LOWER_GOOGLE_TCPA)}
        card={fixtures.GOOGLE_BID_TARGET}
      />,
    );
    fireEvent.click(screen.getByTestId('platform-card-action'));
    const preview = await screen.findByTestId('platform-card-action-preview');
    expect(preview.textContent).toBe('We could not reach the optimizer. Nothing was written.');
  });

  it('labels each write by what it does', () => {
    const cases = [
      [actions.PAUSE_GOOGLE_CAMPAIGN, fixtures.GOOGLE_LOW_QUALITY_KEYWORD, 'Pause campaign'],
      [actions.LOWER_GOOGLE_TCPA, fixtures.GOOGLE_BID_TARGET, 'Apply new bid target (tCPA)'],
      [actions.ADD_GOOGLE_KEYWORD, fixtures.GOOGLE_PROMOTE_TERM, 'Add as exact keyword'],
    ] as const;
    for (const [action, card, label] of cases) {
      render(<PlatformCardBody action={target(action)} card={card} />);
      expect(screen.getByTestId('platform-card-action').textContent).toBe(label);
      cleanup();
    }
  });
});

describe('the negatives card with the engine action', () => {
  it('opens the approval for every term from its own button', async () => {
    render(
      <PlatformCardBody
        action={target(actions.ADD_GOOGLE_NEGATIVES)}
        card={fixtures.GOOGLE_NEGATIVE_TERMS}
      />,
    );
    expect(screen.queryByTestId('platform-card-add-negatives')).toBeNull();
    const button = screen.getByTestId('platform-card-action');
    expect(button.textContent).toBe('Add 3 negatives');
    fireEvent.click(button);
    await screen.findByTestId('platform-card-action-preview');
    expect(sent[0]?.actions).toEqual([actions.ADD_GOOGLE_NEGATIVES]);
  });

  it('approves only the terms a person chose', async () => {
    render(
      <PlatformCardBody
        action={target(actions.ADD_GOOGLE_NEGATIVES)}
        card={fixtures.GOOGLE_NEGATIVE_TERMS}
      />,
    );
    fireEvent.click(screen.getByTestId('platform-card-choose-terms'));
    const boxes = screen.getAllByRole('checkbox');
    fireEvent.click(boxes[2] as HTMLElement);
    fireEvent.click(screen.getByRole('button', { name: /add 2/i }));
    const dialog = await screen.findByTestId('platform-card-action-dialog');
    expect(within(dialog).getByRole('heading').textContent).toBe(
      'Add 2 negatives to the campaign "VIVO 47-EKATAR" on Google',
    );
    await within(dialog).findByTestId('platform-card-action-preview');
    const terms = (sent[0]?.actions[0] as { terms: { text: string }[] }).terms.map((t) => t.text);
    expect(terms).toEqual(['free gym', 'gym jobs']);
  });
});

describe('a TikTok write', () => {
  it('shows the control disabled and says TikTok is not connected', () => {
    render(
      <PlatformCardBody
        action={target(actions.PAUSE_TIKTOK_AD_GROUP)}
        card={fixtures.TIKTOK_BUDGET_BELOW_LEARNING}
      />,
    );
    const unavailable = screen.getByTestId('platform-card-action-unavailable');
    const button = within(unavailable).getByRole('button') as HTMLButtonElement;
    expect(button.textContent).toBe('Pause ad group');
    expect(button.disabled).toBe(true);
    expect(unavailable.textContent).toContain('TikTok is not connected for changes yet.');
    expect(screen.queryByTestId('platform-card-action')).toBeNull();
    fireEvent.click(button);
    expect(sent).toHaveLength(0);
  });
});

describe('a read-only card', () => {
  it('has no control even when an action rides along', () => {
    for (const card of [
      fixtures.GOOGLE_VIDEO,
      fixtures.GOOGLE_DELIVERY_ONE_CAMPAIGN,
      fixtures.TIKTOK_DELIVERY,
      fixtures.TIKTOK_ATTRIBUTION_WINDOW,
    ]) {
      render(<PlatformCardBody action={target(actions.PAUSE_GOOGLE_CAMPAIGN)} card={card} />);
      expect(screen.queryByTestId('platform-card-action')).toBeNull();
      expect(screen.queryByTestId('platform-card-action-unavailable')).toBeNull();
      cleanup();
    }
  });

  it('has no control without an action', () => {
    render(<PlatformCardBody card={fixtures.GOOGLE_BUDGET_LIMITED} />);
    expect(screen.queryByTestId('platform-card-action')).toBeNull();
  });
});

async function applyLive() {
  render(
    <PlatformCardBody
      action={target(actions.RAISE_GOOGLE_BUDGET)}
      card={fixtures.GOOGLE_BUDGET_LIMITED}
    />,
  );
  fireEvent.click(screen.getByTestId('platform-card-action'));
  const dialog = await screen.findByTestId('platform-card-action-dialog');
  const confirm = within(dialog).getByTestId('platform-card-action-confirm') as HTMLButtonElement;
  await waitFor(() => expect(confirm.disabled).toBe(false));
  fireEvent.click(confirm);
  await within(dialog).findByTestId('platform-card-action-result');
  return dialog;
}

describe('undoing an applied Google write', () => {
  it('previews the undo, then writes it back only on confirm', async () => {
    const dialog = await applyLive();
    expect(undoSent).toHaveLength(0);
    fireEvent.click(within(dialog).getByTestId('platform-card-action-undo'));

    const undoDialog = await screen.findByTestId('platform-card-action-dialog');
    expect(within(undoDialog).getByRole('heading').textContent).toBe(
      'Undo: Change the campaign budget of "VIVO 47-EKATAR" on Google',
    );
    const preview = await within(undoDialog).findByTestId('platform-card-undo-preview');
    expect(preview.textContent).toBe(
      'Google checked the undo (validate_only ok). Nothing changes until you confirm.',
    );
    expect(within(undoDialog).getByTestId('platform-card-undo-restores').textContent).toBe(
      'Back to 1,179.00 MXN',
    );
    expect(undoSent).toEqual([
      { portfolio_id: actions.PORTFOLIO_ID, audit_id: AUDIT_ID, dryRun: true },
    ]);
    expect(undoSent[0]).not.toHaveProperty('authorized_by');

    const confirmUndo = within(undoDialog).getByTestId(
      'platform-card-undo-confirm',
    ) as HTMLButtonElement;
    await waitFor(() => expect(confirmUndo.disabled).toBe(false));
    fireEvent.click(confirmUndo);
    const done = await within(undoDialog).findByTestId('platform-card-undo-result');
    expect(done.textContent).toBe('Undone. The previous value is back and recorded in Activity.');
    expect(undoSent.map((request) => request.dryRun)).toEqual([true, false]);
    expect(within(undoDialog).queryByTestId('platform-card-undo-confirm')).toBeNull();
  });

  it('never offers to confirm an undo Google Ads changed since', async () => {
    undoAnswerFor = () =>
      undoEnvelope('conflict', true, {
        reason: 'conflict',
        detail: 'amount_micros reads 1300000000; the write left 1473750000',
      });
    const dialog = await applyLive();
    fireEvent.click(within(dialog).getByTestId('platform-card-action-undo'));
    const preview = await screen.findByTestId('platform-card-undo-preview');
    expect(preview.textContent).toBe(
      'Changed in Google Ads since — not undone. amount_micros reads 1300000000; the write left 1473750000.',
    );
    expect(preview.getAttribute('data-tone')).toBe('refused');
    expect((screen.getByTestId('platform-card-undo-confirm') as HTMLButtonElement).disabled).toBe(
      true,
    );
    expect(undoSent).toHaveLength(1);
  });

  it('keeps an Undo on the card after the dialog closes', async () => {
    const dialog = await applyLive();
    fireEvent.click(within(dialog).getByRole('button', { name: 'Close' }));
    const undo = await screen.findByTestId('platform-card-undo');
    expect(undo.textContent).toBe('Undo');
    fireEvent.click(undo);
    await screen.findByTestId('platform-card-undo-preview');
    expect(undoSent).toHaveLength(1);
  });

  it('offers no undo when the write did not land', async () => {
    answerFor = (request) => ({
      ...result(request.dryRun ? 'would_apply' : 'scheduled', {
        legs: [{ leg: null, status: 'scheduled', auditId: AUDIT_ID }],
      }),
      dryRun: request.dryRun,
    });
    const dialog = await applyLive();
    expect(within(dialog).queryByTestId('platform-card-action-undo')).toBeNull();
    expect(screen.queryByTestId('platform-card-undo')).toBeNull();
  });

  it('says the optimizer could not be reached when the undo call throws', async () => {
    undoAnswerFor = () => {
      throw new Error('optimizer-apply-action-revert unreachable');
    };
    const dialog = await applyLive();
    fireEvent.click(within(dialog).getByTestId('platform-card-action-undo'));
    const preview = await screen.findByTestId('platform-card-undo-preview');
    expect(preview.textContent).toBe('We could not reach the optimizer. Nothing was written.');
  });
});
