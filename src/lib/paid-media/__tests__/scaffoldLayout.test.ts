import { describe, expect, it } from 'bun:test';
import {
  layoutScaffoldTree,
  SCAFFOLD_AD_WIDTH,
  SCAFFOLD_ADSET_WIDTH,
  SCAFFOLD_LEVEL_GAP,
  SCAFFOLD_SIBLING_GAP,
} from '../scaffoldLayout';
import { buildScaffoldTree, type PaidScaffoldNodeRow } from '../scaffoldTree';

const row = (overrides: Partial<PaidScaffoldNodeRow>): PaidScaffoldNodeRow => ({
  id: 'n',
  parentId: null,
  level: 'adset',
  ordinal: 1,
  pathKey: 'c0/a1',
  name: 'Ad set',
  productKey: 'p1',
  angleKey: 'value',
  conceptKey: null,
  payload: {},
  status: 'pending',
  metaObjectId: null,
  metaCreativeId: null,
  errorMessage: null,
  attempt: 0,
  creativeAssetId: null,
  creativeMedia: null,
  ...overrides,
});

const treeOf = (adSets: number, adsPerAdSet: number) => {
  const rows: PaidScaffoldNodeRow[] = [
    row({
      id: 'c',
      level: 'campaign',
      ordinal: 0,
      pathKey: 'c0',
      name: 'Campaign',
      productKey: null,
      angleKey: null,
    }),
  ];
  for (let a = 1; a <= adSets; a += 1) {
    rows.push(row({ id: `a${a}`, parentId: 'c', ordinal: a, pathKey: `c0/a${a}` }));
    for (let d = 1; d <= adsPerAdSet; d += 1) {
      rows.push(
        row({
          id: `a${a}d${d}`,
          parentId: `a${a}`,
          level: 'ad',
          ordinal: d,
          pathKey: `c0/a${a}/ad${d}`,
          conceptKey: `concept-${d}`,
        }),
      );
    }
  }
  return buildScaffoldTree(rows);
};

const nodeAt = (layout: ReturnType<typeof layoutScaffoldTree>, id: string) =>
  layout.nodes.find((node) => node.id === id);

