// The Account structure view's figures: campaign → ad set → ad as an icicle, each node as wide
// as its share of the parent's spend over the last 30 days, and the portfolios laid over the ad
// sets they hold. An ad set a portfolio still holds but Meta no longer serves (its
// `missing_since` is set) is LOST: it keeps its width, because it spent, and it is hatched,
// because nothing optimizes it any more.
//
// When the ad sets a read returns do not cover their campaign's spend (a ranking stops at fifty
// rows), the rest of the campaign is one "Other ad sets" node rather than a gap, so a width
// always means spend. The same holds one level down for the ads of a zoomed campaign.

import {
  metaStructureSentence,
  type PortfolioAdset,
  type PortfolioListItem,
} from '@continuum/contracts';
import {
  type AccountResult,
  accountResult,
  type CostReference,
  costPer,
  costReference,
  formatShare,
  isDate,
  type MetaRankRow,
  type MetaResultKind,
  resultCount,
  totalsOf,
} from './metaLensModel';

export type StructureLevel = 'root' | 'campaign' | 'adset' | 'ad' | 'rest';

export type StructureNode = {
  id: string;
  level: StructureLevel;
  parentId: string | null;
  name: string;
  spend: number;
  results: number | null;
  costPerResult: number | null;
  /** The portfolio holding the ad set (an ad: its ad set's). */
  portfolioId: string | null;
  /** Held by a portfolio but gone from Meta's live fleet since this instant. */
  lostSince: string | null;
  lost: boolean;
};

export type PortfolioSlot = {
  id: string;
  name: string;
  /** The categorical color slot, 0–2, by spend held; null past the third. */
  slot: number | null;
  /** Spend of the ad sets it holds in this read, lost ones included. */
  spend: number;
};

export type LostGroup = {
  portfolioId: string;
  portfolioName: string;
  /** Every lost ad set of the portfolio, with or without spend in the read. */
  count: number;
  /** The latest of their missing_since. */
  since: string | null;
  /** Lost ad sets with no spend in the read: named, because they have no width to hatch. */
  unseen: string[];
};

export type StructureModel = {
  root: StructureNode;
  campaigns: StructureNode[];
  /** Each campaign's ad sets, spend first, with an "Other ad sets" node when they fall short. */
  children: Map<string, StructureNode[]>;
  totalSpend: number;
  adsetCount: number;
  result: AccountResult | null;
  reference: CostReference | null;
  portfolios: PortfolioSlot[];
  lost: LostGroup[];
  /** Spend of the ad sets a portfolio holds and Meta still serves; null without the rosters. */
  managedShare: number | null;
  /** Which portfolio holds each ad set, for the ad sets a zoom finds through their ads. */
  membership: ReadonlyMap<string, Membership>;
  takeaway: string;
};

export type Membership = { portfolioId: string; missingSince: string | null };

/** Which portfolio holds each ad set, from the enrolled rosters. */
function membershipOf(
  rosters: ReadonlyMap<string, readonly PortfolioAdset[]>,
): Map<string, Membership> {
  const byAdset = new Map<string, Membership>();
  for (const [portfolioId, roster] of rosters) {
    for (const member of roster) {
      if (!member.active) continue;
      byAdset.set(member.adset_id, {
        portfolioId,
        missingSince: isDate(member.missing_since) ? member.missing_since : null,
      });
    }
  }
  return byAdset;
}

/** Past this share of the parent, an uncovered remainder becomes its own node. */
const REST_SHARE = 0.01;

function restNode(parent: StructureNode, covered: number, name: string): StructureNode | null {
  const rest = parent.spend - covered;
  if (rest <= Math.max(0.5, parent.spend * REST_SHARE)) return null;
  return {
    id: `${parent.id}:rest`,
    level: 'rest',
    parentId: parent.id,
    name,
    spend: rest,
    results: null,
    costPerResult: null,
    portfolioId: null,
    lostSince: null,
    lost: false,
  };
}

function nodeOf(
  row: MetaRankRow,
  level: 'campaign' | 'adset' | 'ad',
  parentId: string | null,
  kind: MetaResultKind | null,
  membership: Membership | null,
): StructureNode {
  const results = kind ? resultCount(row, kind) : null;
  return {
    id: row.id,
    level,
    parentId,
    name: row.name,
    spend: row.spend,
    results,
    costPerResult: costPer(row.spend, results),
    portfolioId: membership?.portfolioId ?? null,
    lostSince: membership?.missingSince ?? null,
    lost: membership?.missingSince != null,
  };
}

const bySpend = (a: StructureNode, b: StructureNode) => b.spend - a.spend;

