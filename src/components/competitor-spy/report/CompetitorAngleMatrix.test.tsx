import { afterEach, describe, expect, it } from 'bun:test';
import type { CompetitorAngleMapRow } from '@continuum/contracts';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { CompetitorAngleMatrix } from './CompetitorAngleMatrix';

afterEach(cleanup);

const row = (
  competitorId: string | null,
  competitorName: string | null,
  value: string,
  longevityWeightedShare: number,
): CompetitorAngleMapRow => ({
  competitorId,
  competitorName,
  dimension: 'angle',
  value,
  adCount: 10,
  activeAdCount: 6,
  medianLongevityDays: 21,
  longevityWeightedShare,
  variantFamilies: 3,
  sustainedHeroes: 1,
  volumeSpikes: 0,
  competitorCount: competitorId ? 1 : 2,
  tier: 'testing',
  exemplarSnapshotIds: [],
});

const rows = [
  row(null, null, 'social_proof', 0.22),
  row(null, null, 'ingredient_science', 0.18),
  row('northwind', 'Northwind Skin', 'social_proof', 0.31),
  row('northwind', 'Northwind Skin', 'ingredient_science', 0.12),
  row('lumen', 'Lumen Labs', 'social_proof', 0.14),
  row('lumen', 'Lumen Labs', 'ingredient_science', 0.38),
];

describe('CompetitorAngleMatrix', () => {
  it('draws the radar with one series per competitor beside the rollup', () => {
    const { container } = render(<CompetitorAngleMatrix rows={rows} />);
    const headers = Array.from(container.querySelectorAll('table th[scope="col"]')).map(
      (th) => th.textContent,
    );
    expect(headers).toEqual(['Axis', 'All competitors', 'Northwind Skin', 'Lumen Labs']);
  });

  it('keeps every exact share reachable in the chart view', () => {
    const { container } = render(<CompetitorAngleMatrix rows={rows} />);
    const table = container.querySelector('table');
    for (const figure of ['22%', '18%', '31%', '12%', '14%', '38%']) {
      expect(table?.textContent).toContain(figure);
    }
  });

  it('switches to the matrix with every cell labelled', () => {
    render(<CompetitorAngleMatrix rows={rows} />);
    fireEvent.click(screen.getByRole('button', { name: 'table' }));
    expect(
      screen.getByRole('img', {
        name: 'Lumen Labs, ingredient science: 38% of their ad longevity across 10 ads',
      }),
    ).toBeTruthy();
  });

  it('explains the empty state when no competitor carries angles', () => {
    render(<CompetitorAngleMatrix rows={rows.filter((r) => r.competitorId === null)} />);
    expect(screen.getByText(/fills once competitor ads carry labeled angles/)).toBeTruthy();
  });
});
