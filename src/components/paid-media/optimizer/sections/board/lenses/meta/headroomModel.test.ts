import { describe, expect, it } from 'bun:test';
import { CAMPAIGN, PORTFOLIOS, TOP_CAMPAIGNS } from './__fixtures__/easyFitMeta';
import { buildMix } from './branchesModel';
import { buildHeadroom, headroomHeadline, niceScale, placeScatterLabels } from './headroomModel';
import { rankRowOf } from './metaLensModel';

const campaigns = TOP_CAMPAIGNS.map(rankRowOf);

function headroomOf(rows = campaigns) {
  const mix = buildMix(rows, PORTFOLIOS, 'MXN');
  if (!mix) throw new Error('expected a mix');
  return { mix, model: buildHeadroom(mix, 'MXN') };
}

describe('buildHeadroom on Easy Fit (Oct 3 – Nov 2)', () => {
  const { mix, model } = headroomOf();

  it('places one point per branch at its CPM and its cost per purchase', () => {
    expect(
      model.points.map((point) => [
        point.label,
        Number(point.cpm.toFixed(2)),
        Number(point.costPerResult.toFixed(2)),
      ]),
    ).toEqual([
      ['CAÑADAS', 48.5, 451.16],
      ['AV CAMACHO', 52.12, 398.05],
      ['ALEIRA', 43.35, 366.05],
      ['ITESO', 50.23, 484.94],
      ['EASY', 61.1, 305.42],
    ]);
    expect(model.unplaced).toEqual([]);
    expect(model.smallCount).toBe(0);
  });

  it('names the cheapest to reach and the best at converting, which differ here', () => {
    expect(model.cheapest?.label).toBe('ALEIRA');
    expect(model.best?.label).toBe('EASY');
    expect(model.takeaway).toBe(
      'ALEIRA tiene el CPM más bajo ($43.35 MXN) y EASY el mejor costo por compra ($305 MXN).',
    );
  });

  it('leads a small view with the CPM spread', () => {
    expect(headroomHeadline(model, mix, 'MXN')).toEqual({
      figure: '$43.35–$61.10 MXN',
      caption: 'CPM by branch · ALEIRA is the cheapest to reach',
    });
  });
});

describe('buildHeadroom by campaign', () => {
  it('keeps every campaign above 1% of the spend, and says when one leads both axes', () => {
    const canadas = campaigns.filter(
      (row) => row.id === CAMPAIGN.canadas.id || row.id === CAMPAIGN.canadasForm.id,
    );
    const { model } = headroomOf(canadas);
    expect(model.points.map((point) => point.label)).toEqual([
      CAMPAIGN.canadas.name,
      CAMPAIGN.canadasForm.name,
    ]);
    // MENSAJES reaches cheaper ($47.85 CPM); FORMULARIO books cheaper ($192.75 a purchase).
    expect(model.cheapest?.label).toBe(CAMPAIGN.canadas.name);
    expect(model.best?.label).toBe(CAMPAIGN.canadasForm.name);
  });

  // ITESO's TOURS copy spent $168.57 against CAÑADAS' $22,562: under 1% of the spend, it is
  // a dot no one can read, so it is counted off the chart instead.
  it('leaves a row under 1% of the spend off the chart', () => {
    const tours = campaigns.filter(
      (row) => row.id === CAMPAIGN.canadas.id || row.id === CAMPAIGN.itesoTours.id,
    );
    const { model } = headroomOf(tours);
    expect(model.points.map((point) => point.label)).toEqual(['CAÑADAS']);
    expect(model.smallCount).toBe(1);
  });
});

describe('niceScale', () => {
  it('pads the domain and lands its ticks on round values', () => {
    const scale = niceScale([43.35, 61.1]);
    expect(scale.min).toBeLessThan(43.35);
    expect(scale.max).toBeGreaterThan(61.1);
    expect(scale.ticks).toEqual([45, 50, 55, 60]);
  });

  it('holds a single value', () => {
    const scale = niceScale([296]);
    expect(scale.min).toBeLessThan(296);
    expect(scale.max).toBeGreaterThan(296);
  });
});

describe('placeScatterLabels', () => {
  // EASY sat on the goal line at the right end of a 588px chart, under the goal's label.
  it('moves the goal label off a point at the right end of the line', () => {
    const placed = placeScatterLabels({
      circles: [{ cx: 536, cy: 296, r: 8, text: 'EASY' }],
      goal: { y: 300, text: 'goal $296' },
      left: 52,
      right: 572,
    });
    expect(placed.goal).toEqual({ x: 56, y: 294, anchor: 'start' });
    // No room on its right: the point's label goes to its left.
    expect(placed.points[0]).toEqual({ x: 522, y: 300, anchor: 'end' });
  });

  it('keeps two close points’ labels apart', () => {
    const placed = placeScatterLabels({
      circles: [
        { cx: 200, cy: 100, r: 6, text: 'CAÑADAS' },
        { cx: 210, cy: 106, r: 6, text: 'ALEIRA' },
      ],
      goal: null,
      left: 0,
      right: 600,
    });
    // CAÑADAS' right side runs into ALEIRA's dot, so its label takes its left; ALEIRA keeps its
    // right, and the two never touch.
    expect(placed.points[0]).toEqual({ x: 188, y: 104, anchor: 'end' });
    expect(placed.points[1]).toEqual({ x: 222, y: 110, anchor: 'start' });
  });
});
