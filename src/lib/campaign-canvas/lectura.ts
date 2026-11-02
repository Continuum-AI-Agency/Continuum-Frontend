// One campaign model for every drawing of a campaign (design C, option 27): the chat's summary
// card, the companion pane and the full Canvas page read it, in Read (Lectura) and in the Map
// (`columnMap.ts` projects its cards from it). Two builders turn the two things a canvas can
// show — a live change preview and a scaffold graph — into this one `CampaignViewModel`, so no
// view re-reads a payload of its own. The Lectura lays it out to be read at 100% in a 640 px
// pane and approved: the changes first, then the daily total with its split, then one card
// per ad set.

import {
  type CampaignStructurePayload,
  type FieldProvenance,
  formatMoney,
  type LiveChangeNode,
  type LiveChangePreviewPayload,
  type StructureDiff,
  type StructureDiffEntry,
  type StructureNode,
} from '@continuum/contracts';
import type {
  AdData,
  AdSetData,
  AudienceData,
  CampaignCanvasEdge,
  CampaignCanvasNode,
  CampaignData,
  CreativeAssetType,
  CreativeData,
} from '@/CampaignCanvas/types';
import { liveChangeFieldLabel, liveChangeValueText } from './liveChange';
import {
  type CampaignPlatform,
  type PlatformLabels,
  platformLabelsOf,
  platformOfLiveChange,
  platformOfSource,
} from './platformLabels';

/**
 * What a node is in the view. `removed` exists only when two versions are compared: a node the
 * earlier version had and this one dropped, drawn struck through so the drop reads.
 */
export type LecturaMark = 'changed' | 'added' | 'paused' | 'removed' | 'unchanged';

/** A before → after line, already worded. */
export type LecturaRow = { field: string; label: string; before: string; after: string };

export type LecturaAd = {
  id: string;
  name: string;
  mark: LecturaMark;
  /** Meta's effective_status as read; null for a draft. */
  status: string | null;
  /** Its own daily budget as it stands, minor units; null when it has none. */
  budgetMinor: number | null;
  rows: LecturaRow[];
  /** It is unchanged itself but stops because its ad set or campaign is paused. */
  stops: boolean;
  thumbnailUrl: string | null;
  creativeKind: CreativeAssetType | null;
  /** The store node of its creative (a scaffold), so the Map can open it. */
  creativeId: string | null;
};

export type LecturaProvenance = { userGave: number; jainaFilled: number; jainaAsks: number };

export type LecturaAdSet = {
  id: string;
  name: string;
  mark: LecturaMark;
  status: string | null;
  /** Its own daily budget as read (minor units), before any change; null under CBO. */
  budgetMinor: number | null;
  /** Minor units; null when the campaign holds the budget. */
  budgetBefore: number | null;
  budgetAfter: number | null;
  rows: LecturaRow[];
  basedOnName: string | null;
  audience: string | null;
  /** The store node of its audience (a scaffold), so the Map can open it. */
  audienceId: string | null;
  /** Performance Max: what the asset group holds ("5 headlines · 4 images"), in place of ads. */
  assetSummary: string | null;
  ads: LecturaAd[];
  stopsWithParent: boolean;
  provenance: LecturaProvenance | null;
};

export type LecturaCampaign = {
  id: string;
  name: string;
  mark: LecturaMark;
  status: string | null;
  /** Its own daily budget (CBO), minor units; null when the ad sets hold it. */
  budgetMinor: number | null;
  /** "Sales", "Leads"…; null when the source does not carry it (a live preview). */
  objective: string | null;
  rows: LecturaRow[];
  /** True when the campaign holds the budget (CBO). */
  campaignBudget: boolean;
  adSets: LecturaAdSet[];
};

/** One card in the "changes first" list. */
export type LecturaChange = {
  id: string;
  level: 'campaign' | 'adset' | 'ad';
  mark: Exclude<LecturaMark, 'unchanged'>;
  campaignName: string;
  adSetName: string | null;
  title: string;
  rows: LecturaRow[];
  basis: string | null;
  /** The ad set the card expands into. */
  adSetId: string | null;
};

export type BudgetSliceTone = 'kept' | 'changed' | 'removed' | 'new';
export type BudgetSlice = { id: string; name: string; minor: number; tone: BudgetSliceTone };

export type LecturaModel = {
  /** `change`: edits to a live campaign. `new`: a campaign that does not exist yet. */
  kind: 'change' | 'new';
  /** What it was built from: a live change preview, or a scaffold graph (the canvas store). */
  source: 'live' | 'scaffold';
  /** Whose words the views use: Meta's ad set, Google's ad group or asset group, TikTok's. */
  platform: CampaignPlatform;
  currency: string | null;
  campaigns: LecturaCampaign[];
  changes: LecturaChange[];
  truncated: boolean;
  totals: {
    /** Delivering daily budget today; null when nothing has a budget of its own. */
    before: number | null;
    after: number | null;
    /** What new paused objects would add once someone activates them. */
    newWhenActivated: number;
  };
  split: BudgetSlice[];
  adSetCount: number;
};

