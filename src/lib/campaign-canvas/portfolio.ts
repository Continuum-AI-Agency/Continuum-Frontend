// A change that touches several campaigns at once, read as one portfolio (design C, option 29).
//
// One Jaina turn can carry several proposals: "copy every active campaign with 2 test ad sets"
// streams one `paid.campaign_structure` part per copied campaign, and a batch of live edits
// streams one `paid.live_change_preview` part per approval. The projection
// (`toJainaChatMessage`) keeps them all, in order, on the one message (`campaignStructures`,
// `liveChangePreviews`); the message's single `scaffold` is only the LAST proposal's card.
// This file groups those parts into one row per campaign — its daily total before → after and
// its change counts by mark — so the chat can say "4 campaigns · 9 changes" and the canvas can
// list them before opening one. Pure: no React, no store.

import type {
  CampaignStructurePayload,
  LiveChangeNode,
  LiveChangePreviewPayload,
} from '@continuum/contracts';
import {
  type CampaignViewModel,
  campaignViewFromLiveChange,
  campaignViewFromStructure,
} from './lectura';
import type { CampaignPlatform } from './platformLabels';

/** Where a portfolio row's campaign came from, so a tap opens the right drawing of it. */
export type PortfolioSource =
  | {
      kind: 'live';
      campaignId: string;
      /** Every preview part (one per approval) that touches this campaign, in order. */
      partIds: string[];
    }
  | {
      kind: 'scaffold';
      parentScaffoldId: string;
      /** `paid_scaffold_versions.id` of the version drawn. */
      versionId: string;
      version: number;
      partId: string;
    };

export type PortfolioMarkCounts = { changed: number; added: number; paused: number };

export type PortfolioRow = {
  /** Stable across re-renders: `live:<campaign id>` or `scaffold:<parent scaffold id>`. */
  id: string;
  name: string;
  platform: CampaignPlatform;
  currency: string | null;
  source: PortfolioSource;
  /** The campaign's own model: what a tap on the row opens, in Read and in the Map. */
  model: CampaignViewModel;
  /** Delivering daily budget today and after the change, minor units; null when it has none. */
  before: number | null;
  after: number | null;
  /** What new paused objects (a copy, a test ad set) would add once someone activates them. */
  onceActivated: number;
  counts: PortfolioMarkCounts;
  changeCount: number;
};

export type PortfolioViewModel = {
  rows: PortfolioRow[];
  campaignCount: number;
  changeCount: number;
  counts: PortfolioMarkCounts;
  /** The rows' one currency; null when they are in different currencies (nothing is summed). */
  currency: string | null;
  mixedCurrency: boolean;
  totals: { before: number | null; after: number | null; onceActivated: number };
};

/** What one message (or one turn) carries that the portfolio groups. */
export type PortfolioParts = {
  campaignStructures?: readonly CampaignStructurePayload[];
  liveChangePreviews?: readonly LiveChangePreviewPayload[];
};

/** A portfolio band is drawn from this many campaigns up; one campaign is just its view. */
export const PORTFOLIO_MIN_CAMPAIGNS = 2;

const plural = (count: number, one: string, many: string) => `${count} ${count === 1 ? one : many}`;

// ---------------------------------------------------------------------------
// Live previews: one row per campaign, whatever number of approvals touch it
// ---------------------------------------------------------------------------

/** The campaign ids a preview touches, in its own order. */
export const campaignIdsOfPreview = (preview: LiveChangePreviewPayload): string[] =>
  preview.nodes.filter((node) => node.level === 'campaign').map((node) => node.id);

const countsOfNodes = (nodes: readonly LiveChangeNode[]): LiveChangePreviewPayload['counts'] => ({
  changed: nodes.filter((node) => node.mark === 'changed').length,
  added: nodes.filter((node) => node.mark === 'added').length,
  paused: nodes.filter((node) => node.mark === 'paused').length,
});

/** The part of a preview under one campaign, its counts recomputed for that campaign alone. */
export const previewForCampaign = (
  preview: LiveChangePreviewPayload,
  campaignId: string,
): LiveChangePreviewPayload => {
  const kept = new Set<string>([campaignId]);
  // Parent before child (the contract's order), so one pass collects the whole subtree.
  for (const node of preview.nodes) {
    if (node.parentId !== null && kept.has(node.parentId)) kept.add(node.id);
  }
  const nodes = preview.nodes.filter((node) => kept.has(node.id));
  return { ...preview, nodes, counts: countsOfNodes(nodes) };
};

