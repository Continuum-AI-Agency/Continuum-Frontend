// The title vocabulary, and the account candidates' titles composed from it.
//
// Two things are pinned here. The renderer: one figure, one unit, one comparator, printed the
// way a person writes them, with ISO codes and never a "$". And the account side of the
// rule: every detector in the catalogue has its Spanish, a candidate that holds a headline
// figure gets a title composed from that figure and its `from → to` pair or its money, and a
// candidate that holds none gets no title rather than an invented one.
import { describe, expect, it } from 'bun:test';
import {
  ACCOUNT_DETECTOR_TITLE,
  type AccountCandidate,
  accountCandidateAction,
  accountCandidateSchema,
  accountCandidateTitle,
  accountDetectorSchema,
  withCandidateTitle,
} from './account-strategy';
import {
  ACTION_VERB_LABEL,
  actionLabel,
  actionVerbSchema,
  formatMoneyCode,
  recommendationActionOf,
  recommendationTitleOf,
  recommendationTitleSchema,
  titleCarriesVerb,
  titleFigure,
  titleText,
} from './recommendation-title';

const candidate = (over: Partial<AccountCandidate>): AccountCandidate =>
  accountCandidateSchema.parse({
    id: over.detector ? `${over.detector}:x` : 'dead_tail:x',
    detector: 'dead_tail',
    impact_per_day: 96,
    impact_class: 'recoverable',
    impact_basis: 'spend/day on an ad set with 0 conversions in 7d',
    ...over,
  });

describe('money in a title', () => {
  it('prints the ISO code after the figure, never a symbol, and bare when the currency is unknown', () => {
    expect(formatMoneyCode(25.54, 'USD')).toBe('25.54 USD');
    expect(formatMoneyCode(324, 'mxn')).toBe('324 MXN');
    expect(formatMoneyCode(324, null)).toBe('324');
    expect(formatMoneyCode(-25.54, 'MXN')).toBe('-25.54 MXN');
    expect(formatMoneyCode(null, 'MXN')).toBe('—');
  });

  it('glues a percentage, prices a money unit, and leaves a count its words', () => {
    expect(titleFigure({ figure: 12, unit: '%' })).toBe('12%');
    expect(titleFigure({ figure: 0.5, unit: '% de CTR en 3 días' })).toBe('0.5% de CTR en 3 días');
    expect(titleFigure({ figure: 101, unit: 'MXN por lead' })).toBe('101 MXN por lead');
    expect(titleFigure({ figure: 48.8, unit: 'MXN' })).toBe('48.80 MXN');
    expect(titleFigure({ figure: 3.2, unit: 'veces por persona' })).toBe('3.2 veces por persona');
    expect(titleFigure({ figure: 298, unit: '' })).toBe('298');
  });

  it('renders the doc’s sentence: entity, figure with unit, comparison', () => {
    const title = recommendationTitleSchema.parse({
      entity: 'ITESO // AGOSTO - RTG',
      figure: 101,
      unit: 'MXN por lead',
      comparator: '2.9× el objetivo de 35.00 MXN',
      window: 'd14',
    });
    expect(titleText(title)).toBe(
      'ITESO // AGOSTO - RTG: 101 MXN por lead, 2.9× el objetivo de 35.00 MXN',
    );
    expect(titleCarriesVerb(titleText(title))).toBe(false);
    expect(titleCarriesVerb('Stop 48.8 MXN/day going to ITESO')).toBe(true);
    expect(titleCarriesVerb('Pausar ITESO')).toBe(true);
  });

  it('sizes the button by the day, by a from → to, or says the verb alone', () => {
    expect(
      actionLabel({
        verb: 'pause',
        sizing: { perDay: 48.8, from: null, to: null, currency: 'MXN' },
      }),
    ).toBe('Pausar · 48.80 MXN/día');
    expect(
      actionLabel({
        verb: 'settings',
        sizing: { perDay: null, from: 400, to: 360, currency: 'MXN' },
      }),
    ).toBe('Ajustar la configuración · 400 → 360 MXN');
    expect(actionLabel({ verb: 'variate_creative', sizing: null })).toBe('Hacer variantes');
    for (const verb of actionVerbSchema.options) expect(ACTION_VERB_LABEL[verb]).not.toContain('$');
  });

  it('reads a title and an action back off a loose evidence object, and nothing off a malformed one', () => {
    const evidence = {
      metric: 'spend',
      value: 298,
      title: {
        entity: 'A',
        figure: 298,
        unit: 'MXN',
        comparator: 'en 14 días y 0 leads',
        window: 'd14',
      },
      action: { verb: 'pause', sizing: { perDay: 21.29, from: null, to: null, currency: 'MXN' } },
    };
    expect(recommendationTitleOf(evidence)?.entity).toBe('A');
    expect(recommendationActionOf(evidence)?.verb).toBe('pause');
    expect(recommendationTitleOf({ title: { entity: '' } })).toBeNull();
    expect(recommendationActionOf({ action: { verb: 'delete' } })).toBeNull();
    expect(recommendationTitleOf(null)).toBeNull();
  });
});

