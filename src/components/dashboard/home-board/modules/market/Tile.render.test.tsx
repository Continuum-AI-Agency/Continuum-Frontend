import { afterEach, describe, expect, it, mock, setSystemTime } from 'bun:test';
import type { Competitor, HomeBoardTile } from '@continuum/contracts';
import { cleanup, fireEvent, render } from '@testing-library/react';
import type { HomeBoardContext } from '../../types';
import { AWARENESS, NOW, SMART_FIT, SPORT_CITY, TRENDS_READ } from './__fixtures__/marketRadar';
import { competitorMovesOf, trendItemsOf, trendsFromReadResponse } from './marketRadarModel';
import type { MarketRadarLoad } from './useMarketRadar';

// The radar's reads and Brand Spy's competitor list are mocked: the ordering model has its own
// test. `mock.module` replaces a module for the whole process, so this file runs on its own;
// every mock spreads the real module.
const MOVES = competitorMovesOf(AWARENESS);
const TRENDS = trendItemsOf(trendsFromReadResponse(TRENDS_READ));
let retried = 0;
let radar: MarketRadarLoad;
const reset = () => {
  retried = 0;
  radar = {
    reportExists: true,
    moves: MOVES,
    trends: TRENDS,
    loading: false,
    failed: false,
    retry: () => (retried += 1),
  };
};
reset();
const realRadar = await import('./useMarketRadar');
mock.module('./useMarketRadar', () => ({ ...realRadar, useMarketRadar: () => radar }));

const competitor = (id: string, name: string) => ({ id, name }) as Competitor;
const realSpy = await import('@/lib/api/competitorSpy');
mock.module('@/lib/api/competitorSpy', () => ({
  ...realSpy,
  useCompetitors: () => ({
    data: [competitor(SMART_FIT, 'Smart Fit Mexico'), competitor(SPORT_CITY, 'Sport City')],
  }),
}));

const { default: MarketTile } = await import('./Tile');
const { default: MarketRadarModule, RADAR_ORDER_NOTE } = await import('./Module');

setSystemTime(NOW);
afterEach(() => {
  cleanup();
  reset();
});

const ctx = { brandId: '6f597f42-b5b5-4b9a-baa5-9a4d9fdb9b64' } as HomeBoardContext;
const tileOf = (size: HomeBoardTile['size'] = 's'): HomeBoardTile => ({
  id: 'market',
  size,
  urgency: 1,
  score: 30,
  why: null,
});
const stateOf = (root: HTMLElement) =>
  root.querySelector('[data-testid="home-tile-market"]')?.getAttribute('data-module-state');

describe('Market radar tile', () => {
  it('heads with the competitor moves of the last seven days', () => {
    const { container, getByTestId, getAllByTestId } = render(
      <MarketTile ctx={ctx} tile={tileOf()} />,
    );
    expect(stateOf(container)).toBe('ready');
    const headline = getByTestId('home-tile-market-headline');
    expect(headline.getAttribute('data-value')).toBe('4');
    const lines = getAllByTestId('home-tile-market-line');
    expect(lines.length).toBe(1);
    expect(lines[0]?.textContent).toBe('3 new ad variantsCompetitor · Nov 3');
  });

  it('lists competitor moves above trends at size l', () => {
    const { getAllByTestId } = render(<MarketTile ctx={ctx} tile={tileOf('l')} />);
    expect(getAllByTestId('home-tile-market-line').map((line) => line.textContent)).toEqual([
      '3 new ad variantsCompetitor · Nov 3',
      '1 new adCompetitor · Nov 1',
      '1 ad pausedCompetitor · Oct 20',
    ]);
  });

  it('leads with the newest, most confident trend when there are no competitor moves', () => {
    radar = { ...radar, reportExists: false, moves: [] };
    const { getByTestId, getAllByTestId } = render(<MarketTile ctx={ctx} tile={tileOf()} />);
    expect(getByTestId('home-tile-market-headline').getAttribute('data-value')).toBe('0');
    expect(getAllByTestId('home-tile-market-line')[0]?.textContent).toBe(
      'Espacios recreativos que complementan el ejercicio en familiaTrend · Nov 2',
    );
  });

  it('is missing, pointing at Brand Spy, when neither source has anything', () => {
    radar = { ...radar, reportExists: false, moves: [], trends: [] };
    const { container, getByTestId } = render(<MarketTile ctx={ctx} tile={tileOf()} />);
    expect(stateOf(container)).toBe('missing');
    const missing = getByTestId('home-tile-missing');
    expect(missing.textContent).toStartWith('No competitors tracked yet — add them in Brand Spy.');
    expect(missing.querySelector('a')?.getAttribute('href')).toBe('/competitor-spy');
  });

  it('loads while the reads are on their way, never with a figure', () => {
    radar = { ...radar, loading: true, moves: [], trends: [] };
    const { container, queryByTestId } = render(<MarketTile ctx={ctx} tile={tileOf()} />);
    expect(stateOf(container)).toBe('loading');
    expect(queryByTestId('home-tile-market-headline')).toBeNull();
  });

  it('says a failed read failed, and retries it', () => {
    radar = { ...radar, failed: true };
    const { container, getByText } = render(<MarketTile ctx={ctx} tile={tileOf()} />);
    expect(stateOf(container)).toBe('error');
    fireEvent.click(getByText('Retry'));
    expect(retried).toBe(1);
  });
});

describe('Market radar module (expanded)', () => {
  it('names the competitors, newest move first, and puts trends below', () => {
    const { getAllByTestId, getByText } = render(<MarketRadarModule brandId={ctx.brandId} />);
    expect(getAllByTestId('home-market-move').map((row) => row.textContent)).toEqual([
      'Smart Fit Mexico · 3 new ad variantsCompetitor · Nov 3',
      'Sport City launched a new adCompetitor · Nov 1',
      'Smart Fit Mexico paused an adCompetitor · Oct 20',
    ]);
    const trends = getAllByTestId('home-market-trend');
    expect(trends.map((row) => row.querySelector('.font-medium')?.textContent)).toEqual([
      'Espacios recreativos que complementan el ejercicio en familia',
      'Campañas de cadenas de bienestar locales en México',
      'Clases grupales al aire libre',
      'Retos de entrenamiento en pareja',
    ]);
    expect(trends[0]?.textContent).toContain('85% confidence');
    expect(getByText(RADAR_ORDER_NOTE)).toBeTruthy();
  });
});