const MARK_RANK: Record<LiveChangeNode['mark'], number> = {
  unchanged: 0,
  changed: 1,
  added: 2,
  paused: 3,
};

/**
 * Several pending approvals on ONE campaign, read as one picture: every node once, carrying the
 * strongest mark any approval gives it (a pause outranks a change) and every changed field, the
 * later approval's value winning on the same field. The first preview names the subject.
 */
export const mergePreviews = (
  previews: readonly LiveChangePreviewPayload[],
): LiveChangePreviewPayload => {
  const [first, ...rest] = previews;
  if (!first) throw new Error('mergePreviews needs at least one preview');
  if (rest.length === 0) return first;
  const order: string[] = [];
  const byId = new Map<string, LiveChangeNode>();
  for (const preview of previews) {
    for (const node of preview.nodes) {
      const seen = byId.get(node.id);
      if (!seen) {
        order.push(node.id);
        byId.set(node.id, node);
        continue;
      }
      const changes = new Map(seen.changes.map((row) => [row.field, row]));
      for (const row of node.changes) changes.set(row.field, row);
      byId.set(node.id, {
        ...seen,
        mark: MARK_RANK[node.mark] > MARK_RANK[seen.mark] ? node.mark : seen.mark,
        changes: [...changes.values()],
      });
    }
  }
  const nodes = order.map((id) => byId.get(id) as LiveChangeNode);
  return {
    ...first,
    subject:
      previews
        .map((preview) => preview.subject)
        .filter((subject): subject is string => Boolean(subject))
        .join(' · ') || null,
    nodes,
    truncated: previews.some((preview) => preview.truncated),
    counts: countsOfNodes(nodes),
  };
};

// ---------------------------------------------------------------------------
// Structures: one row per scaffold, its newest version, its diff drawing preferred
// ---------------------------------------------------------------------------

/** The scaffold a structure part belongs to: its parent, so every version groups together. */
export const scaffoldKeyOf = (structure: CampaignStructurePayload): string =>
  structure.parentScaffoldId ?? structure.scaffoldId;

/** Of one scaffold's drawings, the newest version, and of that version the diff (it marks). */
export const pickStructure = (
  structures: readonly CampaignStructurePayload[],
): CampaignStructurePayload | null => {
  let best: CampaignStructurePayload | null = null;
  for (const structure of structures) {
    if (!best || structure.version > best.version) {
      best = structure;
      continue;
    }
    if (structure.version === best.version && structure.layout === 'diff') best = structure;
  }
  return best;
};

// ---------------------------------------------------------------------------
// Rows
// ---------------------------------------------------------------------------

const countsOfModel = (model: CampaignViewModel): PortfolioMarkCounts => ({
  changed: model.changes.filter((change) => change.mark === 'changed').length,
  added: model.changes.filter((change) => change.mark === 'added').length,
  paused: model.changes.filter((change) => change.mark === 'paused').length,
});

const liveRowOf = (
  campaignId: string,
  previews: readonly LiveChangePreviewPayload[],
): PortfolioRow => {
  const merged = mergePreviews(previews.map((preview) => previewForCampaign(preview, campaignId)));
  const model = campaignViewFromLiveChange(merged);
  const counts = countsOfModel(model);
  return {
    id: `live:${campaignId}`,
    name: model.campaigns[0]?.name ?? merged.subject ?? 'Campaign',
    platform: model.platform,
    currency: model.currency,
    source: { kind: 'live', campaignId, partIds: previews.map((preview) => preview.partId) },
    model,
    before: model.totals.before,
    after: model.totals.after,
    onceActivated: model.totals.newWhenActivated,
    counts,
    changeCount: model.changes.length,
  };
};

const scaffoldRowOf = (structure: CampaignStructurePayload): PortfolioRow => {
  const model = campaignViewFromStructure(structure);
  const counts = countsOfModel(model);
  return {
    id: `scaffold:${scaffoldKeyOf(structure)}`,
    name: model.campaigns[0]?.name ?? structure.title,
    platform: model.platform,
    currency: model.currency,
    source: {
      kind: 'scaffold',
      parentScaffoldId: scaffoldKeyOf(structure),
      versionId: structure.scaffoldId,
      version: structure.version,
      partId: structure.partId,
    },
    model,
    // A proposal is built paused: it delivers nothing today and nothing on approval alone.
    before: null,
    after: null,
    onceActivated: model.totals.after ?? 0,
    counts,
    changeCount: model.changes.length,
  };
};

