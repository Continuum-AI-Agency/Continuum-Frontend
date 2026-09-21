import { describe, expect, it } from 'bun:test';
import type { AdhocSuggestionRow } from '@continuum/contracts';
import { buildAskedForRows } from './askedForModel';

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

  it('lands a built row on the recommendation it made, and says it is not delivering', () => {
    const [row] = buildAskedForRows(
      [adopted({ category: 'audience' }, { category: 'audience', handoff })],
      500,
    );
    expect(row?.cta.kind).toBe('queue_row');
    expect(row?.cta.rowKey).toBe(`rec:${handoff.recommendation_id}`);
    expect(row?.cta.label).toBe('Open the audience proposal');
    expect(row?.tierLabel).toBe('Handed off');
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
