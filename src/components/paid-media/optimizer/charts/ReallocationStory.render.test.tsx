import { afterEach, describe, expect, it } from 'bun:test';
import type { AdSetSnapshot, CycleItemRow } from '@continuum/contracts';
import { getOptimizationMetricDefinition } from '@continuum/contracts';
import { cleanup, fireEvent, render } from '@testing-library/react';

const { ReallocationStory } = await import('./ReallocationStory');

afterEach(cleanup);

const lead = getOptimizationMetricDefinition('lead');

function item(adset_id: string, current: number, final: number, reason?: string): CycleItemRow {
  return {
    adset_id,
    current_budget: current,
    final_budget: final,
    change_abs: final - current,
    change_pct: (final - current) / current,
    reason: reason ?? null,
  };
}

function snapshot(id: string, spend: number, leads: number): AdSetSnapshot {
  const w = { spend, leads, purchases: 0, addToCarts: 0, clicks: 0, impressions: 0 };
  return {
    id,
    status: 'active',
    currentBudget: 100,
    windows: { d3: w, d7: w, d14: { ...w, spend: spend * 3, leads } },
  } as unknown as AdSetSnapshot;
}

const items = [
  item('cheap', 100, 140, 'Earned a larger share of the pool than its current budget.'),
  item('pricey', 100, 60, 'Costs more per lead than the pool.'),
];
const snapshotById = new Map([
  ['cheap', snapshot('cheap', 100, 10)],
  ['pricey', snapshot('pricey', 100, 2)],
]);
const nameById = new Map([
  ['cheap', 'Cheap leads'],
  ['pricey', 'Pricey leads'],
]);

describe('ReallocationStory', () => {
  it('tells the move as a sentence, then a row per ad set with cost, standing, budget and why', () => {
    const { container, getAllByRole } = render(
      <ReallocationStory
        currency="USD"
        items={items}
        metric={lead}
        nameById={nameById}
        snapshotById={snapshotById}
        target={30}
      />,
    );
    const text = container.textContent ?? '';
    expect(text).toMatch(
      /Moving \$40\/day from 1 ad set \(1 above target\) to 1 ad set \(1 below target\)/,
    );
    const rows = getAllByRole('listitem');
    expect(rows).toHaveLength(2);
    expect(rows[0].textContent).toContain('Cheap leads');
    expect(rows[0].textContent).toContain('Below target');
    expect(rows[0].textContent).toContain('$10');
    expect(rows[0].textContent).toContain('$100');
    expect(rows[0].textContent).toContain('$140');
    expect(rows[0].textContent).toContain('+40%');
    expect(rows[0].textContent).toContain('Earned a larger share');
    expect(rows[1].textContent).toContain('Above target');
    expect(rows[1].textContent).toContain('$50');
    expect(text).toContain('target $30');
  });

  it('switching the lookback re-prices the rows on that engine window', () => {
    const { getByRole, getAllByRole } = render(
      <ReallocationStory
        currency="USD"
        items={items}
        metric={lead}
        nameById={nameById}
        snapshotById={snapshotById}
        target={30}
      />,
    );
    fireEvent.click(getByRole('button', { name: '14d' }));
    // 14d window: spend ×3, same leads → $30 and $150
    expect(getAllByRole('listitem')[0].textContent).toContain('$30');
    expect(getAllByRole('listitem')[1].textContent).toContain('$150');
  });

  it('collapses long lists behind "show more"', () => {
    const many = Array.from({ length: 12 }, (_, i) => item(`a${i}`, 100, 110));
    const { getByRole, getAllByRole } = render(
      <ReallocationStory collapsedRows={5} items={many} metric={lead} target={null} />,
    );
    expect(getAllByRole('listitem')).toHaveLength(5);
    fireEvent.click(getByRole('button', { name: /show 7 more/i }));
    expect(getAllByRole('listitem')).toHaveLength(12);
  });

  it('says plainly when nothing moved', () => {
    const { container } = render(
      <ReallocationStory items={[item('a', 100, 100)]} metric={lead} target={null} />,
    );
    expect(container.textContent).toMatch(/No budget moved this cycle/);
  });
});
