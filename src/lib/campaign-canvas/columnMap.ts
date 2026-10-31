// The canvas's Map in columns (design C, phase 2, Ramiro 2026-10-31): campaign → ad sets → ads
// in three fixed columns that fit a 560–720 px companion pane at 100%, growing only downward.
// The old map spread ads sideways (24 ads ≈ 10,900 px, fitView at ~6% zoom); here an ad set's
// ads stack beside it and its creative and audience fold into the cards.
//
// Pure: the card model (projected from the one campaign model), the collapse of the
// unchanged branches, the layout, the reading order of the changes and the viewport math. The
// components only draw what this returns.

import type { LiveChangePreviewPayload } from '@continuum/contracts';
import type { CampaignCanvasEdge, CampaignCanvasNode } from '@/CampaignCanvas/types';
import {
  type CampaignViewModel,
  humanStatus,
  type LecturaAd,
  type LecturaMark,
  type LecturaRow,
  lecturaFromCanvasGraph,
  lecturaFromLiveChange,
  lecturaMoney,
  type ScaffoldMark,
} from './lectura';

export type MapCardLevel = 'campaign' | 'adset' | 'ad';

/** One box on the Map. Every line is already worded; the height follows from them. */
export type MapCard = {
  id: string;
  level: MapCardLevel;
  mark: LecturaMark;
  title: string;
  /** Meta's status in words ("Active", "Paused"), drawn dimmed beside the level; null for a draft. */
  status: string | null;
  /** Short fact lines: budget, objective, creative. */
  lines: string[];
  /** The folded audience, worded ("MX · 25-44 · women"); a click opens it. */
  audienceLine: string | null;
  /** Before → after, one per changed field. */
  rows: LecturaRow[];
  /** "copy of X", "stops with its campaign". */
  note: string | null;
  thumbnailUrl: string | null;
  /** Store nodes this card stands for besides itself (the folded audience / creative). */
  folded: { audienceId: string | null; creativeId: string | null };
};

export type MapAdSet = MapCard & { ads: MapCard[] };
export type MapCampaign = MapCard & { adSets: MapAdSet[] };

export type ColumnMapModel = { campaigns: MapCampaign[] };

/** Sizes of the companion's compact Map. 3 × 168 + 2 × 24 = 552 ≤ the 560 px narrowest pane. */
export const COLUMN_MAP = {
  nodeWidth: 168,
  columnGap: 24,
  /** Between two ads stacked under one ad set. */
  rowGap: 8,
  /** Between two ad set blocks. */
  blockGap: 20,
  /** Between two campaigns. */
  campaignGap: 48,
  collapsedHeight: 44,
  /** Padding the pane keeps around the map at the initial viewport. */
  panePadding: 4,
} as const;

/** The closest the "next change" control ever zooms out: a focused node stays readable. */
export const FOCUS_MIN_ZOOM = 0.8;

const LEVEL_COLUMN: Record<MapCardLevel | 'collapsed', number> = {
  campaign: 0,
  adset: 1,
  collapsed: 1,
  ad: 2,
};

export const columnX = (level: MapCardLevel | 'collapsed'): number =>
  LEVEL_COLUMN[level] * (COLUMN_MAP.nodeWidth + COLUMN_MAP.columnGap);

/** Total width of the three columns. */
export const COLUMN_MAP_WIDTH = columnX('ad') + COLUMN_MAP.nodeWidth;

// ---------------------------------------------------------------------------
// Card height: fixed per content, so the layout knows it without measuring and boxes can
// never overlap (the node renders at exactly this height, clamping its text).
// ---------------------------------------------------------------------------

const CARD = {
  padding: 20,
  header: 14,
  titleLine: 16,
  line: 15,
  row: 30,
  thumbnail: 40,
  /** Characters of 12 px semibold that safely fit one title line in a 168 px card. */
  titleCharsPerLine: 20,
} as const;

/**
 * How many lines the title wraps to (clamped at 2), by greedy word wrap. It errs long — an
 * over-estimate leaves a little air, an under-estimate would clip the line below the title.
 */
