import { describe, expect, it } from 'bun:test';
import { deriveDashboardSpec } from '../jaina-dashboard-spec';
import { checkpointBlockV2Schema, sectionOfBlockCategory, validateReport } from '../jaina-report';
import {
  ANSWER_TEMPLATE_IDS,
  type AnswerTemplatePayload,
  answerTemplatePayloadSchema,
  figureRefSegments,
  figureRefsIn,
  formatFigure,
  renderFigureRefs,
  stripFigureRefs,
  TEMPLATE_SPECS,
  type TemplateFigure,
  templateFigureSchema,
  UnresolvedFigureRefError,
  validateTemplateBlock,
} from './index';

const window = { since: '2026-09-01', until: '2026-09-25', label: 'este mes' };
const source = { tool: 'get_key_metrics', datasetId: 'ds_1', level: 'campaign', entityId: null };

const figure = (
  id: string,
  value: number | null,
  unit: TemplateFigure['unit'] = 'money',
  currency: string | null = unit === 'money' ? 'MXN' : null,
): TemplateFigure =>
  templateFigureSchema.parse({ id, label: id, value, unit, currency, window, source });

/** A valid explained_ranking payload: two ranked rows against the account average. */
const rankingPayload = (overrides: Partial<AnswerTemplatePayload> = {}): AnswerTemplatePayload =>
  answerTemplatePayloadSchema.parse({
    template_id: 'explained_ranking',
    executive: {
      sentence: 'A es la que mejor rinde: {cpr_1} por compra, contra {cpr_avg} de la cuenta.',
      hero_chart: {
        kind: 'bar_horizontal',
        title: 'Costo por compra',
        points: [
          { label: 'A', figure_id: 'cpr_1', emphasis: true },
          { label: 'B', figure_id: 'cpr_2' },
        ],
        reference: { label: 'promedio', figure_id: 'cpr_avg' },
        lower_is_better: true,
      },
    },
    justification: {
      sections: [
        { kind: 'measured', title: 'Qué medimos', text: 'Gasto y compras de 2 campañas.' },
        {
          kind: 'found',
          title: 'Qué encontramos',
          text: 'A cuesta {cpr_1}.',
          items: [
            { id: 'r1', title: 'A', badge_figure_id: 'cpr_1', text: 'A: {cpr_1}.' },
            { id: 'r2', title: 'B', badge_figure_id: 'cpr_2', text: 'B: {cpr_2}.' },
          ],
        },
        { kind: 'why', title: 'Por qué', text: 'Ordenado por costo por compra.' },
      ],
    },
    figures: [figure('cpr_1', 248.73), figure('cpr_2', 356.32), figure('cpr_avg', 300)],
    ...overrides,
  });

describe('formatFigure', () => {
  it('prints money by the one money rule', () => {
    expect(formatFigure(figure('m', 248.734))).toBe('249 MXN');
    expect(formatFigure(figure('m', 14426.29))).toBe('14,426 MXN');
    expect(formatFigure(figure('m', 25.5, 'money', 'USD'))).toBe('$25.50');
    // An unknown currency is a bare figure, never dollars.
    expect(formatFigure(figure('m', 25.5, 'money', null))).toBe('25.50');
  });

  it('prints each non-money unit in its own way', () => {
    expect(formatFigure(figure('c', 1553, 'count'))).toBe('1,553');
    // percent is a FRACTION
    expect(formatFigure(figure('p', 0.19, 'percent'))).toBe('19%');
    expect(formatFigure(figure('p', 0.1183, 'percent'))).toBe('11.8%');
    expect(formatFigure(figure('r', 1.123, 'ratio'))).toBe('1.12');
    expect(formatFigure(figure('x', 1.4, 'multiple'))).toBe('1.40×');
    expect(formatFigure(figure('d', 12, 'days'))).toBe('12 d');
  });

  it('prints a missing value as a dash', () => {
    expect(formatFigure(figure('m', null))).toBe('—');
    expect(formatFigure({ value: Number.NaN, unit: 'count', currency: null })).toBe('—');
  });
});

