// The canvas's Lectura view (design C, Ramiro 2026-10-31): the same campaign the Mapa draws,
// laid out to be read at 100% in a 640 px pane and approved — the changes first, then a band
// with the daily total and its split, then one card per ad set. Pure: two builders turn the
// two things the companion canvas can show (a live change preview and a scaffold graph) into
// one model, so the component only lays it out.

import {
  type FieldProvenance,
  formatMoney,
  type LiveChangeNode,
  type LiveChangePreviewPayload,
} from '@continuum/contracts';
import type {
  AdSetData,
  AudienceData,
  CampaignCanvasEdge,
  CampaignCanvasNode,
  CampaignData,
  CreativeAssetType,
  CreativeData,
} from '@/CampaignCanvas/types';
import { liveChangeFieldLabel, liveChangeValueText } from './liveChange';

export type LecturaMark = 'changed' | 'added' | 'paused' | 'unchanged';

/** A before → after line, already worded. */
export type LecturaRow = { field: string; label: string; before: string; after: string };

export type LecturaAd = {
  id: string;
  name: string;
  mark: LecturaMark;
  /** It is unchanged itself but stops because its ad set or campaign is paused. */
  stops: boolean;
  thumbnailUrl: string | null;
  creativeKind: CreativeAssetType | null;
};

export type LecturaProvenance = { userGave: number; jainaFilled: number; jainaAsks: number };

export type LecturaAdSet = {
  id: string;
  name: string;
  mark: LecturaMark;
  status: string | null;
  /** Minor units; null when the campaign holds the budget. */
  budgetBefore: number | null;
  budgetAfter: number | null;
  rows: LecturaRow[];
  basedOnName: string | null;
  audience: string | null;
  ads: LecturaAd[];
  stopsWithParent: boolean;
  provenance: LecturaProvenance | null;
};

