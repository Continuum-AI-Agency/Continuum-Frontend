import { afterEach, describe, expect, it } from 'bun:test';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { PORTFOLIOS, TOP_CAMPAIGNS } from './__fixtures__/easyFitMeta';
import { BranchesView } from './BranchesLens';
import { buildMix } from './branchesModel';
import { rankRowOf } from './metaLensModel';

afterEach(cleanup);

const mix = buildMix(TOP_CAMPAIGNS.map(rankRowOf), PORTFOLIOS, 'MXN');
if (!mix) throw new Error('expected a mix');

describe('BranchesView at m (Easy Fit, Oct 3 – Nov 2)', () => {
  it('draws one row per branch, cheapest first, with its cost against the Tours goal', () => {
    render(<BranchesView currency="MXN" model={mix} size="m" />);
    const rows = screen.getAllByTestId('board-module-branches-row');
    expect(rows.map((row) => within(row).getByTitle(/./).textContent)).toEqual([
      'EASY',
      'ALEIRA',
      'AV CAMACHO',
      'CAÑADAS',
      'ITESO',
    ]);
    const easy = rows[0];
    if (!easy) throw new Error('expected a row');
    expect(easy.textContent).toContain('$305 MXN');
    expect(easy.textContent).toContain('3% over goal');
    expect(easy.textContent).toContain('10%');
    expect(easy.textContent).toContain('13%');
    expect(rows[3]?.textContent).toContain('2 campaigns');
    expect(rows[4]?.textContent).toContain('3 campaigns');
  });

  it('names the goal and the portfolio it comes from, and the takeaway in Spanish', () => {
    render(<BranchesView currency="MXN" model={mix} size="m" />);
    expect(screen.getByTestId('board-module-branches-reference').textContent).toBe(
      'Cost per purchase · goal $296 MXN (Tours Programados - Octubre)',
    );
    expect(screen.getByTestId('board-module-branches-takeaway').textContent).toBe(
      'EASY consigue compras a $305 MXN y ITESO a $485 MXN; la meta es $296 MXN.',
    );
    expect(screen.getByText(/5 branches from 10 campaigns · 217 purchases/)).toBeTruthy();
  });

  it('shows a branch’s figures on hover', () => {
    render(<BranchesView currency="MXN" model={mix} size="m" />);
    const bars = screen.getByRole('img', { name: /^CAÑADAS:/ });
    fireEvent.pointerEnter(bars);
    const tip = screen.getByRole('tooltip');
    expect(tip.textContent).toContain('$23,911 MXN spend · 27%');
    expect(tip.textContent).toContain('53 purchases · 24%');
    expect(tip.textContent).toContain('$451 MXN per purchase');
    fireEvent.pointerLeave(bars);
    expect(screen.queryByRole('tooltip')).toBeNull();
  });
});

describe('BranchesView at s', () => {
  it('leads with the cheapest-to-dearest cost and a bar per branch', () => {
    render(<BranchesView currency="MXN" model={mix} size="s" />);
    const headline = screen.getByTestId('board-module-branches-headline');
    expect(headline.textContent).toBe('$305–$485 MXNCost per purchase by branch');
    const list = screen.getByRole('list', { name: 'Cost per purchase by branch' });
    expect(within(list).getAllByRole('listitem')).toHaveLength(5);
    expect(screen.queryByTestId('board-module-branches-takeaway')).toBeNull();
  });
});