/** The one campaign model every view draws from; `LecturaModel` is its historical name. */
export type CampaignViewModel = LecturaModel;

/** Past this many ad sets the cards become a long scroll; the table reads better. */
export const LECTURA_TABLE_THRESHOLD = 12;

export const prefersLecturaTable = (model: LecturaModel): boolean =>
  model.adSetCount > LECTURA_TABLE_THRESHOLD;

export const lecturaMoney = (minor: number | null, currency: string | null): string | null =>
  minor === null ? null : formatMoney(minor / 100, currency);

const STATUS_WORDS: Record<string, string> = {
  ACTIVE: 'Active',
  PAUSED: 'Paused',
  ARCHIVED: 'Archived',
  DELETED: 'Deleted',
  DISAPPROVED: 'Disapproved',
  IN_PROCESS: 'In review',
  PENDING_REVIEW: 'In review',
  WITH_ISSUES: 'With issues',
  CAMPAIGN_PAUSED: 'Campaign paused',
  ADSET_PAUSED: 'Ad set paused',
};

/** Meta's "ACTIVE" / "CAMPAIGN_PAUSED" as a person reads it: "Active", "Campaign paused". */
export const humanStatus = (status: string | null | undefined): string | null => {
  if (!status) return null;
  const known = STATUS_WORDS[status.toUpperCase()];
  if (known) return known;
  const words = status.toLowerCase().replace(/_/g, ' ').trim();
  return words ? words.charAt(0).toUpperCase() + words.slice(1) : null;
};

const NOT_DELIVERING = /PAUSED|ARCHIVED|DELETED|DISAPPROVED/i;

/** Read from Meta as effective_status; null (a draft or a new copy) delivers nothing yet. */
const isDelivering = (status: string | null): boolean =>
  status !== null && !NOT_DELIVERING.test(status);

const sum = (values: number[]): number => values.reduce((total, value) => total + value, 0);

// ---------------------------------------------------------------------------
// From a live change preview
// ---------------------------------------------------------------------------

const rowsOfLive = (node: LiveChangeNode, currency: string | null): LecturaRow[] =>
  node.changes.map((row) => ({
    field: row.field,
    label: liveChangeFieldLabel(row.field),
    before: liveChangeValueText(row, 'before', currency),
    after: liveChangeValueText(row, 'after', currency),
  }));

/** The budget a node will have after the change, in minor units. */
const budgetAfterOfLive = (node: LiveChangeNode): number | null => {
  const row = node.changes.find((change) => change.field === 'daily_budget');
  if (row && typeof row.after === 'number') return row.after;
  return node.dailyBudgetMinor;
};

/** A Performance Max asset group's assets, worded by the source (`assetSummary`, passthrough). */
const assetSummaryOf = (node: LiveChangeNode): string | null => {
  const summary = (node as Record<string, unknown>).assetSummary;
  return typeof summary === 'string' && summary.trim().length > 0 ? summary.trim() : null;
};

const basisOf = (node: LiveChangeNode): string | null => {
  const basis = (node as Record<string, unknown>).basis;
  return typeof basis === 'string' && basis.trim().length > 0 ? basis.trim() : null;
};

const titleOf = (node: LiveChangeNode, rows: LecturaRow[], labels: PlatformLabels): string => {
  const level = labels.singular[node.level];
  if (node.mark === 'paused') return `Pause the ${level}`;
  if (node.mark === 'added') return `New ${level}, created paused`;
  const fields = rows.filter((row) => row.field !== 'status').map((row) => row.label);
  return fields.length > 0 ? fields.join(' · ') : `Change the ${level}`;
};

