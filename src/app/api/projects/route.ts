// Projects list. Read-only: every write goes through the `projects` edge function, because
// writes are service-role and that key stays off Vercel.
//
// The query runs on the caller's own client, under RLS (`projects_member_read` is
// has_brand_access). The explicit gate first turns a foreign brand into a 403 instead of an
// empty list that reads as "this brand has no projects".

import { type Project, projectListQuerySchema, toProject } from '@continuum/contracts';
import { NextResponse } from 'next/server';
import { callerHasBrandAccess } from '@/lib/media/brand-access.server';
import { brandProfilesSchema } from '@/lib/projects/schema.server';
import { createSupabaseServerClient } from '@/lib/supabase/server';

export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const parsed = projectListQuerySchema.safeParse({
    brandId: params.get('brandId') ?? undefined,
    ...(params.get('status') ? { status: params.get('status') } : {}),
  });
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.message }, { status: 422 });
  }
  const { brandId, status } = parsed.data;

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
    .from('projects')
    .select('*')
    .eq('brand_id', brandId)
    .order('created_at', { ascending: false });
  if (status !== 'all') query = query.eq('status', status);

  const { data, error } = await query;
  if (error) {
    console.error('[api/projects] list failed', error);
    return NextResponse.json({ error: 'Query failed' }, { status: 500 });
  }

  const projects: Project[] = (data ?? []).map(toProject);
  return NextResponse.json({ projects });
}