const sumOrNull = (values: (number | null)[]): number | null => {
  const present = values.filter((value): value is number => value !== null);
  return present.length > 0 ? present.reduce((total, value) => total + value, 0) : null;
};

/**
 * Every campaign the parts touch, one row each: the live campaigns first (in the order their
 * first preview arrived), then the proposed scaffolds (in the order they were drawn).
 */
export const portfolioOfParts = (parts: PortfolioParts): PortfolioViewModel => {
  const previewsByCampaign = new Map<string, LiveChangePreviewPayload[]>();
  for (const preview of parts.liveChangePreviews ?? []) {
    for (const campaignId of campaignIdsOfPreview(preview)) {
      const list = previewsByCampaign.get(campaignId) ?? [];
      list.push(preview);
      previewsByCampaign.set(campaignId, list);
    }
  }
  const structuresByScaffold = new Map<string, CampaignStructurePayload[]>();
  for (const structure of parts.campaignStructures ?? []) {
    const key = scaffoldKeyOf(structure);
    const list = structuresByScaffold.get(key) ?? [];
    list.push(structure);
    structuresByScaffold.set(key, list);
  }
  const rows: PortfolioRow[] = [
    ...[...previewsByCampaign].map(([campaignId, previews]) => liveRowOf(campaignId, previews)),
    ...[...structuresByScaffold.values()].flatMap((structures) => {
      const picked = pickStructure(structures);
      return picked ? [scaffoldRowOf(picked)] : [];
    }),
  ];
  const currencies = new Set(rows.map((row) => row.currency).filter(Boolean));
  const mixedCurrency = currencies.size > 1;
  const counts: PortfolioMarkCounts = {
    changed: rows.reduce((total, row) => total + row.counts.changed, 0),
    added: rows.reduce((total, row) => total + row.counts.added, 0),
    paused: rows.reduce((total, row) => total + row.counts.paused, 0),
  };
  return {
    rows,
    campaignCount: rows.length,
    changeCount: rows.reduce((total, row) => total + row.changeCount, 0),
    counts,
    currency: mixedCurrency ? null : ([...currencies][0] ?? null),
    mixedCurrency,
    totals: mixedCurrency
      ? { before: null, after: null, onceActivated: 0 }
      : {
          before: sumOrNull(rows.map((row) => row.before)),
          after: sumOrNull(rows.map((row) => row.after)),
          onceActivated: rows.reduce((total, row) => total + row.onceActivated, 0),
        },
  };
};

/** The message's portfolio, or null when it touches fewer than two campaigns. */
export const portfolioOfMessage = (message: PortfolioParts): PortfolioViewModel | null => {
  if ((message.campaignStructures?.length ?? 0) + (message.liveChangePreviews?.length ?? 0) < 2) {
    return null;
  }
  const portfolio = portfolioOfParts(message);
  return portfolio.campaignCount >= PORTFOLIO_MIN_CAMPAIGNS ? portfolio : null;
};

/** "4 campaigns · 9 changes" — the portfolio's headline. */
export const portfolioHeadline = (portfolio: PortfolioViewModel): string =>
  `${plural(portfolio.campaignCount, 'campaign', 'campaigns')} · ${plural(portfolio.changeCount, 'change', 'changes')}`;

/** A row's counts as short words, strongest first: "1 pause · 2 changes · 3 new". */
export const portfolioCountWords = (
  counts: PortfolioMarkCounts,
): { mark: keyof PortfolioMarkCounts; text: string }[] =>
  [
    counts.paused > 0
      ? { mark: 'paused' as const, text: plural(counts.paused, 'pause', 'pauses') }
      : null,
    counts.changed > 0
      ? { mark: 'changed' as const, text: plural(counts.changed, 'change', 'changes') }
      : null,
    counts.added > 0 ? { mark: 'added' as const, text: `${counts.added} new` } : null,
  ].filter((entry): entry is { mark: keyof PortfolioMarkCounts; text: string } => entry !== null);
