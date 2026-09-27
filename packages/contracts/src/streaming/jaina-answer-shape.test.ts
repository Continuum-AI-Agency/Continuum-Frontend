import { describe, expect, it } from 'bun:test';
import {
  ANSWER_SHAPE_CODES,
  type AnswerShapeCode,
  answerShapeOf,
  answerTextsOf,
  isPlaceholderAnswer,
  metricsNamedIn,
  splitSentences,
  wordCount,
} from './jaina-answer-shape';
import type { TemplateFigure } from './jaina-templates/figure';

const codesOf = (report: unknown): AnswerShapeCode[] =>
  answerShapeOf(report).map((violation) => violation.code);

// ---------------------------------------------------------------------------
// The splitter — every prose device the answer uses must survive it
// ---------------------------------------------------------------------------

describe('splitSentences', () => {
  const cases: Array<[string, string, number]> = [
    ['one plain sentence (en)', 'Spend rose to 1,200 MXN last week.', 1],
    ['one plain sentence (es)', 'El gasto subió a 1,200 MXN la semana pasada.', 1],
    ['two sentences (en)', 'Spend rose. Results fell.', 2],
    ['two sentences (es)', 'El gasto subió. Los resultados bajaron.', 2],
    ['a decimal is not a boundary', 'El CPA quedó en 32.19 MXN contra 40.5 del mes.', 1],
    ['a comma decimal is not a boundary', 'El CTR fue de 1,7% y el CPM de 32,19.', 1],
    ['"vs." is not a boundary', 'CPA of 32 MXN vs. 40 MXN for the account average.', 1],
    ['"p. ej." is not a boundary', 'Hay campañas caras, p. ej. SEDE C con 90 MXN.', 1],
    ['"etc." is not a boundary', 'Gasto, clics, etc. se leyeron de Meta.', 1],
    ['"e.g." is not a boundary', 'Some ad sets, e.g. Retargeting, spent nothing.', 1],
    ['an ellipsis char is not a boundary', 'El gasto subió… Sin embargo el CPA mejoró.', 1],
    ['three dots are not a boundary', 'El gasto subió... Sin embargo el CPA mejoró.', 1],
    [
      'a prose mark holding a period',
      'El ROAS cayó a [risk: 0.90 ROAS vs. 1.2 prev.] esta semana.',
      1,
    ],
    ['a window mark', 'Leímos [window: Sep 1 – Sep 25.] de la cuenta.', 1],
    ['bold around a figure', 'CAÑADAS lidera con **32.19 MXN** por compra.', 1],
    ['a sentence opening with bold', 'Spend rose. **CAÑADAS** carried it.', 2],
    ['a sentence opening with a mark', 'Spend rose. [risk: 0.90 ROAS] is below break-even.', 2],
    ['a sentence opening with a ref', 'Gasto estable. {cpr_1} es el mejor costo.', 2],
    ['a Spanish question after a statement', 'El gasto subió. ¿Vale la pena seguir?', 2],
    ['an exclamation', 'Great week! Results doubled.', 2],
    ['a paragraph break is a boundary', 'Spend rose\n\nResults fell', 2],
    ['trailing whitespace', '  Spend rose.  ', 1],
    ['empty text', '', 0],
  ];
  for (const [name, text, expected] of cases) {
    it(name, () => {
      expect(splitSentences(text)).toHaveLength(expected);
    });
  }

  it('returns the original substrings, marks and bold intact', () => {
    expect(splitSentences('El ROAS cayó a [risk: 0.90 ROAS]. **CAÑADAS** lo explica.')).toEqual([
      'El ROAS cayó a [risk: 0.90 ROAS].',
      '**CAÑADAS** lo explica.',
    ]);
  });
});

describe('wordCount and metricsNamedIn', () => {
  it('counts words, not marks or bold syntax', () => {
    expect(wordCount('El ROAS cayó a [risk: 0.90 ROAS] **hoy**.')).toBe(7);
  });

  it('names distinct metrics in EN and ES, a multiword metric once', () => {
    expect(metricsNamedIn('El costo por compra subió porque el gasto creció')).toEqual([
      'cost_per_result',
      'spend',
    ]);
    expect(metricsNamedIn('CTR fell while CPM rose')).toEqual(['ctr', 'cpm']);
    expect(metricsNamedIn('Nothing measurable here')).toEqual([]);
  });
});

