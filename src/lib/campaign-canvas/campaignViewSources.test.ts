// The one campaign model from every source (phase 4a): the Backend's diff of a copy, a
// structure frame, a scaffold card's rows, and a Google / TikTok live change in their own words.

import { describe, expect, it } from 'bun:test';
import type {
  CampaignStructurePayload,
  LiveChangePreviewPayload,
  StructureDiff,
  StructureDiffEntry,
} from '@continuum/contracts';
import {
  changeOrder,
  collapsedGroupLabel,
  collapseUnchangedBranches,
  columnMapFromCanvasGraph,
  columnMapFromView,
} from './columnMap';
import { SCAFFOLD_COPY_WITH_TESTS } from './columnMap.fixtures';
import {
  campaignViewFromScaffoldRows,
  campaignViewFromStructure,
  lecturaFromCanvasGraph,
  lecturaFromLiveChange,
  marksFromStructureDiff,
  minorFromWordedMoney,
  scaffoldMarksOf,
} from './lectura';
import { platformLabelsOf } from './platformLabels';

const entry = (
  path_key: string,
  level: StructureDiffEntry['level'],
  change: StructureDiffEntry['change'],
  fields: StructureDiffEntry['fields'] = [],
  name = path_key,
): StructureDiffEntry => ({
  path_key,
  source_path_key: change === 'added' ? null : path_key,
  level,
  name,
  change,
  fields,
});

const PAUSED = { key: 'status', label: 'Status', before: 'ACTIVE', after: 'PAUSED' };

/**
 * The shape `paid_scaffold_propose_duplicate` emits for a copy with two test ad sets (captured
 * from Easy Fit, 2026-10-31): every copied node "changed" only by being created paused, the
 * campaign renamed, and the test ad sets added on the first ad set with their one lever.
 */
const COPY_DIFF: StructureDiff = {
  source: { kind: 'campaign', id: '120253141147440236', name: 'ZAPOPAN // MENSAJES' },
  entries: [
    entry('c0', 'campaign', 'changed', [
      {
        key: 'name',
        label: 'Name',
        before: 'ZAPOPAN // MENSAJES',
        after: 'ZAPOPAN // MENSAJES · test copy',
      },
    ]),
    entry('c0/a0', 'adset', 'changed', [PAUSED]),
    entry('c0/a0/ad0', 'ad', 'changed', [PAUSED]),
    entry('c0/a1', 'adset', 'changed', [PAUSED]),
    entry('c0/a2', 'adset', 'changed', [PAUSED]),
    entry(
      'c0/a3',
      'adset',
      'added',
      [
        { key: 'name', label: 'Name', before: 'Mujeres 25-34', after: 'Test Advantage+ on' },
        PAUSED,
        { key: 'advantage_audience', label: 'Advantage+ audience', before: 'off', after: 'on' },
      ],
      'Test Advantage+ on',
    ),
    entry('c0/a3/ad0', 'ad', 'added', [PAUSED]),
    entry(
      'c0/a4',
      'adset',
      'added',
      [
        { key: 'name', label: 'Name', before: 'Mujeres 25-34', after: 'Test Reels only' },
        PAUSED,
        {
          key: 'placements',
          label: 'Placements',
          before: 'Advantage+ placements (automatic)',
          after: 'instagram reels',
        },
      ],
      'Test Reels only',
    ),
  ],
};

