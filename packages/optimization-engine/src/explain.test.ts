// The explanations are the ONLY prose the money trail carries: cycle_items.reason at cycle
// time, copied to apply_audits.justification on apply, and rendered on the dashboard. These
// pin the sentences, and pin that a held row and an unmoved row say nothing rather than
// something manufactured.

import { describe, expect, it } from 'bun:test';
import { budgetMoveWhy, freezeLabel, moveReasonText, velocityCapTruncated } from './explain';

describe('budgetMoveWhy explains one move from what a cycle item already carries', () => {
  it('reads a cut as a smaller share of the pool', () => {
    const why = budgetMoveWhy(-15, { score3d: 0.41, score7d: 0.38, score14d: 0.44 });
    expect(why?.lead).toContain('smaller share');
    expect(why?.windows).toEqual({ d3: 0.41, d7: 0.38, d14: 0.44 });
    expect(why?.windowsAgree).toBe(true);
  });

  it('reads a raise as a larger share of the pool', () => {
    const why = budgetMoveWhy(15, null);
    expect(why?.lead).toContain('larger share');
    expect(why?.windows).toBeNull();
    expect(why?.windowsAgree).toBeNull();
  });

  it('flags disagreeing windows', () => {
    expect(budgetMoveWhy(15, { score3d: 0.1, score7d: 0.9 })?.windowsAgree).toBe(false);
  });

  it('carries the cost interval and its event count', () => {
    const why = budgetMoveWhy(-15, { ci: { cpa: 61, lo: 44, hi: 92, events: 14 } });
    expect(why?.cost).toEqual({ cpa: 61, lo: 44, hi: 92, events: 14 });
  });

  it('says nothing about a HELD row — freezeLabel already owns that explanation', () => {
    expect(budgetMoveWhy(0, { freezeReason: 'no_conversions' })).toBeNull();
  });

  it('says nothing about a row that did not move', () => {
    expect(budgetMoveWhy(0, {})).toBeNull();
  });

  // velocityCapped is the engine's raw proportional budget after the velocity clamp — a
  // BUDGET, not a flag, so the truncation test compares the two numbers.
  it('reports the velocity cap when the clamp actually moved the number', () => {
    expect(budgetMoveWhy(15, { rawBudget: 82.4, velocityCapped: 65 })?.capped).toBe(true);
    expect(velocityCapTruncated({ rawBudget: 65, velocityCapped: 65 })).toBe(false);
  });
});

describe('freezeLabel names each ingest-side abstain', () => {
  it('has a distinct label for every declared freeze reason', () => {
    const reasons = [
      'no_conversions',
      'missing_window',
      'unsupported_budget',
      'lifetime_budget',
      'no_own_budget',
      'no_declared_objective',
      'kpi_mismatch',
    ];
    const labels = reasons.map((r) => freezeLabel(r)?.label);
    expect(labels.every((l) => typeof l === 'string' && l.startsWith('Held'))).toBe(true);
    expect(new Set(labels).size).toBe(reasons.length);
  });

  it('degrades an unknown reason to a generic Held, and says nothing without one', () => {
    expect(freezeLabel('something_new')?.label).toBe('Held');
    expect(freezeLabel(null)).toBeNull();
  });
});

describe('moveReasonText is the one line persisted next to the money', () => {
  it('explains a held ad set with its label and hint', () => {
    const text = moveReasonText(0, { freezeReason: 'no_conversions' });
    expect(text).toContain('Held · no conversion signal');
    expect(text).toContain('budget left unchanged until signal arrives');
  });

  it('explains a raise, naming window agreement, cost and the velocity cap', () => {
    const text = moveReasonText(15, {
      score3d: 0.4,
      score7d: 0.42,
      score14d: 0.41,
      ci: { cpa: 61, lo: 44, hi: 92, events: 14 },
      rawBudget: 82.4,
      velocityCapped: 65,
    });
    expect(text).toBe(
      'Earned a larger share of the pool than its current budget. ' +
        'The 3d, 7d and 14d scores agree. ' +
        'Cost per result 61 on 14 events. ' +
        'Truncated by the per-cycle velocity cap.',
    );
  });

  it('is null when there is nothing honest to say', () => {
    expect(moveReasonText(0, {})).toBeNull();
    expect(moveReasonText(null, null)).toBeNull();
  });

  it('singularises a one-event cost interval', () => {
    expect(moveReasonText(-5, { ci: { cpa: 12, events: 1 } })).toContain('on 1 event.');
  });
});
