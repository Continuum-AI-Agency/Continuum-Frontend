/**
 * The campaign -> ad set -> ad tree a scaffold card renders, built from database rows
 * and overlaid with live progress.
 *
 * Pure: no React, no Supabase, no fetch. The split it encodes is the one the whole
 * feature turns on — the DATABASE is the truth (a node's status and Meta id change
 * under it during every gate), and progress frames are only a PUSH telling the UI
 * something moved. So the overlay may advance a row optimistically but may never
 * walk one backwards.
 */

import type { JainaScaffoldNodeProgress } from '@/lib/jaina/stream';

export type ScaffoldNodeStatus =
  | 'pending'
  | 'creating'
  | 'created'
  | 'activating'
  | 'active'
  | 'failed_retryable'
  | 'failed_terminal'
  | 'indeterminate';

export type PaidScaffoldNodeRow = {
  id: string;
  parentId: string | null;
  level: 'campaign' | 'adset' | 'ad';
  ordinal: number;
  pathKey: string;
  name: string;
  productKey: string | null;
  angleKey: string | null;
  conceptKey: string | null;
  payload: Record<string, unknown>;
  status: ScaffoldNodeStatus;
  metaObjectId: string | null;
  metaCreativeId: string | null;
  errorMessage: string | null;
  attempt: number;
  creativeAssetId: string | null;
  creativeMedia: Record<string, unknown> | null;
};

/**
 * The genuine choices a model or a human makes. Everything NOT here is derived
 * server-side and is read-only in the UI by construction.
 *
 * Still read defensively. D-NODE-PAYLOAD is resolved and `paid_scaffold_propose` now
 * writes these, but rows proposed before that change carry `payload = {}` and must
 * render as absent rather than as a crash or a zero.
 */
export type ScaffoldChoices = {
  objective?: string;
  optimizationGoal?: string;
  funnelStage?: string;
  placement?: string[];
};

/** Computed server-side and shown for review only. Never editable. */
export type ScaffoldDerived = {
  billingEvent?: string;
  targeting?: unknown;
  promotedObject?: unknown;
  specialAdCategories?: string[];
  /** Which audience group `targeting` was compiled from. Provenance, not a choice. */
  audienceGroupVersionId?: string;
};

export type ScaffoldAdRow = {
  id: string;
  pathKey: string;
  ordinal: number;
  name: string;
  conceptKey: string | null;
  status: ScaffoldNodeStatus;
  metaCreativeId: string | null;
  errorMessage: string | null;
  /** Set once a Library asset is attached through paid_scaffold_attach_creative. */
  creativeAssetId: string | null;
  creativeMedia: Record<string, unknown> | null;
};

export type ScaffoldAdSetRow = {
  id: string;
  pathKey: string;
  ordinal: number;
  name: string;
  productKey: string | null;
  angleKey: string | null;
  status: ScaffoldNodeStatus;
  metaObjectId: string | null;
  errorMessage: string | null;
  attempt: number;
  choices: ScaffoldChoices;
  derived: ScaffoldDerived;
  ads: ScaffoldAdRow[];
};

export type ScaffoldCampaignRow = {
  id: string;
  pathKey: string;
  name: string;
  status: ScaffoldNodeStatus;
  metaObjectId: string | null;
  choices: ScaffoldChoices;
  derived: ScaffoldDerived;
};

export type ScaffoldTree = {
  campaign: ScaffoldCampaignRow | null;
  adSets: ScaffoldAdSetRow[];
  counts: { adSets: number; ads: number; created: number; failed: number; pending: number };
};

/** How far along a status is. Used for the never-walk-backwards rule and for sorting. */
const STATUS_RANK: Record<ScaffoldNodeStatus, number> = {
  pending: 0,
  creating: 1,
  created: 2,
  activating: 3,
  active: 4,
  failed_retryable: 5,
  failed_terminal: 6,
  indeterminate: 7,
};

export const scaffoldStatusRank = (status: ScaffoldNodeStatus): number => STATUS_RANK[status] ?? 0;

