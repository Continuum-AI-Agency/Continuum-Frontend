import type { SupabaseClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';
import { CreativeOperationError } from '@/lib/library/creativeOperations';

// The dispatcher's own status (403 insufficient_role, 404 not found, 422 invalid) is the
// honest answer; only an unexplained failure becomes a logged 500.
export function operationFailure(action: string, error: unknown): Response {
  const status = error instanceof CreativeOperationError ? (error.status ?? 500) : 500;
  if (status >= 500) console.error(`[library/collections] ${action} failed`, error);
  return NextResponse.json(
    { error: error instanceof Error ? error.message : `${action} failed` },
    { status },
  );
}

/**
 * A viewer's collection write is refused here with an honest 403 before it reaches the
 * dispatcher. The dispatcher (authorize_operation) and the restrictive RLS refuse it too —
 * this does not replace them, it only answers the viewer plainly instead of relaying
 * whatever status an older dispatcher deployment maps the refusal to.
 */
export async function refuseViewer(
  supabase: SupabaseClient,
  brandId: string,
): Promise<Response | null> {
  const { data, error } = await supabase
    .schema('brand_profiles')
    .rpc('brand_role', { p_brand_id: brandId });
  if (error || data !== 'viewer') return null;
  return NextResponse.json({ error: 'Your role cannot change collections' }, { status: 403 });
}
