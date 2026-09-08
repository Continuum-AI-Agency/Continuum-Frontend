// Project membership — tag / untag / list.
//
// Same auth shape as the CRUD route: gate on the user-scoped client, query on the admin
// client, re-apply the brand filter by hand. One extra check lives here that the CRUD route
// does not need: the project must belong to the SAME brand the caller was gated on, or a
// caller with access to brand A could tag things into brand B's project by id.
//
// The membership row carries `brand_id`, and every reader is expected to AND on brand scope
// (media.library_browse_page does: its project predicate sits inside a query already filtered
// to `a.brand_id = p_brand_id`). Entity ownership itself is deliberately not verified here —
// there are eight entity types across five schemas, and a row pointing at a foreign id is
// inert rather than leaky as long as readers hold that invariant.

import {
  projectMembershipQuerySchema,
  projectTagRequestSchema,
  projectUntagRequestSchema,
  toProjectMembership,
} from '@continuum/contracts';
import type { SupabaseClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';
import { callerHasBrandAccess } from '@/lib/media/brand-access.server';
import { brandProfilesSchema } from '@/lib/projects/schema.server';
import { createSupabaseAdminClient } from '@/lib/supabase/admin';
import { createSupabaseServerClient } from '@/lib/supabase/server';

type AuthorizedCaller = { userId: string };

async function authorize(brandId: string): Promise<AuthorizedCaller | NextResponse> {
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
  return { userId: user.id };
}

/** The project must be this brand's, or an id from another brand would be taggable. */
async function projectBelongsToBrand(
  admin: SupabaseClient,
  projectId: string,
  brandId: string,
): Promise<boolean> {
  const { data, error } = await brandProfilesSchema(admin)
    .from('projects')
    .select('id')
    .eq('id', projectId)
    .eq('brand_id', brandId)
    .maybeSingle();
  return !error && data !== null;
}

async function readJson(request: Request): Promise<unknown | NextResponse> {
  try {
    return await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }
}

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

  const caller = await authorize(brandId);
  if (caller instanceof NextResponse) return caller;

  const admin = createSupabaseAdminClient();
  let query = brandProfilesSchema(admin)
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

export async function POST(request: Request) {
  const body = await readJson(request);
  if (body instanceof NextResponse) return body;

  const parsed = projectTagRequestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.message }, { status: 422 });
  }
  const { brandId, projectId, entityType, entityIds } = parsed.data;

  const caller = await authorize(brandId);
  if (caller instanceof NextResponse) return caller;

  const admin = createSupabaseAdminClient();
  if (!(await projectBelongsToBrand(admin, projectId, brandId))) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  // Upsert on the composite primary key so re-tagging is idempotent — a multi-select that
  // overlaps what is already in the project must not 409 the whole batch.
  const { data, error } = await brandProfilesSchema(admin)
    .from('project_memberships')
    .upsert(
      [...new Set(entityIds)].map((entityId) => ({
        project_id: projectId,
        brand_id: brandId,
        entity_type: entityType,
        entity_id: entityId,
        added_by: caller.userId,
      })),
      { onConflict: 'project_id,entity_type,entity_id' },
    )
    .select('*');

  if (error) {
    console.error('[api/projects/memberships] tag failed', error);
    return NextResponse.json({ error: 'Tag failed' }, { status: 500 });
  }

  return NextResponse.json({ memberships: (data ?? []).map(toProjectMembership) }, { status: 201 });
}

export async function DELETE(request: Request) {
  const body = await readJson(request);
  if (body instanceof NextResponse) return body;

  const parsed = projectUntagRequestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.message }, { status: 422 });
  }
  const { brandId, projectId, entityType, entityIds } = parsed.data;

  const caller = await authorize(brandId);
  if (caller instanceof NextResponse) return caller;

  const admin = createSupabaseAdminClient();
  const { data, error } = await brandProfilesSchema(admin)
    .from('project_memberships')
    .delete()
    .eq('brand_id', brandId)
    .eq('project_id', projectId)
    .eq('entity_type', entityType)
    .in('entity_id', [...new Set(entityIds)])
    .select('entity_id');

  if (error) {
    console.error('[api/projects/memberships] untag failed', error);
    return NextResponse.json({ error: 'Untag failed' }, { status: 500 });
  }

  return NextResponse.json({ removed: (data ?? []).length });
}