describe('the account candidates’ titles', () => {
  it('gives every detector its Spanish and a verb, none of which is an instruction', () => {
    for (const detector of accountDetectorSchema.options) {
      const words = ACCOUNT_DETECTOR_TITLE[detector];
      expect(words.unit.length).toBeGreaterThan(0);
      expect(titleCarriesVerb(words.unit)).toBe(false);
      expect(titleCarriesVerb(`${words.a} frente a ${words.b}`)).toBe(false);
      expect(actionVerbSchema.options).toContain(words.verb);
    }
  });

  it('composes a priced transfer from its two sides: "Spending on nothing" becomes the entity and the money', () => {
    const transfer = candidate({
      detector: 'portfolio_reallocation',
      impact_per_day: 14,
      impact_class: 'better_price',
      headline: {
        kind: 'efficiency',
        value: 33,
        unit: 'percent',
        label: 'cheaper per result',
        from: 90,
        to: 60,
      },
      evidence: { portfolio: 'Leads MX', window_days: 14 },
    });
    const title = accountCandidateTitle(transfer, 'MXN');
    expect(title && titleText(title)).toBe(
      'Leads MX: 33% más barato por resultado, 90.00 MXN por resultado en el origen frente a 60.00 MXN en el destino',
    );
    expect(title?.window).toBe('d14');
    expect(actionLabel(accountCandidateAction(transfer, 'MXN'))).toBe(
      'Mover presupuesto · 14.00 MXN/día',
    );
  });

  it('leads a dead tail with the spend avoided and the ad set that carries it', () => {
    const dead = candidate({
      headline: {
        kind: 'avoided',
        value: 96,
        unit: 'currency_per_day',
        label: 'a day buying nothing',
        from: null,
        to: null,
      },
      evidence: { worst: 'ALEIRA // AGOSTO - LKL', conversions_7d: 0 },
    });
    const title = accountCandidateTitle(dead, 'MXN');
    expect(title && titleText(title)).toBe(
      'ALEIRA // AGOSTO - LKL: 96.00 MXN por día sin resultados, 96.00 MXN por día recuperables',
    );
    expect(title?.window).toBe('d7'); // a daily detector, no window declared
    expect(actionLabel(accountCandidateAction(dead, 'MXN'))).toBe('Pausar · 96.00 MXN/día');
  });

  it('states an auction move as the CPM then and now: "The auction moved, not the ad" is the second line', () => {
    const auction = candidate({
      detector: 'auction_pressure',
      impact_per_day: 40,
      impact_class: 'deferred',
      headline: {
        kind: 'drift',
        value: 24,
        unit: 'percent',
        label: 'more per thousand shown',
        from: 53.6,
        to: 66.62,
      },
      evidence: { cpm_now: 66.62, cpm_prior: 53.6, window_days: 7 },
    });
    const title = accountCandidateTitle(auction, 'MXN');
    expect(title && titleText(title)).toBe(
      'Cuenta: 24% más por cada mil impresiones, 53.60 MXN de CPM antes frente a 66.62 MXN ahora',
    );
    expect(title?.window).toBe('d7');
  });

  it('prints bare figures for an account with no recorded currency, and no "$" for a USD one', () => {
    const dead = candidate({
      headline: {
        kind: 'avoided',
        value: 96,
        unit: 'currency_per_day',
        label: 'a day buying nothing',
        from: null,
        to: null,
      },
    });
    const bare = accountCandidateTitle(dead, null);
    expect(bare && titleText(bare)).toBe(
      'Cuenta: 96 por día sin resultados, 96.00 por día recuperables',
    );
    const dollars = accountCandidateTitle(dead, 'USD');
    expect(dollars && titleText(dollars)).toBe(
      'Cuenta: 96.00 USD por día sin resultados, 96.00 USD por día recuperables',
    );
    expect(titleText(dollars as NonNullable<typeof dollars>)).not.toContain('$');
  });

  it('invents no title for a candidate that declared no headline, but still names the action', () => {
    const silent = candidate({ headline: null });
    expect(accountCandidateTitle(silent, 'MXN')).toBeNull();
    const stamped = withCandidateTitle(silent, 'MXN');
    expect(stamped.title).toBeNull();
    expect(stamped.action?.verb).toBe('pause');
    // The stamped candidate still parses: the schema admits both fields, nullable and optional.
    expect(accountCandidateSchema.safeParse(JSON.parse(JSON.stringify(stamped))).success).toBe(
      true,
    );
  });
});
