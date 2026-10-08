import { afterEach, describe, expect, it, mock } from 'bun:test';
import type { AdhocSuggestionRow } from '@continuum/contracts';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { AskedProposalPanel } from './AskedProposalPanel';
import { buildAskedForRows } from './askedForModel';
import { DailyReadList } from './DailyReadList';

afterEach(cleanup);

// MENSAJES // TODOS, 2026-09-29: suggestion 1f2426b1 was adopted, its handoff opened
// proposal e2310011 on recommendation 2b89167f, and the worker failed the proposal with a
// Zod dump for a message. The row opens that proposal on itself.
const REC = '2b89167f-2fb3-44ff-8d2b-c2a316991daf';
const PROPOSAL = 'e2310011-8823-4419-868d-ea1a53d235dd';
const handoff = {
  kind: 'audience_proposal',
  recommendation_id: REC,
  proposal_id: PROPOSAL,
  adset_id: '120252387327740236',
  adset_name: 'ALEIRA // AGOSTO - LKL - Mensajes',
  reused: false,
  built_at: '2026-09-29T19:08:58Z',
};
const suggestion: AdhocSuggestionRow = {
  id: '1f2426b1-36b7-4921-a222-54559979434d',
  portfolio_id: '3c1d992e-e0f8-453c-b743-7eb8ad686a7a',
  brand_id: '6f597f42-b5b5-4b9a-baa5-9a4d9fdb9b64',
  ad_account_id: 'act_521903353286118',
  category: 'audience',
  utc_day: '2026-09-29',
  status: 'adopted',
  requested_at: '2026-09-29T19:02:33Z',
  requested_by: null,
  attempts: 1,
  suggestion: {
    version: 1,
    category: 'audience',
    headline: 'Reduce spend on high-cost audiences',
    why: 'ALEIRA // AGOSTO - LKL - Mensajes buys results at 68.96 against a target of 30.',
    adset_id: '120252387327740236',
    adset_name: 'ALEIRA // AGOSTO - LKL - Mensajes',
    impact_per_day: 78.09,
    impact_unit: 'currency',
    impact_basis: 'spend/day × the cost gap',
    confidence_note: null,
    steps: ['Pause the set'],
    figures: [],
    cta: null,
    adopt: null,
  },
  handoff,
  model: 'gemini-2.5-flash',
  prompt_version: 'v4',
  ready_at: '2026-09-29T19:03:14Z',
  adopted_at: '2026-09-29T19:08:54Z',
  dismissed_at: null,
  error: null,
  created_at: '2026-09-29T19:02:33Z',
  updated_at: '2026-09-29T19:08:58Z',
} as AdhocSuggestionRow;
const zodDump =
  '[\n  {\n    "origin": "string",\n    "code": "too_big",\n    "maximum": 240,\n    "path": ["blocked_option_ids", 0, "rule"]\n  }\n]';
const failedProposal = {
  id: PROPOSAL,
  portfolio_id: '3c1d992e-e0f8-453c-b743-7eb8ad686a7a',
  brand_id: '6f597f42-b5b5-4b9a-baa5-9a4d9fdb9b64',
  ad_account_id: 'act_521903353286118',
  campaign_id: null,
  adset_id: '120252387327740236',
  trigger: 'F3_audience_exhausted',
  kind: 'audience_expand',
  recommendation_id: REC,
  cycle_run_id: 'acfe6eca-56be-45c1-aa3d-68fae4a2a381',
  utc_day: '2026-09-29',
  status: 'failed',
  requested_via: 'human',
  requested_by: null,
  attempts: 1,
  proposal: null,
  proposal_built_at: null,
  blocked_by: null,
  approved_at: null,
  approved_by: null,
  approval: null,
  result: null,
  executed_at: null,
  undo_requested_at: null,
  undo_result: null,
  undone_at: null,
  error: { code: 'propose_failed', phase: 'propose', message: zodDump },
  created_at: '2026-09-29T19:08:58Z',
  updated_at: '2026-09-29T19:09:45Z',
} as never;
const rec = {
  id: REC,
  adset_id: '120252387327740236',
  adset_name: 'ALEIRA // AGOSTO - LKL - Mensajes',
  ad_id: null,
  kind: 'audience_expand',
  trigger: 'F3_audience_exhausted',
  severity: null,
  reason: null,
  status: 'pending',
} as never;

const actions = {
  request: mock(() => {}),
  approve: mock(() => {}),
  cancel: mock(() => {}),
  activate: mock(() => {}),
  undo: mock(() => {}),
  retry: mock(() => {}),
  convertCbo: mock(() => {}),
};
const idle = {
  requestingRecId: null,
  retryingId: null,
  approvingId: null,
  busyId: null,
  convertingCbo: false,
};

const panelFor = (proposals: unknown[], recRow: unknown = rec) => {
  const [row] = buildAskedForRows([suggestion], 500, { proposals: proposals as never });
  if (!row) throw new Error('no asked-for row');
  return (
    <AskedProposalPanel
      actions={actions}
      adAccountId="act_521903353286118"
      brandId="6f597f42-b5b5-4b9a-baa5-9a4d9fdb9b64"
      busy={idle}
      cboPreviewByCampaign={new Map()}
      currency="MXN"
      portfolioSpecs={[]}
      rec={recRow as never}
      resultWord="mensajes"
      row={row}
      snapshot={null}
    />
  );
};