describe('isPlaceholderAnswer', () => {
  it('knows the placeholders the orchestrator ships', () => {
    expect(isPlaceholderAnswer('Synthesis summary unavailable.')).toBe(true);
    expect(isPlaceholderAnswer('Analysis complete.')).toBe(true);
    expect(isPlaceholderAnswer('  analysis complete  ')).toBe(true);
    expect(isPlaceholderAnswer('Spend rose.')).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Non-template answers — executive_summary + the blocks under it
// ---------------------------------------------------------------------------

const narrative = (block_id: string, body: string) => ({
  block_id,
  category: 'narrative',
  scope: 'account',
  title: 'Analysis',
  body,
});

const dataScope = {
  block_id: 'data_scope',
  category: 'data_scope',
  scope: 'account',
  title: 'Data scope',
  dates: 'Sep 1 – Sep 25, 2026',
  source: 'api',
  notes: [],
};

const GOOD_JUSTIFICATION_EN =
  'We read spend and purchases for the last 30 days from Meta Ads. ' +
  'The cost per purchase rose because spend grew faster than purchases across the three campaigns that spent. ' +
  'CAÑADAS carried most of the increase, and its frequency climbed above four, which usually wears an audience out.';

const GOOD_JUSTIFICATION_ES =
  'Leímos el gasto y las compras de los últimos 30 días según Meta Ads. ' +
  'El costo por compra subió porque el gasto creció más rápido que las compras en las tres campañas activas. ' +
  'CAÑADAS explica casi todo el aumento, y su frecuencia pasó de cuatro, lo que suele cansar a la audiencia.';

describe('answerShapeOf — non-template answers', () => {
  const table: Array<{ name: string; report: unknown; codes: AnswerShapeCode[] }> = [
    {
      name: 'a well-shaped English answer',
      report: {
        executive_summary: 'Cost per purchase rose 18% this month.',
        blocks: [narrative('why', GOOD_JUSTIFICATION_EN)],
      },
      codes: [],
    },
    {
      name: 'a well-shaped Spanish answer',
      report: {
        executive_summary: 'El costo por compra subió 18% este mes.',
        blocks: [narrative('why', GOOD_JUSTIFICATION_ES)],
      },
      codes: [],
    },
    {
      name: 'a placeholder executive',
      report: {
        executive_summary: 'Synthesis summary unavailable.',
        blocks: [narrative('why', GOOD_JUSTIFICATION_EN)],
      },
      codes: ['answer_missing'],
    },
    {
      name: 'an empty executive',
      report: { executive_summary: '  ', blocks: [narrative('why', GOOD_JUSTIFICATION_ES)] },
      codes: ['answer_missing'],
    },
    {
      name: 'a three-sentence executive (es)',
      report: {
        executive_summary: 'El CPA subió. El gasto creció. Las compras no.',
        blocks: [narrative('why', GOOD_JUSTIFICATION_ES)],
      },
      codes: ['executive_not_one_sentence'],
    },
    {
      name: 'no justification at all',
      report: { executive_summary: 'Spend rose 12% this week.', blocks: [] },
      codes: ['justification_missing'],
    },
    {
      name: 'a narrative that only repeats the executive is no justification',
      report: {
        executive_summary: 'Spend rose 12% this week.',
        blocks: [narrative('block_prose', 'Spend rose 12% this week.')],
      },
      codes: ['justification_missing'],
    },
    {
      name: 'a justification shorter than the floor',
      report: {
        executive_summary: 'Spend rose 12% this week.',
        blocks: [
          narrative(
            'why',
            'Spend and clicks were read from Meta Ads for the last 7 days. Both rose.',
          ),
        ],
      },
      codes: ['justification_not_longer'],
    },
    {
      name: 'a long justification in one sentence',
      report: {
        executive_summary: 'Spend rose.',
        blocks: [
          narrative(
            'why',
            'We read spend and purchases from Meta Ads for the last 30 days and the cost per purchase rose because spend grew faster than purchases in every campaign that spent money this month across the account.',
          ),
        ],
      },
      codes: ['justification_not_longer'],
    },
    {
      name: 'no window and no source cue',
      report: {
        executive_summary: 'El costo por compra subió.',
        blocks: [
          narrative(
            'why',
            'El costo por compra subió porque el gasto creció más rápido que las compras en tres campañas. ' +
              'CAÑADAS explica casi todo el aumento, y su frecuencia pasó de cuatro, lo que suele cansar a la audiencia muy rápido.',
          ),
        ],
      },
      codes: ['justification_no_procedure'],
    },
    {
      name: 'a data_scope block states the window',
      report: {
        executive_summary: 'El costo por compra subió.',
        blocks: [
          dataScope,
          narrative(
            'why',
            'El costo por compra subió porque el gasto creció más rápido que las compras en tres campañas. ' +
              'CAÑADAS explica casi todo el aumento, y su frecuencia pasó de cuatro, lo que suele cansar a la audiencia muy rápido.',
          ),
        ],
      },
      codes: [],
    },
    {
      name: 'no sentence relates two metrics',
      report: {
        executive_summary: 'Spend rose this week.',
        blocks: [
          narrative(
            'why',
            'We read the account for the last 7 days from Meta Ads, every campaign included. ' +
              'CAÑADAS spent the most of all of them, well ahead of the rest of the account this time around. ' +
              'The other two campaigns stayed flat against the week before.',
          ),
        ],
      },
      codes: ['justification_no_relation'],
    },
    {
      name: 'insight rationale and impact count as justification',
      report: {
        executive_summary: 'ROAS fell to 0.9 this month.',
        blocks: [
          {
            block_id: 'insights',
            category: 'insight_list',
            scope: 'account',
            title: 'Why',
            items: [
              {
                item_type: 'insight',
                title: 'Revenue lagged spend',
                summary: 'x',
                rationale:
                  'We read spend and revenue for the last 30 days from Meta Ads; revenue grew 3% while spend grew 20%.',
                impact:
                  'Every extra peso bought less revenue than the one before it, so ROAS slid below break-even for the month.',
              },
            ],
          },
        ],
      },
      codes: [],
    },
    {
      name: 'a signed delta that contradicts the direction word (es)',
      report: {
        executive_summary: 'El costo por compra subió −12% este mes.',
        blocks: [narrative('why', GOOD_JUSTIFICATION_ES)],
      },
      codes: ['sentence_direction_contradicts'],
    },
    {
      name: 'a signed delta that agrees (en)',
      report: {
        executive_summary: 'Cost per purchase fell -12% this month.',
        blocks: [narrative('why', GOOD_JUSTIFICATION_EN)],
      },
      codes: [],
    },
  ];
  for (const row of table) {
    it(row.name, () => {
      expect(codesOf(row.report)).toEqual(row.codes);
    });
  }

  it('reads the justification minus the executive the prose block repeats', () => {
    const texts = answerTextsOf({
      executive_summary: 'Spend rose 12% this week.',
      blocks: [narrative('block_prose', `Spend rose 12% this week.\n\n${GOOD_JUSTIFICATION_EN}`)],
    });
    expect(texts.template).toBe(false);
    expect(texts.justification.join(' ')).not.toContain('Spend rose 12% this week.');
    expect(texts.justification.join(' ')).toContain('We read spend and purchases');
  });

  it('carries no client prose in a violation message', () => {
    const violations = answerShapeOf({
      executive_summary: 'SECRET campaign rose. SECRET again.',
      blocks: [],
    });
    expect(violations.length).toBeGreaterThan(0);
    for (const violation of violations) expect(violation.message).not.toContain('SECRET');
  });

  it('declares every code it can emit', () => {
    expect([...ANSWER_SHAPE_CODES].sort()).toEqual(
      [
        'answer_missing',
        'executive_not_one_sentence',
        'justification_missing',
        'justification_not_longer',
        'justification_no_procedure',
        'justification_no_relation',
        'sentence_figure_unjustified',
        'sentence_direction_contradicts',
      ].sort(),
    );
  });
});

// ---------------------------------------------------------------------------
// Template answers — the block's sentence and sections are what the user reads
// ---------------------------------------------------------------------------

const window = { since: '2026-09-01', until: '2026-09-25', label: 'este mes' };
const source = { tool: 'get_key_metrics', datasetId: 'ds_1', level: 'campaign', entityId: null };
const fig = (
  id: string,
  value: number | null,
  unit: TemplateFigure['unit'] = 'money',
  derivation: string | null = null,
): TemplateFigure => ({
  id,
  label: id,
  value,
  unit,
  currency: unit === 'money' ? 'MXN' : null,
  window,
  source,
  derivation,
});

const rankingBlock = (patch: {
  sentence?: string;
  measuredText?: string;
  foundText?: string;
  figures?: TemplateFigure[];
}) => ({
  block_id: 'answer_template',
  category: 'answer_template',
  scope: 'account',
  title: 'Campaign ranking',
  template_id: 'explained_ranking',
  executive: {
    sentence:
      patch.sentence ??
      'A es la que mejor rinde: {cpr_1} por compra, contra {cpr_avg} de la cuenta.',
    hero_chart: {
      kind: 'bar_horizontal',
      title: 'Costo por compra',
      points: [
        { label: 'A', figure_id: 'cpr_1' },
        { label: 'B', figure_id: 'cpr_2' },
      ],
      lower_is_better: true,
    },
  },
  justification: {
    sections: [
      {
        kind: 'measured',
        title: 'Qué medimos',
        text: patch.measuredText ?? 'Gasto y compras de {campaigns_read} campañas este mes.',
      },
      {
        kind: 'found',
        title: 'Qué encontramos',
        text:
          patch.foundText ??
          'A cuesta {cpr_1} por compra y B cuesta {cpr_2}; el promedio de la cuenta es {cpr_avg}.',
        items: [
          {
            id: 'r1',
            title: 'A',
            badge_figure_id: 'cpr_1',
            text: 'A: {cpr_1} por compra, la más barata.',
          },
          {
            id: 'r2',
            title: 'B',
            badge_figure_id: 'cpr_2',
            text: 'B: {cpr_2} por compra, la más cara.',
          },
        ],
      },
      {
        kind: 'why',
        title: 'Por qué',
        text: 'Ordenamos las campañas por costo por compra, gasto dividido entre compras, y solo cuentan las que tienen al menos cinco compras.',
      },
    ],
  },
  figures: patch.figures ?? [
    fig('cpr_1', 248.73, 'money', 'spend_1 / purchases_1'),
    fig('cpr_2', 356.32, 'money', 'spend_2 / purchases_2'),
    fig('cpr_avg', 300, 'money', 'sum(spend) / sum(purchases)'),
    fig('campaigns_read', 2, 'count'),
  ],
});

const templated = (block: unknown, executive_summary = 'hidden summary the user never sees') => ({
  executive_summary,
  blocks: [dataScope, block],
});

describe('answerShapeOf — template answers', () => {
  it('a well-formed ranking answer is clean', () => {
    expect(codesOf(templated(rankingBlock({})))).toEqual([]);
  });

  it('grades the template sentence, not the hidden executive_summary', () => {
    const texts = answerTextsOf(templated(rankingBlock({}), 'Placeholder. Two. Three.'));
    expect(texts.template).toBe(true);
    expect(texts.executive).toBe(
      'A es la que mejor rinde: 249 MXN por compra, contra 300 MXN de la cuenta.',
    );
    expect(codesOf(templated(rankingBlock({}), 'Analysis complete.'))).toEqual([]);
  });

  it('a two-sentence template sentence is flagged', () => {
    expect(
      codesOf(templated(rankingBlock({ sentence: 'A es la mejor. Cuesta {cpr_1} por compra.' }))),
    ).toEqual(['executive_not_one_sentence']);
  });

  it('a sentence figure no section carries is unjustified', () => {
    const block = rankingBlock({
      sentence: 'A es la que mejor rinde con {cpr_1} y {results_1} compras.',
      figures: [
        fig('cpr_1', 248.73, 'money', 'spend_1 / purchases_1'),
        fig('cpr_2', 356.32, 'money', 'spend_2 / purchases_2'),
        fig('cpr_avg', 300, 'money', 'sum(spend) / sum(purchases)'),
        fig('campaigns_read', 2, 'count'),
        fig('results_1', 58, 'count'),
      ],
    });
    const violations = answerShapeOf(templated(block));
    expect(violations.map((v) => v.code)).toEqual(['sentence_figure_unjustified']);
    expect(violations[0]?.message).toContain('results_1');
  });

  it('a measured section with no figure has no procedure', () => {
    expect(
      codesOf(templated(rankingBlock({ measuredText: 'Gasto y compras de todas las campañas.' }))),
    ).toEqual(['justification_no_procedure']);
  });

  it('with no derived figure and no two-metric sentence there is no relation', () => {
    const block = rankingBlock({
      foundText: 'A cuesta {cpr_1} y B cuesta {cpr_2}; la cuenta queda en {cpr_avg}.',
      figures: [
        fig('cpr_1', 248.73),
        fig('cpr_2', 356.32),
        fig('cpr_avg', 300),
        fig('campaigns_read', 2, 'count'),
      ],
    });
    // "Gasto y compras" in the measured section names two metrics — take it out too.
    const noRelation = {
      ...block,
      justification: {
        sections: block.justification.sections.map((section) =>
          section.kind === 'measured'
            ? { ...section, text: 'Leímos {campaigns_read} campañas este mes.' }
            : section.kind === 'why'
              ? {
                  ...section,
                  text: 'Solo cuentan las campañas con al menos cinco resultados en el mes.',
                }
              : section,
        ),
      },
    };
    expect(codesOf(templated(noRelation))).toEqual(['justification_no_relation']);
  });

  it('"mejor" citing the worst ranked figure contradicts the ranking', () => {
    expect(
      codesOf(
        templated(rankingBlock({ sentence: 'B es la que mejor rinde: {cpr_2} por compra.' })),
      ),
    ).toEqual(['sentence_direction_contradicts']);
    expect(
      codesOf(templated(rankingBlock({ sentence: 'B es la peor: {cpr_2} por compra.' }))),
    ).toEqual([]);
  });

  const bridge = (sentence: string, change: number) => ({
    block_id: 'answer_template',
    category: 'answer_template',
    scope: 'account',
    title: 'Weekly bridge',
    template_id: 'weekly_bridge',
    executive: { sentence, hero_chart: null },
    justification: {
      sections: [
        {
          kind: 'measured',
          title: 'Qué medimos',
          text: 'Resultados de la semana, {results_current} contra {results_prior}.',
        },
        {
          kind: 'found',
          title: 'Qué encontramos',
          text: 'El cambio fue de {results_change} resultados, porque el gasto bajó y el costo por resultado subió en las dos campañas principales.',
        },
        { kind: 'why', title: 'Por qué', text: 'Cada paso separa volumen de eficiencia.' },
      ],
    },
    figures: [
      fig('results_current', 40, 'count', 'sum(results) over last_7d'),
      fig('results_prior', 40 - change, 'count', 'sum(results) over last_14d − last_7d'),
      fig('results_change', change, 'count', 'results_current − results_prior'),
    ],
  });

  it('a direction word must agree with the sign of the delta it cites (es + en)', () => {
    expect(
      codesOf(templated(bridge('Los resultados subieron {results_change} esta semana.', -12))),
    ).toEqual(['sentence_direction_contradicts']);
    expect(
      codesOf(templated(bridge('Los resultados bajaron {results_change} esta semana.', -12))),
    ).toEqual([]);
    expect(
      codesOf(templated(bridge('Results increased by {results_change} this week.', 12))),
    ).toEqual([]);
    expect(
      codesOf(templated(bridge('Results were worse by {results_change} this week.', 12))),
    ).toEqual(['sentence_direction_contradicts']);
  });
});