describe("marksFromStructureDiff: the Backend's diff of a copy", () => {
  const marks = marksFromStructureDiff(COPY_DIFF);

  it('does not count "created paused" as a change: a copied node is unchanged', () => {
    expect(marks.get('c0/a0')).toEqual({ mark: 'unchanged', rows: [] });
    expect(marks.get('c0/a0/ad0')).toEqual({ mark: 'unchanged', rows: [] });
  });

  it('keeps a real change with its before → after (the copy renamed)', () => {
    expect(marks.get('c0')).toEqual({
      mark: 'changed',
      rows: [
        {
          field: 'name',
          label: 'Name',
          before: 'ZAPOPAN // MENSAJES',
          after: 'ZAPOPAN // MENSAJES · test copy',
        },
      ],
    });
  });

  it('marks a test ad set added, with the lever it tests, based on its source', () => {
    expect(marks.get('c0/a3')).toEqual({
      mark: 'added',
      rows: [
        { field: 'advantage_audience', label: 'Advantage+ audience', before: 'off', after: 'on' },
      ],
      basedOnName: 'Mujeres 25-34',
    });
    expect(marks.get('c0/a3/ad0')?.mark).toBe('added');
  });

  it('marks nothing without a diff', () => {
    expect(marksFromStructureDiff(null).size).toBe(0);
  });
});

describe('a copy on the canvas, marked by the diff', () => {
  const { nodes, edges } = SCAFFOLD_COPY_WITH_TESTS;
  const marks = scaffoldMarksOf(nodes, edges, COPY_DIFF);

  it('marks exactly the nodes the Backend added, and the renamed campaign', () => {
    const marked = [...marks.entries()]
      .filter(([, mark]) => mark.mark !== 'unchanged')
      .map(([id, mark]) => `${id}:${mark.mark}`);
    expect(marked).toEqual(['c:changed', 's4:added', 's4a1:added', 's5:added']);
  });

  it('folds the copied ad sets in the Map and walks the changes only', () => {
    const model = columnMapFromCanvasGraph(nodes, edges, marks);
    expect(changeOrder(model)).toEqual(['c', 's4', 's5']);
    const slots = collapseUnchangedBranches(model)[0]?.slots ?? [];
    expect(slots.map((slot) => (slot.kind === 'adset' ? slot.adSet.id : slot.group.count))).toEqual(
      ['s4', 's5', 3],
    );
  });

  it('puts the changes first in Read, the test ad sets with what they test', () => {
    const view = lecturaFromCanvasGraph(nodes, edges, marks);
    expect(view.changes.map((change) => [change.id, change.mark, change.title])).toEqual([
      ['c', 'changed', 'Renamed'],
      ['s4', 'added', 'New ad set'],
      ['s5', 'added', 'New ad set'],
    ]);
    expect(view.changes[1]?.basis).toBe('Based on Mujeres 25-34');
    expect(view.changes[1]?.rows).toEqual([
      { field: 'advantage_audience', label: 'Advantage+ audience', before: 'off', after: 'on' },
    ]);
    expect(view.campaigns[0]?.adSets.find((adSet) => adSet.id === 's4')?.basedOnName).toBe(
      'Mujeres 25-34',
    );
  });
});

describe('minorFromWordedMoney: a printed figure read back', () => {
  it('reads what formatMoney prints, and only that', () => {
    expect(minorFromWordedMoney('$100 MXN')).toEqual({ minor: 10000, currency: 'MXN' });
    expect(minorFromWordedMoney('$1,235 USD')).toEqual({ minor: 123500, currency: 'USD' });
    expect(minorFromWordedMoney('€1,500 EUR')).toEqual({ minor: 150000, currency: 'EUR' });
    expect(minorFromWordedMoney('Placeholder budget')).toBeNull();
    expect(minorFromWordedMoney('100 pesos al día')).toBeNull();
    expect(minorFromWordedMoney(null)).toBeNull();
  });
});