export const lecturaFromLiveChange = (payload: LiveChangePreviewPayload): LecturaModel => {
  const { currency } = payload;
  const platform = platformOfLiveChange(payload);
  const labels = platformLabelsOf(platform);
  const nameOf = new Map(payload.nodes.map((node) => [node.id, node.name]));
  const childrenOf = (id: string) => payload.nodes.filter((node) => node.parentId === id);
  const changes: LecturaChange[] = [];
  let before = 0;
  let after = 0;
  let anyBudget = false;
  let newWhenActivated = 0;
  const split: BudgetSlice[] = [];

  const campaigns = payload.nodes
    .filter((node) => node.level === 'campaign')
    .map((campaign): LecturaCampaign => {
      const campaignRows = rowsOfLive(campaign, currency);
      const campaignBudget = campaign.dailyBudgetMinor !== null;
      const campaignStops = campaign.mark === 'paused';
      if (campaign.mark !== 'unchanged') {
        changes.push({
          id: campaign.id,
          level: 'campaign',
          mark: campaign.mark,
          campaignName: campaign.name,
          adSetName: null,
          title: titleOf(campaign, campaignRows, labels),
          rows: campaignRows,
          basis: basisOf(campaign),
          adSetId: null,
        });
      }
      if (campaignBudget && campaign.dailyBudgetMinor !== null) {
        anyBudget = true;
        const delivering = isDelivering(campaign.status);
        const was = delivering ? campaign.dailyBudgetMinor : 0;
        const will = campaignStops ? 0 : delivering ? (budgetAfterOfLive(campaign) ?? 0) : 0;
        before += was;
        after += will;
        split.push({
          id: campaign.id,
          name: campaign.name,
          minor: Math.max(was, will),
          tone: campaignStops ? 'removed' : will !== was ? 'changed' : 'kept',
        });
      }

      const adSets = childrenOf(campaign.id)
        .filter((node) => node.level === 'adset')
        .map((adSet): LecturaAdSet => {
          const rows = rowsOfLive(adSet, currency);
          const stopsWithParent = campaignStops && adSet.mark === 'unchanged';
          const adSetStops = adSet.mark === 'paused' || stopsWithParent;
          const budgetBefore = adSet.mark === 'added' ? null : adSet.dailyBudgetMinor;
          const budgetAfter =
            adSet.mark === 'paused' || stopsWithParent ? 0 : budgetAfterOfLive(adSet);

          if (!campaignBudget && adSet.dailyBudgetMinor !== null) {
            anyBudget = true;
            if (adSet.mark === 'added') {
              newWhenActivated += adSet.dailyBudgetMinor;
              split.push({
                id: adSet.id,
                name: adSet.name,
                minor: adSet.dailyBudgetMinor,
                tone: 'new',
              });
            } else {
              const delivering =
                isDelivering(adSet.status) && !(campaign.status && !isDelivering(campaign.status));
              const was = delivering ? adSet.dailyBudgetMinor : 0;
              const will = delivering ? (budgetAfter ?? 0) : 0;
              before += was;
              after += will;
              if (was > 0 || will > 0) {
                split.push({
                  id: adSet.id,
                  name: adSet.name,
                  minor: adSetStops ? was : will,
                  tone: adSetStops ? 'removed' : will !== was ? 'changed' : 'kept',
                });
              }
            }
          }

          const ads = childrenOf(adSet.id)
            .filter((node) => node.level === 'ad')
            .map(
              (ad): LecturaAd => ({
                id: ad.id,
                name: ad.name,
                mark: ad.mark,
                status: ad.status,
                budgetMinor: ad.dailyBudgetMinor,
                rows: rowsOfLive(ad, currency),
                stops: ad.mark === 'unchanged' && adSetStops,
                thumbnailUrl: null,
                creativeKind: null,
                creativeId: null,
              }),
            );

          if (adSet.mark !== 'unchanged') {
            changes.push({
              id: adSet.id,
              level: 'adset',
              mark: adSet.mark,
              campaignName: campaign.name,
              adSetName: adSet.name,
              title: titleOf(adSet, rows, labels),
              rows,
              basis: basisOf(adSet),
              adSetId: adSet.id,
            });
          }
          for (const ad of childrenOf(adSet.id).filter((node) => node.level === 'ad')) {
            if (ad.mark === 'unchanged' || adSet.mark === 'added') continue;
            const adRows = rowsOfLive(ad, currency);
            changes.push({
              id: ad.id,
              level: 'ad',
              mark: ad.mark,
              campaignName: campaign.name,
              adSetName: adSet.name,
              title: `${ad.name}: ${titleOf(ad, adRows, labels).toLowerCase()}`,
              rows: adRows,
              basis: basisOf(ad),
              adSetId: adSet.id,
            });
          }

          return {
            id: adSet.id,
            name: adSet.name,
            mark: adSet.mark,
            status: adSet.status,
            budgetMinor: adSet.dailyBudgetMinor,
            budgetBefore,
            budgetAfter,
            rows,
            basedOnName: adSet.basedOnId ? (nameOf.get(adSet.basedOnId) ?? 'an ad set') : null,
            audience: null,
            audienceId: null,
            assetSummary: assetSummaryOf(adSet),
            ads,
            stopsWithParent,
            provenance: null,
          };
        });

      return {
        id: campaign.id,
        name: campaign.name,
        mark: campaign.mark,
        status: campaign.status,
        budgetMinor: campaign.dailyBudgetMinor,
        objective: null,
        rows: campaignRows,
        campaignBudget,
        adSets,
      };
    });

  return {
    kind: 'change',
    source: 'live',
    platform,
    currency,
    campaigns,
    changes,
    truncated: payload.truncated,
    totals: {
      before: anyBudget ? before : null,
      after: anyBudget ? after : null,
      newWhenActivated,
    },
    split,
    adSetCount: sum(campaigns.map((campaign) => campaign.adSets.length)),
  };
};

