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

/** What a PostgREST / Supabase error actually said. The default `error.message` can be
 *  empty or missing on some shapes, and "undefined" tells nobody anything. */
export function describeSupabaseError(error: unknown): string {
  if (error instanceof Error && error.message) return error.message;
  const rec =
    typeof error === 'object' && error !== null ? (error as Record<string, unknown>) : null;
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

export async function saveDashboard(input: JainaDashboardInsert): Promise<JainaDashboard> {
  const payload = jainaDashboardInsertSchema.parse(input);
  const { data: auth } = await createSupabaseBrowserClient().auth.getUser();
  const { data, error } = await table()
    .insert({ ...payload, created_by: auth.user?.id ?? null } as never)
    .select('*')
    .single();
  if (error) throw new Error(`Could not save the dashboard: ${describeSupabaseError(error)}`);
  return jainaDashboardSchema.parse(data);
}

export async function deleteDashboard(id: string): Promise<void> {
  const { error } = await table().delete().eq('id', id);
  if (error) throw new Error(`Could not delete the dashboard: ${describeSupabaseError(error)}`);
}
