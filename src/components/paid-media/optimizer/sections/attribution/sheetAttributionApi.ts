'use client';

// The spreadsheet source's calls. Reading a sheet — the Google token, the CSV, the header
// guess, matching rows against the portfolio — is the Optimizer service's job, reached through
// the optimizer-attribution-sheet edge like every other optimizer call. Saving the mapping is
// optimizer_upsert_sheet_attribution_source (20261005120100). Each call answers one of three
// outcomes, never throws: `unavailable` is the edge or the RPC not being reachable from here yet
// (404/501, a missing function, or a function only the service may call), which the panel
// shows as "not available yet" rather than as an error.

import {
  SHEET_ATTRIBUTION_EDGE,
  type SheetAttributionConfig,
  type SheetAttributionRequest,
  SheetAttributionRequestSchema,
  type SheetInspectResponse,
  SheetInspectResponseSchema,
  type SheetSyncReport,
  SheetSyncReportSchema,
} from '@continuum/contracts';
import { createSupabaseBrowserClient } from '@/lib/supabase/client';
import { readEdgeErrorMessage } from '@/lib/supabase/edgeErrorMessage';
import { isMissingRpcError } from '../platforms/multiplatformRead';

export const UPSERT_SHEET_SOURCE_RPC = 'optimizer_upsert_sheet_attribution_source';

export type SheetCallOutcome<T> =
  | { status: 'ready'; data: T }
  | { status: 'unavailable' }
  | { status: 'error'; message: string };

export type SheetAttributionClient = {
  rpc: (fn: string, args?: Record<string, unknown>) => Promise<{ data: unknown; error: unknown }>;
  functions: {
    invoke: (
      name: string,
      options?: { body?: unknown },
    ) => Promise<{ data: unknown; error: unknown }>;
  };
};

function defaultClient(): SheetAttributionClient {
  return createSupabaseBrowserClient() as unknown as SheetAttributionClient;
}

/** 42501 = insufficient_privilege: the RPC exists but only the Optimizer service may call it. */
function rpcUnreachable(error: unknown): boolean {
  if (isMissingRpcError(error)) return true;
  return (
    typeof error === 'object' && error !== null && (error as { code?: unknown }).code === '42501'
  );
}

function edgeStatus(error: unknown): number | null {
  const status = (error as { context?: { status?: unknown } } | null)?.context?.status;
  return typeof status === 'number' ? status : null;
}

async function invokeSheetEdge<T>(
  request: SheetAttributionRequest,
  schema: { safeParse: (value: unknown) => { success: true; data: T } | { success: false } },
  client: SheetAttributionClient,
): Promise<SheetCallOutcome<T>> {
  const body = SheetAttributionRequestSchema.parse(request);
  const { data, error } = await client.functions.invoke(SHEET_ATTRIBUTION_EDGE, { body });
  if (error) {
    const status = edgeStatus(error);
    if (status === 404 || status === 501) return { status: 'unavailable' };
    return {
      status: 'error',
      message: await readEdgeErrorMessage(error, 'The sheet could not be read.'),
    };
  }
  const parsed = schema.safeParse(data);
  if (!parsed.success)
    return { status: 'error', message: 'The sheet read answered in a shape we do not know.' };
  return { status: 'ready', data: parsed.data };
}

export type SheetLocationInput =
  | { source: 'google_sheet'; spreadsheetId: string; tab?: string }
  | { source: 'csv_upload'; csv: string };

/** The tabs, the first five rows and the header guess. Reads only. */
export function inspectSheet(
  portfolioId: string,
  location: SheetLocationInput,
  client: SheetAttributionClient = defaultClient(),
): Promise<SheetCallOutcome<SheetInspectResponse>> {
  return invokeSheetEdge(
    { action: 'inspect', portfolioId, ...location },
    SheetInspectResponseSchema,
    client,
  );
}

/** Read and match with this mapping, writing nothing: the live match check. */
export function checkSheet(
  portfolioId: string,
  config: SheetAttributionConfig,
  csv: string | null,
  client: SheetAttributionClient = defaultClient(),
): Promise<SheetCallOutcome<SheetSyncReport>> {
  return invokeSheetEdge(
    { action: 'check', portfolioId, config, ...(csv ? { csv } : {}) },
    SheetSyncReportSchema,
    client,
  );
}

/** "Re-read now": the saved source, read again, its days replaced whole. */
export function syncSheet(
  portfolioId: string,
  csv: string | null,
  client: SheetAttributionClient = defaultClient(),
): Promise<SheetCallOutcome<SheetSyncReport>> {
  return invokeSheetEdge(
    { action: 'sync', portfolioId, ...(csv ? { csv } : {}) },
    SheetSyncReportSchema,
    client,
  );
}

/** Save the mapping as the portfolio's spreadsheet source and make it the one in use. */
export async function saveSheetSource(
  portfolioId: string,
  config: SheetAttributionConfig,
  label: string | null,
  client: SheetAttributionClient = defaultClient(),
): Promise<SheetCallOutcome<{ sourceId: string }>> {
  const { data, error } = await client.rpc(UPSERT_SHEET_SOURCE_RPC, {
    p_portfolio_id: portfolioId,
    p_config: config,
    p_label: label,
    p_activate: true,
  });
  if (error) {
    if (rpcUnreachable(error)) return { status: 'unavailable' };
    const message = (error as { message?: unknown }).message;
    return {
      status: 'error',
      message: typeof message === 'string' ? message : 'The sheet could not be saved.',
    };
  }
  if (typeof data !== 'string')
    return { status: 'error', message: 'The save answered without a source id.' };
  return { status: 'ready', data: { sourceId: data } };
}

/** The four calls as one value, so the panel can be rendered against a stand-in. */
export type SheetAttributionApi = {
  inspect: (
    portfolioId: string,
    location: SheetLocationInput,
  ) => Promise<SheetCallOutcome<SheetInspectResponse>>;
  check: (
    portfolioId: string,
    config: SheetAttributionConfig,
    csv: string | null,
  ) => Promise<SheetCallOutcome<SheetSyncReport>>;
  sync: (portfolioId: string, csv: string | null) => Promise<SheetCallOutcome<SheetSyncReport>>;
  save: (
    portfolioId: string,
    config: SheetAttributionConfig,
    label: string | null,
  ) => Promise<SheetCallOutcome<{ sourceId: string }>>;
};

export const sheetAttributionApi: SheetAttributionApi = {
  inspect: (portfolioId, location) => inspectSheet(portfolioId, location),
  check: (portfolioId, config, csv) => checkSheet(portfolioId, config, csv),
  sync: (portfolioId, csv) => syncSheet(portfolioId, csv),
  save: (portfolioId, config, label) => saveSheetSource(portfolioId, config, label),
};
