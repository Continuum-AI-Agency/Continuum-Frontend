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
