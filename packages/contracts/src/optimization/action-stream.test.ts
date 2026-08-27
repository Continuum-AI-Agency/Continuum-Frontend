import { describe, expect, test } from 'bun:test';
import { type ActionStreamEntry, foldReverts, toActionStreamEntries } from './action-stream';

const entry = (overrides: Partial<ActionStreamEntry>): ActionStreamEntry => ({
  id: null,
  occurredAt: '2026-08-24T19:00:00.000Z',
  actorKind: 'human',
  action: 'adset_budget',
  targetKind: 'adset',
  targetId: '120200000000000000',
  outcome: 'applied',
  justification: null,
  beforeMinor: null,
  afterMinor: null,
  beforeStatus: null,
  afterStatus: null,
  currency: null,
  revertsActionId: null,
  source: 'optimizer.apply_audits',
  ...overrides,
});

describe('toActionStreamEntries', () => {
  test('lifts the jsonb before/after into flat amounts and statuses', () => {
    const [parsed] = toActionStreamEntries([
      {
        occurred_at: '2026-08-24T19:14:26.332Z',
        action: 'adset_budget',
        action_id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
        actor_kind: 'autopilot',
        target_kind: 'adset',
        target_id: '120200000000000000',
        outcome: 'applied',
        justification: 'CPA held under target for three days.',
        before: { minor: 6000 },
        after: { minor: 7500 },
        currency: 'USD',
        reverts_action_id: null,
        source: 'optimizer.apply_audits',
      },
    ]);
    expect(parsed?.beforeMinor).toBe(6000);
    expect(parsed?.afterMinor).toBe(7500);
    expect(parsed?.actorKind).toBe('autopilot');
    expect(parsed?.justification).toBe('CPA held under target for three days.');
  });

  test('a status flip carries statuses, not amounts', () => {
    const [parsed] = toActionStreamEntries([
      {
        occurred_at: '2026-08-24T19:14:26.332Z',
        action: 'adset_status',
        before: { status: 'ACTIVE' },
        after: { status: 'PAUSED' },
      },
    ]);
    expect(parsed?.beforeStatus).toBe('ACTIVE');
    expect(parsed?.afterStatus).toBe('PAUSED');
    expect(parsed?.beforeMinor).toBeNull();
  });

  test('a row with no timestamp or no verb is dropped, never half-rendered', () => {
    expect(toActionStreamEntries([{ action: 'adset_budget' }])).toHaveLength(0);
    expect(toActionStreamEntries([{ occurred_at: '2026-08-24T19:00:00Z' }])).toHaveLength(0);
    expect(toActionStreamEntries(null)).toHaveLength(0);
  });
});

describe('foldReverts', () => {
  test('a change and the undo that reversed it render as ONE entry', () => {
    const change = entry({
      id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      beforeMinor: 6000,
      afterMinor: 7500,
      currency: 'USD',
    });
    const revert = entry({
      id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
      occurredAt: '2026-08-24T19:30:00.000Z',
      beforeMinor: 7500,
      afterMinor: 6000,
      currency: 'USD',
      revertsActionId: change.id,
    });

    const folded = foldReverts([change, revert]);

    expect(folded).toHaveLength(1);
    expect(folded[0]?.id).toBe(change.id ?? '');
    expect(folded[0]?.revertedAt).toBe('2026-08-24T19:30:00.000Z');
    expect(folded[0]?.revertedToMinor).toBe(6000);
  });

  test('a revert whose target is outside the window keeps its own row', () => {
    // Dropping it would under-report: it IS the only action the reader can see.
    const orphan = entry({
      id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
      revertsActionId: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
    });
    expect(foldReverts([orphan])).toHaveLength(1);
  });

  test('a status revert folds the same way a money one does', () => {
    const pause = entry({
      id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      action: 'adset_status',
      beforeStatus: 'ACTIVE',
      afterStatus: 'PAUSED',
    });
    const resume = entry({
      id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
      action: 'adset_status',
      beforeStatus: 'PAUSED',
      afterStatus: 'ACTIVE',
      revertsActionId: pause.id,
    });
    const folded = foldReverts([pause, resume]);
    expect(folded).toHaveLength(1);
    expect(folded[0]?.revertedToStatus).toBe('ACTIVE');
  });

  test('untouched actions pass through with no undo recorded', () => {
    const folded = foldReverts([entry({ id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' })]);
    expect(folded).toHaveLength(1);
    expect(folded[0]?.revertedAt).toBeNull();
  });
});
