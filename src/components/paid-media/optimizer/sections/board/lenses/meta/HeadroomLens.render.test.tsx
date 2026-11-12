import { afterEach, describe, expect, it } from 'bun:test';
import { cleanup, fireEvent, screen } from '@testing-library/react';
import { render } from '@/i18n/__tests__/render';
import { PORTFOLIOS, TOP_CAMPAIGNS } from './__fixtures__/easyFitMeta';
import { buildMix } from './branchesModel';
import { HeadroomView } from './HeadroomLens';
import { buildHeadroom } from './headroomModel';
import { rankRowOf } from './metaLensModel';

afterEach(cleanup);

const mix = buildMix(TOP_CAMPAIGNS.map(rankRowOf), PORTFOLIOS, 'MXN');
if (!mix) throw new Error('expected a mix');
const model = buildHeadroom(mix, 'MXN');

describe('HeadroomView at m (Easy Fit, Oct 3 – Nov 2)', () => {
  it('plots one labelled point per branch with the goal line', () => {
    const { container } = render(<HeadroomView currency="MXN" mix={mix} model={model} size="m" />);
    const points = screen.getAllByTestId('board-module-headroom-point');
    expect(points.map((point) => point.getAttribute('data-label'))).toEqual([
      'CAÑADAS',
      'AV CAMACHO',
      'ALEIRA',
      'ITESO',
      'EASY',
    ]);
    const labels = [...container.querySelectorAll('svg text')].map((node) => node.textContent);
    expect(labels).toEqual(expect.arrayContaining(['ALEIRA', 'EASY', 'goal $296', 'CPM · MXN']));
    expect(screen.getByTestId('board-module-headroom-goal')).toBeTruthy();
  });

  it('calls out the cheapest to reach and the best at converting', () => {
    render(<HeadroomView currency="MXN" mix={mix} model={model} size="m" />);
    const callouts = screen.getByTestId('board-module-headroom-callouts').textContent;
    expect(callouts).toContain('Cheapest to reachALEIRA · CPM $43.35 MXN');
    expect(callouts).toContain('Converts bestEASY · $305 MXN per purchase');
    expect(screen.getByTestId('board-module-headroom-takeaway').textContent).toBe(
      'ALEIRA tiene el CPM más bajo ($43.35 MXN) y EASY el mejor costo por compra ($305 MXN).',
    );
  });

  it('shows a point’s figures on hover', () => {
    render(<HeadroomView currency="MXN" mix={mix} model={model} size="m" />);
    const aleira = screen
      .getAllByTestId('board-module-headroom-point')
      .find((point) => point.getAttribute('data-label') === 'ALEIRA');
    if (!aleira) throw new Error('expected ALEIRA');
    fireEvent.pointerEnter(aleira);
    const tip = screen.getByRole('tooltip').textContent;
    expect(tip).toContain('CPM $43.35 MXN');
    expect(tip).toContain('$366 MXN per purchase');
    expect(tip).toContain('$19,035 MXN spend');
  });
});

describe('HeadroomView at s', () => {
  it('leads with the CPM spread over a bare scatter', () => {
    const { container } = render(<HeadroomView currency="MXN" mix={mix} model={model} size="s" />);
    expect(screen.getByTestId('board-module-headroom-headline').textContent).toBe(
      '$43.35–$61.10 MXNCPM by branch · ALEIRA is the cheapest to reach',
    );
    expect(screen.getAllByTestId('board-module-headroom-point')).toHaveLength(5);
    expect(container.querySelectorAll('svg text')).toHaveLength(0);
    expect(screen.queryByTestId('board-module-headroom-callouts')).toBeNull();
  });
});