const structureOf = (over: Partial<CampaignStructurePayload> = {}): CampaignStructurePayload => ({
  scaffoldId: 'v1',
  parentScaffoldId: 'p1',
  version: 1,
  layout: 'diff',
  partId: 'campaign-structure:p1:diff',
  title: 'ZAPOPAN // MENSAJES · test copy',
  counts: { campaigns: 1, adSets: 2, ads: 1, userGave: 1, jainaFilled: 3, jainaAsks: 0 },
  nodes: [
    {
      path_key: 'c0',
      parent_path_key: null,
      level: 'campaign',
      name: 'ZAPOPAN // MENSAJES · test copy',
      funnel_stage: null,
      audience_key: null,
      creative_key: null,
      fields: [{ key: 'objective', label: 'Objective', value: 'Sales', provenance: 'user_gave' }],
    },
    {
      path_key: 'c0/a0',
      parent_path_key: 'c0',
      level: 'adset',
      name: 'Mujeres 25-34',
      funnel_stage: 'prospecting',
      audience_key: null,
      creative_key: null,
      fields: [
        {
          key: 'daily_budget_minor_units',
          label: 'Daily budget',
          value: '$100 MXN',
          provenance: 'jaina_filled',
        },
        {
          key: 'audience',
          label: 'Audience',
          value: 'copied from Mujeres',
          provenance: 'jaina_filled',
        },
      ],
    },
    {
      path_key: 'c0/a0/ad0',
      parent_path_key: 'c0/a0',
      level: 'ad',
      name: 'Reel 1',
      funnel_stage: null,
      audience_key: null,
      creative_key: null,
      fields: [],
    },
    {
      path_key: 'c0/a3',
      parent_path_key: 'c0',
      level: 'adset',
      name: 'Test Advantage+ on',
      funnel_stage: 'prospecting',
      audience_key: null,
      creative_key: null,
      fields: [
        {
          key: 'daily_budget_minor_units',
          label: 'Daily budget',
          value: '$100 MXN',
          provenance: 'jaina_filled',
        },
      ],
    },
  ],
  truncated: false,
  diff: COPY_DIFF,
  html: null,
  ...over,
});

describe('campaignViewFromStructure: the chat drawing of a proposal', () => {
  it('builds the campaign from its nodes, marked by its diff, budgets read back', () => {
    const view = campaignViewFromStructure(structureOf());
    expect(view.platform).toBe('meta');
    expect(view.currency).toBe('MXN');
    expect(view.campaigns[0]?.objective).toBe('Sales');
    expect(view.changes.map((change) => [change.id, change.mark])).toEqual([
      ['c0', 'changed'],
      ['c0/a3', 'added'],
    ]);
    expect(view.totals.after).toBe(20000);
    expect(view.campaigns[0]?.adSets.map((adSet) => adSet.audience)).toEqual([
      'copied from Mujeres',
      null,
    ]);
  });

  it('is a plain new campaign when the frame carries no diff (outline)', () => {
    const view = campaignViewFromStructure(structureOf({ layout: 'outline', diff: null }));
    expect(view.changes).toEqual([]);
    expect(view.adSetCount).toBe(2);
  });

  it('says a truncated frame is cut', () => {
    expect(campaignViewFromStructure(structureOf({ truncated: true })).truncated).toBe(true);
  });
});

describe('campaignViewFromScaffoldRows: the scaffold card', () => {
  const tree = {
    campaign: { id: 'row-c', pathKey: 'c0', name: 'Copy', budgetMinor: null },
    adSets: [
      {
        id: 'row-a0',
        pathKey: 'c0/a0',
        name: 'Mujeres 25-34',
        budgetMinor: 10000,
        audience: 'MX',
        ads: [{ id: 'row-ad', pathKey: 'c0/a0/ad0', name: 'Reel' }],
      },
      {
        id: 'row-a3',
        pathKey: 'c0/a3',
        name: 'Test Advantage+ on',
        budgetMinor: 10000,
        audience: null,
        ads: [],
      },
    ],
  };

  it('marks by path key from the diff, and totals the ad set budgets (ABO)', () => {
    const view = campaignViewFromScaffoldRows(tree, { currency: 'MXN', diff: COPY_DIFF });
    expect(view.changes.map((change) => [change.id, change.mark])).toEqual([
      ['c0', 'changed'],
      ['c0/a3', 'added'],
    ]);
    expect(view.totals.after).toBe(20000);
    expect(view.campaigns[0]?.campaignBudget).toBe(false);
  });

  it('holds the budget on the campaign under CBO', () => {
    const view = campaignViewFromScaffoldRows(
      {
        campaign: { ...tree.campaign, budgetMinor: 25000 },
        adSets: tree.adSets.map((adSet) => ({ ...adSet, budgetMinor: null })),
      },
      { currency: 'USD' },
    );
    expect(view.campaigns[0]?.campaignBudget).toBe(true);
    expect(view.totals.after).toBe(25000);
    expect(view.changes).toEqual([]);
  });
});