// ---------------------------------------------------------------------------
// From a scaffold graph (the companion canvas's store)
// ---------------------------------------------------------------------------

const GENDER_LABEL: Record<number, string> = { 1: 'men', 2: 'women' };

/**
 * "MX, CO · 25-44 · women · 3 interests", from the audience node the ad set reads — a copied
 * audience too, whose source the ad set names apart (`basedOnName`).
 */
export const audienceLineOf = (audience: AudienceData | null): string | null => {
  if (!audience) return null;
  const parts: string[] = [];
  if (audience.locations?.length) parts.push(audience.locations.join(', '));
  if (audience.ageMin || audience.ageMax) {
    parts.push(`${audience.ageMin ?? 18}-${audience.ageMax ?? 65}`);
  }
  const genders = (audience.genders ?? []).map((gender) => GENDER_LABEL[gender]).filter(Boolean);
  if (genders.length === 1) parts.push(genders[0] as string);
  const interests = (audience.interests?.length ?? 0) + (audience.behaviors?.length ?? 0);
  if (interests > 0) parts.push(`${interests} interest${interests === 1 ? '' : 's'}`);
  if (audience.customAudiences?.length) {
    parts.push(
      `${audience.customAudiences.length} custom audience${audience.customAudiences.length === 1 ? '' : 's'}`,
    );
  }
  if (parts.length > 0) return parts.join(' · ');
  // Where a copy came from is the ad set's own line ("Based on …"); this one reads targeting.
  return audience.mode === 'copied' ? 'Copied targeting' : audience.label || null;
};

const countProvenance = (
  into: LecturaProvenance,
  values: Partial<Record<string, FieldProvenance>> | undefined,
) => {
  for (const value of Object.values(values ?? {})) {
    if (value === 'user_gave') into.userGave += 1;
    else if (value === 'jaina_filled') into.jainaFilled += 1;
    else if (value === 'jaina_asks') into.jainaAsks += 1;
  }
};

const toMinor = (major: number | null | undefined): number | null =>
  typeof major === 'number' && Number.isFinite(major) ? Math.round(major * 100) : null;

// ---------------------------------------------------------------------------
// Marks for a scaffold: a campaign COPY says what it adds
// ---------------------------------------------------------------------------

/** What a scaffold node is relative to the live campaign it was copied from. */
export type ScaffoldMark = {
  mark: LecturaMark;
  rows: LecturaRow[];
  /** An added node planned from a source node: that node's name ("Based on …"). */
  basedOnName?: string;
};

const DIFF_MARK: Record<StructureDiffEntry['change'], LecturaMark | null> = {
  added: 'added',
  changed: 'changed',
  unchanged: 'unchanged',
  removed: null,
};

const diffValueText = (value: string | number | boolean | null): string =>
  value === null || value === '' ? 'none' : String(value);

/**
 * The Backend's per-node diff of a campaign copy (`paid.campaign_structure`, layout 'diff'),
 * keyed by path key. Every copied node is created PAUSED, so the diff says "status ACTIVE →
 * PAUSED" on all of them; that is the copy, not a change anyone asked for, so the row is left
 * out and a node with nothing else is unchanged — the copied branches fold and "next change"
 * walks only what was asked: the new test ad sets and any field the copy really changes (its
 * name, a budget). An added node's `name` row is where it came from, said as "Based on …".
 */
export const marksFromStructureDiff = (
  diff: StructureDiff | null | undefined,
): Map<string, ScaffoldMark> => {
  const marks = new Map<string, ScaffoldMark>();
  for (const entry of diff?.entries ?? []) {
    const mark = DIFF_MARK[entry.change];
    if (!mark) continue;
    const named = entry.fields.find((field) => field.key === 'name');
    const rows = entry.fields
      .filter((field) => field.key !== 'status' && !(mark === 'added' && field.key === 'name'))
      .map((field) => ({
        field: field.key,
        label: field.label,
        before: diffValueText(field.before),
        after: diffValueText(field.after),
      }));
    const settled: LecturaMark = mark === 'changed' && rows.length === 0 ? 'unchanged' : mark;
    marks.set(entry.path_key, {
      mark: settled,
      rows,
      ...(mark === 'added' && typeof named?.before === 'string' && named.before
        ? { basedOnName: named.before }
        : {}),
    });
  }
  return marks;
};

const pathKeyOf = (node: CampaignCanvasNode): string | null =>
  (node.data as { provenance?: { pathKey?: string } }).provenance?.pathKey ?? null;

/**
 * Marks for a scaffold, keyed by store node id. A scaffold that is a COPY of a live campaign
 * (P5 design 08) is a diff — the copied ad sets are the original, the test ad sets beside
 * them are new — so the Map folds the copied ones and "next change" walks the new ones.
 *
 * The Backend's duplicate builder words that diff per node (`marksFromStructureDiff`); when the
 * canvas has it, it is the truth. Without it the graph still says it: a copied ad set reads its
 * source's targeting verbatim (audience mode `copied`), so in a campaign that has copied ad sets
 * every other ad set — and its ads — is new. A campaign with no copied ad set is new as a whole
 * and carries no marks: nothing folds.
 */