const readString = (payload: Record<string, unknown>, key: string): string | undefined => {
  const value = payload[key];
  return typeof value === 'string' && value.length > 0 ? value : undefined;
};

const readStringArray = (payload: Record<string, unknown>, key: string): string[] | undefined => {
  const value = payload[key];
  if (!Array.isArray(value)) return undefined;
  const strings = value.filter((entry): entry is string => typeof entry === 'string');
  return strings.length > 0 ? strings : undefined;
};

/**
 * `payload.placement` is Meta's placement CHOICE — a discriminated union, not a list.
 * Flattened to display strings here so every consumer (table cell, canvas node, hover)
 * reads one shape and none of them has to know the union.
 *
 * `advantage_plus` names no surfaces on purpose: that is how Meta's automatic placement
 * is requested, so "Advantage+" is the whole truth about where the ad set can deliver.
 */
const placementLabelsOf = (value: unknown): string[] | undefined => {
  if (!value || typeof value !== 'object') return undefined;
  const choice = value as Record<string, unknown>;
  if (choice.mode === 'advantage_plus') return ['Advantage+'];
  if (choice.mode !== 'manual') return undefined;
  const labels = [
    ...(readStringArray(choice, 'publisher_platforms') ?? []),
    ...(readStringArray(choice, 'facebook_positions') ?? []).map((entry) => `fb:${entry}`),
    ...(readStringArray(choice, 'instagram_positions') ?? []).map((entry) => `ig:${entry}`),
    ...(readStringArray(choice, 'device_platforms') ?? []),
  ];
  return labels.length > 0 ? labels : undefined;
};

const choicesOf = (payload: Record<string, unknown>): ScaffoldChoices => ({
  ...(readString(payload, 'objective') ? { objective: readString(payload, 'objective') } : {}),
  ...(readString(payload, 'optimization_goal')
    ? { optimizationGoal: readString(payload, 'optimization_goal') }
    : {}),
  ...(readString(payload, 'funnel_stage')
    ? { funnelStage: readString(payload, 'funnel_stage') }
    : {}),
  ...(placementLabelsOf(payload.placement)
    ? { placement: placementLabelsOf(payload.placement) }
    : {}),
});

const derivedOf = (payload: Record<string, unknown>): ScaffoldDerived => ({
  ...(readString(payload, 'billing_event')
    ? { billingEvent: readString(payload, 'billing_event') }
    : {}),
  ...(payload.targeting !== undefined ? { targeting: payload.targeting } : {}),
  ...(payload.promoted_object !== undefined ? { promotedObject: payload.promoted_object } : {}),
  ...(readStringArray(payload, 'special_ad_categories')
    ? { specialAdCategories: readStringArray(payload, 'special_ad_categories') }
    : {}),
  ...(readString(payload, 'audience_group_version_id')
    ? { audienceGroupVersionId: readString(payload, 'audience_group_version_id') }
    : {}),
});

/**
 * One line describing who an ad set delivers to, from a compiled targeting spec.
 *
 * Lives here rather than beside the table column because the canvas hover needs the
 * identical sentence — two summaries of the same spec that disagreed would read as two
 * different audiences.
 */
export const targetingSummary = (targeting: unknown): string | null => {
  if (!targeting || typeof targeting !== 'object') return null;
  const record = targeting as Record<string, unknown>;
  const parts: string[] = [];
  const included = record.custom_audiences;
  const excluded = record.excluded_custom_audiences;
  if (Array.isArray(included) && included.length > 0) parts.push(`${included.length} included`);
  if (Array.isArray(excluded) && excluded.length > 0) parts.push(`${excluded.length} excluded`);
  const countries = (record.geo_locations as Record<string, unknown> | undefined)?.countries;
  if (Array.isArray(countries) && countries.length > 0) parts.push(countries.join('/'));
  const ageMin = record.age_min;
  const ageMax = record.age_max;
  if (typeof ageMin === 'number' || typeof ageMax === 'number') {
    parts.push(`${ageMin ?? '?'}–${ageMax ?? '?'}`);
  }
  return parts.length > 0 ? parts.join(' · ') : null;
};