export const titleLinesOf = (title: string): 1 | 2 => {
  let line = 0;
  let lines = 1;
  for (const word of title.trim().split(/\s+/)) {
    const needed = line === 0 ? word.length : line + 1 + word.length;
    if (needed <= CARD.titleCharsPerLine) {
      line = needed;
      continue;
    }
    lines += 1;
    if (lines >= 2) return 2;
    line = word.length;
  }
  return lines > 1 ? 2 : 1;
};

export const cardHeight = (card: MapCard): number => {
  const text =
    CARD.padding +
    CARD.header +
    CARD.titleLine * titleLinesOf(card.title) +
    CARD.line * (card.lines.length + (card.note ? 1 : 0) + (card.audienceLine ? 1 : 0)) +
    CARD.row * card.rows.length;
  return card.thumbnailUrl ? Math.max(text, CARD.padding + CARD.thumbnail) : text;
};

// ---------------------------------------------------------------------------
// Only the changed branch
// ---------------------------------------------------------------------------

/** True when something on the map is proposed — a change, a pause or a new object. */
export const hasProposedChange = (model: ColumnMapModel): boolean =>
  model.campaigns.some(
    (campaign) =>
      campaign.mark !== 'unchanged' ||
      campaign.adSets.some(
        (adSet) => adSet.mark !== 'unchanged' || adSet.ads.some((ad) => ad.mark !== 'unchanged'),
      ),
  );

const branchUnchanged = (adSet: MapAdSet): boolean =>
  adSet.mark === 'unchanged' && adSet.ads.every((ad) => ad.mark === 'unchanged');

export type CollapsedGroup = {
  id: string;
  count: number;
  adSetIds: string[];
  /** True while the person has it open: its ad sets are drawn and it offers to fold them. */
  expanded: boolean;
};

export type ColumnSlot =
  | { kind: 'adset'; adSet: MapAdSet }
  | { kind: 'collapsed'; group: CollapsedGroup };

export type ColumnCampaignView = { campaign: MapCampaign; slots: ColumnSlot[] };

export const collapsedGroupId = (campaignId: string): string => `${campaignId}:unchanged`;

export const collapsedGroupLabel = (group: CollapsedGroup): string => {
  const noun = group.count === 1 ? 'unchanged ad set' : 'unchanged ad sets';
  return group.expanded ? `Hide ${group.count} ${noun}` : `+ ${group.count} ${noun}`;
};

/**
 * The campaign plus only the branches that change. Unchanged ad sets fold into one
 * "+ N unchanged ad sets" slot after the changed ones; a group in `expanded` draws them back
 * in their own order. Nothing folds when nothing is proposed (a scaffold opened by hand) or
 * when everything is new (a brand-new campaign: every branch IS the change).
 */
export const collapseUnchangedBranches = (
  model: ColumnMapModel,
  expanded: ReadonlySet<string> = new Set(),
): ColumnCampaignView[] => {
  const proposed = hasProposedChange(model);
  return model.campaigns.map((campaign) => {
    const unchanged = campaign.adSets.filter(branchUnchanged);
    if (!proposed || unchanged.length === 0) {
      return {
        campaign,
        slots: campaign.adSets.map((adSet) => ({ kind: 'adset' as const, adSet })),
      };
    }
    const id = collapsedGroupId(campaign.id);
    const open = expanded.has(id);
    const group: CollapsedGroup = {
      id,
      count: unchanged.length,
      adSetIds: unchanged.map((adSet) => adSet.id),
      expanded: open,
    };
    const shown = open
      ? campaign.adSets
      : campaign.adSets.filter((adSet) => !branchUnchanged(adSet));
    return {
      campaign,
      slots: [
        ...shown.map((adSet) => ({ kind: 'adset' as const, adSet })),
        { kind: 'collapsed' as const, group },
      ],
    };
  });
};

// ---------------------------------------------------------------------------
// Layout
// ---------------------------------------------------------------------------

export type ColumnPlacement = {
  id: string;
  kind: MapCardLevel | 'collapsed';
  x: number;
  y: number;
  width: number;
  height: number;
  /** The parent the edge comes from: campaign for an ad set, ad set for an ad. */
  parentId: string | null;
};

