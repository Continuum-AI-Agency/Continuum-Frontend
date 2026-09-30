import { describe, expect, it } from 'bun:test';
import type { BriefGrowth } from '@continuum/contracts';
import { getOptimizationMetricDefinition } from '@continuum/contracts';
import {
  adsetsOnTargetTile,
  agoWords,
  anchorOf,
  attributedRead,
  buildPortfolioHeadline,
  coveredDays,
  decisionsWaiting,
  type HeadlineSentence,
  relevantTiles,
  statusSentence,
} from './headlineModel';
import { buildHeroHeader, type HeroPortfolio } from './heroHeaderModel';
import { type RealBodyName, readBody } from './news/realBodies.fixture';

// The headline from each real optimizer-status body, and from the FORMULARIOS // TODOS
// figures the redesign page quotes (56 leads in 7 days at 38.59 MXN, target 35, the week
// before 58.78). Every figure in a sentence has to be one the tiles below carry.

const text = (sentence: HeadlineSentence): string =>
  sentence.map((s) => (typeof s === 'string' ? s : s.text)).join('');

const figures = (sentence: HeadlineSentence) =>
  sentence.filter((s): s is Exclude<typeof s, string> => typeof s !== 'string');

function headlineOf(name: RealBodyName, now?: number, objective?: string) {
  const { report, view, dailyTotal } = readBody(name);
  const portfolio = report.portfolio as unknown as HeroPortfolio & { name: string };
  const metric = getOptimizationMetricDefinition(objective ?? portfolio.objective);
  const header = buildHeroHeader({
    report,
    portfolio,
    lastCycleAt: report.latest_run?.cycle_ts ?? null,
    growth: view.brief.growth,
    metric,
    currency: null,
  });
  return buildPortfolioHeadline({
    view,
    report,
    portfolio: { name: portfolio.name, daily_total: dailyTotal, apply_mode: portfolio.apply_mode },
    metric,
    currency: null,
    mismatch: header.mismatch,
    now,
  });
}

const LEADS = { one: 'lead', many: 'leads' };

/** FORMULARIOS // TODOS as the redesign page quotes it. */
const quoted: BriefGrowth = {
  spend: 2161,
  results: 56,
  cost_per_result: 38.59,
  target: 35,
  deltas: { spend: 0.23, results: 0.87, cost_per_result: -0.34 },
  pacing: { status: null, ratio: null, note: null },
  scale: null,
  window: 'd7',
  as_of: '2026-09-28T01:05:00Z',
  currency: 'MXN',
  result_label: 'leads',
};

describe('the status sentence — how we are doing', () => {
  it('reads the count, the cost, the distance to target and the week before, with figures', () => {
    const sentence = statusSentence(quoted, LEADS, 'MXN', 7);
    expect(text(sentence)).toBe(
      '56 leads in 7 days at 38.59 MXN, 10% over the target of 35.00 MXN and 34% cheaper than the week before.',
    );
    expect(figures(sentence).map((f) => [f.key, f.raw, f.unit])).toEqual([
      ['headline.results', 56, 'count'],
      ['headline.cost', 38.59, 'currency'],
      ['headline.vs-target', 10, 'percent'],
      ['headline.target', 35, 'currency'],
      ['headline.vs-prior', 34, 'percent'],
    ]);
  });

  it('says under the target and dearer than before when that is the direction', () => {
    const sentence = statusSentence(
      { ...quoted, cost_per_result: 31.5, deltas: { ...quoted.deltas, cost_per_result: 0.12 } },
      LEADS,
      'MXN',
      7,
    );
    expect(text(sentence)).toBe(
      '56 leads in 7 days at 31.50 MXN, 10% under the target of 35.00 MXN and 12% dearer than the week before.',
    );
  });

  it('names the window before by its length', () => {
    expect(text(statusSentence({ ...quoted, window: 'd14' }, LEADS, 'MXN', 14))).toContain(
      'the two weeks before',
    );
  });

  it('with no target it says so; with no prior it stops at the target', () => {
    expect(text(statusSentence({ ...quoted, target: null }, LEADS, 'MXN', 7))).toBe(
      '56 leads in 7 days at 38.59 MXN, no target set and 34% cheaper than the week before.',
    );
    expect(
      text(
        statusSentence(
          { ...quoted, deltas: { spend: null, results: null, cost_per_result: null } },
          LEADS,
          'MXN',
          7,
        ),
      ),
    ).toBe('56 leads in 7 days at 38.59 MXN, 10% over the target of 35.00 MXN.');
  });

  it('with nothing bought it says what was spent for it', () => {
    const none = statusSentence(
      { ...quoted, results: 0, cost_per_result: null, spend: 408 },
      { one: 'purchase', many: 'purchases' },
      'MXN',
      4,
    );
    expect(text(none)).toBe('0 purchases in 4 days with 408 MXN spent.');
    expect(
      text(
        statusSentence({ ...quoted, results: 0, cost_per_result: null, spend: 0 }, LEADS, 'MXN', 4),
      ),
    ).toBe('0 leads in 4 days, no spend.');
  });
});