export const scaffoldMarksOf = (
  nodes: readonly CampaignCanvasNode[],
  edges: readonly CampaignCanvasEdge[],
  diff: StructureDiff | null = null,
): Map<string, ScaffoldMark> => {
  const marks = new Map<string, ScaffoldMark>();
  const byPath = marksFromStructureDiff(diff);
  if (byPath.size > 0) {
    for (const node of nodes) {
      const path = pathKeyOf(node);
      const mark = path ? byPath.get(path) : undefined;
      if (mark) marks.set(node.id, mark);
    }
    if (marks.size > 0) return marks;
  }

  const byId = new Map(nodes.map((node) => [node.id, node]));
  const adSets = nodes.filter((node) => node.type === 'ad-set');
  const isCopied = (adSetId: string) =>
    edges.some(
      (edge) =>
        edge.target === adSetId &&
        byId.get(edge.source)?.type === 'audience' &&
        (byId.get(edge.source)?.data as AudienceData | undefined)?.mode === 'copied',
    );
  const copied = new Set(adSets.filter((node) => isCopied(node.id)).map((node) => node.id));
  if (copied.size === 0 || copied.size === adSets.length) return marks;
  for (const adSet of adSets) {
    if (copied.has(adSet.id)) continue;
    marks.set(adSet.id, { mark: 'added', rows: [] });
    for (const edge of edges) {
      if (edge.source === adSet.id && byId.get(edge.target)?.type === 'ad') {
        marks.set(edge.target, { mark: 'added', rows: [] });
      }
    }
  }
  return marks;
};

// ---------------------------------------------------------------------------
// One shape for every scaffold source (the canvas store, the saved rows, a structure frame)
// ---------------------------------------------------------------------------

type PlainAd = {
  id: string;
  name: string;
  status: string | null;
  thumbnailUrl: string | null;
  creativeKind: CreativeAssetType | null;
  creativeId: string | null;
};

type PlainAdSet = {
  id: string;
  name: string;
  status: string | null;
  /** Its own daily budget, minor units; null under CBO or when not set. */
  budgetMinor: number | null;
  audience: string | null;
  audienceId: string | null;
  /** Where a copied audience came from, when the source says so. */
  copiedFromName: string | null;
  assetSummary: string | null;
  provenance: LecturaProvenance | null;
  ads: PlainAd[];
};

type PlainCampaign = {
  id: string;
  name: string;
  status: string | null;
  cbo: boolean;
  /** CBO only: the campaign's daily budget, minor units. */
  budgetMinor: number | null;
  objective: string | null;
  adSets: PlainAdSet[];
};

type PlainScaffold = {
  campaigns: PlainCampaign[];
  currency: string | null;
  platform: CampaignPlatform;
  truncated: boolean;
};

export const changeTitle = (
  labels: PlatformLabels,
  level: keyof PlatformLabels['singular'],
  mark: Exclude<LecturaMark, 'unchanged'>,
  rows: LecturaRow[],
): string => {
  if (mark === 'added') return `New ${labels.singular[level]}`;
  if (mark === 'paused') return `Pause the ${labels.singular[level]}`;
  if (mark === 'removed') return `Removed ${labels.singular[level]}`;
  // The row already says the old and the new name; the title says what happened.
  return rows.length > 0
    ? rows.map((row) => (row.field === 'name' ? 'Renamed' : row.label)).join(' · ')
    : `Change the ${labels.singular[level]}`;
};

const NO_MARK: ScaffoldMark = { mark: 'unchanged', rows: [] };