export type ColumnLayout = { placements: ColumnPlacement[]; width: number; height: number };

/**
 * Three fixed columns. Each ad set owns a row block: the ad set at its top, its ads stacked
 * beside it from the same y; the block is as tall as the taller of the two. A campaign sits
 * at the top of its first block. Nothing shares a column's y range, so nothing overlaps.
 */
export const layoutColumns = (views: readonly ColumnCampaignView[]): ColumnLayout => {
  const placements: ColumnPlacement[] = [];
  const width = COLUMN_MAP.nodeWidth;
  let y = 0;
  views.forEach((view, campaignIndex) => {
    if (campaignIndex > 0) y += COLUMN_MAP.campaignGap;
    const top = y;
    const campaignHeight = cardHeight(view.campaign);
    placements.push({
      id: view.campaign.id,
      kind: 'campaign',
      x: columnX('campaign'),
      y: top,
      width,
      height: campaignHeight,
      parentId: null,
    });
    view.slots.forEach((slot, slotIndex) => {
      if (slotIndex > 0) y += COLUMN_MAP.blockGap;
      if (slot.kind === 'collapsed') {
        placements.push({
          id: slot.group.id,
          kind: 'collapsed',
          x: columnX('collapsed'),
          y,
          width,
          height: COLUMN_MAP.collapsedHeight,
          parentId: view.campaign.id,
        });
        y += COLUMN_MAP.collapsedHeight;
        return;
      }
      const { adSet } = slot;
      const adSetHeight = cardHeight(adSet);
      placements.push({
        id: adSet.id,
        kind: 'adset',
        x: columnX('adset'),
        y,
        width,
        height: adSetHeight,
        parentId: view.campaign.id,
      });
      let adY = y;
      adSet.ads.forEach((ad, adIndex) => {
        if (adIndex > 0) adY += COLUMN_MAP.rowGap;
        const height = cardHeight(ad);
        placements.push({
          id: ad.id,
          kind: 'ad',
          x: columnX('ad'),
          y: adY,
          width,
          height,
          parentId: adSet.id,
        });
        adY += height;
      });
      y = Math.max(y + adSetHeight, adY);
    });
    y = Math.max(y, top + campaignHeight);
  });
  return { placements, width: COLUMN_MAP_WIDTH, height: y };
};

// ---------------------------------------------------------------------------
// "Change 1 of 3 →"
// ---------------------------------------------------------------------------

/**
 * Every changed node in reading order: the campaign, then each ad set top to bottom followed
 * by its changed ads. The ads of a NEW ad set are part of that one change, not changes of
 * their own (the Lectura counts them the same way).
 */
export const changeOrder = (model: ColumnMapModel): string[] =>
  model.campaigns.flatMap((campaign) => [
    ...(campaign.mark !== 'unchanged' ? [campaign.id] : []),
    ...campaign.adSets.flatMap((adSet) => [
      ...(adSet.mark !== 'unchanged' ? [adSet.id] : []),
      ...(adSet.mark === 'added'
        ? []
        : adSet.ads.filter((ad) => ad.mark !== 'unchanged').map((ad) => ad.id)),
    ]),
  ]);

/** Wraps: after the last change comes the first again. */
export const stepChange = (index: number, total: number, direction: 1 | -1 = 1): number =>
  total === 0 ? 0 : (((index + direction) % total) + total) % total;

export const changeCounterLabel = (index: number, total: number): string =>
  total === 0 ? 'No changes' : `Change ${index + 1} of ${total}`;

// ---------------------------------------------------------------------------
// Viewport
// ---------------------------------------------------------------------------

export type PaneSize = { width: number; height: number };
export type Viewport = { x: number; y: number; zoom: number };

/**
 * The map's full width at the largest zoom ≤ 1 that fits the pane, top-aligned below
 * `topInset`. This is also what "Fit to screen" does in columns: the map grows downward, so
 * fitting its height would shrink 24 ads to unreadable; fitting the width keeps them legible.
 */
