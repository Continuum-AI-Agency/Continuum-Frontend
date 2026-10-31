import { describe, expect, it } from 'bun:test';
import type { LiveChangePreviewPayload } from '@continuum/contracts';
import {
  busEdgePath,
  COLUMN_MAP,
  COLUMN_MAP_WIDTH,
  type ColumnPlacement,
  cardHeight,
  changeCounterLabel,
  changeOrder,
  collapsedGroupId,
  collapsedGroupLabel,
  collapseUnchangedBranches,
  columnMapFromCanvasGraph,
  columnMapFromLiveChange,
  columnMapFromView,
  columnsShowEveryNode,
  columnX,
  FOCUS_MIN_ZOOM,
  focusViewport,
  initialColumnViewport,
  layoutColumns,
  showsMinimap,
  stepChange,
  titleLinesOf,
} from './columnMap';
import {
  LIVE_24_ADS_PREVIEW,
  SCAFFOLD_24_ADS,
  SCAFFOLD_COPY_WITH_TESTS,
} from './columnMap.fixtures';
import {
  humanStatus,
  lecturaFromCanvasGraph,
  lecturaFromLiveChange,
  scaffoldMarksOf,
} from './lectura';
import { LIVE_BATCH_PREVIEW } from './lectura.fixtures';

const overlaps = (a: ColumnPlacement, b: ColumnPlacement) =>
  a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;

const expectNoOverlap = (placements: ColumnPlacement[]) => {
  for (let i = 0; i < placements.length; i += 1) {
    for (let j = i + 1; j < placements.length; j += 1) {
      const a = placements[i] as ColumnPlacement;
      const b = placements[j] as ColumnPlacement;
      if (overlaps(a, b)) throw new Error(`${a.id} overlaps ${b.id}`);
    }
  }
};

describe('columns', () => {
  it('puts campaign, ad sets and ads in three fixed columns left to right', () => {
    expect(columnX('campaign')).toBe(0);
    expect(columnX('adset')).toBe(COLUMN_MAP.nodeWidth + COLUMN_MAP.columnGap);
    expect(columnX('ad')).toBe(2 * (COLUMN_MAP.nodeWidth + COLUMN_MAP.columnGap));
    expect(columnX('collapsed')).toBe(columnX('adset'));
  });

  it('fits the narrowest companion pane (560 px) at 100%', () => {
    expect(COLUMN_MAP_WIDTH).toBeLessThanOrEqual(560);
  });
});

describe('layoutColumns — 24 ads across 5 ad sets', () => {
  const model = columnMapFromCanvasGraph(SCAFFOLD_24_ADS.nodes, SCAFFOLD_24_ADS.edges);
  const layout = layoutColumns(collapseUnchangedBranches(model));

  it('places every campaign, ad set and ad once; creatives and audiences fold into cards', () => {
    const kinds = layout.placements.map((placement) => placement.kind);
    expect(kinds.filter((kind) => kind === 'campaign')).toHaveLength(1);
    expect(kinds.filter((kind) => kind === 'adset')).toHaveLength(5);
    expect(kinds.filter((kind) => kind === 'ad')).toHaveLength(24);
    expect(new Set(layout.placements.map((placement) => placement.id)).size).toBe(30);
  });

  it('is no wider than the pane, whatever the ad count: it grows only downward', () => {
    const right = Math.max(...layout.placements.map((placement) => placement.x + placement.width));
    expect(right).toBe(COLUMN_MAP_WIDTH);
    expect(layout.width).toBeLessThanOrEqual(560);
    expect(layout.height).toBeGreaterThan(layout.width);
  });

  it('never overlaps two boxes', () => {
    expectNoOverlap(layout.placements);
  });

  it("stacks each ad set's ads beside it, starting on the ad set's own row", () => {
    const byId = new Map(layout.placements.map((placement) => [placement.id, placement]));
    for (const adSet of layout.placements.filter((placement) => placement.kind === 'adset')) {
      const ads = layout.placements.filter((placement) => placement.parentId === adSet.id);
      expect(ads[0]?.y).toBe(adSet.y);
      ads.forEach((ad, index) => {
        if (index === 0) return;
        const previous = ads[index - 1] as ColumnPlacement;
        expect(ad.y).toBe(previous.y + previous.height + COLUMN_MAP.rowGap);
      });
      // The next ad set starts below the taller of the ad set and its stack.
      const blockBottom = Math.max(adSet.y + adSet.height, ...ads.map((ad) => ad.y + ad.height));
      const next = layout.placements.find(
        (placement) => placement.kind === 'adset' && placement.y > adSet.y,
      );
      if (next) expect(next.y).toBe(blockBottom + COLUMN_MAP.blockGap);
    }
    expect(byId.get('c')?.y).toBe(0);
  });

  it('keeps the folded audience and creative ids, so a click still selects them', () => {
    const adSet = model.campaigns[0]?.adSets[0];
    expect(adSet?.folded.audienceId).toBe('s1:audience');
    expect(adSet?.audienceLine).toBe('MX · 25-44 · women');
    expect(adSet?.ads[0]?.folded.creativeId).toBe('s1a1:creative');
    expect(adSet?.ads[0]?.lines).toEqual(['Video']);
  });
});

