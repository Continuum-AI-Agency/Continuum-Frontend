import { describe, expect, it } from 'bun:test';
import {
  AWARENESS,
  NOW,
  SMART_FIT,
  SPORT_CITY,
  TRENDS_READ,
  TRENDS_READ_EMPTY,
} from './__fixtures__/marketRadar';
import {
  competitorMovesOf,
  groupMoves,
  marketTileView,
  moveSentence,
  movesInLastDays,
  orderTrends,
  shortDay,
  trendItemsOf,
  trendsFromReadResponse,
} from './marketRadarModel';

const moves = competitorMovesOf(AWARENESS);
const insights = trendsFromReadResponse(TRENDS_READ);
const trends = trendItemsOf(insights);

describe('competitor moves — the stored awareness report', () => {
  it('reads every lifecycle row it can, and drops one it cannot', () => {
    expect(moves.length).toBe(5);
    expect(competitorMovesOf(null)).toEqual([]);
  });

  it('counts the moves of the last seven days for the headline', () => {
    expect(movesInLastDays(moves, NOW, 7)).toBe(4);
  });

  it('groups a burst from one competitor into one line, newest first', () => {
    const groups = groupMoves(moves);
    expect(
      groups.map((group) => [group.competitorId, group.eventType, group.count, group.day]),
    ).toEqual([
      [SMART_FIT, 'variant_spawned', 3, '2026-11-03'],
      [SPORT_CITY, 'new_ad', 1, '2026-11-01'],
      [SMART_FIT, 'paused', 1, '2026-10-20'],
    ]);
  });
});

describe('trends — the latest completed generation', () => {
  it('is null when the brand never completed a generation', () => {
    expect(trendsFromReadResponse(TRENDS_READ_EMPTY)).toBeNull();
    expect(trendItemsOf(null)).toEqual([]);
  });

  it('keeps the stored text and the confidence', () => {
    const first = trends.find((item) => item.id === 't1');
    expect(first?.title).toBe('Espacios recreativos que complementan el ejercicio en familia');
    expect(first?.relevance).toBe('Relevance of t1 to Easy Fit.');
    expect(first?.confidence).toBe(0.85);
  });

  it('orders by recency first, then confidence — there is no relevance score to order by', () => {
    expect(orderTrends(trends).map((item) => item.id)).toEqual(['t1', 't2', 't4', 't3']);
  });
});

describe('marketTileView — what the tile can show', () => {
  const settled = { loading: false, failed: false };

  it('is missing, pointing at Brand Spy, when neither source has anything', () => {
    const view = marketTileView({ ...settled, reportExists: false, moves: [], trends: [] });
    expect(view.state).toBe('missing');
    expect(view.missing).toBe('No competitors tracked yet — add them in Brand Spy.');
  });

  it('says what is missing when a report exists with no moves and there are no trends', () => {
    const view = marketTileView({ ...settled, reportExists: true, moves: [], trends: [] });
    expect(view.state).toBe('missing');
    expect(view.missing).toBe(
      'No competitor moves or trends read yet — scan your competitors in Brand Spy.',
    );
  });

  it('is ready with trends alone, or with moves alone', () => {
    expect(marketTileView({ ...settled, reportExists: false, moves: [], trends }).state).toBe(
      'ready',
    );
    expect(marketTileView({ ...settled, reportExists: true, moves, trends: [] }).state).toBe(
      'ready',
    );
  });

  it('loads while a read is on its way and fails when a read failed', () => {
    expect(
      marketTileView({ loading: true, failed: false, reportExists: false, moves: [], trends: [] })
        .state,
    ).toBe('loading');
    expect(
      marketTileView({ loading: false, failed: true, reportExists: true, moves, trends }).state,
    ).toBe('error');
  });
});

describe('moveSentence — one line per group', () => {
  const [burst, single] = groupMoves(moves);
  if (!burst || !single) throw new Error('fixture has two groups');

  it('names the competitor when the module has read the names', () => {
    expect(moveSentence(burst, 'Smart Fit Mexico')).toBe('Smart Fit Mexico · 3 new ad variants');
    expect(moveSentence(single, 'Sport City')).toBe('Sport City launched a new ad');
  });

  it('counts without a name on the tile', () => {
    expect(moveSentence(burst, null)).toBe('3 new ad variants');
    expect(moveSentence(single, null)).toBe('1 new ad');
  });

  it('dates a group by its UTC day', () => {
    expect(shortDay('2026-11-03')).toBe('Nov 3');
  });
});
