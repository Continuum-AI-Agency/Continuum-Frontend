import { describe, expect, it } from 'bun:test';
import type { AdhocSuggestionRow } from '@continuum/contracts';
import { askedRecommendationIds, buildAskedForRows } from './askedForModel';

const base: AdhocSuggestionRow = {
  id: '11111111-1111-4111-8111-111111111111',
  portfolio_id: '22222222-2222-4222-8222-222222222222',
  brand_id: '33333333-3333-4333-8333-333333333333',
  ad_account_id: 'act_1',
  category: 'budget',
  utc_day: '2026-09-21',
  status: 'ready',
  requested_at: '2026-09-21T10:00:00Z',
  requested_by: null,
  attempts: 1,
  suggestion: null,
  model: 'gemini-2.5-flash',
  prompt_version: 'v1',
  ready_at: '2026-09-21T10:00:20Z',
  adopted_at: null,
  dismissed_at: null,
  error: null,
  created_at: '2026-09-21T10:00:00Z',
  updated_at: '2026-09-21T10:00:20Z',
};

const plan = (over: Record<string, unknown> = {}) => ({
  version: 1,
  category: 'budget',
  headline: 'Move 40 a day out of the retargeting set',
  why: 'It buys results at 88 against a target of 45.',
  adset_id: '120210',
  adset_name: 'Retargeting 30d',
  impact_per_day: null,
  impact_unit: 'currency',
  impact_basis: null,
  confidence_note: 'Seven days of spend on both sides.',
  steps: ['Cut the retargeting set by 40', 'Give it to the prospecting set'],
  figures: [{ label: 'Cost per result', value: 88, unit: 'currency' }],
  cta: null,
  adopt: { token: 'a'.repeat(32), expires_at: '2026-09-21T10:30:00Z' },
  ...over,
});

describe('buildAskedForRows', () => {
  it('renders a row still with the worker as waiting, with no invented tier', () => {
    const [row] = buildAskedForRows([{ ...base, status: 'proposing' }], 500);
    expect(row?.origin).toBe('asked');
    expect(row?.status).toBe('proposing');
    expect(row?.tierLabel).toBe('Reading');
    expect(row?.adoptToken).toBeNull();
  });

  it('carries the plan, its steps and its figures onto the shared row shape', () => {
    const [row] = buildAskedForRows([{ ...base, suggestion: plan() }], 500);
    expect(row?.title).toBe('Move 40 a day out of the retargeting set');
    expect(row?.detail?.steps).toHaveLength(2);
    expect(row?.detail?.figures[0]?.label).toBe('Cost per result');
    expect(row?.adoptToken).toBe('a'.repeat(32));
  });

  it('does not size a suggestion the cycle did not raise', () => {
    const [row] = buildAskedForRows([{ ...base, suggestion: plan() }], 500);
    expect(row?.tierLabel).toBe('Not sized');
    expect(row?.cta).toEqual({ kind: 'manage', rowKey: null, label: 'Take this on' });
  });

  it('hands off to the queue row when the plan names one, instead of duplicating it', () => {
    const [row] = buildAskedForRows(
      [
        {
          ...base,
          suggestion: plan({
            impact_per_day: 120,
            impact_basis: 'spend/day on an ad set with 0 conversions in 7d',
            cta: { kind: 'queue_row', target_id: 'rec:abc' },
          }),
        },
      ],
      500,
    );
    expect(row?.cta.kind).toBe('queue_row');
    expect(row?.cta.rowKey).toBe('rec:abc');
    expect(row?.tierLabel).toBe('High impact');
  });

  it('keeps "we looked and found nothing" apart from "the read did not finish"', () => {
    const [empty] = buildAskedForRows([{ ...base, status: 'empty' }], 500);
    const [failed] = buildAskedForRows([{ ...base, status: 'failed' }], 500);
    expect(empty?.tierLabel).toBe('Nothing to change');
    expect(failed?.tierLabel).toBe('Could not read');
    expect(empty?.title).not.toBe(failed?.title);
  });

  it('burns the adopt affordance once the row is adopted', () => {
    const [row] = buildAskedForRows([{ ...base, status: 'adopted', suggestion: plan() }], 500);
    expect(row?.adoptToken).toBeNull();
    expect(row?.tierLabel).toBe('Taken on');
  });

  it('leaves a dismissed row out of the list entirely', () => {
    expect(buildAskedForRows([{ ...base, status: 'dismissed' }], 500)).toHaveLength(0);
  });
});