/** The campaign model of a scaffold, whichever source it was read from. */
const modelFromPlainScaffold = (
  scaffold: PlainScaffold,
  markOf: (id: string) => ScaffoldMark,
): LecturaModel => {
  const labels = platformLabelsOf(scaffold.platform);
  let total = 0;
  let anyBudget = false;
  const split: BudgetSlice[] = [];
  const changes: LecturaChange[] = [];

  const campaigns = scaffold.campaigns.map((campaign): LecturaCampaign => {
    const campaignMark = markOf(campaign.id);
    if (campaign.budgetMinor !== null) {
      anyBudget = true;
      total += campaign.budgetMinor;
      split.push({
        id: campaign.id,
        name: campaign.name,
        minor: campaign.budgetMinor,
        tone: 'kept',
      });
    }
    if (campaignMark.mark !== 'unchanged') {
      changes.push({
        id: campaign.id,
        level: 'campaign',
        mark: campaignMark.mark,
        campaignName: campaign.name,
        adSetName: null,
        title: changeTitle(labels, 'campaign', campaignMark.mark, campaignMark.rows),
        rows: campaignMark.rows,
        basis: null,
        adSetId: null,
      });
    }
    const adSets = campaign.adSets.map((adSet): LecturaAdSet => {
      const adSetMark = markOf(adSet.id);
      if (adSet.budgetMinor !== null) {
        anyBudget = true;
        total += adSet.budgetMinor;
        split.push({
          id: adSet.id,
          name: adSet.name,
          minor: adSet.budgetMinor,
          tone: adSetMark.mark === 'added' ? 'new' : 'kept',
        });
      }
      if (adSetMark.mark !== 'unchanged') {
        changes.push({
          id: adSet.id,
          level: 'adset',
          mark: adSetMark.mark,
          campaignName: campaign.name,
          adSetName: adSet.name,
          title: changeTitle(labels, 'adset', adSetMark.mark, adSetMark.rows),
          rows: adSetMark.rows,
          basis: adSetMark.basedOnName ? `Based on ${adSetMark.basedOnName}` : null,
          adSetId: adSet.id,
        });
      }
      const ads = adSet.ads.map((ad): LecturaAd => {
        const adMark = markOf(ad.id);
        // The ads of a new ad set are part of that one change, not changes of their own.
        if (adMark.mark !== 'unchanged' && adSetMark.mark !== 'added') {
          changes.push({
            id: ad.id,
            level: 'ad',
            mark: adMark.mark,
            campaignName: campaign.name,
            adSetName: adSet.name,
            title: `${ad.name}: ${changeTitle(labels, 'ad', adMark.mark, adMark.rows).toLowerCase()}`,
            rows: adMark.rows,
            basis: null,
            adSetId: adSet.id,
          });
        }
        return {
          id: ad.id,
          name: ad.name,
          mark: adMark.mark,
          status: ad.status,
          budgetMinor: null,
          rows: adMark.rows,
          stops: false,
          thumbnailUrl: ad.thumbnailUrl,
          creativeKind: ad.creativeKind,
          creativeId: ad.creativeId,
        };
      });
      return {
        id: adSet.id,
        name: adSet.name,
        mark: adSetMark.mark,
        status: adSet.status,
        budgetMinor: adSet.budgetMinor,
        budgetBefore: null,
        budgetAfter: adSet.budgetMinor,
        rows: adSetMark.rows,
        // A copied ad set keeps its source's name: "Based on" itself would say nothing.
        basedOnName:
          adSetMark.basedOnName ??
          (adSet.copiedFromName && adSet.copiedFromName !== adSet.name
            ? adSet.copiedFromName
            : null),
        audience: adSet.audience,
        audienceId: adSet.audienceId,
        assetSummary: adSet.assetSummary,
        ads,
        stopsWithParent: false,
        provenance: adSet.provenance,
      };
    });
    return {
      id: campaign.id,
      name: campaign.name,
      mark: campaignMark.mark,
      status: campaign.status,
      budgetMinor: campaign.budgetMinor,
      objective: campaign.objective,
      rows: campaignMark.rows,
      campaignBudget: campaign.cbo,
      adSets,
    };
  });

  return {
    kind: 'new',
    source: 'scaffold',
    platform: scaffold.platform,
    currency: scaffold.currency,
    campaigns,
    changes,
    truncated: scaffold.truncated,
    totals: { before: null, after: anyBudget ? total : null, newWhenActivated: 0 },
    split,
    adSetCount: sum(campaigns.map((campaign) => campaign.adSets.length)),
  };
};

// ---------------------------------------------------------------------------
// From a scaffold graph (the companion canvas's store)
// ---------------------------------------------------------------------------

const OBJECTIVE_LABEL: Record<CampaignData['objective'], string> = {
  OUTCOME_SALES: 'Sales',
  OUTCOME_LEADS: 'Leads',
  OUTCOME_ENGAGEMENT: 'Engagement',
  OUTCOME_AWARENESS: 'Awareness',
  OUTCOME_TRAFFIC: 'Traffic',
  OUTCOME_APP_PROMOTION: 'App promotion',
};

/**
 * The companion canvas's own graph (the scaffold store). `marks` default to what the graph
 * itself says (`scaffoldMarksOf`): nothing for a new campaign, the new ad sets of a copy.
 */