const googlePreview = (channel: 'SEARCH' | 'PERFORMANCE_MAX'): LiveChangePreviewPayload =>
  ({
    approvalId: `appr_${channel}`,
    toolCallId: `call_${channel}`,
    toolName: 'google_ads_change_budget',
    partId: `live-change:appr_${channel}`,
    subject: null,
    currency: 'MXN',
    truncated: false,
    counts: { changed: 1, added: 0, paused: 1 },
    readAt: '2026-10-31T06:00:00.000Z',
    platform: 'google',
    channel,
    nodes: [
      {
        id: 'g1',
        parentId: null,
        level: 'campaign',
        name: 'Easy Fit · Brand',
        status: 'ENABLED',
        dailyBudgetMinor: 50000,
        mark: 'changed',
        changes: [{ field: 'daily_budget', before: 50000, after: 60000 }],
        basedOnId: null,
      },
      {
        id: 'g1a',
        parentId: 'g1',
        level: 'adset',
        name: 'Membresías',
        status: 'ENABLED',
        dailyBudgetMinor: null,
        mark: 'paused',
        changes: [{ field: 'status', before: 'ENABLED', after: 'PAUSED' }],
        basedOnId: null,
        assetSummary: '5 headlines · 4 descriptions · 6 images',
      },
      {
        id: 'g1b',
        parentId: 'g1',
        level: 'adset',
        name: 'Day pass',
        status: 'ENABLED',
        dailyBudgetMinor: null,
        mark: 'unchanged',
        changes: [],
        basedOnId: null,
        assetSummary: '3 headlines · 2 images',
      },
    ],
  }) as LiveChangePreviewPayload;

describe('a Google live change, in Google words', () => {
  it('Search names ad groups', () => {
    const view = lecturaFromLiveChange(googlePreview('SEARCH'));
    expect(view.platform).toBe('google_search');
    expect(view.changes.map((change) => change.title)).toEqual([
      'Daily budget',
      'Pause the ad group',
    ]);
  });

  it('Performance Max names asset groups, and the Map shows assets instead of ads', () => {
    const view = lecturaFromLiveChange(googlePreview('PERFORMANCE_MAX'));
    expect(view.platform).toBe('google_pmax');
    expect(view.changes[1]?.title).toBe('Pause the asset group');
    expect(view.campaigns[0]?.adSets[0]?.assetSummary).toBe(
      '5 headlines · 4 descriptions · 6 images',
    );
    const map = columnMapFromView(view);
    expect(map.platform).toBe('google_pmax');
    const assets = map.campaigns[0]?.adSets.map((adSet) =>
      adSet.ads.map((ad) => [ad.level, ad.title, ad.note]),
    );
    expect(assets).toEqual([
      [['ad', '5 headlines · 4 descriptions · 6 images', 'stops with its asset group']],
      [['ad', '3 headlines · 2 images', null]],
    ]);
    const slots = collapseUnchangedBranches(map)[0]?.slots ?? [];
    const group = slots.find((slot) => slot.kind === 'collapsed');
    expect(
      group?.kind === 'collapsed' &&
        collapsedGroupLabel(group.group, platformLabelsOf('google_pmax')),
    ).toBe('+ 1 unchanged asset group');
  });
});
