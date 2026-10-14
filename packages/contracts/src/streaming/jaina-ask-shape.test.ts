import { describe, expect, it } from 'bun:test';

import { askShapeOf, foldAsk, formatBlockOf, formatDelivered } from './jaina-ask-shape';

/**
 * Real phrasings: the golden corpus (Continuum-Backend/App/agents-ts/Jaina/eval/golden/corpus.json),
 * the campaign corpora (docs/perfplus-campaign/jaina-corpus-hypothetical.json,
 * jaina-redteam-corpus.json) and the asks Ramiro reported on 2026-10-13, anonymised.
 */
describe('askShapeOf — format', () => {
  it.each([
    // list
    ['List my campaigns and tell me which ones are currently active.', 'list'],
    [
      'Cuales son los creativos que traen el costo por conversacion mas bajo de la cuenta y dime 2 angulos de comunicacion para desarrollar y probar resultados',
      'list',
    ],
    ['Dame una lista de los anuncios que más gastaron este mes', 'list'],
    ['Give me three ideas to lower the cost per lead', 'list'],
    ['Enumérame los conjuntos con frecuencia mayor a 3', 'list'],
    // steps
    ['¿Cómo aprovecho esta oportunidad en CAÑADAS?', 'steps'],
    ['Explícame paso a paso cómo escalar la campaña de mensajes', 'steps'],
    ['How do I scale the winning ad set without resetting learning?', 'steps'],
    ['What steps should we take to lower the CPA?', 'steps'],
    ['¿Qué tengo que hacer para bajar el costo por conversación?', 'steps'],
    ['Dame un plan de acción para esta semana', 'steps'],
    // table
    ['Ponme en una tabla el gasto y los resultados por campaña de los últimos 30 días', 'table'],
    ['Show me a table of spend, CTR and CPC by ad set', 'table'],
    ['Compara ITESO y CAÑADAS en una tabla', 'table'],
    // comparison
    [
      'How did last week (Monday to Sunday) compare with the week before? Spend, clicks and results.',
      'comparison',
    ],
    [
      '¿Cómo cambiaron los resultados de los últimos 7 días frente a los 7 días anteriores, campaña por campaña?',
      'comparison',
    ],
    ["How does this month's spend and cost per result compare with last month?", 'comparison'],
    ['¿Cómo van mis campañas de TikTok Ads esta semana frente a Meta?', 'comparison'],
    ['El mes pasado gastamos 100,000 MXN en Meta. ¿Cómo viene este mes contra eso?', 'comparison'],
    ['ITESO vs CAÑADAS: ¿cuál convierte mejor?', 'comparison'],
    // chart
    ['muestrame la tendencia del CPL cada mes en un gráfico', 'chart'],
    ['Chart daily spend for the last 14 days', 'chart'],
    ['Visualiza el costo por resultado de la semana', 'chart'],
    // explanation
    ['¿Qué sucursal tiene el costo por mensaje más alto este mes y por qué', 'explanation'],
    [
      'Why is the CPA on the ad set I launched on Monday so much worse than the rest?',
      'explanation',
    ],
    ['Explícame qué está pasando con el CPM', 'explanation'],
    [
      'Take my highest-spending campaign from the last 30 days and break down what is driving its performance at the ad set level.',
      'explanation',
    ],
    // direct
    ['What is our current total ad spend this month?', 'direct'],
    ['¿Cómo vamos este mes?', 'direct'],
    ['How are we pacing against budget this month? Are we on track?', 'direct'],
    ['Give me a 7-day campaign health brief with risks and opportunities.', 'direct'],
    [
      'Which ads spent the most in the last 30 days? Give me the top 5 by cost with their spend and results.',
      'direct',
    ],
    ['Recommend budget reallocations for this week by campaign.', 'direct'],
    ['Show me ROAS by campaign for the last 30 days.', 'direct'],
  ] as const)('%s → %s', (query, format) => {
    expect(askShapeOf(query).format).toBe(format);
  });
});

describe('askShapeOf — depth and technical', () => {
  it.each([
    ['Explícame en detalle por qué subió el CPA', 'profundo', false],
    ['Explícame paso a paso cómo escalar la campaña de mensajes', 'profundo', false],
    ['Hazme un análisis a fondo de la cuenta', 'profundo', false],
    ['Give me a deep dive on the ad set performance', 'profundo', false],
    ['Walk me through the funnel in detail', 'profundo', false],
    ['Explícame a nivel técnico cómo se calcula el costo por resultado', 'profundo', true],
    ['How is the cost per result calculated? Technical answer please', 'profundo', true],
    ['Which single ad should I scale 10x tomorrow? One line, no caveats.', 'breve', false],
    ['Solo dame el total en una cifra, no me importa la moneda.', 'breve', false],
    ['Rápido: ¿cuánto gastamos ayer?', 'breve', false],
    ['Explícame en una línea por qué subió el CPA', 'breve', false],
    ['Is that in USD? Just give me the totals in dollars.', 'breve', false],
    ['What is our current total ad spend this month?', 'estandar', false],
    ['¿Cómo vamos este mes?', 'estandar', false],
    ['Recommend budget reallocations for this week by campaign.', 'estandar', false],
  ] as const)('%s → %s (technical %s)', (query, depth, technical) => {
    const shape = askShapeOf(query);
    expect(shape.depth).toBe(depth);
    expect(shape.technical).toBe(technical);
  });

  it('folds accents and case so the two spellings of a phrase are one', () => {
    expect(foldAsk('  Explícame  PASO a Paso ')).toBe('explicame paso a paso');
    expect(askShapeOf('EXPLICAME PASO A PASO').depth).toBe('profundo');
  });

  it('does not read a direction in the frame ("top-down") or "keep it brief" as a report', () => {
    expect(askShapeOf('Keep it brief: what did we spend yesterday?').depth).toBe('breve');
  });
});

describe('formatDelivered', () => {
  const list = (n: number, id = 'l') => ({
    block_id: id,
    category: 'insight_list',
    items: Array.from({ length: n }, (_, i) => ({ title: `i${i}` })),
  });

  it('a list is two items at least, and the closing watch list is never the asked list', () => {
    expect(formatDelivered({ blocks: [list(1)] }, 'list')).toBe(false);
    expect(formatDelivered({ blocks: [list(3, 'what_to_watch')] }, 'list')).toBe(false);
    expect(formatDelivered({ blocks: [list(2)] }, 'list')).toBe(true);
  });

  it('each container format needs its block with content', () => {
    expect(formatDelivered({ blocks: [{ category: 'data_table', rows: [] }] }, 'table')).toBe(
      false,
    );
    expect(formatDelivered({ blocks: [{ category: 'data_table', rows: [{}] }] }, 'table')).toBe(
      true,
    );
    expect(formatDelivered({ blocks: [{ category: 'steps', items: [{}] }] }, 'steps')).toBe(true);
    expect(
      formatDelivered({ blocks: [{ category: 'comparison', pairs: [{}] }] }, 'comparison'),
    ).toBe(true);
    expect(formatDelivered({ blocks: [{ category: 'chart', data: [{}] }] }, 'chart')).toBe(true);
    expect(formatBlockOf([{ category: 'chart', data: [] }], 'chart')).toBeNull();
  });

  it('an explanation is prose of its own; a direct answer needs nothing', () => {
    expect(formatDelivered({ blocks: [] }, 'explanation')).toBe(false);
    expect(
      formatDelivered({ blocks: [{ category: 'narrative', body: 'Because…' }] }, 'explanation'),
    ).toBe(true);
    expect(formatDelivered({ blocks: [] }, 'direct')).toBe(true);
  });
});