function lostGroups(
  membership: ReadonlyMap<string, Membership>,
  rosters: ReadonlyMap<string, readonly PortfolioAdset[]>,
  portfolios: readonly PortfolioListItem[],
  seen: ReadonlySet<string>,
): LostGroup[] {
  const groups: LostGroup[] = [];
  for (const portfolio of portfolios) {
    const roster = rosters.get(portfolio.id) ?? [];
    const lost = roster.filter(
      (member) => member.active && membership.get(member.adset_id)?.missingSince != null,
    );
    if (lost.length === 0) continue;
    const since = lost
      .map((member) => membership.get(member.adset_id)?.missingSince ?? null)
      .filter(isDate)
      .sort()
      .pop();
    groups.push({
      portfolioId: portfolio.id,
      portfolioName: portfolio.name,
      count: lost.length,
      since: since ?? null,
      unseen: lost
        .filter((member) => !seen.has(member.adset_id))
        .map((member) => member.adset_name ?? member.adset_id),
    });
  }
  return groups.sort((a, b) => b.count - a.count);
}

/** The figures the takeaway quotes, printed; the sentence is in contracts (metaViewsCopy). */
function takeawayOf(
  model: Pick<StructureModel, 'managedShare' | 'lost' | 'campaigns' | 'totalSpend'>,
): string {
  const lost = model.lost[0];
  const top = model.campaigns[0];
  return metaStructureSentence({
    managedShare: model.managedShare == null ? null : formatShare(model.managedShare),
    noneManaged: model.managedShare === 0,
    top: top
      ? {
          label: top.name,
          share: formatShare(model.totalSpend > 0 ? top.spend / model.totalSpend : null),
        }
      : null,
    lost: lost ? { count: lost.count, portfolio: lost.portfolioName, since: lost.since } : null,
  });
}

/**
 * The icicle's tree. `rosters` is null while the portfolios' rosters are not in: the structure
 * still draws, without the portfolios on it. Null when no campaign spent.
 */
export function buildStructure(args: {
  campaigns: readonly MetaRankRow[];
  adsets: readonly MetaRankRow[];
  portfolios: readonly PortfolioListItem[];
  rosters: ReadonlyMap<string, readonly PortfolioAdset[]> | null;
  rootName: string;
  /** False when the ad set read failed: each campaign's width then reads "Ad sets not read". */
  adsetsRead?: boolean;
}): StructureModel | null {
  const campaignRows = args.campaigns.filter((row) => row.spend > 0);
  if (campaignRows.length === 0) return null;
  const result = accountResult(campaignRows, args.portfolios);
  const kind = result?.kind ?? null;
  const sums = totalsOf(campaignRows, kind);
  const reference = costReference(result, costPer(sums.spend, sums.results));
  const membership = args.rosters ? membershipOf(args.rosters) : new Map<string, Membership>();

  const campaigns = campaignRows.map((row) => nodeOf(row, 'campaign', 'root', kind, null));
  campaigns.sort(bySpend);
  const known = new Set(campaigns.map((campaign) => campaign.id));
  const children = new Map<string, StructureNode[]>();
  const seen = new Set<string>();
  for (const row of args.adsets) {
    if (row.spend <= 0 || !row.campaignId || !known.has(row.campaignId)) continue;
    seen.add(row.id);
    const node = nodeOf(row, 'adset', row.campaignId, kind, membership.get(row.id) ?? null);
    children.set(row.campaignId, [...(children.get(row.campaignId) ?? []), node]);
  }
  for (const campaign of campaigns) {
    const own = (children.get(campaign.id) ?? []).sort(bySpend);
    const rest = restNode(
      campaign,
      own.reduce((sum, node) => sum + node.spend, 0),
      args.adsetsRead === false ? 'Ad sets not read' : 'Other ad sets',
    );
    children.set(campaign.id, rest ? [...own, rest] : own);
  }

  const held = new Map<string, number>();
  for (const nodes of children.values()) {
    for (const node of nodes) {
      if (node.portfolioId)
        held.set(node.portfolioId, (held.get(node.portfolioId) ?? 0) + node.spend);
    }
  }
  const portfolios: PortfolioSlot[] = args.portfolios
    .map((portfolio) => ({
      id: portfolio.id,
      name: portfolio.name,
      slot: null as number | null,
      spend: held.get(portfolio.id) ?? 0,
    }))
    .sort((a, b) => b.spend - a.spend)
    .map((portfolio, index) => ({
      ...portfolio,
      slot: portfolio.spend > 0 && index < 3 ? index : null,
    }));

  const managedSpend = [...children.values()]
    .flat()
    .filter((node) => node.portfolioId != null && !node.lost)
    .reduce((sum, node) => sum + node.spend, 0);
  const lost = args.rosters ? lostGroups(membership, args.rosters, args.portfolios, seen) : [];
  const model = {
    root: {
      id: 'root',
      level: 'root' as const,
      parentId: null,
      name: args.rootName,
      spend: sums.spend,
      results: sums.results,
      costPerResult: costPer(sums.spend, sums.results),
      portfolioId: null,
      lostSince: null,
      lost: false,
    },
    campaigns,
    children,
    totalSpend: sums.spend,
    adsetCount: seen.size,
    result,
    reference,
    portfolios,
    lost,
    managedShare: args.rosters && sums.spend > 0 ? managedSpend / sums.spend : null,
    membership,
  };
  return { ...model, takeaway: takeawayOf(model) };
}

