import { describe, expect, it } from 'bun:test';
import type { BriefGrowth } from '@continuum/contracts';
import { getOptimizationMetricDefinition } from '@continuum/contracts';
import {
  agoWords,
  buildPortfolioHeadline,
  coveredDays,
  decisionsWaiting,
  type HeadlineSentence,
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

function headlineOf(name: RealBodyName, now?: number) {
  const { report, view, dailyTotal } = readBody(name);
  const portfolio = report.portfolio as unknown as HeroPortfolio & { name: string };
  const metric = getOptimizationMetricDefinition(portfolio.objective);
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
      '56 leads en 7 días a 38.59 MXN, 10% sobre el objetivo de 35.00 MXN y 34% más barato que la semana anterior.',
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
      '56 leads en 7 días a 31.50 MXN, 10% bajo el objetivo de 35.00 MXN y 12% más caro que la semana anterior.',
    );
  });

  it('names the window before by its length', () => {
    expect(text(statusSentence({ ...quoted, window: 'd14' }, LEADS, 'MXN', 14))).toContain(
      'las dos semanas anteriores',
    );
  });

  it('with no target it says so; with no prior it stops at the target', () => {
    expect(text(statusSentence({ ...quoted, target: null }, LEADS, 'MXN', 7))).toBe(
      '56 leads en 7 días a 38.59 MXN, sin objetivo fijado y 34% más barato que la semana anterior.',
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
    ).toBe('56 leads en 7 días a 38.59 MXN, 10% sobre el objetivo de 35.00 MXN.');
  });

  it('with nothing bought it says what was spent for it', () => {
    const none = statusSentence(
      { ...quoted, results: 0, cost_per_result: null, spend: 408 },
      { one: 'compra', many: 'compras' },
      'MXN',
      4,
    );
    expect(text(none)).toBe('0 compras en 4 días con 408 MXN gastados.');
    expect(
      text(
        statusSentence({ ...quoted, results: 0, cost_per_result: null, spend: 0 }, LEADS, 'MXN', 4),
      ),
    ).toBe('0 leads en 4 días, sin gasto.');
  });
});

describe('FORMULARIOS — the real body', () => {
  const headline = headlineOf('formularios', Date.parse('2026-09-25T21:04:40Z'));

  it('states the status with the body’s own figures and no dollar sign', () => {
    expect(text(headline.status)).toBe(
      '80 leads en 14 días a 45.69, 31% sobre el objetivo de 35.00.',
    );
    expect(JSON.stringify(headline)).not.toContain('$');
  });

  it('names the single largest opportunity, the ad set’s own cost and the money it frees', () => {
    expect(text(headline.opportunity)).toBe(
      'La oportunidad: Ad set A paga 75.65 por lead; pausarlo libera 43.23 al día.',
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
      label: 'Gasto · 14 días',
      value: '3,655',
      sub: '261 por día · plan 324',
      state: 'warn',
    });
    expect(results).toMatchObject({
      label: 'Leads',
      value: '80',
      sub: '104 al objetivo con este gasto',
      state: 'bad',
    });
    expect(cost).toMatchObject({
      label: 'Costo por lead',
      value: '45.69',
      sub: '+31% sobre objetivo 35.00',
      state: 'bad',
    });
    expect(decisions).toMatchObject({ label: 'Decisiones', value: '3', state: 'warn' });
    expect(decisions?.sub).toMatch(/^90\.72\/día en juego$/);
  });

  it('carries Jaina’s own sentence as her read, dated', () => {
    expect(headline.read).toMatchObject({
      source: 'jaina',
      label: 'Jaina · sobre Lead forms portfolio · hace 2 h',
      sentence: 'Pause Ad set A to save 43.23/day',
    });
    expect(headline.read.figure).toMatchObject({ key: 'jaina.read', raw: 43.23, unit: 'sentence' });
  });
});

describe('Tours — nothing bought, every ad set held', () => {
  const headline = headlineOf('tours', Date.parse('2026-09-25T00:47:57Z'));

  it('states the spend that bought nothing', () => {
    expect(text(headline.status)).toBe('0 conversaciones en 2 días con 155 gastados.');
  });

  it('says there is no opportunity, with the plan figure', () => {
    expect(text(headline.opportunity)).toBe(
      'Sin oportunidades abiertas hoy: el optimizador no tiene nada que proponer y el portafolio sigue a 750 al día.',
    );
  });

  it('the blocker is the goal mismatch, ahead of the missing signal, with the header’s fixes', () => {
    expect(headline.blocker?.code).toBe('kpi_mismatch');
    expect(text(headline.blocker?.sentence ?? [])).toBe(
      'Bloqueo: los 12 conjuntos pujan por otro resultado, no por conversaciones como mide este portafolio; el optimizador los retiene y no mueve nada.',
    );
    expect(headline.blocker?.actions.map((a) => a.label)).toEqual([
      'Cambiar objetivo',
      'Quitar estos conjuntos',
    ]);
  });

  it('labels the deterministic headline as automatic and falls back to the status sentence', () => {
    // "Nothing worth changing today" carries no figure; the read has to.
    expect(headline.read.source).toBe('auto');
    expect(headline.read.label).toBe('Lectura automática · sobre Tours portfolio · hace 30 min');
    expect(headline.read.sentence).toBe('0 conversaciones en 2 días con 155 gastados.');
  });

  it('the results tile is bad and the cost tile cannot be judged', () => {
    const [, results, cost, decisions] = headline.tiles;
    expect(results).toMatchObject({ value: '0', sub: '155 sin resultado', state: 'bad' });
    expect(cost).toMatchObject({
      value: '—',
      sub: 'sin conversaciones que dividir',
      state: 'none',
    });
    expect(decisions).toMatchObject({ value: '0', sub: 'nada espera tu decisión', state: 'none' });
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
      'Bloqueo: entrega en cero, nada gastado en 14 días.',
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
      'Bloqueo: sin señal, 3,655 MXN gastados y 0 leads en 14 días; no hay con qué decidir.',
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
    expect(agoWords('2026-09-28T11:25:00Z', now)).toBe('hace 35 min');
    expect(agoWords('2026-09-28T09:58:00Z', now)).toBe('hace 2 h');
    expect(agoWords('2026-09-25T12:00:00Z', now)).toBe('hace 3 días');
    expect(agoWords('nope', now)).toBeNull();
  });
});