describe('FORMULARIOS — the real body', () => {
  const headline = headlineOf('formularios', Date.parse('2026-09-25T21:04:40Z'));

  it('states the status with the body’s own figures and no dollar sign', () => {
    expect(text(headline.status)).toBe(
      '80 leads in 14 days at 45.69, 31% over the target of 35.00.',
    );
    expect(JSON.stringify(headline)).not.toContain('$');
  });

  it('names the single largest opportunity, the ad set’s own cost and the money it frees', () => {
    expect(text(headline.opportunity)).toBe(
      'The opportunity: Ad set A pays 75.65 per lead; pausing it frees 43.23 a day.',
    );
    expect(figures(headline.opportunity).map((f) => f.key)).toEqual([
      'headline.opportunity.cost',
      'headline.opportunity',
    ]);
  });

  it('has no blocker: it delivers, it buys leads, every ad set bids for them', () => {
    expect(headline.blocker).toBeNull();
  });

  it('draws four tiles, spend · results · cost · decisions, each with a state', () => {
    expect(headline.tiles.map((t) => t.key)).toEqual(['spend', 'results', 'cost', 'decisions']);
    const [spend, results, cost, decisions] = headline.tiles;
    expect(spend).toMatchObject({
      label: 'Spend · 14 days',
      value: '3,655',
      sub: '261 per day · plan 324',
      state: 'warn',
    });
    expect(results).toMatchObject({
      label: 'Leads',
      value: '80',
      sub: '104 at target for this spend',
      state: 'bad',
    });
    expect(cost).toMatchObject({
      label: 'Cost per lead',
      value: '45.69',
      sub: '+31% over target 35.00',
      state: 'bad',
    });
    expect(decisions).toMatchObject({ label: 'Decisions', value: '3', state: 'warn' });
    expect(decisions?.sub).toMatch(/^90\.72\/day at stake$/);
  });

  it('carries Jaina’s own sentence as her read, dated', () => {
    expect(headline.read).toMatchObject({
      source: 'jaina',
      label: 'Jaina · on Lead forms portfolio · 2 h ago',
      sentence: 'Pause Ad set A to save 43.23/day',
    });
    expect(headline.read.figure).toMatchObject({ key: 'jaina.read', raw: 43.23, unit: 'sentence' });
  });
});

