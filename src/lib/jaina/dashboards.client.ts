// Saved dashboards, read and written as the signed-in user through PostgREST. RLS on
// brand_profiles.jaina_dashboards enforces brand membership; this file only shapes rows.

import {
  type JainaDashboard,
  type JainaDashboardInsert,
  jainaDashboardInsertSchema,
  jainaDashboardSchema,
} from '@continuum/contracts';
import { createSupabaseBrowserClient } from '@/lib/supabase/client';

const TABLE = 'jaina_dashboards';

const asRecord = (error: unknown): Record<string, unknown> | null =>
  typeof error === 'object' && error !== null ? (error as Record<string, unknown>) : null;

/** What a PostgREST / Supabase error actually said. The default `error.message` can be
 *  empty or missing on some shapes, and "undefined" tells nobody anything. */
export function describeSupabaseError(error: unknown): string {
  if (error instanceof Error && error.message) return error.message;
  const rec = asRecord(error);
  if (!rec) return String(error);
  const code = typeof rec.code === 'string' ? rec.code : null;
  if (code === 'PGRST205' || code === '42P01') {
    return 'The dashboards table is not in the database yet (migration 20260918150000 pending). Nothing was saved.';
  }
  if (code === '42501') {
    return 'You do not have access to save dashboards for this brand.';
  }
  const parts = [rec.message, rec.details, rec.hint, code ? `code ${code}` : null]
    .filter((part): part is string => typeof part === 'string' && part.length > 0)
    .map((part) => part.trim());
  if (parts.length > 0) return parts.join(' · ');
  try {
    return JSON.stringify(error);
  } catch {
    return 'unknown error';
  }
}

/**
 * PostgREST's answer to a column the table does not have yet: the `spec` column ships in
 * migration 20260923205040, which is applied separately from this code. Until it lands, a
 * save keeps the dashboard and drops the spec rather than failing the whole save.
 */
export function isMissingSpecColumn(error: unknown): boolean {
  const rec = asRecord(error);
  return rec?.code === 'PGRST204' && /'spec'/.test(String(rec.message ?? ''));
}

// The table is newer than the generated Database types; the cast keeps the typed client
// and lets the contract schema do the checking on the way back.
const table = () =>
  createSupabaseBrowserClient()
    .schema('brand_profiles')
    .from(TABLE as never);

export async function listDashboards(brandId: string): Promise<JainaDashboard[]> {
  const { data, error } = await table()
    .select('*')
    .eq('brand_id', brandId)
    .order('created_at', { ascending: false })
    .limit(50);
  if (error) throw new Error(`Could not load saved dashboards: ${describeSupabaseError(error)}`);
  const rows: JainaDashboard[] = [];
  for (const row of (data ?? []) as unknown[]) {
    const parsed = jainaDashboardSchema.safeParse(row);
    if (parsed.success) rows.push(parsed.data);
  }
  return rows;
}

const insertRow = (row: Record<string, unknown>) =>
  table()
    .insert(row as never)
    .select('*')
    .single();

const withoutSpec = (row: Record<string, unknown>): Record<string, unknown> =>
  Object.fromEntries(Object.entries(row).filter(([key]) => key !== 'spec'));

export async function saveDashboard(input: JainaDashboardInsert): Promise<JainaDashboard> {
  const payload = jainaDashboardInsertSchema.parse(input);
  const { data: auth } = await createSupabaseBrowserClient().auth.getUser();
  const row: Record<string, unknown> = { ...payload, created_by: auth.user?.id ?? null };
  let result = await insertRow(row);
  if (result.error && isMissingSpecColumn(result.error)) {
    result = await insertRow(withoutSpec(row));
  }
  if (result.error) {
    throw new Error(`Could not save the dashboard: ${describeSupabaseError(result.error)}`);
  }
  return jainaDashboardSchema.parse(result.data);
}

export async function deleteDashboard(id: string): Promise<void> {
  const { error } = await table().delete().eq('id', id);
  if (error) throw new Error(`Could not delete the dashboard: ${describeSupabaseError(error)}`);
}