export const initialColumnViewport = (
  pane: PaneSize,
  mapWidth = COLUMN_MAP_WIDTH,
  topInset = 0,
): Viewport => {
  const available = Math.max(1, pane.width - COLUMN_MAP.panePadding * 2);
  const zoom = Math.min(1, available / mapWidth);
  return { x: (pane.width - mapWidth * zoom) / 2, y: COLUMN_MAP.panePadding * 4 + topInset, zoom };
};

/** The minimap's footprint in the pane's bottom-right corner: 64 px wide plus its margins. */
export const MINIMAP_FOOTPRINT = 64 + 2 * 8;

/**
 * Below this pane width the minimap would sit on the ad column (the columns are centred, so
 * the gutter on each side must hold it); it is left out rather than covering a card.
 */
export const MINIMAP_MIN_PANE_WIDTH = COLUMN_MAP_WIDTH + 2 * MINIMAP_FOOTPRINT;

export const showsMinimap = (pane: PaneSize | null): boolean =>
  pane !== null && pane.width >= MINIMAP_MIN_PANE_WIDTH;

/** Where an edge leaves and enters a card: level with the title, not the card's middle. */
export const EDGE_ANCHOR_TOP = 22;

/**
 * One trunk per parent: out of the parent's side, a short stub to a vertical bus half a column
 * gap away, down the bus, and a short stub into each child. Every child of one parent shares
 * the bus x, so their lines lie on one trunk instead of zig-zagging; a child level with its
 * parent is one straight line. Corners are rounded by `radius`.
 */
export const busEdgePath = (
  source: { x: number; y: number },
  target: { x: number; y: number },
  radius = 6,
): string => {
  const busX = source.x + COLUMN_MAP.columnGap / 2;
  const dy = target.y - source.y;
  if (Math.abs(dy) < 1) return `M ${source.x} ${source.y} H ${target.x}`;
  const r = Math.min(radius, Math.abs(dy) / 2, COLUMN_MAP.columnGap / 2);
  const down = Math.sign(dy);
  return [
    `M ${source.x} ${source.y}`,
    `H ${busX - r}`,
    `Q ${busX} ${source.y} ${busX} ${source.y + down * r}`,
    `V ${target.y - down * r}`,
    `Q ${busX} ${target.y} ${busX + r} ${target.y}`,
    `H ${target.x}`,
  ].join(' ');
};

/**
 * Where "next change" takes the viewport: the node centred vertically at a zoom that keeps it
 * readable — the fit-to-width zoom when that is ≥ 0.8, else 0.8 with the node centred
 * horizontally too (a 375 px pane cannot show all three columns readably).
 */
export const focusViewport = (
  placement: Pick<ColumnPlacement, 'x' | 'y' | 'width' | 'height'>,
  pane: PaneSize,
  mapWidth = COLUMN_MAP_WIDTH,
): Viewport => {
  const fit = initialColumnViewport(pane, mapWidth);
  const zoom = Math.max(FOCUS_MIN_ZOOM, fit.zoom);
  const centreY = placement.y + placement.height / 2;
  const x = zoom === fit.zoom ? fit.x : pane.width / 2 - (placement.x + placement.width / 2) * zoom;
  return { x, y: pane.height / 2 - centreY * zoom, zoom };
};

// ---------------------------------------------------------------------------
// Card models: projected from the one campaign model (lectura.ts), never read from a payload
// ---------------------------------------------------------------------------

const factLine = (...parts: (string | null | undefined)[]): string[] => {
  const line = parts.filter((part): part is string => Boolean(part)).join(' · ');
  return line ? [line] : [];
};

const perDay = (minor: number | null, currency: string | null): string | null => {
  const text = lecturaMoney(minor, currency);
  return text ? `${text}/day` : null;
};

const shownRows = (rows: LecturaRow[]): LecturaRow[] =>
  rows.filter((row) => row.field !== 'status');

const creativeLine = (ad: LecturaAd): string =>
  ad.creativeKind
    ? ad.creativeKind.charAt(0).toUpperCase() + ad.creativeKind.slice(1)
    : 'No creative yet';

/**
 * The Map's cards for a campaign model. The status is its own dimmed word ("Active"), not a
 * fact line; a live preview's ad set says what it was copied from or that it stops with its
 * campaign; a scaffold's audience and creative fold into their ad set and ad, which keep the
 * store ids so a click still opens them.
 */