/** One positioned node: `row` 0–2 from the top, `x` and `w` in percent of the width. */
export type IcicleCell = {
  node: StructureNode;
  row: number;
  x: number;
  w: number;
  visible: boolean;
};

function spread(
  nodes: readonly StructureNode[],
  parent: { x: number; w: number; spend: number },
  row: number,
): IcicleCell[] {
  let x = parent.x;
  return nodes.map((node) => {
    const w = parent.spend > 0 ? (node.spend / parent.spend) * parent.w : 0;
    const cell = { node, row, x, w, visible: true };
    x += w;
    return cell;
  });
}

/** The zoomed campaign's ad sets: the read's, plus any its ads name that the read did not
 *  return, then the uncovered rest. */
function zoomedAdsets(
  model: StructureModel,
  campaign: StructureNode,
  ads: readonly MetaRankRow[],
): StructureNode[] {
  const own = (model.children.get(campaign.id) ?? []).filter((node) => node.level === 'adset');
  const ids = new Set(own.map((node) => node.id));
  const extra = new Map<string, MetaRankRow[]>();
  for (const ad of ads) {
    if (!ad.adsetId || ids.has(ad.adsetId) || ad.spend <= 0) continue;
    extra.set(ad.adsetId, [...(extra.get(ad.adsetId) ?? []), ad]);
  }
  const kind = model.result?.kind ?? null;
  const found = [...extra].map(([adsetId, rows]): StructureNode => {
    const sums = totalsOf(rows, kind);
    const member = model.membership.get(adsetId);
    return {
      id: adsetId,
      level: 'adset',
      parentId: campaign.id,
      name: rows[0]?.adsetName ?? adsetId,
      spend: sums.spend,
      results: sums.results,
      costPerResult: costPer(sums.spend, sums.results),
      portfolioId: member?.portfolioId ?? null,
      lostSince: member?.missingSince ?? null,
      lost: member?.missingSince != null,
    };
  });
  const adsets = [...own, ...found].sort(bySpend);
  const rest = restNode(
    campaign,
    adsets.reduce((sum, node) => sum + node.spend, 0),
    'Other ad sets',
  );
  return rest ? [...adsets, rest] : adsets;
}

function adNodes(
  adset: StructureNode,
  ads: readonly MetaRankRow[],
  kind: MetaResultKind | null,
): StructureNode[] {
  const own = ads
    .filter((ad) => ad.adsetId === adset.id && ad.spend > 0)
    .map((ad) => ({
      ...nodeOf(ad, 'ad', adset.id, kind, null),
      portfolioId: adset.portfolioId,
      lostSince: adset.lostSince,
      lost: adset.lost,
    }))
    .sort(bySpend);
  if (adset.level !== 'adset') return own;
  const rest = restNode(
    adset,
    own.reduce((sum, node) => sum + node.spend, 0),
    'Other ads',
  );
  return rest ? [...own, rest] : own;
}

/**
 * Where every node sits. Unzoomed: the account, its campaigns, their ad sets. Zoomed on a
 * campaign: the campaign across the width, its ad sets, their ads (`ads`, null while they load).
 * Nodes outside the zoom stay in the list, collapsed and hidden, so they can animate back.
 */
export function layoutIcicle(
  model: StructureModel,
  focus: string | null,
  ads: readonly MetaRankRow[] | null,
): IcicleCell[] {
  const focused = focus ? model.campaigns.find((campaign) => campaign.id === focus) : undefined;
  const all = { x: 0, w: 100, spend: model.totalSpend };
  if (!focused) {
    const cells: IcicleCell[] = [{ node: model.root, row: 0, x: 0, w: 100, visible: true }];
    for (const campaign of spread(model.campaigns, all, 1)) {
      cells.push(campaign);
      cells.push(
        ...spread(
          model.children.get(campaign.node.id) ?? [],
          { ...campaign, spend: campaign.node.spend },
          2,
        ),
      );
    }
    return cells;
  }
  const cells: IcicleCell[] = [{ node: model.root, row: 0, x: 0, w: 100, visible: false }];
  const index = model.campaigns.indexOf(focused);
  model.campaigns.forEach((campaign, position) => {
    if (campaign === focused) return;
    const edge = position < index ? 0 : 100;
    cells.push({ node: campaign, row: 1, x: edge, w: 0, visible: false });
    for (const child of model.children.get(campaign.id) ?? []) {
      cells.push({ node: child, row: 2, x: edge, w: 0, visible: false });
    }
  });
  const whole = { x: 0, w: 100, spend: focused.spend };
  cells.push({ node: focused, row: 0, x: 0, w: 100, visible: true });
  const kind = model.result?.kind ?? null;
  const adsets = spread(zoomedAdsets(model, focused, ads ?? []), whole, 1);
  for (const adset of adsets) {
    cells.push(adset);
    if (ads) {
      cells.push(
        ...spread(adNodes(adset.node, ads, kind), { ...adset, spend: adset.node.spend }, 2),
      );
    }
  }
  return cells;
}