describe('AskedProposalPanel — a proposal with no body', () => {
  it('failed: the failure block with the one-line reason, what is known, and asking again', () => {
    actions.request.mockClear();
    const { container } = render(panelFor([failedProposal]));
    const state = screen.getByTestId('asked-proposal-state');
    expect(state.textContent).toContain('Failed');
    const failure = screen.getByTestId('audience-failure');
    expect(failure.textContent).toContain("Jaina couldn't build the proposal.");
    expect(failure.textContent).toContain(
      'Jaina ran into an error while reading the audience, catalogue and creatives.',
    );
    expect(failure.textContent).toContain('Nothing was created in Meta.');
    expect(container.textContent).not.toContain('too_big');
    const facts = screen.getByTestId('asked-proposal-facts');
    expect(facts.textContent).toContain('ALEIRA // AGOSTO - LKL - Mensajes');
    expect(facts.textContent).toContain('Reach exhausted');
    expect(facts.textContent).toContain('2026');
    const retry = screen.getByTestId('asked-proposal-retry');
    expect(retry.textContent).toBe('Ask Jaina again');
    fireEvent.click(retry);
    expect(actions.request).toHaveBeenCalledTimes(1);
    expect((actions.request.mock.calls[0] as unknown[])[0]).toBe(REC);
  });

  it('failed and re-asked within the hour: says when Jaina can look again instead of nothing', () => {
    actions.request.mockClear();
    actions.request.mockImplementationOnce(((
      _recId: string,
      handlers?: { onDone?: (id: string) => void },
    ) => handlers?.onDone?.(PROPOSAL)) as never);
    render(panelFor([failedProposal]));
    fireEvent.click(screen.getByTestId('asked-proposal-retry'));
    expect(screen.getByTestId('audience-action-notice').textContent).toMatch(
      /^Jaina already re-analysed this in the last hour\. Try again after .+\.$/,
    );
  });

  it('blocked and closed by the cycle: the reason stays, the retry does not', () => {
    const { container } = render(
      panelFor([
        {
          ...(failedProposal as object),
          status: 'superseded',
          error: { code: 'signal_stopped', message: 'The trigger did not fire again.' },
          blocked_by: {
            code: 'no_creatives',
            message: 'No creative has enough results.',
            campaign_id: null,
            campaign_name: null,
          },
        },
      ]),
    );
    expect(screen.getByTestId('asked-proposal-state').textContent).toContain('Blocked');
    expect(container.textContent).toContain('No creative has enough results.');
    expect(container.textContent).toContain('The cycle closed the recommendation');
    expect(screen.queryByTestId('asked-proposal-retry')).toBeNull();
  });

  it('queued: says Jaina takes it shortly and offers nothing to press', () => {
    render(panelFor([{ ...(failedProposal as object), status: 'queued', error: null }]));
    expect(screen.getByTestId('asked-proposal-state').textContent).toContain('Queued');
    expect(screen.queryByTestId('asked-proposal-retry')).toBeNull();
  });

  it('before the proposals query has the row: reading, with what the handoff knows', () => {
    render(panelFor([]));
    expect(screen.getByTestId('asked-proposal-state').textContent).toContain(
      'Reading the proposal',
    );
    expect(screen.getByTestId('asked-proposal-facts').textContent).toContain(
      'ALEIRA // AGOSTO - LKL - Mensajes',
    );
  });
});

describe('DailyReadList — an asked-for row opens its proposal under itself', () => {
  it('renders the expansion on the open row only, and the button reads as the way to close it', () => {
    const rows = buildAskedForRows([suggestion], 500, { proposals: [failedProposal] });
    const onCta = mock(() => {});
    const { container, rerender } = render(
      <DailyReadList
        expandedRowId={null}
        onCta={onCta}
        renderExpansion={() => <div data-testid="expansion-body">la propuesta</div>}
        rows={rows}
        source="brief"
      />,
    );
    expect(screen.queryByTestId('expansion-body')).toBeNull();
    const rowId = rows[0]?.id ?? '';
    expect(container.textContent).toContain('Failed');
    expect(screen.getByTestId(`read-next-note:${rowId}`).textContent).toBe(
      'Failed — Jaina ran into an error while reading the audience, catalogue and creatives.',
    );
    fireEvent.click(screen.getByRole('button', { name: 'Open the audience proposal' }));
    expect(onCta).toHaveBeenCalledTimes(1);
    rerender(
      <DailyReadList
        expandedRowId={rowId}
        onCta={onCta}
        renderExpansion={() => <div data-testid="expansion-body">la propuesta</div>}
        rows={rows}
        source="brief"
      />,
    );
    const expansion = screen.getByTestId(`read-expansion:${rowId}`);
    expect(expansion.closest(`li[data-row-key="read:${rowId}"]`)).not.toBeNull();
    expect(screen.getByTestId('expansion-body').textContent).toBe('la propuesta');
    expect(screen.getByRole('button', { name: 'Close the proposal' })).toBeTruthy();
  });
});
