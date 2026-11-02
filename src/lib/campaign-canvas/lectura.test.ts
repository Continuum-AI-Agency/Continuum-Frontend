import { describe, expect, it } from 'bun:test';
import type { LiveChangeNode, LiveChangePreviewPayload } from '@continuum/contracts';
import {
  LECTURA_TABLE_THRESHOLD,
  lecturaFromCanvasGraph,
  lecturaFromLiveChange,
  prefersLecturaTable,
} from './lectura';
import { LIVE_BATCH_PREVIEW, SCAFFOLD_GRAPH } from './lectura.fixtures';

describe('lecturaFromLiveChange', () => {
  const model = lecturaFromLiveChange(LIVE_BATCH_PREVIEW);

  it('lists every change first, ad sets in payload order, with their breadcrumb and basis', () => {
    expect(model.kind).toBe('change');
    expect(model.changes.map((change) => [change.id, change.mark, change.title])).toEqual([
      ['2202', 'paused', 'Pause the ad set'],
      ['2203', 'changed', 'Daily budget'],
      ['new:1', 'added', 'New ad set, created paused'],
    ]);
    const budget = model.changes[1];
    expect(budget?.campaignName).toBe('CAÑADAS // MENSAJES // Octubre 2026');
    expect(budget?.adSetName).toBe('Lookalike 1% clientes');
    expect(budget?.basis).toBe('Lowest cost per conversation in the campaign: 48 MXN');
    expect(budget?.rows[0]).toMatchObject({
      label: 'Daily budget',
      before: '$300 MXN',
      after: '$450 MXN',
    });
  });

  it('totals what delivers today against after, and keeps new paused copies out of the total', () => {
    // 350 + 300 + 300 + 200 today; after: 350 + 0 + 450 + 200; the 150 copy is paused.
    expect(model.totals).toEqual({ before: 115000, after: 100000, newWhenActivated: 15000 });
  });

  it('splits the budget by ad set with a tone per mark', () => {
    expect(model.split.map((slice) => [slice.name, slice.minor, slice.tone])).toEqual([
      ['Mujeres 25-34 · Zapopan', 35000, 'kept'],
      ['Intereses fitness', 30000, 'removed'],
      ['Lookalike 1% clientes', 45000, 'changed'],
      ['Prueba A · Advantage+', 15000, 'new'],
      ['Retargeting 30d', 20000, 'kept'],
    ]);
  });

  it('dims the ads of a paused ad set and names a copy by its source', () => {
    const adSets = model.campaigns[0]?.adSets ?? [];
    const paused = adSets.find((adSet) => adSet.id === '2202');
    expect(paused?.ads.every((ad) => ad.stops)).toBe(true);
    expect(paused?.budgetAfter).toBe(0);
    const copy = adSets.find((adSet) => adSet.id === 'new:1');
    expect(copy?.basedOnName).toBe('Lookalike 1% clientes');
    expect(copy?.budgetBefore).toBeNull();
  });

  it('stops every ad set when the campaign itself is paused, and the total goes to zero', () => {
    const paused: LiveChangePreviewPayload = {
      ...LIVE_BATCH_PREVIEW,
      counts: { changed: 0, added: 0, paused: 1 },
      nodes: LIVE_BATCH_PREVIEW.nodes
        .filter((node) => !node.id.startsWith('new:'))
        .map(
          (node): LiveChangeNode =>
            node.level === 'campaign'
              ? {
                  ...node,
                  mark: 'paused',
                  changes: [{ field: 'status', before: 'ACTIVE', after: 'PAUSED' }],
                }
              : { ...node, mark: 'unchanged', changes: [] },
        ),
    };
    const stopped = lecturaFromLiveChange(paused);
    expect(stopped.changes.map((change) => change.level)).toEqual(['campaign']);
    expect(stopped.totals.after).toBe(0);
    expect(stopped.campaigns[0]?.adSets.every((adSet) => adSet.stopsWithParent)).toBe(true);
  });

  it('reads a campaign budget (CBO) from the campaign, not the ad sets', () => {
    const cbo: LiveChangePreviewPayload = {
      ...LIVE_BATCH_PREVIEW,
      nodes: LIVE_BATCH_PREVIEW.nodes
        .filter((node) => !node.id.startsWith('new:'))
        .map(
          (node): LiveChangeNode =>
            node.level === 'campaign'
              ? {
                  ...node,
                  dailyBudgetMinor: 100000,
                  mark: 'changed',
                  changes: [{ field: 'daily_budget', before: 100000, after: 120000 }],
                }
              : { ...node, dailyBudgetMinor: null, mark: 'unchanged', changes: [] },
        ),
    };
    const model = lecturaFromLiveChange(cbo);
    expect(model.campaigns[0]?.campaignBudget).toBe(true);
    expect(model.totals).toMatchObject({ before: 100000, after: 120000 });
    expect(model.split).toHaveLength(1);
  });
});

describe('lecturaFromCanvasGraph', () => {
  const model = lecturaFromCanvasGraph(SCAFFOLD_GRAPH.nodes, SCAFFOLD_GRAPH.edges);

  it('reads a new campaign: no changes list, every ad set with its budget, audience and ads', () => {
    expect(model.kind).toBe('new');
    expect(model.changes).toEqual([]);
    expect(model.currency).toBe('MXN');
    expect(model.totals).toEqual({ before: null, after: 60000, newWhenActivated: 0 });
    const [first, second] = model.campaigns[0]?.adSets ?? [];
    expect(first?.budgetAfter).toBe(40000);
    expect(first?.audience).toBe('MX · 25-44 · women');
    expect(first?.ads[0]).toMatchObject({
      name: 'Reel clase spinning',
      thumbnailUrl: 'https://example.test/reel.jpg',
      creativeKind: 'video',
    });
    expect(second?.ads[0]?.thumbnailUrl).toBeNull();
  });

  it('counts where each field came from, ad set, audience and ads together', () => {
    const [first, second] = model.campaigns[0]?.adSets ?? [];
    expect(first?.provenance).toEqual({ userGave: 3, jainaFilled: 1, jainaAsks: 0 });
    expect(second?.provenance).toEqual({ userGave: 0, jainaFilled: 0, jainaAsks: 1 });
  });
});

describe('prefersLecturaTable', () => {
  it('switches to the table only past the threshold', () => {
    const base = lecturaFromLiveChange(LIVE_BATCH_PREVIEW);
    expect(prefersLecturaTable(base)).toBe(false);
    expect(prefersLecturaTable({ ...base, adSetCount: LECTURA_TABLE_THRESHOLD })).toBe(false);
    expect(prefersLecturaTable({ ...base, adSetCount: LECTURA_TABLE_THRESHOLD + 1 })).toBe(true);
  });
});