export const columnMapFromView = (model: CampaignViewModel): ColumnMapModel => {
  const { currency } = model;
  const live = model.source === 'live';
  return {
    campaigns: model.campaigns.map(
      (campaign): MapCampaign => ({
        id: campaign.id,
        level: 'campaign',
        mark: campaign.mark,
        title: campaign.name,
        status: humanStatus(campaign.status),
        lines: factLine(campaign.objective, perDay(campaign.budgetMinor, currency)),
        audienceLine: null,
        rows: shownRows(campaign.rows),
        note: null,
        thumbnailUrl: null,
        folded: NO_FOLD,
        adSets: campaign.adSets.map(
          (adSet): MapAdSet => ({
            id: adSet.id,
            level: 'adset',
            mark: adSet.mark,
            title: adSet.name,
            status: humanStatus(adSet.status),
            lines: factLine(perDay(adSet.budgetMinor, currency)),
            audienceLine: adSet.audience,
            rows: shownRows(adSet.rows),
            note: adSet.basedOnName
              ? `copy of ${adSet.basedOnName}`
              : adSet.stopsWithParent
                ? 'stops with its campaign'
                : null,
            thumbnailUrl: null,
            folded: { audienceId: adSet.audienceId, creativeId: null },
            ads: adSet.ads.map(
              (ad): MapCard => ({
                id: ad.id,
                level: 'ad',
                mark: ad.mark,
                title: ad.name,
                status: humanStatus(ad.status),
                lines: live ? factLine(perDay(ad.budgetMinor, currency)) : [creativeLine(ad)],
                audienceLine: null,
                rows: shownRows(ad.rows),
                note: ad.stops ? 'stops with its ad set' : null,
                thumbnailUrl: ad.thumbnailUrl,
                folded: { audienceId: null, creativeId: ad.creativeId },
              }),
            ),
          }),
        ),
      }),
    ),
  };
};

const NO_FOLD = { audienceId: null, creativeId: null } as const;

/** A pending edit to a live campaign, with Meta's own marks. */
export const columnMapFromLiveChange = (preview: LiveChangePreviewPayload): ColumnMapModel =>
  columnMapFromView(lecturaFromLiveChange(preview));

/**
 * The companion's own graph (the scaffold store). A new campaign carries no marks — what it
 * shows is all proposed, not a diff — so nothing folds; a campaign COPY marks the ad sets it
 * adds (`scaffoldMarksOf`), so its copied ones fold and "next change" walks the new ones.
 */
export const columnMapFromCanvasGraph = (
  nodes: readonly CampaignCanvasNode[],
  edges: readonly CampaignCanvasEdge[],
  marks?: ReadonlyMap<string, ScaffoldMark>,
): ColumnMapModel => columnMapFromView(lecturaFromCanvasGraph(nodes, edges, marks));

/** Every card of the model by id, for the node components. */
export const cardsById = (model: ColumnMapModel): Map<string, MapCard> => {
  const cards = new Map<string, MapCard>();
  for (const campaign of model.campaigns) {
    cards.set(campaign.id, campaign);
    for (const adSet of campaign.adSets) {
      cards.set(adSet.id, adSet);
      for (const ad of adSet.ads) cards.set(ad.id, ad);
    }
  }
  return cards;
};

/**
 * True when every node of the graph has a place in the columns — as a card, or folded into
 * one. A node that hangs off nothing (an ad set dropped on the canvas by hand, an audience
 * no ad set reads) has no column; the Map then keeps the free layout so it is never hidden.
 */
export const columnsShowEveryNode = (
  model: ColumnMapModel,
  nodes: readonly Pick<CampaignCanvasNode, 'id'>[],
): boolean => {
  if (model.campaigns.length === 0) return false;
  const shown = new Set<string>();
  for (const card of cardsById(model).values()) {
    shown.add(card.id);
    if (card.folded.audienceId) shown.add(card.folded.audienceId);
    if (card.folded.creativeId) shown.add(card.folded.creativeId);
  }
  return nodes.every((node) => shown.has(node.id));
};