export const lecturaFromCanvasGraph = (
  nodes: readonly CampaignCanvasNode[],
  edges: readonly CampaignCanvasEdge[],
  marks: ReadonlyMap<string, ScaffoldMark> = scaffoldMarksOf(nodes, edges),
  platform: CampaignPlatform = 'meta',
): LecturaModel => {
  const byId = new Map(nodes.map((node) => [node.id, node]));
  const targetsOf = (id: string) =>
    edges.filter((edge) => edge.source === id).map((edge) => byId.get(edge.target));
  const sourcesOf = (id: string) =>
    edges.filter((edge) => edge.target === id).map((edge) => byId.get(edge.source));
  let currency: string | null = null;

  const campaigns = nodes
    .filter((node) => node.type === 'campaign')
    .map((campaignNode): PlainCampaign => {
      const campaign = campaignNode.data as CampaignData;
      const cbo = campaign.budgetMode === 'cbo';
      currency ??= campaign.budgetCurrency ?? null;
      const adSets = targetsOf(campaignNode.id)
        .filter((node): node is CampaignCanvasNode => node?.type === 'ad-set')
        .map((adSetNode): PlainAdSet => {
          const adSet = adSetNode.data as AdSetData;
          currency ??= adSet.budgetCurrency ?? null;
          const audienceNode = sourcesOf(adSetNode.id).find((node) => node?.type === 'audience');
          const audience = (audienceNode?.data as AudienceData | undefined) ?? null;
          const provenance: LecturaProvenance = { userGave: 0, jainaFilled: 0, jainaAsks: 0 };
          countProvenance(provenance, adSet.fieldProvenance);
          countProvenance(provenance, audience?.fieldProvenance);
          const ads = targetsOf(adSetNode.id)
            .filter((node): node is CampaignCanvasNode => node?.type === 'ad')
            .map((adNode): PlainAd => {
              countProvenance(provenance, adNode.data.fieldProvenance as LecturaFieldProvenance);
              const creativeNode = targetsOf(adNode.id).find((node) => node?.type === 'creative');
              const creative = (creativeNode?.data as CreativeData | undefined) ?? null;
              if (creative) countProvenance(provenance, creative.fieldProvenance);
              return {
                id: adNode.id,
                name: adNode.data.label,
                status: (adNode.data as AdData).provenance?.metaStatus ?? null,
                thumbnailUrl:
                  creative?.thumbnailUrl ??
                  creative?.cards?.find((card) => card.thumbnailUrl)?.thumbnailUrl ??
                  null,
                creativeKind: creative?.assetType ?? null,
                creativeId: creativeNode?.id ?? null,
              };
            });
          const counted = provenance.userGave + provenance.jainaFilled + provenance.jainaAsks;
          return {
            id: adSetNode.id,
            name: adSet.label,
            status: adSet.provenance?.metaStatus ?? null,
            budgetMinor: cbo ? null : toMinor(adSet.budgetAmount),
            audience: audienceLineOf(audience),
            audienceId: audienceNode?.id ?? null,
            copiedFromName:
              audience?.mode === 'copied' ? (audience.copiedFromAdSetName ?? null) : null,
            assetSummary: null,
            provenance: counted > 0 ? provenance : null,
            ads,
          };
        });
      return {
        id: campaignNode.id,
        name: campaign.label,
        status: campaign.provenance?.metaStatus ?? null,
        cbo,
        budgetMinor: cbo ? toMinor(campaign.campaignBudgetAmount) : null,
        objective: OBJECTIVE_LABEL[campaign.objective] ?? null,
        adSets,
      };
    });

  return modelFromPlainScaffold(
    { campaigns, currency, platform, truncated: false },
    (id) => marks.get(id) ?? NO_MARK,
  );
};

// ---------------------------------------------------------------------------
// From a scaffold's saved rows (the chat's scaffold card)
// ---------------------------------------------------------------------------

/** The rows a scaffold card already loads, built into its tree (`buildScaffoldTree`). */
export type ScaffoldTreeSource = {
  campaign: { id: string; pathKey: string; name: string; budgetMinor: number | null } | null;
  adSets: {
    id: string;
    pathKey: string;
    name: string;
    budgetMinor: number | null;
    audience: string | null;
    ads: { id: string; pathKey: string; name: string }[];
  }[];
};

/**
 * A scaffold card's campaign, from its saved rows, marked by the Backend's diff when the turn
 * that proposed it drew one (a campaign copy). Ids are path keys: the diff's own anchor.
 */
export const campaignViewFromScaffoldRows = (
  tree: ScaffoldTreeSource,
  options: { currency: string | null; diff?: StructureDiff | null; platform?: CampaignPlatform },
): LecturaModel => {
  const marks = marksFromStructureDiff(options.diff);
  const campaign = tree.campaign;
  const adSets = tree.adSets.map(
    (adSet): PlainAdSet => ({
      id: adSet.pathKey,
      name: adSet.name,
      status: null,
      budgetMinor: adSet.budgetMinor,
      audience: adSet.audience,
      audienceId: null,
      copiedFromName: null,
      assetSummary: null,
      provenance: null,
      ads: adSet.ads.map((ad) => ({
        id: ad.pathKey,
        name: ad.name,
        status: null,
        thumbnailUrl: null,
        creativeKind: null,
        creativeId: null,
      })),
    }),
  );
  return modelFromPlainScaffold(
    {
      campaigns: [
        {
          id: campaign?.pathKey ?? 'c0',
          name: campaign?.name ?? 'Campaign',
          status: null,
          cbo: campaign?.budgetMinor !== null && campaign?.budgetMinor !== undefined,
          budgetMinor: campaign?.budgetMinor ?? null,
          objective: null,
          adSets,
        },
      ],
      currency: options.currency,
      platform: options.platform ?? 'meta',
      truncated: false,
    },
    (id) => marks.get(id) ?? NO_MARK,
  );
};

