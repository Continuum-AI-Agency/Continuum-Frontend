import { describe, expect, it } from 'bun:test';

import { classifyClaims, groundingViolationsOf } from './jaina-report';

// JG-prose-figures-ungraded: on roas-by-campaign-30d Jaina wrote "Revenue: 26000" in PROSE
// for a leads campaign whose only read carries `purchase_value: 0`. `groundingViolationsOf`
// holds a figure a block RENDERS (`unmeasuredCellsOf`) to the turn's `figures`, but a
// `figure` claim `classifyClaims` finds in a narrative body or an insight summary is skipped
// on the prose walk. The same invented number is a violation in a cell and nothing in a
// sentence. These cases are the contract-level anchor for the prose seam, with the bounds
// the fix must keep: a measured figure stays clean, a window is not a measurement, and no
// figure set means no figure is graded.

const figures = [15986.35, 412_910, 9874, 0, 2.39, 1.62, 38.72, 41];
const entities = [{ level: 'campaign' as const, id: '120210001', name: 'Leads // North' }];

const narrative = (body: string) => ({
  block_id: 'summary',
  category: 'narrative',
  body,
  highlights: [],
});

const insight = (summary: string) => ({
  block_id: 'reading',
  category: 'insight_list',
  items: [
    {
      item_type: 'insight',
      title: 'Leads // North',
      summary,
      rationale: 'Because.',
      impact: 'Keep it running.',
      severity: 'neutral',
      cite_ids: ['c1'],
    },
  ],
});

const INVENTED_REVENUE = 'Revenue: 26000 for Leads // North over the last 30 days.';
const MEASURED_SPEND = 'Spend: 15,986.35 MXN for Leads // North over the last 30 days.';

describe('groundingViolationsOf — figures stated in prose', () => {
  it('classifies the sentence as a figure claim, so the walk already sees it', () => {
    expect(classifyClaims(INVENTED_REVENUE, { entities })).toContainEqual({
      kind: 'figure',
      span: INVENTED_REVENUE,
    });
  });

  it('flags "Revenue: 26000" in a narrative body when the figure set carries no such value', () => {
    expect(
      groundingViolationsOf(narrative(INVENTED_REVENUE), { toolKinds: [], figures, entities }),
    ).toContainEqual({
      kind: 'figure',
      span: expect.stringMatching(/26,?000/),
      reason: 'claim_without_source',
    });
  });

  it('flags the same sentence in an insight_list summary', () => {
    expect(
      groundingViolationsOf(insight(INVENTED_REVENUE), { toolKinds: [], figures, entities }),
    ).toContainEqual({
      kind: 'figure',
      span: expect.stringMatching(/26,?000/),
      reason: 'claim_without_source',
    });
  });

  it('leaves a spend the figure set carries alone, printed with a thousands separator', () => {
    expect(
      groundingViolationsOf(narrative(MEASURED_SPEND), { toolKinds: [], figures, entities }),
    ).toEqual([]);
  });

  it('never reads a window as a figure to ground — "last 30 days" is computed, not measured', () => {
    expect(
      groundingViolationsOf(narrative('Leads // North ran over the last 30 days with 41 leads.'), {
        toolKinds: [],
        figures,
        entities,
      }),
    ).toEqual([]);
  });

  it('grades no prose figure without a figure set', () => {
    expect(groundingViolationsOf(narrative(INVENTED_REVENUE), { toolKinds: [], entities })).toEqual(
      [],
    );
  });
});

// Golden 3cbd27a4 — the first run where the justification prose reaches every report. The
// product owner's rule for a proposal: a percentage it proposes ("reallocate 20%") and a
// threshold it states as a rule ("sub-1.0 ROAS") are computed — no tool returns them — but a
// money amount it proposes ("shift 1500 MXN") must be a figure a read returned. The table
// holds both directions, each against a figure set that carries none of the phrase's numbers.

const NO_PHRASE_FIGURES = [999_999];

const proseViolations = (text: string, readFigures: ReadonlyArray<number> = NO_PHRASE_FIGURES) =>
  groundingViolationsOf(narrative(text), { toolKinds: [], figures: readFigures, entities });

describe('groundingViolationsOf — a proposal percentage or a threshold is computed', () => {
  const masked: ReadonlyArray<[string, string]> = [
    ['EN proposal percentage', 'Reallocate 20% to Leads // North.'],
    ['EN proposal percentage after a noun', 'Cut budget 15% on the weakest ad set.'],
    ['EN proposal percentage with by', 'Shift spend by 25% toward Leads // North.'],
    ['ES proposal percentage', 'Reasignar un 20% a Leads // North.'],
    ['ES proposal percentage, infinitive', 'Subir 10% el presupuesto de Leads // North.'],
    ['ES proposal percentage after a noun', 'Recortar el presupuesto un 15% en ITESO.'],
    ['EN sub- threshold', 'Pause campaigns returning sub-1.0 ROAS.'],
    ['EN under threshold', 'Pause campaigns under 1.0 ROAS.'],
    ['EN metric-first threshold', 'Pause ad sets with ROAS under 1.2.'],
    ['EN CPA threshold with money', 'Pause ad sets with a CPA over 45 MXN.'],
    ['EN below threshold', 'Pause campaigns below 1.0 ROAS.'],
    ['ES threshold', 'Pausar campañas por debajo de 1.0 de ROAS.'],
    ['ES per-lead money threshold', 'Pausar si cuesta menos de 30 MXN por lead.'],
    ['EN hyphenated window', 'Based on the 7-day period, hold spend steady.'],
  ];

  it.each(masked)('masks the %s — "%s"', (_label, sentence) => {
    expect(proseViolations(sentence)).toEqual([]);
  });

  it('clears the real strategy-next-month sentence — every figure in it is computed', () => {
    expect(
      proseViolations(
        'Defining underperforming as campaigns returning sub-1.0 ROAS, reallocate 20% of budget from **ITESO // MENSAJES // AGOSTO 2026** into **CAÑADAS // MENSAJES // AGOSTO 2026** based on the 7-day period to lift account return above 1.06 ROAS.',
      ),
    ).toEqual([]);
  });
});

describe('groundingViolationsOf — a money amount in a proposal must come from a read', () => {
  const flagged: ReadonlyArray<[string, string]> = [
    ['EN proposal money', 'Shift 1500 MXN into Leads // North.'],
    ['EN proposal money, formatted', 'Move 1,500 MXN to Leads // North.'],
    ['ES proposal money', 'Mover 1,500 MXN a Leads // North.'],
    ['ES proposal money with un', 'Reasignar 2,000 MXN a Leads // North.'],
    ['EN spend cap without a metric', 'Pause ad sets consuming over 1500 MXN.'],
    [
      'EN read percentage outside a proposal',
      'Leads // North converted 7.5% of clicks into leads today, a CTR of 3.3%.',
    ],
  ];

  it.each(flagged)('flags the %s — "%s"', (_label, sentence) => {
    expect(proseViolations(sentence)).toContainEqual({
      kind: 'figure',
      span: expect.any(String),
      reason: 'claim_without_source',
    });
  });

  it('flags the real budget-reallocation-week sentence while 1500 is not a read figure', () => {
    const sentence =
      'Shifting 1500 MXN into **CAÑADAS // MENSAJES // AGOSTO 2026**, which delivered 1.40 ROAS and 16 purchases, will immediately improve blended profitability.';
    expect(proseViolations(sentence, [1.4, 16])).toContainEqual({
      kind: 'figure',
      span: sentence,
      reason: 'claim_without_source',
    });
    expect(proseViolations(sentence, [1500, 1.4, 16])).toEqual([]);
  });
});
