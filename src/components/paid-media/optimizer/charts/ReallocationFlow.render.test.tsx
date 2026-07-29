import { afterEach, describe, expect, it } from 'bun:test';
import { cleanup, render } from '@testing-library/react';
import type { ReactElement } from 'react';

(globalThis as unknown as { window: { SyntaxError: typeof SyntaxError } }).window.SyntaxError =
  SyntaxError;

import { TooltipProvider } from '@/components/ui/tooltip';
import { cycleItemsHeldOnly, cycleItemsMixed } from './__fixtures__/optimizerFixtures';
import { ReallocationFlow } from './ReallocationFlow';

afterEach(cleanup);

function renderFlow(ui: ReactElement) {
  return render(<TooltipProvider>{ui}</TooltipProvider>);
}

describe('ReallocationFlow', () => {
  it('shows the empty state when only held ad sets remain (no flow)', () => {
    const { getByText } = renderFlow(<ReallocationFlow items={cycleItemsHeldOnly} />);
    expect(getByText(/No budget moved this cycle/i)).toBeTruthy();
  });

  it('renders gain/loss bars on the semantic tokens, never hardcoded emerald/rose', () => {
    const { getByText, container } = renderFlow(
      <ReallocationFlow currency="USD" items={cycleItemsMixed} />,
    );
    // Held ad set is excluded; the two moved ones render as rows.
    expect(getByText('act_1::adset_gainer')).toBeTruthy();
    expect(getByText('act_1::adset_loser')).toBeTruthy();
    // Gainers, losers AND the net — a cut that used to read as "$40 moved" now reads as a
    // net, which is the number that tells you whether spend is being reallocated or reduced.
    expect(container.textContent).toContain('+$40 to 1');
    expect(container.textContent).toContain('−$40 from 1');
    expect(container.textContent).toContain('net +$0');
    expect(container.textContent).toContain('across 2 ad sets');
    expect(container.innerHTML).toContain('bg-success');
    expect(container.innerHTML).toContain('bg-destructive');
    expect(container.innerHTML).not.toMatch(/emerald-|rose-/);
  });

  it('reads human ad-set names when nameById resolves them', () => {
    const nameById = new Map([
      ['act_1::adset_gainer', 'Prospecting — Broad'],
      ['act_1::adset_loser', 'Retargeting — 30d'],
    ]);
    const { getByText, queryByText } = renderFlow(
      <ReallocationFlow currency="USD" items={cycleItemsMixed} nameById={nameById} />,
    );
    expect(getByText('Prospecting — Broad')).toBeTruthy();
    expect(getByText('Retargeting — 30d')).toBeTruthy();
    // Raw ids no longer surface once a name is resolved.
    expect(queryByText('act_1::adset_gainer')).toBeNull();
    expect(queryByText('act_1::adset_loser')).toBeNull();
  });

  it('falls back to the raw id for an ad set missing from nameById', () => {
    const nameById = new Map([['act_1::adset_gainer', 'Prospecting — Broad']]);
    const { getByText } = renderFlow(
      <ReallocationFlow currency="USD" items={cycleItemsMixed} nameById={nameById} />,
    );
    expect(getByText('Prospecting — Broad')).toBeTruthy();
    expect(getByText('act_1::adset_loser')).toBeTruthy();
  });

  it('adds KPI-adaptive cost/results columns when an objective is provided', () => {
    const { container } = renderFlow(
      <ReallocationFlow currency="USD" items={cycleItemsMixed} objective="lead" />,
    );
    // The lead objective labels the cost column CPL and the results column Leads.
    expect(container.textContent).toContain('CPL');
    expect(container.textContent).toContain('Leads');
  });
});

describe('ReallocationFlow — net honesty', () => {
  // The field bug: −$746 out, +$75 in read as "$75 moved", so a budget CUT looked like a
  // reallocation. The net is what distinguishes them.
  const cuttingItems = [
    { adset_id: 'up', current_budget: 100, final_budget: 175, change_abs: 75, change_pct: 0.75 },
    {
      adset_id: 'down',
      current_budget: 900,
      final_budget: 154,
      change_abs: -746,
      change_pct: -0.83,
    },
  ] as never;

  it('surfaces a net cut instead of reporting only the gainers', () => {
    const { container } = render(<ReallocationFlow currency="USD" items={cuttingItems} />);
    expect(container.textContent).toContain('net −$671');
  });

  it('warns when a budget-neutral portfolio does not net to zero', () => {
    const { container } = render(
      <ReallocationFlow budgetSource="observed" currency="USD" items={cuttingItems} />,
    );
    expect(container.textContent).toContain('should be about zero');
  });

  it('explains a deliberate cut on a fixed-target portfolio instead of warning', () => {
    const { container } = render(
      <ReallocationFlow budgetSource="fixed" currency="USD" items={cuttingItems} />,
    );
    expect(container.textContent).toContain('fixed daily budget');
    expect(container.textContent).not.toContain('should be about zero');
  });
});
