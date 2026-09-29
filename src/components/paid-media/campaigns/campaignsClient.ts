'use client';

// The Scale › Campaigns tab's data and actions, as plain functions.
//
// Reads go through the same `paid-media-reporting` routes the dashboard uses, with the same
// request shape and error parsing. Writes do NOT live here: a row action only BUILDS the
// operator action (`buildEntityStatusAction`); the one path to Meta is the approval gate that
// `useJainaOperatorAction` opens and a person answers.

import {
  type JainaMetaEntityStatusReadBack,
  type JainaOperatorAction,
  jainaMetaEntityStatusReadBackSchema,
} from '@continuum/contracts';
import { z } from 'zod';
import type { OperatorActionResult } from '@/hooks/useJainaOperatorAction';
import { createConversationSessionResponseSchema } from '@/lib/jaina/conversations';
import { createSupabaseBrowserClient } from '@/lib/supabase/client';

export type EntityLevel = 'campaign' | 'adset' | 'ad';

export type ScaleEntityRow = {
  id: string;
  name: string;
  /** The configured status as read, upper-cased (ACTIVE, PAUSED, ARCHIVED, DELETED, ...). */
  status: string;
  /** Meta's delivery status, when the route returns it (e.g. CAMPAIGN_PAUSED). */
  effectiveStatus: string | null;
  /** Minor units of the account currency, as Meta sends them. */
  dailyBudget: string | null;
  lifetimeBudget: string | null;
};

export type ScaleEntityPage = {
  rows: ScaleEntityRow[];
  /** When the rows were read from Meta. Null when the route does not say (older functions). */
  fetchedAt: string | null;
};

export type ScaleScope = { brandId: string; adAccountId: string };

/**
 * Every campaign status `fetch-meta-campaigns` will list (its allow-list, `statuses.ts`): the tab
 * shows every campaign, and only the ACTIVE and PAUSED rows carry an action. Sent as a comma string
 * in both query and body; the older function ignores it (ACTIVE only).
 */
export const CAMPAIGN_STATUSES = 'ACTIVE,ARCHIVED,CAMPAIGN_PAUSED,IN_PROCESS,PAUSED,WITH_ISSUES';

export class ScaleLoadError extends Error {
  readonly errorCode?: string;
  readonly retryAfter?: number;

  constructor(message: string, errorCode?: string, retryAfter?: number) {
    super(message);
    this.name = 'ScaleLoadError';
    this.errorCode = errorCode;
    this.retryAfter = retryAfter;
  }
}

async function toLoadError(error: { message: string; context?: unknown }): Promise<ScaleLoadError> {
  const context = error.context as { json?: () => Promise<unknown> } | undefined;
  const payload = (await context?.json?.().catch(() => null)) as {
    error?: string;
    errorCode?: string;
    retryAfter?: number;
  } | null;
  return new ScaleLoadError(
    payload?.error ?? error.message,
    payload?.errorCode,
    payload?.retryAfter,
  );
}

const budgetSchema = z
  .union([z.string(), z.number()])
  .nullish()
  .transform((value) => (value === null || value === undefined ? null : String(value)));

const entityRowSchema = z
  .object({
    id: z.string().min(1),
    name: z.string().nullish(),
    status: z.string().nullish(),
    effectiveStatus: z.string().nullish(),
    effective_status: z.string().nullish(),
    dailyBudget: budgetSchema,
    lifetimeBudget: budgetSchema,
  })
  .transform(
    (row): ScaleEntityRow => ({
      id: row.id,
      name: row.name?.trim() || row.id,
      status: (row.status ?? 'UNKNOWN').toUpperCase(),
      effectiveStatus: (row.effectiveStatus ?? row.effective_status ?? null)?.toUpperCase() ?? null,
      dailyBudget: row.dailyBudget,
      lifetimeBudget: row.lifetimeBudget,
    }),
  );

function toRows(value: unknown): ScaleEntityRow[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    const parsed = entityRowSchema.safeParse(item);
    return parsed.success ? [parsed.data] : [];
  });
}

function readFetchedAt(data: unknown): string | null {
  if (!data || typeof data !== 'object') return null;
  for (const key of ['cachedAt', 'fetchedAt']) {
    const value = Reflect.get(data, key);
    if (typeof value === 'string' && Number.isFinite(Date.parse(value))) return value;
  }
  return null;
}