// The trail after adopting. Before this, an adopted plan that proposed something NEW carried
// no `target_id` and fell through to "Open Manage", which cannot build anything — so the
// interesting half of the feature ended on a dead end. Each case below pins one step of what
// replaced it.
describe('buildAskedForRows — after adopting', () => {
  const adopted = (over: Record<string, unknown> = {}, row: Record<string, unknown> = {}) => ({
    ...base,
    status: 'adopted' as const,
    suggestion: plan(over),
    ...row,
  });

  const handoff = {
    kind: 'audience_proposal',
    recommendation_id: '44444444-4444-4444-8444-444444444444',
    proposal_id: '55555555-5555-4555-8555-555555555555',
    adset_id: '120210',
    adset_name: 'Retargeting 30d',
    reused: false,
    built_at: '2026-09-21T10:05:00Z',
  };

  it('offers the build on an adopted plan that named an ad set and no existing row', () => {
    const [row] = buildAskedForRows(
      [adopted({ category: 'audience' }, { category: 'audience' })],
      500,
    );
    expect(row?.cta.kind).toBe('build');
    expect(row?.cta.label).toBe('Build the audience proposal');
    expect(row?.handoff).toBeNull();
  });

  it('promises nothing goes live BEFORE the press, not after it', () => {
    const [row] = buildAskedForRows(
      [adopted({ category: 'audience' }, { category: 'audience' })],
      500,
    );
    expect(row?.nextNote).toContain('arrive paused');
    expect(row?.nextNote).toContain('read back');
  });

  it('never offers a build for work the cycle already scored — it hands off to that row', () => {
    const [row] = buildAskedForRows(
      [adopted({ cta: { kind: 'queue_row', target_id: 'rec:abc' } })],
      500,
    );
    expect(row?.cta.kind).toBe('queue_row');
    expect(row?.cta.rowKey).toBe('rec:abc');
    expect(row?.nextNote).toBeNull();
  });

  it('says why instead of offering a button when the plan named no ad set', () => {
    const [row] = buildAskedForRows([adopted({ adset_id: null })], 500);
    expect(row?.cta.kind).toBe('manage');
    expect(row?.nextNote).toContain('names no ad set');
  });

  it('lands a built row on the proposal it opened, and says it is not delivering', () => {
    const [row] = buildAskedForRows(
      [adopted({ category: 'audience' }, { category: 'audience', handoff })],
      500,
    );
    // An audience handoff is an audience_card CTA: the proposal opens on the row itself,
    // and the key still names the recommendation row it belongs to.
    expect(row?.cta.kind).toBe('audience_card');
    expect(row?.cta.rowKey).toBe(`rec:${handoff.recommendation_id}`);
    expect(row?.cta.label).toBe('Open the audience proposal');
    expect(row?.tierLabel).toBe('Handed off');
    expect(row?.proposal).toBeNull();
    expect(row?.nextNote).toContain('audience proposal is being built');
    expect(row?.nextNote).toContain('arrive paused');
  });

  it('builds nothing for a budget move and sends the person to the queue row instead', () => {
    const [row] = buildAskedForRows(
      [
        adopted(
          {},
          {
            category: 'budget',
            handoff: {
              kind: 'budget_queue',
              recommendation_id: null,
              proposal_id: null,
              adset_id: '120210',
              adset_name: 'Retargeting 30d',
              reused: false,
              built_at: '2026-09-21T10:05:00Z',
            },
          },
        ),
      ],
      500,
    );
    expect(row?.cta.rowKey).toBe('budget:120210');
    expect(row?.nextNote).toContain('Nothing is created');
  });

  it('reads a handoff the schema does not recognise as "not built" rather than crashing', () => {
    const [row] = buildAskedForRows([adopted({}, { handoff: { kind: 'nonsense' } })], 500);
    expect(row?.handoff).toBeNull();
    expect(row?.cta.kind).toBe('build');
  });
});

