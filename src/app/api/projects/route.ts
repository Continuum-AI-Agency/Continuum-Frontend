// Projects CRUD — list / create / update / archive.
//
// Auth shape is copied verbatim from /api/library/collections: gate with
// `callerHasBrandAccess` on the USER-scoped client (has_brand_access is SECURITY DEFINER and
// reads auth.uid(), so it resolves nothing on the admin client), then run the query on the
// admin client and RE-APPLY the brand filter by hand. The RLS policy on the table is member
// SELECT only — every write here is service-role, which is exactly why the gate above it is
// the whole authorization story.

import {
  type Project,
  projectArchiveRequestSchema,
  projectCreateRequestSchema,
  projectListQuerySchema,
  projectUpdateRequestSchema,
  toProject,
} from '@continuum/contracts';
import { NextResponse } from 'next/server';
import { callerHasBrandAccess } from '@/lib/media/brand-access.server';
import { brandProfilesSchema } from '@/lib/projects/schema.server';
import { createSupabaseAdminClient } from '@/lib/supabase/admin';
import { createSupabaseServerClient } from '@/lib/supabase/server';

/** Raised by the unique index on (brand_id, lower(name)) where status = 'active'. */
const UNIQUE_VIOLATION = '23505';

type AuthorizedCaller = { userId: string };

async function authorize(
  brandId: string,
): Promise<AuthorizedCaller | NextResponse> {
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

async function readJson(request: Request): Promise<unknown | NextResponse> {
  try {
    return await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }
}

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

  const caller = await authorize(brandId);
  if (caller instanceof NextResponse) return caller;

  const admin = createSupabaseAdminClient();
  let query = brandProfilesSchema(admin)
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

export async function POST(request: Request) {
  const body = await readJson(request);
  if (body instanceof NextResponse) return body;

  const parsed = projectCreateRequestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.message }, { status: 422 });
  }
  const { brandId, name, brief, color, adAccountIds, campaignIds, leadUserId, startsOn, endsOn } =
    parsed.data;

  const caller = await authorize(brandId);
  if (caller instanceof NextResponse) return caller;

  const admin = createSupabaseAdminClient();
  const { data, error } = await brandProfilesSchema(admin)
    .from('projects')
    .insert({
      brand_id: brandId,
      name,
      brief: brief ?? null,
      color: color ?? null,
      ad_account_ids: adAccountIds,
      campaign_ids: campaignIds,
      // The creator leads unless someone says otherwise. A lead that defaults to nobody is
      // how a column ends up unused: "my projects" would be empty for everyone on day one,
      // and nobody would go back and fill it in.
      lead_user_id: leadUserId ?? caller.userId,
      starts_on: startsOn ?? null,
      ends_on: endsOn ?? null,
      created_by: caller.userId,
    })
    .select('*')
    .single();

  if (error) {
    if ((error as { code?: string }).code === UNIQUE_VIOLATION) {
      return NextResponse.json({ error: 'A project with that name already exists' }, { status: 409 });
    }
    console.error('[api/projects] create failed', error);
    return NextResponse.json({ error: 'Create failed' }, { status: 500 });
  }

  return NextResponse.json({ project: toProject(data) }, { status: 201 });
}

export async function PATCH(request: Request) {
  const body = await readJson(request);
  if (body instanceof NextResponse) return body;

  const parsed = projectUpdateRequestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.message }, { status: 422 });
  }
  const { brandId, projectId, ...changes } = parsed.data;

  const caller = await authorize(brandId);
  if (caller instanceof NextResponse) return caller;

  // Built from `in`, not from truthiness: an explicit null clears the field, an omitted key
  // leaves it alone, and `brief: ''` is a legitimate value the caller chose.
  const update: Record<string, unknown> = {};
  if ('name' in changes) update['name'] = changes.name;
  if ('brief' in changes) update['brief'] = changes.brief;
  if ('color' in changes) update['color'] = changes.color;
  if ('status' in changes) update['status'] = changes.status;
  if ('adAccountIds' in changes) update['ad_account_ids'] = changes.adAccountIds;
  if ('campaignIds' in changes) update['campaign_ids'] = changes.campaignIds;
  if ('leadUserId' in changes) update['lead_user_id'] = changes.leadUserId;
  if ('startsOn' in changes) update['starts_on'] = changes.startsOn;
  if ('endsOn' in changes) update['ends_on'] = changes.endsOn;
  if (Object.keys(update).length === 0) {
    return NextResponse.json({ error: 'No fields to update' }, { status: 422 });
  }

  const admin = createSupabaseAdminClient();
  const { data, error } = await brandProfilesSchema(admin)
    .from('projects')
    .update(update)
    .eq('id', projectId)
    // The brand filter is re-applied by hand because the admin client bypasses RLS: without
    // it, a caller with access to brand A could edit brand B's project by id.
    .eq('brand_id', brandId)
    .select('*')
    .maybeSingle();

  if (error) {
    if ((error as { code?: string }).code === UNIQUE_VIOLATION) {
      return NextResponse.json({ error: 'A project with that name already exists' }, { status: 409 });
    }
    console.error('[api/projects] update failed', error);
    return NextResponse.json({ error: 'Update failed' }, { status: 500 });
  }
  if (!data) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  return NextResponse.json({ project: toProject(data) });
}

/**
 * Archive, not delete. Memberships and history survive so a past approval still resolves the
 * scope it was made under; the unique name index excludes archived rows, so the name frees up.
 */
export async function DELETE(request: Request) {
  const params = new URL(request.url).searchParams;
  const parsed = projectArchiveRequestSchema.safeParse({
    brandId: params.get('brandId') ?? undefined,
    projectId: params.get('projectId') ?? undefined,
  });
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.message }, { status: 422 });
  }
  const { brandId, projectId } = parsed.data;

  const caller = await authorize(brandId);
  if (caller instanceof NextResponse) return caller;

  const admin = createSupabaseAdminClient();
  const { data, error } = await brandProfilesSchema(admin)
    .from('projects')
    .update({ status: 'archived' })
    .eq('id', projectId)
    .eq('brand_id', brandId)
    .select('*')
    .maybeSingle();

  if (error) {
    console.error('[api/projects] archive failed', error);
    return NextResponse.json({ error: 'Archive failed' }, { status: 500 });
  }
  if (!data) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  return NextResponse.json({ project: toProject(data) });
}