async function invokeReporting(
  route: 'campaigns' | 'adsets' | 'ads',
  query: Record<string, string>,
  body: Record<string, unknown>,
): Promise<unknown> {
  const supabase = createSupabaseBrowserClient();
  const { data, error } = await supabase.functions.invoke(
    `paid-media-reporting/${route}?${new URLSearchParams(query).toString()}`,
    { method: 'POST', body },
  );
  if (error) throw await toLoadError(error);
  return data;
}

type LoadOptions = { refresh?: boolean };

/** `refresh` bypasses the 12h Meta edge cache on functions that support it; older ones ignore it. */
const refreshFields = (
  refresh: boolean | undefined,
): { query: Record<string, string>; body: Record<string, unknown> } =>
  refresh ? { query: { refresh: 'true' }, body: { refresh: true } } : { query: {}, body: {} };

export async function fetchScaleCampaigns(
  scope: ScaleScope,
  options: LoadOptions = {},
): Promise<ScaleEntityPage> {
  const { brandId, adAccountId } = scope;
  const fresh = refreshFields(options.refresh);
  const data = await invokeReporting(
    'campaigns',
    { brandId, adAccountId, platform: 'meta', statuses: CAMPAIGN_STATUSES, ...fresh.query },
    { platform: 'meta', brandId, adAccountId, statuses: CAMPAIGN_STATUSES, ...fresh.body },
  );
  const campaigns = data && typeof data === 'object' ? Reflect.get(data, 'campaigns') : null;
  return { rows: toRows(campaigns), fetchedAt: readFetchedAt(data) };
}

export async function fetchScaleAdSets(
  scope: ScaleScope & { campaignId: string },
  options: LoadOptions = {},
): Promise<ScaleEntityPage> {
  const { brandId, adAccountId, campaignId } = scope;
  const fresh = refreshFields(options.refresh);
  const data = await invokeReporting(
    'adsets',
    { brandId, adAccountId, campaignId, platform: 'meta', ...fresh.query },
    { platform: 'meta', brandId, adAccountId, campaignId, ...fresh.body },
  );
  const adsets = data && typeof data === 'object' ? Reflect.get(data, 'adsets') : null;
  return { rows: toRows(adsets), fetchedAt: readFetchedAt(data) };
}

/** The dashboard's default ads request (last 7 days, daily trends), so both share one edge-cache
 *  entry instead of paying Meta twice for the same ad set. */
export async function fetchScaleAds(
  scope: ScaleScope & { adSetId: string },
  options: LoadOptions = {},
): Promise<ScaleEntityPage> {
  const { brandId, adAccountId, adSetId } = scope;
  const fresh = refreshFields(options.refresh);
  const data = await invokeReporting(
    'ads',
    {
      brandId,
      adAccountId,
      adSetId,
      platform: 'meta',
      includeTrends: 'true',
      trendResolution: 'daily',
      datePreset: 'last_7d',
      ...fresh.query,
    },
    {
      platform: 'meta',
      brandId,
      adAccountId,
      adSetId,
      includeTrends: true,
      trendResolution: 'daily',
      datePreset: 'last_7d',
      ...fresh.body,
    },
  );
  const ads = data && typeof data === 'object' ? Reflect.get(data, 'ads') : null;
  return { rows: toRows(ads), fetchedAt: readFetchedAt(data) };
}

/** One level of the tree: campaigns (no parent), a campaign's ad sets, or an ad set's ads. */
export function loadScaleEntities(
  level: EntityLevel,
  scope: ScaleScope,
  parentId: string | null,
  options: LoadOptions = {},
): Promise<ScaleEntityPage> {
  if (level === 'campaign') return fetchScaleCampaigns(scope, options);
  if (!parentId) return Promise.resolve({ rows: [], fetchedAt: null });
  return level === 'adset'
    ? fetchScaleAdSets({ ...scope, campaignId: parentId }, options)
    : fetchScaleAds({ ...scope, adSetId: parentId }, options);
}

export type ScaleEntitiesKey = readonly [
  'scale-entities',
  string,
  string,
  EntityLevel,
  string | null,
];

export const scaleEntitiesKeyPrefix = (scope: ScaleScope) =>
  ['scale-entities', scope.brandId, scope.adAccountId] as const;

export const scaleEntitiesKey = (
  level: EntityLevel,
  scope: ScaleScope,
  parentId: string | null,
): ScaleEntitiesKey => ['scale-entities', scope.brandId, scope.adAccountId, level, parentId];