// Where a CTA lands. Two resolvers used to disagree: the hero card resolved an `audience_card`
// CTA to its candidate's `rec:<id>` while this model handed the queue the bare PROPOSAL id —
// a key no row has, so "Open the audience proposal" switched tabs and focused nothing. The
// cases below pin the one rule both sides now share (heroModel.queueRowKeyFor).
describe('buildAskedForRows — where the CTA lands', () => {
  const REC = '44444444-4444-4444-8444-444444444444';
  const PROPOSAL = '55555555-5555-4555-8555-555555555555';
  const handoff = {
    kind: 'audience_proposal',
    recommendation_id: REC,
    proposal_id: PROPOSAL,
    adset_id: '120210',
    adset_name: 'Retargeting 30d',
    reused: false,
    built_at: '2026-09-21T10:05:00Z',
  };
  const audienceRow = (
    over: Record<string, unknown> = {},
    row: Record<string, unknown> = {},
  ): AdhocSuggestionRow =>
    ({
      ...base,
      category: 'audience',
      suggestion: plan({ category: 'audience', ...over }),
      ...row,
    }) as AdhocSuggestionRow;

  it("never hands the queue a bare proposal id: an audience_card CTA with no handoff offers the row's own next step", () => {
    const [row] = buildAskedForRows(
      [audienceRow({ cta: { kind: 'audience_card', target_id: PROPOSAL } })],
      500,
    );
    expect(row?.cta).toEqual({ kind: 'manage', rowKey: null, label: 'Take this on' });
  });

  it('resolves an audience_card CTA through the handoff to the recommendation row it became', () => {
    const [row] = buildAskedForRows(
      [
        audienceRow(
          { cta: { kind: 'audience_card', target_id: PROPOSAL } },
          { status: 'adopted', handoff },
        ),
      ],
      500,
    );
    expect(row?.cta).toEqual({
      kind: 'audience_card',
      rowKey: `rec:${REC}`,
      label: 'Open the audience proposal',
    });
  });

  it('keeps an audience_card CTA that already names a queue row', () => {
    const [row] = buildAskedForRows(
      [audienceRow({ cta: { kind: 'audience_card', target_id: 'rec:abc' } })],
      500,
    );
    expect(row?.cta.rowKey).toBe('rec:abc');
  });

  it('a queue_row CTA whose target is not a row key is not a queue_row CTA', () => {
    const [row] = buildAskedForRows(
      [audienceRow({ cta: { kind: 'queue_row', target_id: PROPOSAL } })],
      500,
    );
    expect(row?.cta.kind).toBe('manage');
    expect(row?.cta.rowKey).toBeNull();
  });

  it('lists the recommendations the handoffs point at, once each', () => {
    const rows = buildAskedForRows(
      [
        audienceRow({}, { status: 'adopted', handoff }),
        audienceRow({}, { id: '99999999-9999-4999-8999-999999999999', status: 'adopted', handoff }),
        audienceRow({}),
      ],
      500,
    );
    expect(askedRecommendationIds(rows)).toEqual([REC]);
  });

  // Easy Fit → Tours, 2026-09-28: the handoff opened proposal 622bc858, the worker blocked it
  // (no_creatives, proposal null) and the next cycle superseded it, expiring the
  // recommendation with it. The row used to keep saying "being built".
  it('says why a handed-off proposal is blocked, and that the cycle has closed it', () => {
    const proposal = {
      id: PROPOSAL,
      recommendation_id: REC,
      adset_id: '120210',
      trigger: 'F3_audience_exhausted',
      kind: 'audience_expand',
      status: 'superseded',
      proposal: null,
      blocked_by: {
        code: 'no_creatives',
        message:
          'No delivering creative in this portfolio has enough results to carry into a new ad set yet.',
        campaign_id: 'c1',
        campaign_name: 'ITESO // TOURS',
      },
      error: { code: 'signal_stopped', message: 'The trigger did not fire again.' },
      created_at: '2026-09-27T09:20:16Z',
    } as never;
    const [row] = buildAskedForRows([audienceRow({}, { status: 'adopted', handoff })], 500, {
      proposals: [proposal],
    });
    expect(row?.tierLabel).toBe('Blocked');
    expect(row?.nextNote).toBe(
      'Blocked — No delivering creative in this portfolio has enough results to carry into a new ad set yet. The trigger did not fire again. The cycle closed the recommendation it opened.',
    );
    expect(row?.proposal?.state).toBe('blocked');
    expect(row?.proposal?.closed).toBe(true);
    expect(row?.proposal?.retryable).toBe(false);
    expect(row?.cta.rowKey).toBe(`rec:${REC}`);
  });

  it('keeps the built note when the handed-off proposal is not blocked', () => {
    const [row] = buildAskedForRows([audienceRow({}, { status: 'adopted', handoff })], 500, {
      proposals: [],
    });
    expect(row?.tierLabel).toBe('Handed off');
    expect(row?.nextNote).toContain('audience proposal is being built');
  });
});

