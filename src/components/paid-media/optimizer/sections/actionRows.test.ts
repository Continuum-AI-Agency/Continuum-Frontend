import { describe, expect, it } from 'bun:test';
import type { OptimizerActionFeedRow } from '../useOptimizerData';
import {
  actorLabel,
  readActionChange,
  readReceiptTrace,
  revertScopeOf,
  revertState,
} from './actionRows';

const AUDIT_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const PORTFOLIO_ID = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';

const action = (over: Partial<OptimizerActionFeedRow> = {}): OptimizerActionFeedRow =>
  ({
    id: AUDIT_ID,
    ts: '2026-08-26T09:00:00Z',
    family: 'money',
    op: 'budget',
    portfolio_id: PORTFOLIO_ID,
    portfolio_name: 'Prospecting',
    ...over,
  }) as OptimizerActionFeedRow;

describe('readActionChange reads one row shape across four unit systems', () => {
  it('reads a budget move as minor units', () => {
    const change = readActionChange(
      action({ op: 'budget', before: { minor: 500000 }, after: { minor: 450000 } }),
    );
    expect(change).toEqual({
      label: 'Daily budget',
      unit: 'money',
      before: 500000,
      after: 450000,
    });
  });

  it('tolerates the numeric-string form jsonb can produce', () => {
    expect(readActionChange(action({ before: { minor: '500000' } })).before).toBe(500000);
  });

  it('reads a status write as its Meta effective_status', () => {
    const change = readActionChange(
      action({ op: 'status', before: { status: 'ACTIVE' }, after: { status: 'PAUSED' } }),
    );
    expect(change).toEqual({ label: 'Status', unit: 'text', before: 'ACTIVE', after: 'PAUSED' });
  });

  it('names the FIELD that changed on a settings row', () => {
    const change = readActionChange(
      action({
        family: 'settings',
        op: 'setting',
        entity_id: 'daily_total',
        before: { value: '3500' },
        after: { value: '4200' },
      }),
    );
    expect(change.label).toBe('daily_total');
    expect(change.after).toBe('4200');
  });

  it('reads a recommendation decision as its status transition', () => {
    const change = readActionChange(
      action({
        family: 'decision',
        op: 'decision',
        before: { status: 'pending' },
        after: { status: 'approved' },
      }),
    );
    expect(change).toEqual({
      label: 'Recommendation',
      unit: 'text',
      before: 'pending',
      after: 'approved',
    });
  });

  // The RPC emits 'convert' for a CBO→ABO restructure and the contract enum has not caught
  // up. Rendering it as SOMETHING is the whole point of widening `op` on the way in.
  it('still renders an op the contract enum has not caught up with', () => {
    const change = readActionChange(action({ op: 'convert' }));
    expect(change.label).toBe('convert');
    expect(change.before).toBeNull();
  });

  it('names the field even when before/after carry nothing readable', () => {
    expect(readActionChange(action({ op: 'budget', before: null, after: null })).label).toBe(
      'Daily budget',
    );
  });
});

describe('actorLabel', () => {
  it('names who authorized the write', () => {
    expect(actorLabel(action({ actor_kind: 'autopilot' }))).toBe('Autopilot');
    expect(actorLabel(action({ actor_kind: 'human' }))).toBe('Human');
    expect(actorLabel(action({ actor_kind: 'system' }))).toBe('System');
    expect(actorLabel(action({ actor_kind: null }))).toBe('Unknown');
  });
});

describe('readReceiptTrace', () => {
  it('finds the Meta trace id whichever key the applier stored it under', () => {
    expect(readReceiptTrace(action({ receipt: { fbtrace_id: 'AbC1' } }))).toBe('AbC1');
    expect(readReceiptTrace(action({ receipt: { fbtraceId: 'AbC2' } }))).toBe('AbC2');
  });

  it('is null when there is no receipt', () => {
    expect(readReceiptTrace(action({ receipt: null }))).toBeNull();
    expect(readReceiptTrace(action({ receipt: { ok: true } }))).toBeNull();
  });
});

describe('revertState gates undo on the SERVER, never on the row shape', () => {
  it('offers a revert when the RPC says the write is reversible', () => {
    expect(revertState(action({ reversible: true }))).toEqual({
      kind: 'available',
      auditId: AUDIT_ID,
      portfolioId: PORTFOLIO_ID,
    });
  });

  // A write with no recorded prior value has nothing to restore; a button would lie.
  it('offers nothing when the RPC says it is not reversible', () => {
    expect(revertState(action({ reversible: false })).kind).toBe('none');
    expect(revertState(action({ reversible: null })).kind).toBe('none');
  });

  it('never offers undo on a setting or a decision', () => {
    expect(revertState(action({ family: 'settings', op: 'setting', reversible: false })).kind).toBe(
      'none',
    );
  });

  it('reports an already-undone write instead of offering the button twice', () => {
    expect(revertState(action({ reversible: true, reverted_by: 'cccccccc' })).kind).toBe('reverted');
  });

  it('offers nothing when there is no portfolio for the revert edge to scope against', () => {
    expect(revertState(action({ reversible: true, portfolio_id: null })).kind).toBe('none');
  });
});

describe('revertScopeOf', () => {
  it('switches the dialog to unpause copy on a status write only', () => {
    expect(revertScopeOf(action({ op: 'status' }))).toBe('adset_status');
    expect(revertScopeOf(action({ op: 'budget' }))).toBeNull();
  });
});
