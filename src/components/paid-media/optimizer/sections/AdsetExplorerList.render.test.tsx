import { afterEach, describe, expect, it, mock } from 'bun:test';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import type { OptimizerAdsetRow } from '../kpiColumns';
import { AdsetExplorerList } from './AdsetExplorerList';

function row(partial: Partial<OptimizerAdsetRow> & { adsetId: string }): OptimizerAdsetRow {
  return {
    name: null,
    spend: null,
    results: null,
    cost: null,
    ci: null,
    ...partial,
  };
}

const ROWS: OptimizerAdsetRow[] = [
  row({ adsetId: 'as-1', name: 'Alpha set', spend: 5000, cost: 50, currentBudget: 200 }),
  row({ adsetId: 'as-2', name: 'Beta set', spend: 1000, cost: 40, currentBudget: 150 }),
];

afterEach(cleanup);

describe('AdsetExplorerList', () => {
  it('renders every ad set with its inline budget / spend / cost, highest spend first', () => {
    render(
      <AdsetExplorerList
        currency="USD"
        metricLabel="CPL"
        onSelect={() => {}}
        rows={ROWS}
        selectedId={null}
      />,
    );

    const rowButtons = screen.getAllByRole('button');
    // Spend-desc: Alpha ($5,000) precedes Beta ($1,000).
    expect(rowButtons[0].textContent).toContain('Alpha set');
    expect(rowButtons[1].textContent).toContain('Beta set');
    expect(rowButtons[0].textContent).toContain('$200'); // budget
    expect(rowButtons[0].textContent).toContain('$5,000'); // spend
    expect(rowButtons[0].textContent).toContain('$50'); // CPL
  });

  it('filters the list by the search box', () => {
    render(
      <AdsetExplorerList
        currency="USD"
        metricLabel="CPL"
        onSelect={() => {}}
        rows={ROWS}
        selectedId={null}
      />,
    );

    fireEvent.change(screen.getByLabelText('Search ad sets'), { target: { value: 'beta' } });

    expect(screen.queryByText('Alpha set')).toBeNull();
    expect(screen.getByText('Beta set')).toBeTruthy();
  });

  it('fires onSelect with the ad set id when a row is clicked', () => {
    const onSelect = mock(() => {});
    render(
      <AdsetExplorerList
        currency="USD"
        metricLabel="CPL"
        onSelect={onSelect}
        rows={ROWS}
        selectedId={null}
      />,
    );

    fireEvent.click(screen.getByText('Alpha set'));

    expect(onSelect).toHaveBeenCalledTimes(1);
    expect(onSelect.mock.calls[0][0]).toBe('as-1');
  });

  it('marks the selected row pressed', () => {
    render(
      <AdsetExplorerList
        currency="USD"
        metricLabel="CPL"
        onSelect={() => {}}
        rows={ROWS}
        selectedId="as-2"
      />,
    );

    const selected = screen
      .getAllByRole('button')
      .find((button) => button.textContent?.includes('Beta set'));
    expect(selected?.getAttribute('aria-pressed')).toBe('true');
  });
});