// ---------------------------------------------------------------------------
// From a structure frame (the chat's drawing of a proposal)
// ---------------------------------------------------------------------------

/**
 * A structure field prints its money already worded ("$100 MXN"). The model counts minor units,
 * so the figure is read back — and kept only when printing it again gives the very same words,
 * so a format this reader does not know costs the budget line, never a wrong total.
 */
export const minorFromWordedMoney = (
  text: unknown,
): { minor: number; currency: string | null } | null => {
  if (typeof text !== 'string') return null;
  const currency = /\b([A-Z]{3})\s*$/.exec(text.trim())?.[1] ?? null;
  const digits = /-?\d[\d,]*(?:\.\d+)?/.exec(text)?.[0];
  if (!digits) return null;
  const major = Number(digits.replace(/,/g, ''));
  if (!Number.isFinite(major)) return null;
  return formatMoney(major, currency) === text.trim()
    ? { minor: Math.round(major * 100), currency }
    : null;
};

const fieldValue = (node: StructureNode, key: string): StructureNode['fields'][number] | null =>
  node.fields.find((field) => field.key === key) ?? null;

/**
 * The chat's drawing of a proposal (`paid.campaign_structure`): its nodes are the campaign,
 * and a copy's `diff` marks them. A truncated frame carries the campaigns only — the model
 * says so, and the scaffold card and canvas hold the rest.
 */
export const campaignViewFromStructure = (structure: CampaignStructurePayload): LecturaModel => {
  const marks = marksFromStructureDiff(structure.diff);
  let currency: string | null = null;
  const budgetOf = (node: StructureNode, key: string): number | null => {
    const money = minorFromWordedMoney(fieldValue(node, key)?.value);
    if (!money) return null;
    currency ??= money.currency;
    return money.minor;
  };
  const childrenOf = (pathKey: string, level: StructureNode['level']) =>
    structure.nodes.filter((node) => node.parent_path_key === pathKey && node.level === level);
  const campaigns = structure.nodes
    .filter((node) => node.level === 'campaign')
    .map((campaign): PlainCampaign => {
      const campaignBudget = budgetOf(campaign, 'campaign_daily_budget_minor_units');
      const objective = fieldValue(campaign, 'objective')?.value;
      return {
        id: campaign.path_key,
        name: campaign.name,
        status: null,
        cbo: campaignBudget !== null,
        budgetMinor: campaignBudget,
        objective: typeof objective === 'string' ? objective : null,
        adSets: childrenOf(campaign.path_key, 'adset').map((adSet): PlainAdSet => {
          const provenance: LecturaProvenance = { userGave: 0, jainaFilled: 0, jainaAsks: 0 };
          const nodes = [adSet, ...childrenOf(adSet.path_key, 'ad')];
          countProvenance(
            provenance,
            Object.fromEntries(
              nodes.flatMap((node) =>
                node.fields.map((field) => [`${node.path_key}:${field.key}`, field.provenance]),
              ),
            ),
          );
          const audience = fieldValue(adSet, 'audience')?.value;
          const assets = fieldValue(adSet, 'assets')?.value;
          const counted = provenance.userGave + provenance.jainaFilled + provenance.jainaAsks;
          return {
            id: adSet.path_key,
            name: adSet.name,
            status: null,
            budgetMinor:
              campaignBudget === null ? budgetOf(adSet, 'daily_budget_minor_units') : null,
            audience: typeof audience === 'string' ? audience : null,
            audienceId: null,
            copiedFromName: null,
            assetSummary: typeof assets === 'string' ? assets : null,
            provenance: counted > 0 ? provenance : null,
            ads: childrenOf(adSet.path_key, 'ad').map((ad) => ({
              id: ad.path_key,
              name: ad.name,
              status: null,
              thumbnailUrl: null,
              creativeKind: null,
              creativeId: null,
            })),
          };
        }),
      };
    });
  return modelFromPlainScaffold(
    { campaigns, currency, platform: platformOfSource(structure), truncated: structure.truncated },
    (id) => marks.get(id) ?? NO_MARK,
  );
};

/** The one model, by its name in every view: built from a live preview… */
export const campaignViewFromLiveChange = lecturaFromLiveChange;
/** …or from a scaffold graph. */
export const campaignViewFromCanvasGraph = lecturaFromCanvasGraph;

type LecturaFieldProvenance = Partial<Record<string, FieldProvenance>> | undefined;