export function scaleEntitiesQueryOptions(
  level: EntityLevel,
  scope: ScaleScope,
  parentId: string | null,
  options: LoadOptions = {},
) {
  return {
    queryKey: scaleEntitiesKey(level, scope, parentId),
    queryFn: () => loadScaleEntities(level, scope, parentId, options),
    staleTime: 5 * 60_000,
    retry: false,
    refetchOnWindowFocus: false,
  };
}

const LEVEL_NOUN: Record<EntityLevel, string> = { campaign: 'campaign', adset: 'ad set', ad: 'ad' };

export const levelNoun = (level: EntityLevel): string => LEVEL_NOUN[level];

export const DEFAULT_PAUSE_REASON = 'Paused from Scale › Campaigns';
export const DEFAULT_UNPAUSE_REASON = 'Unpaused from Scale › Campaigns';
const REASON_MAX = 500;

/**
 * The ONE place a row becomes an operator action. `expected_status` is the status the row was
 * READ with, so a stale row is refused by the tool rather than overwritten. Only ACTIVE rows can
 * be paused and only PAUSED rows unpaused; every other status gets no action (null).
 */
export function buildEntityStatusAction(
  row: Pick<ScaleEntityRow, 'id' | 'status'>,
  level: EntityLevel,
  reason?: string,
): JainaOperatorAction | null {
  const written = reason?.trim().slice(0, REASON_MAX);
  const status = row.status.toUpperCase();
  const base = { entity_id: row.id, level, dry_run: false as const };
  if (status === 'ACTIVE') {
    return {
      tool: 'pause_meta_entity',
      input: { ...base, reason: written || DEFAULT_PAUSE_REASON, expected_status: 'ACTIVE' },
    };
  }
  if (status === 'PAUSED') {
    return {
      tool: 'activate_meta_entity',
      input: { ...base, reason: written || DEFAULT_UNPAUSE_REASON, expected_status: 'PAUSED' },
    };
  }
  return null;
}

/** What the person asked, as the conversation records it: `Pause ad set "Summer Sale"`. */
export function describeEntityStatusAction(
  action: JainaOperatorAction,
  row: Pick<ScaleEntityRow, 'name'>,
  level: EntityLevel,
): string {
  const verb = action.tool === 'pause_meta_entity' ? 'Pause' : 'Unpause';
  return `${verb} ${levelNoun(level)} "${row.name}"`;
}

export type EntityStatusOutcome =
  | { kind: 'read_back'; readBack: JainaMetaEntityStatusReadBack }
  | { kind: 'refused'; code: string | null; message: string }
  | { kind: 'unreported' };

/** Reads the tool's result honestly: Meta's read-back, the tool's refusal, or neither. */
export function readEntityStatusOutcome(result: OperatorActionResult): EntityStatusOutcome {
  if (!result.ok) return { kind: 'refused', code: null, message: result.error };
  const output =
    result.output && typeof result.output === 'object'
      ? (result.output as Record<string, unknown>)
      : {};
  const readBack = jainaMetaEntityStatusReadBackSchema.safeParse(output.read_back);
  if (readBack.success) return { kind: 'read_back', readBack: readBack.data };
  if (output.ok === false) {
    const error =
      output.error && typeof output.error === 'object'
        ? (output.error as { code?: unknown; message?: unknown })
        : {};
    return {
      kind: 'refused',
      code: typeof error.code === 'string' ? error.code : null,
      message:
        typeof error.message === 'string' && error.message.length > 0
          ? error.message
          : 'Meta refused the change.',
    };
  }
  return { kind: 'unreported' };
}

/**
 * Makes sure the conversation the tab's actions are recorded in exists, and returns the id the
 * server confirmed. If the Backend later owns a per-brand Operations session, only this changes.
 */
export async function ensureOperationsSession(args: {
  brandId: string;
  adAccountId: string;
  sessionId: string;
}): Promise<string> {
  const response = await fetch('/api/agents/jaina/chat/conversations', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    cache: 'no-store',
    body: JSON.stringify({
      context: { adAccountId: args.adAccountId, brandId: args.brandId, sessionId: args.sessionId },
    }),
  });
  if (!response.ok) {
    const detail = await response.text().catch(() => '');
    throw new Error(detail || 'Could not open a Jaina session for this action.');
  }
  const parsed = createConversationSessionResponseSchema.safeParse(
    await response.json().catch(() => null),
  );
  if (!parsed.success) throw new Error('Jaina returned an invalid session.');
  return parsed.data.session_id;
}
