import { describe, expect, it } from 'bun:test';

import {
  blockCategorySchema,
  cellsOfBlocks,
  checkpointBlockV2Schema,
  comparisonBlockSchema,
  groundingViolationsOf,
  PRISM_BLOCK_ORDER,
  sectionOfBlock,
  sectionOfBlockCategory,
  stepsBlockSchema,
  withPrismBlockOrder,
} from './jaina-report';

/**
 * The two blocks a requested FORMAT is delivered in (Ramiro, 2026-10-13, "Jaina: formato y
 * profundidad de la respuesta"): `steps` — how to do something, step by step, each step with
 * the place it is done and what it should change — and the existing `comparison`, widened to
 * carry two named sides (a window or an entity each) so an entity-vs-entity read fits it too.
 */

const steps = {
  block_id: 'steps_1',
  category: 'steps',
  scope: 'campaign',
  title: 'Cómo escalar CAÑADAS',
  items: [
    {
      action: 'Sube el presupuesto diario de **CAÑADAS // MENSAJES** un 20%.',
      where: 'Ads Manager → Campañas → CAÑADAS // MENSAJES → Presupuesto',
      expected_effect: 'Más conversaciones al mismo costo mientras la frecuencia siga bajo 2.',
      figure: {
        label: 'Costo por conversación',
        value: 35.61,
        currency: 'MXN',
        format: 'currency',
      },
    },
    {
      action: 'Duplica el conjunto ganador con un público similar al 1%.',
      where: 'Ads Manager → Conjuntos de anuncios → Duplicar',
      expected_effect: 'Un segundo conjunto que aprende sin reiniciar el primero.',
    },
  ],
};

describe('steps block', () => {
  it('parses ordered steps, each with action, where, expected effect and an optional figure', () => {
    const parsed = stepsBlockSchema.parse(steps);
    expect(parsed.items).toHaveLength(2);
    expect(parsed.items[0].figure).toEqual({
      label: 'Costo por conversación',
      value: 35.61,
      unit: null,
      currency: 'MXN',
      format: 'currency',
      percent_basis: null,
    });
    expect(parsed.items[1].figure).toBeNull();
    expect(parsed.items[1].cite_ids).toEqual([]);
  });

  it('is a member of the V2 union and refuses a step with no place to do it', () => {
    expect(checkpointBlockV2Schema.safeParse(steps).success).toBe(true);
    const nowhere = {
      ...steps,
      items: [{ ...steps.items[0], where: '' }],
    };
    expect(checkpointBlockV2Schema.safeParse(nowhere).success).toBe(false);
    expect(checkpointBlockV2Schema.safeParse({ ...steps, items: [] }).success).toBe(false);
  });

  it('is part of the answer, never folded under the justification', () => {
    expect(sectionOfBlockCategory('steps')).toBe('answer');
    expect(PRISM_BLOCK_ORDER).toContain('steps');
    expect(new Set(PRISM_BLOCK_ORDER)).toEqual(new Set(blockCategorySchema.options));
  });

  it('puts its figures on the grounding walk like any cell', () => {
    const cells = cellsOfBlocks([steps]);
    expect(cells).toEqual([
      {
        value: 35.61,
        where: 'steps_1.items[0].figure.value',
        label: 'Costo por conversación',
        format: 'currency',
      },
    ]);
    const flagged = groundingViolationsOf(stepsBlockSchema.parse(steps) as never, {
      toolKinds: [],
      figures: [12],
    });
    expect(flagged.some((v) => v.kind === 'figure' && v.span.includes('35.61'))).toBe(true);
    expect(
      groundingViolationsOf(stepsBlockSchema.parse(steps) as never, {
        toolKinds: [],
        figures: [35.61],
      }).filter((v) => v.kind === 'figure'),
    ).toEqual([]);
  });

  it('grades the prose of a step like an insight item: an audience claim with no audience read is flagged', () => {
    const audience = {
      ...steps,
      items: [
        {
          action:
            'Restringe la audiencia a mujeres de 25 a 34 años, que son las que más convierten.',
          where: 'Ads Manager → Conjunto → Audiencia',
          expected_effect: 'Menor costo por conversación.',
        },
      ],
    };
    const flagged = groundingViolationsOf(stepsBlockSchema.parse(audience) as never, {
      toolKinds: [],
    });
    expect(flagged.length).toBeGreaterThan(0);
  });
});

