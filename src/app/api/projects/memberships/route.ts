// Project memberships list. Read-only: tag and untag go through the `projects` edge function,
// because writes are service-role and that key stays off Vercel.
//
// The query runs on the caller's own client, under RLS (`project_memberships_member_read` is
// has_brand_access); the explicit gate first turns a foreign brand into a 403.

import { projectMembershipQuerySchema, toProjectMembership } from '@continuum/contracts';
import { NextResponse } from 'next/server';
import { callerHasBrandAccess } from '@/lib/media/brand-access.server';
import { brandProfilesSchema } from '@/lib/projects/schema.server';
import { createSupabaseServerClient } from '@/lib/supabase/server';

export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const parsed = projectMembershipQuerySchema.safeParse({
    brandId: params.get('brandId') ?? undefined,
    ...(params.get('projectId') ? { projectId: params.get('projectId') } : {}),
    ...(params.get('entityType') ? { entityType: params.get('entityType') } : {}),
    ...(params.get('entityId') ? { entityId: params.get('entityId') } : {}),
  });
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.message }, { status: 422 });
  }
  const { brandId, projectId, entityType, entityId } = parsed.data;

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();
  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  if (!(await callerHasBrandAccess(supabase, brandId))) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  let query = brandProfilesSchema(supabase)
    .from('project_memberships')
    .select('*')
    .eq('brand_id', brandId);
  if (projectId) query = query.eq('project_id', projectId);
  if (entityType) query = query.eq('entity_type', entityType);
  if (entityId) query = query.eq('entity_id', entityId);

  const { data, error } = await query;
  if (error) {
    console.error('[api/projects/memberships] list failed', error);
    return NextResponse.json({ error: 'Query failed' }, { status: 500 });
  }

  return NextResponse.json({ memberships: (data ?? []).map(toProjectMembership) });
}