/**
 * The precedence rule, stated once.
 *
 * A live frame may advance a row the database has not caught up with yet, but a
 * stale query result must never drag a row backwards. Encoding it as a rank
 * comparison makes late frames and stale fetches harmless in BOTH directions,
 * which is what lets the query cache sit at a 30s staleTime without ever lying.
 */
export const effectiveScaffoldStatus = (
  rowStatus: ScaffoldNodeStatus,
  progress: JainaScaffoldNodeProgress | undefined,
): ScaffoldNodeStatus => {
  if (!progress) return rowStatus;
  const implied: ScaffoldNodeStatus | null =
    progress.status === 'succeeded'
      ? 'created'
      : progress.status === 'failed'
        ? 'failed_retryable'
        : progress.status === 'started'
          ? 'creating'
          : null;
  if (!implied) return rowStatus;
  return scaffoldStatusRank(implied) > scaffoldStatusRank(rowStatus) ? implied : rowStatus;
};

export const buildScaffoldTree = (
  rows: readonly PaidScaffoldNodeRow[],
  overlay: Readonly<Record<string, JainaScaffoldNodeProgress>> = {},
): ScaffoldTree => {
  const statusOf = (row: PaidScaffoldNodeRow): ScaffoldNodeStatus =>
    effectiveScaffoldStatus(row.status, overlay[row.pathKey]);

  const campaignRow = rows.find((row) => row.level === 'campaign') ?? null;
  const adSetsById = new Map<string, ScaffoldAdSetRow>();

  for (const row of rows) {
    if (row.level !== 'adset') continue;
    adSetsById.set(row.id, {
      id: row.id,
      pathKey: row.pathKey,
      ordinal: row.ordinal,
      name: row.name,
      productKey: row.productKey,
      angleKey: row.angleKey,
      status: statusOf(row),
      metaObjectId: row.metaObjectId,
      errorMessage: row.errorMessage,
      attempt: row.attempt,
      choices: choicesOf(row.payload),
      derived: derivedOf(row.payload),
      ads: [],
    });
  }

  for (const row of rows) {
    if (row.level !== 'ad' || !row.parentId) continue;
    adSetsById.get(row.parentId)?.ads.push({
      id: row.id,
      pathKey: row.pathKey,
      ordinal: row.ordinal,
      name: row.name,
      conceptKey: row.conceptKey,
      status: statusOf(row),
      metaCreativeId: row.metaCreativeId,
      errorMessage: row.errorMessage,
      creativeAssetId: row.creativeAssetId,
      creativeMedia: row.creativeMedia,
    });
  }

  const adSets = [...adSetsById.values()].sort((left, right) => left.ordinal - right.ordinal);
  for (const adSet of adSets) adSet.ads.sort((left, right) => left.ordinal - right.ordinal);

  const everyNodeStatus = [
    ...adSets.map((adSet) => adSet.status),
    ...adSets.flatMap((adSet) => adSet.ads.map((ad) => ad.status)),
    ...(campaignRow ? [statusOf(campaignRow)] : []),
  ];

  return {
    campaign: campaignRow
      ? {
          id: campaignRow.id,
          pathKey: campaignRow.pathKey,
          name: campaignRow.name,
          status: statusOf(campaignRow),
          metaObjectId: campaignRow.metaObjectId,
          choices: choicesOf(campaignRow.payload),
          derived: derivedOf(campaignRow.payload),
        }
      : null,
    adSets,
    counts: {
      adSets: adSets.length,
      ads: adSets.reduce((total, adSet) => total + adSet.ads.length, 0),
      created: everyNodeStatus.filter((status) => status === 'created' || status === 'active')
        .length,
      failed: everyNodeStatus.filter(
        (status) =>
          status === 'failed_retryable' ||
          status === 'failed_terminal' ||
          status === 'indeterminate',
      ).length,
      pending: everyNodeStatus.filter((status) => status === 'pending').length,
    },
  };
};