describe('figure refs', () => {
  const figures = [figure('cpr_1', 248.73), figure('n', 58, 'count')];

  it('finds and strips refs', () => {
    expect(figureRefsIn('{cpr_1} y {n} y {cpr_1}')).toEqual(['cpr_1', 'n', 'cpr_1']);
    expect(stripFigureRefs('cuesta {cpr_1} con {n}', '·')).toBe('cuesta · con ·');
    // Braces that are not a ref are prose.
    expect(figureRefsIn('{Not A Ref} {x-1}')).toEqual([]);
  });

  it('renders refs through the formatter', () => {
    expect(renderFigureRefs('Cuesta {cpr_1} con {n} compras.', figures)).toEqual({
      text: 'Cuesta 249 MXN con 58 compras.',
      unresolved: [],
    });
  });

  it('throws on an unknown ref by default, and marks it at runtime', () => {
    expect(() => renderFigureRefs('Cuesta {ghost}.', figures)).toThrow(UnresolvedFigureRefError);
    expect(
      renderFigureRefs('Cuesta {ghost}.', figures, formatFigure, { onUnresolved: 'mark' }),
    ).toEqual({ text: 'Cuesta —.', unresolved: ['ghost'] });
  });

  it('splits text into prose and figure segments for a renderer', () => {
    const segments = figureRefSegments('A {cpr_1}, B {ghost}.', figures);
    expect(segments.map((segment) => segment.kind)).toEqual([
      'text',
      'figure',
      'text',
      'unresolved',
      'text',
    ]);
    const [, first] = segments;
    expect(first.kind === 'figure' && first.figure.id).toBe('cpr_1');
    expect(first.kind === 'figure' && first.text).toBe('249 MXN');
  });
});

describe('validateTemplateBlock', () => {
  it('passes a complete explained_ranking payload', () => {
    expect(validateTemplateBlock(rankingPayload())).toEqual([]);
  });

  const rulesOf = (payload: AnswerTemplatePayload) =>
    validateTemplateBlock(payload).map((violation) => violation.rule);

  it('reports a malformed block off the wire instead of crashing', () => {
    const partial = { template_id: 'explained_ranking' } as unknown as AnswerTemplatePayload;
    const violations = validateTemplateBlock(partial);
    expect(violations.length).toBeGreaterThan(0);
    expect(violations.every((violation) => violation.rule === 'payload_invalid')).toBe(true);
    const unknownId = { ...rankingPayload(), template_id: 'causal_chain' } as unknown as AnswerTemplatePayload;
    expect(validateTemplateBlock(unknownId).map((violation) => violation.rule)).toEqual(['payload_invalid']);
  });

  it('flags a ref in prose that names no figure', () => {
    const payload = rankingPayload();
    payload.justification.sections[0].text = 'Medimos {ghost}.';
    expect(rulesOf(payload)).toContain('unresolved_ref');
  });

  it('flags a chart point, table cell or item badge that names no figure', () => {
    const chart = rankingPayload();
    chart.executive.hero_chart?.points.push({
      label: 'C',
      figure_id: 'cpr_3',
      entity_id: null,
      emphasis: false,
    });
    expect(rulesOf(chart)).toContain('unresolved_ref');

    const table = rankingPayload();
    table.justification.sections[1].table = {
      columns: [{ key: 'cpr', label: 'CPR' }],
      rows: [{ label: 'A', entity_id: null, cells: { cpr: 'nope' } }],
    };
    expect(rulesOf(table)).toContain('unresolved_ref');

    const badge = rankingPayload();
    badge.justification.sections[1].items[0].badge_figure_id = 'nope';
    expect(rulesOf(badge)).toContain('unresolved_ref');
  });

  it('flags a figure with no source or no window', () => {
    const noSource = rankingPayload();
    noSource.figures[0] = { ...noSource.figures[0], source: { ...source, datasetId: '' } };
    expect(rulesOf(noSource)).toContain('figure_without_source');

    const noWindow = rankingPayload();
    noWindow.figures[0] = { ...noWindow.figures[0], window: { ...window, label: ' ' } };
    expect(rulesOf(noWindow)).toContain('figure_window_missing');
  });

  it('flags money in two currencies, and a missing currency beside a known one', () => {
    const mixed = rankingPayload();
    mixed.figures[1] = figure('cpr_2', 356.32, 'money', 'USD');
    expect(rulesOf(mixed)).toContain('currency_inconsistent');

    const unknown = rankingPayload();
    unknown.figures[1] = figure('cpr_2', 356.32, 'money', null);
    expect(rulesOf(unknown)).toContain('currency_inconsistent');

    const allUnknown = rankingPayload({
      figures: [
        figure('cpr_1', 248.73, 'money', null),
        figure('cpr_2', 356.32, 'money', null),
        figure('cpr_avg', 300, 'money', null),
      ],
    });
    expect(rulesOf(allUnknown)).not.toContain('currency_inconsistent');
  });

  it('flags a duplicated figure id', () => {
    const payload = rankingPayload();
    payload.figures.push(figure('cpr_1', 1));
    expect(rulesOf(payload)).toContain('duplicate_figure_id');
  });

  it('flags an executive sentence that would print a dash', () => {
    const payload = rankingPayload();
    payload.figures[0] = figure('cpr_1', null);
    expect(rulesOf(payload)).toContain('sentence_figure_missing_value');
  });

  it("holds the block to its template's spec", () => {
    const missingSection = rankingPayload();
    missingSection.justification.sections = missingSection.justification.sections.filter(
      (section) => section.kind !== 'why',
    );
    expect(rulesOf(missingSection)).toContain('payload_invalid');

    const oneRow = rankingPayload();
    oneRow.justification.sections[1].items = oneRow.justification.sections[1].items.slice(0, 1);
    expect(rulesOf(oneRow)).toContain('payload_invalid');

    const noHero = rankingPayload();
    noHero.executive.hero_chart = null;
    expect(rulesOf(noHero)).toContain('payload_invalid');

    const noReference = rankingPayload();
    if (noReference.executive.hero_chart) noReference.executive.hero_chart.reference = null;
    expect(rulesOf(noReference)).toContain('payload_invalid');
  });
});

