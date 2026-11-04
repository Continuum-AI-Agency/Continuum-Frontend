import { describe, expect, it } from 'bun:test';
import type { HomeBriefFigure } from '@continuum/contracts';
import {
  briefFigureHref,
  briefFigureSource,
  briefFigureWindow,
  sentenceParts,
} from './briefEvidence';

const figure = (over: Partial<HomeBriefFigure> = {}): HomeBriefFigure => ({
  n: 1,
  label: 'Spending on nothing',
  value: 9.16,
  unit: 'currency',
  currency: 'MXN',
  display: '9.16 MXN',
  field: 'impact_per_day',
  source: {
    kind: 'optimizer.account_daily_reads',
    ref: '5251780631|platform_signal:8c5a',
    since: '2026-11-04',
    until: '2026-11-04',
  },
  ...over,
});

describe('sentenceParts', () => {
  it('splits a sentence at each citation marker, keeping the words as written', () => {
    expect(sentenceParts('En 14 días consiguió 168[2] leads, 31%[3] menos.')).toEqual([
      { text: 'En 14 días consiguió 168' },
      { n: 2 },
      { text: ' leads, 31%' },
      { n: 3 },
      { text: ' menos.' },
    ]);
  });

  it('leaves a bracket that is not a citation alone', () => {
    expect(sentenceParts('Marca [Oct] 16[1].')).toEqual([
      { text: 'Marca [Oct] 16' },
      { n: 1 },
      { text: '.' },
    ]);
  });
});

describe('briefFigureSource', () => {
  it('names each stored source in words', () => {
    expect(briefFigureSource(figure())).toBe('The Optimizer’s daily read');
    expect(
      briefFigureSource(
        figure({ source: { ...figure().source, kind: 'optimizer.portfolio_daily_briefs' } }),
      ),
    ).toBe('The portfolio’s daily brief');
    expect(
      briefFigureSource(
        figure({ source: { ...figure().source, kind: 'brand_profiles.reporting_cache' } }),
      ),
    ).toBe('The account’s results, as last read from the platform');
    expect(
      briefFigureSource(
        figure({ source: { ...figure().source, kind: 'brand_profiles.home_goal_targets' } }),
      ),
    ).toBe('Your team’s goal target');
  });

  it('a source this version does not know is named as it came', () => {
    expect(briefFigureSource(figure({ source: { ...figure().source, kind: 'x.y' } }))).toBe('x.y');
  });
});

describe('briefFigureWindow', () => {
  it('names the days a figure covers, once when they are one', () => {
    expect(briefFigureWindow(figure())).toBe('Nov 4');
    expect(
      briefFigureWindow(
        figure({ source: { ...figure().source, since: '2026-11-01', until: '2026-11-03' } }),
      ),
    ).toBe('Nov 1 – Nov 3');
  });

  it('a source that states no window says nothing', () => {
    expect(
      briefFigureWindow(figure({ source: { ...figure().source, since: null, until: null } })),
    ).toBeNull();
    expect(
      briefFigureWindow(
        figure({ source: { ...figure().source, since: null, until: '2026-11-04' } }),
      ),
    ).toBe('Through Nov 4');
  });
});

describe('briefFigureHref', () => {
  it('opens the account a stored read belongs to', () => {
    expect(briefFigureHref(figure())).toBe('/scale?tab=performance&adAccountId=5251780631');
  });

  it('opens the portfolio a brief belongs to', () => {
    expect(
      briefFigureHref(
        figure({
          source: { ...figure().source, kind: 'optimizer.portfolio_daily_briefs', ref: 'p1' },
        }),
      ),
    ).toBe('/scale?tab=performance&optimizerView=portfolios&portfolio=p1');
  });

  it('a source with nowhere to open has no link', () => {
    expect(
      briefFigureHref(
        figure({ source: { ...figure().source, kind: 'brand_profiles.home_goal_targets' } }),
      ),
    ).toBeNull();
  });
});