export type LecturaCampaign = {
  id: string;
  name: string;
  mark: LecturaMark;
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

/** Past this many ad sets the cards become a long scroll; the table reads better. */
export const LECTURA_TABLE_THRESHOLD = 12;

export const prefersLecturaTable = (model: LecturaModel): boolean =>
  model.adSetCount > LECTURA_TABLE_THRESHOLD;

export const lecturaMoney = (minor: number | null, currency: string | null): string | null =>
  minor === null ? null : formatMoney(minor / 100, currency);

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

const basisOf = (node: LiveChangeNode): string | null => {
  const basis = (node as Record<string, unknown>).basis;
  return typeof basis === 'string' && basis.trim().length > 0 ? basis.trim() : null;
};

const titleOf = (node: LiveChangeNode, rows: LecturaRow[]): string => {
  const level = node.level === 'adset' ? 'ad set' : node.level;
  if (node.mark === 'paused') return `Pause the ${level}`;
  if (node.mark === 'added') return `New ${level}, created paused`;
  const fields = rows.filter((row) => row.field !== 'status').map((row) => row.label);
  return fields.length > 0 ? fields.join(' · ') : `Change the ${level}`;
};

export const lecturaFromLiveChange = (payload: LiveChangePreviewPayload): LecturaModel => {
  const { currency } = payload;
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
          title: titleOf(campaign, campaignRows),
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
                stops: ad.mark === 'unchanged' && adSetStops,
                thumbnailUrl: null,
                creativeKind: null,
              }),
            );

          if (adSet.mark !== 'unchanged') {
            changes.push({
              id: adSet.id,
              level: 'adset',
              mark: adSet.mark,
              campaignName: campaign.name,
              adSetName: adSet.name,
              title: titleOf(adSet, rows),
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
              title: `${ad.name}: ${titleOf(ad, adRows).toLowerCase()}`,
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
            budgetBefore,
            budgetAfter,
            rows,
            basedOnName: adSet.basedOnId ? (nameOf.get(adSet.basedOnId) ?? null) : null,
            audience: null,
            ads,
            stopsWithParent,
            provenance: null,
          };
        });

      return {
        id: campaign.id,
        name: campaign.name,
        mark: campaign.mark,
        rows: campaignRows,
        campaignBudget,
        adSets,
      };
    });

  return {
    kind: 'change',
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

/** "MX, CO · 25-44 · women · 3 interests", from the audience node the ad set reads. */
export const audienceLineOf = (audience: AudienceData | null): string | null => {
  if (!audience) return null;
  if (audience.mode === 'copied') {
    return audience.copiedFromAdSetName
      ? `Copied from ${audience.copiedFromAdSetName}`
      : 'Copied targeting';
  }
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
  return parts.length > 0 ? parts.join(' · ') : audience.label || null;
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

export const lecturaFromCanvasGraph = (
  nodes: readonly CampaignCanvasNode[],
  edges: readonly CampaignCanvasEdge[],
): LecturaModel => {
  const byId = new Map(nodes.map((node) => [node.id, node]));
  const targetsOf = (id: string) =>
    edges.filter((edge) => edge.source === id).map((edge) => byId.get(edge.target));
  const sourcesOf = (id: string) =>
    edges.filter((edge) => edge.target === id).map((edge) => byId.get(edge.source));

  const campaignNodes = nodes.filter((node) => node.type === 'campaign');
  let currency: string | null = null;
  let total = 0;
  let anyBudget = false;
  const split: BudgetSlice[] = [];

  const campaigns = campaignNodes.map((campaignNode): LecturaCampaign => {
    const campaign = campaignNode.data as CampaignData;
    const cbo = campaign.budgetMode === 'cbo';
    currency ??= campaign.budgetCurrency ?? null;
    if (cbo) {
      const minor = toMinor(campaign.campaignBudgetAmount);
      if (minor !== null) {
        anyBudget = true;
        total += minor;
        split.push({ id: campaignNode.id, name: campaign.label, minor, tone: 'kept' });
      }
    }
    const adSets = targetsOf(campaignNode.id)
      .filter((node): node is CampaignCanvasNode => node?.type === 'ad-set')
      .map((adSetNode): LecturaAdSet => {
        const adSet = adSetNode.data as AdSetData;
        currency ??= adSet.budgetCurrency ?? null;
        const minor = cbo ? null : toMinor(adSet.budgetAmount);
        if (minor !== null) {
          anyBudget = true;
          total += minor;
          split.push({ id: adSetNode.id, name: adSet.label, minor, tone: 'kept' });
        }
        const audienceNode = sourcesOf(adSetNode.id).find((node) => node?.type === 'audience');
        const provenance: LecturaProvenance = { userGave: 0, jainaFilled: 0, jainaAsks: 0 };
        countProvenance(provenance, adSet.fieldProvenance);
        countProvenance(
          provenance,
          (audienceNode?.data as AudienceData | undefined)?.fieldProvenance,
        );
        const ads = targetsOf(adSetNode.id)
          .filter((node): node is CampaignCanvasNode => node?.type === 'ad')
          .map((adNode): LecturaAd => {
            countProvenance(provenance, adNode.data.fieldProvenance as LecturaFieldProvenance);
            const creativeNode = targetsOf(adNode.id).find((node) => node?.type === 'creative');
            const creative = (creativeNode?.data as CreativeData | undefined) ?? null;
            if (creative) countProvenance(provenance, creative.fieldProvenance);
            return {
              id: adNode.id,
              name: adNode.data.label,
              mark: 'unchanged',
              stops: false,
              thumbnailUrl:
                creative?.thumbnailUrl ??
                creative?.cards?.find((card) => card.thumbnailUrl)?.thumbnailUrl ??
                null,
              creativeKind: creative?.assetType ?? null,
            };
          });
        const counted = provenance.userGave + provenance.jainaFilled + provenance.jainaAsks;
        return {
          id: adSetNode.id,
          name: adSet.label,
          mark: 'unchanged',
          status: adSet.provenance?.metaStatus ?? null,
          budgetBefore: null,
          budgetAfter: minor,
          rows: [],
          basedOnName:
            (audienceNode?.data as AudienceData | undefined)?.mode === 'copied'
              ? ((audienceNode?.data as AudienceData).copiedFromAdSetName ?? null)
              : null,
          audience: audienceLineOf((audienceNode?.data as AudienceData | undefined) ?? null),
          ads,
          stopsWithParent: false,
          provenance: counted > 0 ? provenance : null,
        };
      });
    return {
      id: campaignNode.id,
      name: campaign.label,
      mark: 'unchanged',
      rows: [],
      campaignBudget: cbo,
      adSets,
    };
  });

  return {
    kind: 'new',
    currency,
    campaigns,
    changes: [],
    truncated: false,
    totals: { before: null, after: anyBudget ? total : null, newWhenActivated: 0 },
    split,
    adSetCount: sum(campaigns.map((campaign) => campaign.adSets.length)),
  };
};

type LecturaFieldProvenance = Partial<Record<string, FieldProvenance>> | undefined;