describe('the template registry', () => {
  it('registers exactly the MVP templates, each spec under its own id', () => {
    expect(Object.keys(TEMPLATE_SPECS).sort()).toEqual([...ANSWER_TEMPLATE_IDS].sort());
    for (const id of ANSWER_TEMPLATE_IDS) expect(TEMPLATE_SPECS[id].id).toBe(id);
  });

  // Each MVP template pins its own payload schema in its own test; this file only tests
  // the shared contract, so a template tightening its schema never breaks a sibling.
});

describe('the answer_template block in the report contract', () => {
  const block = { block_id: 'tpl_1', scope: 'account', title: 'Ranking', ...rankingPayload() };

  it('parses as a V2 block with the steps layout by default', () => {
    const parsed = checkpointBlockV2Schema.parse({ ...block, category: 'answer_template' });
    expect(parsed.category).toBe('answer_template');
    if (parsed.category === 'answer_template') expect(parsed.layout).toBe('steps');
  });

  it('sits in the answer section', () => {
    expect(sectionOfBlockCategory('answer_template')).toBe('answer');
  });

  it('is graded by validateReport through validateTemplateBlock', () => {
    const good = checkpointBlockV2Schema.parse({ ...block, category: 'answer_template' });
    expect(
      validateReport([good]).filter((violation) => violation.code === 'answer_template_invalid'),
    ).toEqual([]);

    const bad = checkpointBlockV2Schema.parse({
      ...block,
      category: 'answer_template',
      executive: { ...block.executive, sentence: 'Cuesta {ghost}.' },
    });
    const violations = validateReport([bad]).filter(
      (violation) => violation.code === 'answer_template_invalid',
    );
    expect(violations).toHaveLength(1);
    expect(violations[0].block_id).toBe('tpl_1');
    expect(violations[0].message).toStartWith('unresolved_ref');
  });

  it('is saved on a dashboard as a block that is not re-run as one fetch', () => {
    const parsed = checkpointBlockV2Schema.parse({ ...block, category: 'answer_template' });
    const [spec] = deriveDashboardSpec([parsed]).blocks;
    expect(spec).toMatchObject({ block_id: 'tpl_1', category: 'answer_template', spec: null });
    expect(spec?.reason).toContain('templated answer');
  });
});