describe('only the changed branch', () => {
  it('folds the unchanged ad sets of a live change into one node after the changed ones', () => {
    const views = collapseUnchangedBranches(columnMapFromLiveChange(LIVE_24_ADS_PREVIEW));
    const slots = views[0]?.slots ?? [];
    expect(slots.map((slot) => (slot.kind === 'adset' ? slot.adSet.id : slot.group.id))).toEqual([
      'as1',
      'as3',
      'as4',
      collapsedGroupId('c1'),
    ]);
    const group = slots.at(-1);
    expect(group?.kind === 'collapsed' && group.group.adSetIds).toEqual(['as2', 'as5']);
    expect(group?.kind === 'collapsed' && collapsedGroupLabel(group.group)).toBe(
      '+ 2 unchanged ad sets',
    );
  });

  it('draws them back, in their own order, once the group is expanded', () => {
    const views = collapseUnchangedBranches(
      columnMapFromLiveChange(LIVE_24_ADS_PREVIEW),
      new Set([collapsedGroupId('c1')]),
    );
    const slots = views[0]?.slots ?? [];
    expect(slots.map((slot) => (slot.kind === 'adset' ? slot.adSet.id : 'group'))).toEqual([
      'as1',
      'as2',
      'as3',
      'as4',
      'as5',
      'group',
    ]);
    const group = slots.at(-1);
    expect(group?.kind === 'collapsed' && collapsedGroupLabel(group.group)).toBe(
      'Hide 2 unchanged ad sets',
    );
  });

  it('folds nothing for a scaffold opened by hand: nothing on it is a diff', () => {
    const views = collapseUnchangedBranches(
      columnMapFromCanvasGraph(SCAFFOLD_24_ADS.nodes, SCAFFOLD_24_ADS.edges),
    );
    expect(views[0]?.slots.every((slot) => slot.kind === 'adset')).toBe(true);
    expect(views[0]?.slots).toHaveLength(5);
  });

  it('folds nothing for a brand-new campaign: every branch is the change', () => {
    const allNew: LiveChangePreviewPayload = {
      ...LIVE_BATCH_PREVIEW,
      nodes: LIVE_BATCH_PREVIEW.nodes.map((node) => ({ ...node, mark: 'added' as const })),
    };
    const views = collapseUnchangedBranches(columnMapFromLiveChange(allNew));
    expect(views[0]?.slots.every((slot) => slot.kind === 'adset')).toBe(true);
  });

  it('lays the folded group out in the ad set column, without overlap', () => {
    const layout = layoutColumns(
      collapseUnchangedBranches(columnMapFromLiveChange(LIVE_24_ADS_PREVIEW)),
    );
    const group = layout.placements.find((placement) => placement.kind === 'collapsed');
    expect(group?.x).toBe(columnX('adset'));
    expect(group?.height).toBe(COLUMN_MAP.collapsedHeight);
    expect(layout.placements.filter((placement) => placement.kind === 'ad')).toHaveLength(
      6 + 5 + 4,
    );
    expectNoOverlap(layout.placements);
  });
});

describe('next change', () => {
  it('reads the changes top to bottom: an ad paused on its own, a pause, a raise', () => {
    expect(changeOrder(columnMapFromLiveChange(LIVE_24_ADS_PREVIEW))).toEqual([
      'as1ad3',
      'as3',
      'as4',
    ]);
  });

  it('counts a new ad set once, not once per ad inside it', () => {
    expect(changeOrder(columnMapFromLiveChange(LIVE_BATCH_PREVIEW))).toEqual([
      '2202',
      '2203',
      'new:1',
    ]);
  });

  it('wraps around and words the counter', () => {
    expect(stepChange(0, 3)).toBe(1);
    expect(stepChange(2, 3)).toBe(0);
    expect(stepChange(0, 3, -1)).toBe(2);
    expect(stepChange(0, 0)).toBe(0);
    expect(changeCounterLabel(0, 3)).toBe('Change 1 of 3');
    expect(changeCounterLabel(0, 0)).toBe('No changes');
  });
});