describe('Tours — nothing bought, every ad set held', () => {
  const headline = headlineOf('tours', Date.parse('2026-09-25T00:47:57Z'));

  it('states the spend that bought nothing', () => {
    expect(text(headline.status)).toBe('0 conversations in 2 days with 155 spent.');
  });

  it('says there is no opportunity, with the plan figure', () => {
    expect(text(headline.opportunity)).toBe(
      'No open opportunities today: the optimizer has nothing to propose and the portfolio keeps running at 750 a day.',
    );
  });

  it('the blocker is the goal mismatch, ahead of the missing signal, with the header’s fixes', () => {
    expect(headline.blocker?.code).toBe('kpi_mismatch');
    expect(text(headline.blocker?.sentence ?? [])).toBe(
      'Blocked: all 12 ad sets bid for another result, not for conversations as this portfolio measures; the optimizer holds them and moves nothing.',
    );
    expect(headline.blocker?.actions.map((a) => a.label)).toEqual([
      'Change objective',
      'Remove these ad sets',
    ]);
  });

  it('labels the deterministic headline as automatic and falls back to the status sentence', () => {
    // "Nothing worth changing today" carries no figure; the read has to.
    expect(headline.read.source).toBe('auto');
    expect(headline.read.label).toBe('Automatic read · on Tours portfolio · 30 min ago');
    expect(headline.read.sentence).toBe('0 conversations in 2 days with 155 spent.');
  });

  it('the results tile is bad and the cost tile cannot be judged', () => {
    const [, results, cost, decisions] = headline.tiles;
    expect(results).toMatchObject({ value: '0', sub: '155 with no result', state: 'bad' });
    expect(cost).toMatchObject({
      value: '—',
      sub: 'no conversations to divide by',
      state: 'none',
    });
    expect(decisions).toMatchObject({
      value: '0',
      sub: 'nothing waits for your decision',
      state: 'none',
    });
  });
});

describe('the other two blockers', () => {
  const base = () => headlineOf('formularios');

  it('zero delivery: nothing spent in the window', () => {
    const { report, view, dailyTotal } = readBody('formularios');
    const growth = { ...view.brief.growth, spend: 0, results: 0, cost_per_result: null };
    const headline = buildPortfolioHeadline({
      view: { ...view, brief: { ...view.brief, growth } },
      report,
      portfolio: { name: 'X', daily_total: dailyTotal, apply_mode: 'autopilot' },
      metric: getOptimizationMetricDefinition('lead'),
      currency: null,
      mismatch: null,
    });
    expect(headline.blocker?.code).toBe('zero_delivery');
    expect(text(headline.blocker?.sentence ?? [])).toBe(
      'Blocked: zero delivery, nothing spent in 14 days.',
    );
  });

  it('no signal: spend with nothing to read', () => {
    const { report, view, dailyTotal } = readBody('formularios');
    const growth = { ...view.brief.growth, results: 0, cost_per_result: null };
    const headline = buildPortfolioHeadline({
      view: { ...view, brief: { ...view.brief, growth } },
      report,
      portfolio: { name: 'X', daily_total: dailyTotal, apply_mode: 'autopilot' },
      metric: getOptimizationMetricDefinition('lead'),
      currency: 'MXN',
      mismatch: null,
    });
    expect(headline.blocker?.code).toBe('no_signal');
    expect(text(headline.blocker?.sentence ?? [])).toBe(
      'Blocked: no signal, 3,655 MXN spent and 0 leads in 14 days; nothing to decide on.',
    );
  });

  it('a healthy body has none', () => {
    expect(base().blocker).toBeNull();
  });
});

describe('the small rules', () => {
  it('covered days never exceed the window nor the portfolio’s age', () => {
    expect(coveredDays(quoted, '2026-09-26')).toBe(3);
    expect(coveredDays(quoted, '2026-09-01')).toBe(7);
    expect(coveredDays(quoted, null)).toBe(7);
  });

  it('decisions count pending recommendations, and held moves only in Recommend', () => {
    const { report } = readBody('prueba');
    expect(decisionsWaiting(report, 'recommend')).toBe(5);
    expect(decisionsWaiting(report, 'autopilot')).toBe(2);
    expect(decisionsWaiting(null, 'recommend')).toBe(0);
  });

  it('ago words', () => {
    const now = Date.parse('2026-09-28T12:00:00Z');
    expect(agoWords('2026-09-28T11:25:00Z', now)).toBe('35 min ago');
    expect(agoWords('2026-09-28T09:58:00Z', now)).toBe('2 h ago');
    expect(agoWords('2026-09-25T12:00:00Z', now)).toBe('3 days ago');
    expect(agoWords('nope', now)).toBeNull();
  });
});

