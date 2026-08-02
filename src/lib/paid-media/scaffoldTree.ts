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
};

/**
 * The genuine choices a model or a human makes. Everything NOT here is derived
 * server-side and is read-only in the UI by construction.
 *
 * Read defensively: `paid_scaffold_nodes.payload` has no schema anywhere yet
 * (D-NODE-PAYLOAD is open — `z.record` breaks Gemini's tool-declaration converter,
 * so nothing model-facing writes it). These fields may legitimately be absent.
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

const choicesOf = (payload: Record<string, unknown>): ScaffoldChoices => ({
  ...(readString(payload, 'objective') ? { objective: readString(payload, 'objective') } : {}),
  ...(readString(payload, 'optimization_goal')
    ? { optimizationGoal: readString(payload, 'optimization_goal') }
    : {}),
  ...(readString(payload, 'funnel_stage')
    ? { funnelStage: readString(payload, 'funnel_stage') }
    : {}),
  ...(readStringArray(payload, 'placement')
    ? { placement: readStringArray(payload, 'placement') }
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
});

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