describe('viewport', () => {
  it('opens at 100% with the columns centred when the pane is wide enough', () => {
    const viewport = initialColumnViewport({ width: 640, height: 700 });
    expect(viewport.zoom).toBe(1);
    expect(viewport.x).toBe((640 - COLUMN_MAP_WIDTH) / 2);
  });

  it('shrinks to fit a narrow pane instead of sprawling past it', () => {
    const viewport = initialColumnViewport({ width: 375, height: 700 });
    expect(viewport.zoom).toBeLessThan(1);
    expect(COLUMN_MAP_WIDTH * viewport.zoom).toBeLessThanOrEqual(375);
  });

  it('focuses a change at a readable zoom (≥ 0.8), centred on it', () => {
    const node = { x: columnX('ad'), y: 1400, width: COLUMN_MAP.nodeWidth, height: 70 };
    for (const pane of [
      { width: 640, height: 700 },
      { width: 375, height: 600 },
    ]) {
      const viewport = focusViewport(node, pane);
      expect(viewport.zoom).toBeGreaterThanOrEqual(FOCUS_MIN_ZOOM);
      const screenY = (node.y + node.height / 2) * viewport.zoom + viewport.y;
      expect(Math.abs(screenY - pane.height / 2)).toBeLessThan(1);
      const left = node.x * viewport.zoom + viewport.x;
      const right = (node.x + node.width) * viewport.zoom + viewport.x;
      expect(left).toBeGreaterThanOrEqual(0);
      expect(right).toBeLessThanOrEqual(pane.width);
    }
  });
});

describe('card heights', () => {
  it('wraps titles by word, erring long', () => {
    expect(titleLinesOf('Reel clase spinning')).toBe(1);
    expect(titleLinesOf('Imagen promo noviembre')).toBe(2);
    expect(titleLinesOf('ZAPOPAN // MENSAJES // Noviembre 2026')).toBe(2);
    expect(titleLinesOf('Supercalifragilisticexpialidocious')).toBe(2);
  });

  it('opens below the next-change control when there is one', () => {
    const plain = initialColumnViewport({ width: 640, height: 700 });
    const inset = initialColumnViewport({ width: 640, height: 700 }, COLUMN_MAP_WIDTH, 48);
    expect(inset.y - plain.y).toBe(48);
  });

  it('grow with the lines a card carries, so the layout never needs to measure', () => {
    const [campaign] = columnMapFromLiveChange(LIVE_24_ADS_PREVIEW).campaigns;
    const raised = campaign?.adSets[3];
    const kept = campaign?.adSets[1];
    expect(raised?.rows).toHaveLength(1);
    if (!raised || !kept) throw new Error('fixture lost its ad sets');
    expect(cardHeight(raised)).toBeGreaterThan(cardHeight(kept));
  });
});

describe('columnsShowEveryNode', () => {
  it('holds for a hydrated scaffold, where every audience and creative folds into a card', () => {
    const model = columnMapFromCanvasGraph(SCAFFOLD_24_ADS.nodes, SCAFFOLD_24_ADS.edges);
    expect(columnsShowEveryNode(model, SCAFFOLD_24_ADS.nodes)).toBe(true);
  });

  it('fails for a node that hangs off nothing, so the Map keeps the free layout', () => {
    const nodes = [...SCAFFOLD_24_ADS.nodes, { id: 'loose-ad-set' }];
    const model = columnMapFromCanvasGraph(SCAFFOLD_24_ADS.nodes, SCAFFOLD_24_ADS.edges);
    expect(columnsShowEveryNode(model, nodes)).toBe(false);
    expect(columnsShowEveryNode({ campaigns: [] }, [])).toBe(false);
  });
});

describe('one campaign model: the Map is projected from it', () => {
  it('draws the same cards from the model as from the payload', () => {
    expect(columnMapFromView(lecturaFromLiveChange(LIVE_24_ADS_PREVIEW))).toEqual(
      columnMapFromLiveChange(LIVE_24_ADS_PREVIEW),
    );
    expect(
      columnMapFromView(lecturaFromCanvasGraph(SCAFFOLD_24_ADS.nodes, SCAFFOLD_24_ADS.edges)),
    ).toEqual(columnMapFromCanvasGraph(SCAFFOLD_24_ADS.nodes, SCAFFOLD_24_ADS.edges));
  });

  it('words the status for a person and keeps it out of the fact lines', () => {
    const [campaign] = columnMapFromLiveChange(LIVE_24_ADS_PREVIEW).campaigns;
    const adSet = campaign?.adSets[0];
    expect(adSet?.status).toBe('Active');
    expect(adSet?.lines).toEqual(['$200 MXN/day']);
    expect(humanStatus('CAMPAIGN_PAUSED')).toBe('Campaign paused');
    expect(humanStatus('WITH_SOME_NEW_STATE')).toBe('With some new state');
    expect(humanStatus(null)).toBeNull();
  });
});