// ── The one-module hero (portafolio-unificado.html, idea D) ──

function moduleOf(name: RealBodyName, objective?: string) {
  const { report, view, dailyTotal } = readBody(name);
  const headline = headlineOf(name, Date.parse('2026-09-25T21:04:40Z'), objective);
  return { report, view, dailyTotal, headline };
}

const item = (adset_id: string, cpa: number, events: number) => ({
  adset_id,
  adset_name: `AS ${adset_id}`,
  current_budget: 100,
  final_budget: 100,
  change_abs: 0,
  change_pct: 0,
  diagnostics: { ci: { cpa, lo: cpa * 0.8, hi: cpa * 1.2, events } },
});

describe('the attributed read — Jaina’s line under the status sentence', () => {
  it('FORMULARIOS: a model wrote it and it says something else, so it stands, dated', () => {
    const read = attributedRead(moduleOf('formularios').headline);
    expect(read).toMatchObject({ ago: '2 h ago', sentence: 'Pause Ad set A to save 43.23/day' });
  });

  it('Tours: a deterministic read only repeats the headline, so there is none', () => {
    expect(attributedRead(moduleOf('tours').headline)).toBeNull();
  });

  it('a model read that is the status sentence again is dropped as a repeat', () => {
    const { headline } = moduleOf('formularios');
    const repeat = {
      ...headline,
      read: { ...headline.read, sentence: `${text(headline.status).slice(0, -1)}` },
    };
    expect(attributedRead(repeat)).toBeNull();
  });
});

describe('the anchor — the cost per result, and the two windows by their dates', () => {
  const beforeAfter = {
    lastCycle: null,
    projection: null,
    source: 'daily' as const,
    after: { label: '', short: 'week of Sep 21–27', spend: 2161, results: 56, cost: 38.59 },
    before: { label: '', short: 'week of Sep 14–20', spend: 1763, results: 30, cost: 58.78 },
  };

  it('over the target: amber, the unit in ISO words, the distance signed', () => {
    const anchor = anchorOf({
      growth: quoted,
      words: LEADS,
      currency: 'MXN',
      days: 7,
      beforeAfter,
    });
    expect(anchor).toMatchObject({
      value: '38.59',
      state: 'warn',
      unit: 'MXN per lead',
      target: 'target 35.00',
      vsTarget: '+10%',
      empty: null,
    });
    expect(anchor.figure).toMatchObject({ key: 'anchor.cost', raw: 38.59, window: 'd7' });
    expect(anchor.windows.map((w) => `${w.label}: ${w.text}`)).toEqual([
      'week of Sep 21–27: 38.59',
      'week of Sep 14–20: 58.78',
    ]);
  });

  it('under the target: green, the distance with a real minus sign', () => {
    const anchor = anchorOf({
      growth: { ...quoted, cost_per_result: 28 },
      words: LEADS,
      currency: 'MXN',
      days: 7,
      beforeAfter: null,
    });
    expect(anchor).toMatchObject({ state: 'ok', vsTarget: '−20%', windows: [] });
  });

  it('without a target: grey, and the target reads as unset', () => {
    const anchor = anchorOf({
      growth: { ...quoted, target: null },
      words: LEADS,
      currency: null,
      days: 7,
      beforeAfter,
    });
    expect(anchor).toMatchObject({
      state: 'none',
      target: 'no target',
      vsTarget: null,
      unit: 'per lead',
    });
  });

  it('without results: a dash and the days it has been without them', () => {
    const anchor = anchorOf({
      growth: { ...quoted, results: 0, cost_per_result: null },
      words: LEADS,
      currency: 'MXN',
      days: 14,
      beforeAfter: { ...beforeAfter, after: { ...beforeAfter.after, cost: null, results: 0 } },
    });
    expect(anchor).toMatchObject({ value: '—', state: 'none', empty: 'no leads in 14 days' });
    expect(anchor.windows[0]?.text).toBe('no leads');
  });
});