describe('layoutScaffoldTree', () => {
  it('keys nodes on pathKey so the canvas and table share one selection', () => {
    const layout = layoutScaffoldTree(treeOf(2, 2));
    expect(layout.nodes.map((node) => node.id)).toContain('c0/a1/ad2');
    expect(nodeAt(layout, 'c0')?.type).toBe('scaffoldCampaign');
    expect(nodeAt(layout, 'c0/a1')?.type).toBe('scaffoldAdSet');
    expect(nodeAt(layout, 'c0/a1/ad1')?.type).toBe('scaffoldAd');
  });

  it('puts each level on its own row', () => {
    const layout = layoutScaffoldTree(treeOf(2, 2));
    expect(nodeAt(layout, 'c0')?.position.y).toBe(0);
    expect(nodeAt(layout, 'c0/a1')?.position.y).toBe(SCAFFOLD_LEVEL_GAP);
    expect(nodeAt(layout, 'c0/a1/ad1')?.position.y).toBe(SCAFFOLD_LEVEL_GAP * 2);
  });

  it('centres an ad set over its own ads', () => {
    const layout = layoutScaffoldTree(treeOf(1, 2));
    const adSet = nodeAt(layout, 'c0/a1');
    const firstAd = nodeAt(layout, 'c0/a1/ad1');
    const lastAd = nodeAt(layout, 'c0/a1/ad2');
    const adsCentre =
      ((firstAd?.position.x ?? 0) + (lastAd?.position.x ?? 0) + SCAFFOLD_AD_WIDTH) / 2;
    expect((adSet?.position.x ?? 0) + SCAFFOLD_ADSET_WIDTH / 2).toBeCloseTo(adsCentre, 5);
  });

  it('centres the campaign over its ad sets', () => {
    const layout = layoutScaffoldTree(treeOf(3, 2));
    const campaign = nodeAt(layout, 'c0');
    const first = nodeAt(layout, 'c0/a1');
    const last = nodeAt(layout, 'c0/a3');
    const adSetsCentre =
      ((first?.position.x ?? 0) + (last?.position.x ?? 0) + SCAFFOLD_ADSET_WIDTH) / 2;
    expect((campaign?.position.x ?? 0) + 300 / 2).toBeCloseTo(adSetsCentre, 5);
  });

  it('never overlaps sibling ads', () => {
    const layout = layoutScaffoldTree(treeOf(4, 3));
    const ads = layout.nodes
      .filter((node) => node.type === 'scaffoldAd')
      .sort((left, right) => left.position.x - right.position.x);
    for (let index = 1; index < ads.length; index += 1) {
      const gap = ads[index].position.x - (ads[index - 1].position.x + SCAFFOLD_AD_WIDTH);
      expect(gap).toBeGreaterThanOrEqual(SCAFFOLD_SIBLING_GAP - 0.001);
    }
  });

  it('gives an ad set with no ads a column of its own', () => {
    const rows: PaidScaffoldNodeRow[] = [
      row({
        id: 'c',
        level: 'campaign',
        ordinal: 0,
        pathKey: 'c0',
        productKey: null,
        angleKey: null,
      }),
      row({ id: 'a1', parentId: 'c', ordinal: 1, pathKey: 'c0/a1' }),
      row({ id: 'a2', parentId: 'c', ordinal: 2, pathKey: 'c0/a2' }),
    ];
    const layout = layoutScaffoldTree(buildScaffoldTree(rows));
    const first = nodeAt(layout, 'c0/a1');
    const second = nodeAt(layout, 'c0/a2');
    expect(second?.position.x ?? 0).toBeGreaterThan(
      (first?.position.x ?? 0) + SCAFFOLD_ADSET_WIDTH,
    );
  });

  it('wires one edge per parent-child pair and no others', () => {
    const layout = layoutScaffoldTree(treeOf(2, 3));
    // 2 campaign->adset + 6 adset->ad
    expect(layout.edges).toHaveLength(8);
    expect(layout.edges.filter((edge) => edge.source === 'c0')).toHaveLength(2);
    expect(layout.edges.filter((edge) => edge.source === 'c0/a1')).toHaveLength(3);
    expect(new Set(layout.edges.map((edge) => edge.id)).size).toBe(layout.edges.length);
  });

  it('is deterministic', () => {
    const tree = treeOf(5, 2);
    expect(layoutScaffoldTree(tree)).toEqual(layoutScaffoldTree(tree));
  });

  it('lays out a 50 x 3 scaffold without collapsing or exploding', () => {
    const layout = layoutScaffoldTree(treeOf(50, 3));
    expect(layout.nodes).toHaveLength(1 + 50 + 150);
    const xs = layout.nodes.map((node) => node.position.x);
    expect(Math.max(...xs) - Math.min(...xs)).toBeLessThan(60_000);
  });

  it('returns nothing rather than throwing for an empty tree', () => {
    const layout = layoutScaffoldTree(buildScaffoldTree([]));
    expect(layout.nodes).toHaveLength(0);
    expect(layout.edges).toHaveLength(0);
  });

  /**
   * The hover panel is the only place a reader learns what a node delivers, and it can
   * read nothing but `node.data`. A level that reaches the canvas without its choices
   * renders a hover with a title and nothing under it — which looks like missing data
   * rather than a missing wire, so it is exactly the failure nobody reports.
   */
  it('carries the delivery detail every hover panel reads onto all three levels', () => {
    const payload = {
      objective: 'OUTCOME_SALES',
      optimization_goal: 'OFFSITE_CONVERSIONS',
      funnel_stage: 'prospecting',
      placement: { mode: 'advantage_plus' },
      targeting: { geo_locations: { countries: ['US'] } },
      audience_group_version_id: 'agv-1',
    };
    const rows: PaidScaffoldNodeRow[] = [
      row({
        id: 'c',
        level: 'campaign',
        ordinal: 0,
        pathKey: 'c0',
        productKey: null,
        angleKey: null,
        payload: { objective: 'OUTCOME_SALES' },
      }),
      row({ id: 'a1', parentId: 'c', ordinal: 1, pathKey: 'c0/a1', payload }),
      row({
        id: 'ad1',
        parentId: 'a1',
        level: 'ad',
        ordinal: 1,
        pathKey: 'c0/a1/ad1',
        conceptKey: 'hook-a',
      }),
    ];
    const layout = layoutScaffoldTree(buildScaffoldTree(rows));

    expect(nodeAt(layout, 'c0')?.data.choices).toMatchObject({ objective: 'OUTCOME_SALES' });
    expect(nodeAt(layout, 'c0/a1')?.data.derived).toMatchObject({
      audienceGroupVersionId: 'agv-1',
    });

    // An ad has no delivery settings of its own, so it must INHERIT its ad set's or a
    // reader hovering an ad cannot tell who sees it.
    const ad = nodeAt(layout, 'c0/a1/ad1');
    expect(ad?.data.choices).toMatchObject({ optimizationGoal: 'OFFSITE_CONVERSIONS' });
    expect(ad?.data.derived).toMatchObject({ audienceGroupVersionId: 'agv-1' });
    expect(ad?.data.angleKey).toBe('value');
  });
});