describe('marks for a campaign copy', () => {
  const { nodes, edges } = SCAFFOLD_COPY_WITH_TESTS;

  it('marks the new test ad sets (and their ads) added, the copied ones not at all', () => {
    const marks = scaffoldMarksOf(nodes, edges);
    expect([...marks.entries()].filter(([, m]) => m.mark === 'added').map(([id]) => id)).toEqual([
      's4',
      's4a1',
      's4a2',
      's4a3',
      's4a4',
      's5',
      's5a1',
      's5a2',
      's5a3',
      's5a4',
    ]);
    expect(marks.has('s1')).toBe(false);
  });

  it('folds the copied ad sets and walks only the new ones', () => {
    const model = columnMapFromCanvasGraph(nodes, edges);
    const slots = collapseUnchangedBranches(model)[0]?.slots ?? [];
    expect(slots.map((slot) => (slot.kind === 'adset' ? slot.adSet.id : slot.group.id))).toEqual([
      's4',
      's5',
      collapsedGroupId('c'),
    ]);
    expect(changeOrder(model)).toEqual(['s4', 's5']);
  });

  it('puts the new ad sets first in Read, as changes', () => {
    const view = lecturaFromCanvasGraph(nodes, edges);
    expect(view.changes.map((change) => [change.id, change.mark, change.title])).toEqual([
      ['s4', 'added', 'New ad set'],
      ['s5', 'added', 'New ad set'],
    ]);
    expect(view.split.filter((slice) => slice.tone === 'new').map((slice) => slice.id)).toEqual([
      's4',
      's5',
    ]);
  });

  it('marks nothing on a brand-new campaign, so nothing folds', () => {
    expect(scaffoldMarksOf(SCAFFOLD_24_ADS.nodes, SCAFFOLD_24_ADS.edges).size).toBe(0);
  });

  it("takes the Backend's per-node diff over the graph's own reading when it has one", () => {
    const marks = scaffoldMarksOf(nodes, edges, {
      source: { kind: 'campaign', id: '120', name: 'ZAPOPAN live' },
      entries: [
        {
          path_key: 'c0/a0',
          source_path_key: 'c0/a0',
          level: 'adset',
          name: 'Mujeres',
          change: 'changed',
          fields: [{ key: 'daily_budget', label: 'Daily budget', before: 200, after: 300 }],
        },
        {
          path_key: 'c0/a3',
          source_path_key: null,
          level: 'adset',
          name: 'Test',
          change: 'added',
          fields: [],
        },
        {
          path_key: 'c0/a9',
          source_path_key: 'c0/a9',
          level: 'adset',
          name: 'Gone',
          change: 'removed',
          fields: [],
        },
      ],
    });
    expect(marks.get('s1')).toEqual({
      mark: 'changed',
      rows: [{ field: 'daily_budget', label: 'Daily budget', before: '200', after: '300' }],
    });
    expect(marks.get('s4')?.mark).toBe('added');
    expect(marks.has('s5')).toBe(false);
  });
});

describe('polish: trunk edges, fit to width, minimap', () => {
  it('draws one straight line to a child level with its parent', () => {
    expect(busEdgePath({ x: 168, y: 22 }, { x: 192, y: 22 })).toBe('M 168 22 H 192');
  });

  it('runs every child of one parent down the same bus, half a column gap out', () => {
    const busX = 168 + COLUMN_MAP.columnGap / 2;
    for (const y of [120, 400, 900]) {
      const path = busEdgePath({ x: 168, y: 22 }, { x: 192, y });
      expect(path).toContain(`V ${y - 6}`);
      expect(path).toContain(`Q ${busX} ${y} ${busX + 6} ${y}`);
      expect(path.endsWith('H 192')).toBe(true);
    }
  });

  it('hides the minimap whenever it would cover the ad column', () => {
    expect(showsMinimap(null)).toBe(false);
    expect(showsMinimap({ width: 560, height: 800 })).toBe(false);
    // 640: the centred columns leave a 44 px gutter, too narrow for the 80 px minimap.
    expect(showsMinimap({ width: 640, height: 800 })).toBe(false);
    expect(showsMinimap({ width: 720, height: 800 })).toBe(true);
  });

  it('fits the width, never the height: a tall map keeps the readable zoom', () => {
    const viewport = initialColumnViewport({ width: 640, height: 300 });
    expect(viewport.zoom).toBe(1);
  });
});