describe('the four tiles, by what the portfolio buys', () => {
  it('leads: spend · leads · ad sets in target · decisions — the cost left for the anchor', () => {
    const { view, report, dailyTotal, headline } = moduleOf('formularios');
    const tiles = relevantTiles({
      headline,
      brief: view.brief,
      items: report.latest_items,
      dailyTotal,
      currency: null,
    });
    expect(tiles.map((t) => [t.key, t.label])).toEqual([
      ['spend', 'Spend · 14 days'],
      ['results', 'Leads'],
      ['adsets', 'Ad sets on target'],
      ['decisions', 'Decisions'],
    ]);
    // The plan is the budget's own setting, one click from Manage.
    expect(tiles[0]?.sub).toEqual(['261/day · ', { setting: 'budget', text: 'plan 324' }]);
    expect(tiles[1]?.detail).toBe('104 at target for this spend');
  });

  it('conversations: the results tile speaks the portfolio’s own word', () => {
    const { view, report, dailyTotal, headline } = moduleOf('mensajes');
    const tiles = relevantTiles({
      headline,
      brief: view.brief,
      items: report.latest_items,
      dailyTotal,
      currency: null,
    });
    expect(tiles.map((t) => t.label)).toEqual([
      'Spend · 14 days',
      'Conversations',
      'Ad sets on target',
      'Decisions',
    ]);
    expect(tiles[2]).toMatchObject({ value: '1 of 12', state: 'warn' });
    // Nothing waits, so no "open opportunity" line contradicts it.
    expect(tiles[3]).toMatchObject({ sub: ['nothing waits for your decision'], detail: null });
  });

  it('purchases: the same four, the results tile named purchases (the brief carries no value yet)', () => {
    const { view, report, dailyTotal, headline } = moduleOf('formularios', 'purchase');
    const tiles = relevantTiles({
      headline,
      brief: view.brief,
      items: report.latest_items,
      dailyTotal,
      currency: null,
    });
    expect(tiles.map((t) => t.key)).toEqual(['spend', 'results', 'adsets', 'decisions']);
    expect(tiles[1]?.label).toBe('Purchases');
  });

  it('with no target: the ad-set tile says so and its rule is grey', () => {
    const { view, report, dailyTotal, headline } = moduleOf('formularios');
    const tiles = relevantTiles({
      headline,
      brief: { ...view.brief, growth: { ...view.brief.growth, target: null } },
      items: report.latest_items,
      dailyTotal,
      currency: null,
    });
    expect(tiles[2]).toMatchObject({ value: '—', sub: ['no target'], state: 'none' });
  });
});

describe('ad sets in target, from the cycle’s own rows', () => {
  it('counts every scored ad set in the total and only measured ones as best or worst', () => {
    const tile = adsetsOnTargetTile({
      items: [item('a', 26.2, 30), item('b', 58.1, 12), item('c', 31, 20), item('d', 0, 0)],
      target: 35,
      window: 'd14',
    });
    expect(tile).toMatchObject({
      value: '2 of 4',
      sub: ['best AS a 26.20'],
      detail: 'worst AS b 58.10',
      state: 'ok',
    });
    expect(tile.figure).toMatchObject({ key: 'tiles.adsets-on-target', raw: 2, unit: 'count' });
  });

  it('none in target is bad; fewer than half is a warning', () => {
    const none = adsetsOnTargetTile({
      items: [item('a', 50, 3), item('b', 60, 3)],
      target: 35,
      window: 'd14',
    });
    expect(none.state).toBe('bad');
    const few = adsetsOnTargetTile({
      items: [item('a', 20, 3), item('b', 60, 3), item('c', 70, 3)],
      target: 35,
      window: 'd14',
    });
    expect(few).toMatchObject({ value: '1 of 3', state: 'warn' });
  });

  it('before a cycle scores anything there is nothing to count', () => {
    expect(adsetsOnTargetTile({ items: [], target: 35, window: 'd14' })).toMatchObject({
      value: '—',
      state: 'none',
    });
  });
});