describe('comparison block — two named sides', () => {
  /** A comparison block exactly as a report stored before 2026-10-13 holds it. */
  const savedBeforeSides = {
    block_id: 'cmp_wow',
    category: 'comparison',
    scope: 'account',
    title: 'Semana contra semana',
    priority: 'secondary',
    provenance: null,
    grounding: null,
    before_label: 'Semana anterior',
    after_label: 'Esta semana',
    baseline_label: null,
    pairs: [
      {
        label: 'Gasto',
        before: 12000,
        after: 13500,
        baseline: null,
        unit: 'MXN',
        format: 'currency',
        percent_basis: null,
        change: 12.5,
        change_direction: 'up',
        severity: 'watch',
        cite_ids: [],
      },
    ],
    citations: [],
  };

  it('parses a stored comparison block unchanged', () => {
    expect(comparisonBlockSchema.parse(savedBeforeSides)).toEqual(savedBeforeSides);
    expect(checkpointBlockV2Schema.parse(savedBeforeSides)).toEqual(savedBeforeSides);
  });

  it('carries side A and side B, each a window or an entity, and a pair currency', () => {
    const entities = {
      ...savedBeforeSides,
      before_label: 'CAÑADAS // MENSAJES',
      after_label: 'ITESO // MENSAJES',
      side_a: {
        label: 'CAÑADAS // MENSAJES',
        entity: 'CAÑADAS // MENSAJES',
        window: 'Últimos 7 días',
      },
      side_b: { label: 'ITESO // MENSAJES', entity: 'ITESO // MENSAJES', window: 'Últimos 7 días' },
      pairs: [
        {
          ...savedBeforeSides.pairs[0],
          label: 'Costo por conversación',
          before: 35.61,
          after: 52.93,
          currency: 'MXN',
          delta: 17.32,
        },
      ],
    };
    const parsed = comparisonBlockSchema.parse(entities);
    expect(parsed.side_a).toEqual({
      label: 'CAÑADAS // MENSAJES',
      entity: 'CAÑADAS // MENSAJES',
      window: 'Últimos 7 días',
    });
    expect(parsed.side_b?.entity).toBe('ITESO // MENSAJES');
    expect(parsed.pairs[0].currency).toBe('MXN');
    expect(parsed.pairs[0].delta).toBe(17.32);
  });

  it('a side with only a window fills the entity as null', () => {
    const parsed = comparisonBlockSchema.parse({
      ...savedBeforeSides,
      side_a: { label: 'Semana anterior', window: '2026-09-28 → 2026-10-04' },
    });
    expect(parsed.side_a).toEqual({
      label: 'Semana anterior',
      window: '2026-09-28 → 2026-10-04',
      entity: null,
    });
  });
});

describe('answer_format — the block that IS the requested format', () => {
  const table = {
    block_id: 't1',
    category: 'data_table',
    scope: 'campaign',
    title: 'Campañas',
    columns: [{ key: 'name', label: 'Campaña' }],
    rows: [{ name: 'A' }],
  };

  it('lifts a justification category into the answer section when it carries the format', () => {
    expect(sectionOfBlock(table)).toBe('justification');
    expect(sectionOfBlock({ ...table, answer_format: true })).toBe('answer');
    expect(sectionOfBlock({ category: 'insight_list' })).toBe('answer');
  });

  it('survives the strict parse, and an old block without it parses without it', () => {
    const parsed = checkpointBlockV2Schema.parse({ ...table, answer_format: true });
    expect(parsed.answer_format).toBe(true);
    expect('answer_format' in checkpointBlockV2Schema.parse(table)).toBe(false);
  });

  it('orders the format block first — the requested format follows the sentence, above the scope', () => {
    const block = (category: string, block_id: string, extra: Record<string, unknown> = {}) => ({
      category,
      block_id,
      ...extra,
    });
    const ordered = withPrismBlockOrder([
      block('metric_grid', 'grid'),
      block('narrative', 'prose'),
      block('data_table', 'asked', { answer_format: true }),
      block('data_table', 'other'),
      block('data_scope', 'scope'),
    ]);
    expect(ordered.map((b) => b.block_id)).toEqual(['asked', 'scope', 'grid', 'other', 'prose']);
  });
});