// The proposal's own state, read off the proposals query for the row that opened it. One
// case per state the worker can leave a proposal in, and one for the cycle closing it. The
// failed case is MENSAJES // TODOS on 2026-09-29 (suggestion 1f2426b1, proposal e2310011):
// the worker stored a 40-line Zod issue list in `error.message`, and the row must never
// print it.
describe('buildAskedForRows — the state of the proposal a handoff opened', () => {
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
  const suggestion = (): AdhocSuggestionRow =>
    ({
      ...base,
      id: '1f2426b1-36b7-4921-a222-54559979434d',
      category: 'audience',
      status: 'adopted',
      suggestion: plan({ category: 'audience', adset_id: '120252387327740236' }),
      handoff,
    }) as AdhocSuggestionRow;
  const proposal = (over: Record<string, unknown>) =>
    ({
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
      error: null,
      created_at: '2026-09-29T19:08:58Z',
      updated_at: '2026-09-29T19:09:45Z',
      ...over,
    }) as never;
  const rowFor = (over: Record<string, unknown>) =>
    buildAskedForRows([suggestion()], 500, { proposals: [proposal(over)] })[0];

  it('queued: the row waits with the proposal, and the proposal opens on the row', () => {
    const row = rowFor({ status: 'queued' });
    expect(row?.tierLabel).toBe('Queued');
    expect(row?.nextNote).toBe('Queued: Jaina picks it up in under a minute.');
    expect(row?.proposal?.state).toBe('queued');
    expect(row?.proposal?.retryable).toBe(false);
    expect(row?.cta).toEqual({
      kind: 'audience_card',
      rowKey: `rec:${REC}`,
      label: 'Open the audience proposal',
    });
  });

  it('proposing: Jaina is reading', () => {
    const row = rowFor({ status: 'proposing' });
    expect(row?.tierLabel).toBe('Jaina is reading');
    expect(row?.nextNote).toContain('Jaina is reading');
    expect(row?.proposal?.retryable).toBe(false);
  });

  it('ready: the row says so and points at the create flow', () => {
    const row = rowFor({ status: 'ready', proposal: { version: 1 } });
    expect(row?.tierLabel).toBe('Ready');
    expect(row?.nextNote).toContain('create the new ad set (paused)');
    expect(row?.proposal?.state).toBe('ready');
    expect(row?.proposal?.retryable).toBe(false);
  });

  it('blocked: the reason, still open to asking again while the recommendation is pending', () => {
    const row = rowFor({
      status: 'blocked',
      blocked_by: {
        code: 'no_creatives',
        message: 'No creative in the portfolio has enough results.',
        campaign_id: 'c1',
        campaign_name: 'MENSAJES',
      },
    });
    expect(row?.tierLabel).toBe('Blocked');
    expect(row?.nextNote).toBe('Blocked — No creative in the portfolio has enough results.');
    expect(row?.proposal?.reason).toBe('No creative in the portfolio has enough results.');
    expect(row?.proposal?.closed).toBe(false);
    expect(row?.proposal?.retryable).toBe(true);
  });

  it('failed: a one-line human reason, never the raw error dump, and asking again on offer', () => {
    const zodDump =
      '[\n  {\n    "origin": "string",\n    "code": "too_big",\n    "maximum": 240,\n    "path": ["blocked_option_ids", 0, "rule"]\n  }\n]';
    const row = rowFor({
      status: 'failed',
      error: { code: 'propose_failed', phase: 'propose', message: zodDump },
    });
    expect(row?.tierLabel).toBe('Failed');
    expect(row?.nextNote).toBe(
      'Failed — Jaina ran into an error while reading the audience, catalogue and creatives.',
    );
    expect(row?.nextNote).not.toContain('too_big');
    expect(row?.nextNote).not.toContain('{');
    expect(row?.proposal?.state).toBe('failed');
    expect(row?.proposal?.retryable).toBe(true);
  });

  it('failed with a sentence for a message keeps that sentence', () => {
    const row = rowFor({
      status: 'failed',
      error: { code: 'execute_failed', message: 'Meta rejected the ad set: minimum budget.' },
    });
    expect(row?.nextNote).toBe('Failed — Meta rejected the ad set: minimum budget.');
  });

  it('superseded without a body: closed by the cycle, nothing to ask again for', () => {
    const row = rowFor({
      status: 'superseded',
      error: { code: 'signal_stopped', message: 'The trigger did not fire again.' },
    });
    expect(row?.tierLabel).toBe('Closed');
    expect(row?.nextNote).toBe(
      'The trigger did not fire again. The cycle closed the recommendation it opened.',
    );
    expect(row?.proposal?.closed).toBe(true);
    expect(row?.proposal?.retryable).toBe(false);
  });

  it('asked again: the row follows the proposal that replaced the one the handoff opened', () => {
    // Production, 2026-09-29 21:11: "Ask Jaina again" superseded e2310011 ("refreshed") and
    // opened 1e89d5e7 on the same recommendation. The row must read 1e89d5e7, as the card
    // does, not report the refreshed row as closed by the cycle.
    const [row] = buildAskedForRows([suggestion()], 500, {
      proposals: [
        proposal({
          status: 'superseded',
          error: { code: 'refreshed', message: 'Re-analysed on request.' },
          updated_at: '2026-09-29T21:11:24Z',
        }),
        proposal({
          id: '1e89d5e7-0000-4000-8000-000000000000',
          status: 'failed',
          error: { code: 'execute_failed', message: 'Meta rejected the ad set: no permission.' },
          created_at: '2026-09-29T21:11:24Z',
          updated_at: '2026-09-29T21:13:56Z',
        }),
      ],
    });
    expect(row?.proposal?.row.id).toBe('1e89d5e7-0000-4000-8000-000000000000');
    expect(row?.proposal?.closed).toBe(false);
    expect(row?.tierLabel).toBe('Failed');
    expect(row?.nextNote).toBe('Failed — Meta rejected the ad set: no permission.');
    expect(row?.proposal?.retryable).toBe(true);
  });

  it('executed: created on Meta', () => {
    const row = rowFor({ status: 'executed', proposal: { version: 1 }, result: {} });
    expect(row?.tierLabel).toBe('Created in Meta');
    expect(row?.nextNote).toContain('Created in Meta');
  });

  it('a proposal the query does not have yet leaves the handoff note in place', () => {
    const [row] = buildAskedForRows([suggestion()], 500, { proposals: [] });
    expect(row?.proposal).toBeNull();
    expect(row?.tierLabel).toBe('Handed off');
    expect(row?.nextNote).toContain('audience proposal is being built');
  });
});
