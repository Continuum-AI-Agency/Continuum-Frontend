import {
  createCommentRequestSchema,
  deleteCommentRequestSchema,
  listCommentsResponseSchema,
  type MediaComment,
  updateCommentRequestSchema,
} from '@continuum/contracts';
import type { SupabaseClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { fetchBrandAuthors } from '@/lib/library/commentAuthors';
import {
  type CommentAuthor,
  commentRowToMediaComment,
  type MediaCommentRow,
} from '@/lib/library/comments';
import {
  type AssetHeadRow,
  ensureHeadVersion,
  loadAssetHead,
  resolveHeadVersionId,
} from '@/lib/library/ensureHeadVersion';
import { callerHasBrandAccess } from '@/lib/media/brand-access.server';
import { mediaSchema } from '@/lib/media/supabase-media';
import { createSupabaseAdminClient } from '@/lib/supabase/admin';
import { createSupabaseServerClient } from '@/lib/supabase/server';

export const runtime = 'nodejs';

// Threaded comments on a Library asset (media.comments). All handlers run on
// the user-scoped client: RLS (has_brand_access on brand_id) is the hard
// boundary, callerHasBrandAccess gives the friendly 403 before any query.
//
// Every comment is pinned to a version. An annotation is anchored to pixels or
// to a frame, so a comment that floats free of a version renders its box over
// whatever file the asset happens to hold today — a v1 note landing on v2's
// image. The version is always resolved server-side (from the parent thread,
// from a validated request id, or from the current head), never trusted from
// the client and never left NULL.

const COMMENT_SELECT =
  'id, brand_id, asset_id, version_id, parent_comment_id, body, annotation, resolved_at, resolved_by, created_by, created_at, updated_at, deleted_at';

// Loose id strings on purpose, matching the contracts request schemas the
// other verbs validate with (see contracts-wire-dto-stay-loose).
const listQuerySchema = z.object({
  brandId: z.string().min(1),
  assetId: z.string().min(1),
});

type AuthedContext = { supabase: SupabaseClient; userId: string; userEmail: string | null };

async function requireCaller(): Promise<AuthedContext | NextResponse> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();
  if (error || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  return {
    supabase: supabase as unknown as SupabaseClient,
    userId: user.id,
    userEmail: user.email ?? null,
  };
}

async function readJson(request: Request): Promise<unknown | NextResponse> {
  try {
    return await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }
}

function toComment(
  row: MediaCommentRow,
  authors: Map<string, CommentAuthor>,
  fallbackEmail?: string | null,
): MediaComment {
  if (fallbackEmail && row.created_by && !authors.has(row.created_by)) {
    authors.set(row.created_by, { name: null, email: fallbackEmail });
  }
  return commentRowToMediaComment(row, authors);
}

// The one place a comment's version_id is decided. It can never come back null:
// a comment that names no version is a box floating over whatever file the asset
// holds today.
async function resolveCommentVersion(params: {
  supabase: SupabaseClient;
  head: AssetHeadRow;
  brandId: string;
  requestedVersionId: string | undefined;
  parentVersionId: string | null;
}): Promise<{ versionId: string } | NextResponse> {
  // A thread lives on one version. A reply inherits its parent's, whatever the
  // client asked for — a discussion cannot straddle two cuts of the file.
  if (params.parentVersionId) {
    return { versionId: params.parentVersionId };
  }

  // A caller commenting while viewing an archived version names it explicitly.
  // It is a client-supplied id, so it is proven to belong to THIS asset and
  // brand before it is trusted.
  if (params.requestedVersionId) {
    const { data, error } = await mediaSchema(params.supabase)
      .from('asset_versions')
      .select('id')
      .eq('id', params.requestedVersionId)
      .eq('asset_id', params.head.id)
      .eq('brand_id', params.brandId)
      .maybeSingle();
    if (error) {
      console.error('[library/comments] version lookup failed', error);
      return NextResponse.json({ error: 'Query failed' }, { status: 500 });
    }
    if (!data) {
      return NextResponse.json({ error: 'Version not found' }, { status: 404 });
    }
    return { versionId: params.requestedVersionId };
  }

  // Nothing named: the author was looking at the head. An asset that was never
  // re-uploaded has no version rows at all, so v1 is materialized here — on the
  // admin client, because the backfill preserves the asset creator as created_by
  // and RLS forbids a member from writing another user's created_by.
  try {
    const { headVersionId } = await ensureHeadVersion(createSupabaseAdminClient(), params.head);
    return { versionId: headVersionId };
  } catch (error) {
    console.error('[library/comments] head version resolution failed', error);
    return NextResponse.json({ error: 'Query failed' }, { status: 500 });
  }
}

export async function GET(request: Request) {
  const caller = await requireCaller();
  if (caller instanceof NextResponse) return caller;

  const url = new URL(request.url);
  const parsed = listQuerySchema.safeParse({
    brandId: url.searchParams.get('brandId'),
    assetId: url.searchParams.get('assetId'),
  });
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.message }, { status: 422 });
  }
  const { brandId, assetId } = parsed.data;

  if (!(await callerHasBrandAccess(caller.supabase, brandId))) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { data, error } = await mediaSchema(caller.supabase)
    .from('comments')
    .select(COMMENT_SELECT)
    .eq('brand_id', brandId)
    .eq('asset_id', assetId)
    .is('deleted_at', null)
    .order('created_at', { ascending: true });
  if (error) {
    console.error('[library/comments] list failed', error);
    return NextResponse.json({ error: 'Query failed' }, { status: 500 });
  }

  // Read-only: a GET never materializes v1, so headVersionId is null for an
  // asset whose history has not started. Consumers use it to tell a comment
  // written on the current file from one written on a superseded cut.
  let headVersionId: string | null = null;
  try {
    const head = await loadAssetHead(caller.supabase, brandId, assetId);
    if (head) headVersionId = await resolveHeadVersionId(caller.supabase, head);
  } catch (headError) {
    console.warn('[library/comments] head version lookup failed', headError);
  }

  const authors = await fetchBrandAuthors(caller.supabase, brandId);
  const rows = (data ?? []) as unknown as MediaCommentRow[];
  return NextResponse.json(
    listCommentsResponseSchema.parse({
      comments: rows.map((row) => toComment(row, authors)),
      headVersionId,
    }),
  );
}

export async function POST(request: Request) {
  const caller = await requireCaller();
  if (caller instanceof NextResponse) return caller;

  const body = await readJson(request);
  if (body instanceof NextResponse) return body;
  const parsed = createCommentRequestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.message }, { status: 422 });
  }
  const input = parsed.data;

  if (!(await callerHasBrandAccess(caller.supabase, input.brandId))) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  // Brand access alone does not prove the asset belongs to that brand — without
  // this, a member could hang a comment off another brand's asset id. The head
  // row doubles as the source of the version this comment gets pinned to.
  let head: AssetHeadRow | null;
  try {
    head = await loadAssetHead(caller.supabase, input.brandId, input.assetId);
  } catch {
    return NextResponse.json({ error: 'Query failed' }, { status: 500 });
  }
  if (!head) {
    return NextResponse.json({ error: 'Asset not found' }, { status: 404 });
  }

  // Threads are one level deep: replying to a reply attaches to its root.
  let parentCommentId: string | null = null;
  let parentVersionId: string | null = null;
  if (input.parentCommentId) {
    const { data: parent, error: parentError } = await mediaSchema(caller.supabase)
      .from('comments')
      .select('id, asset_id, parent_comment_id, version_id, deleted_at')
      .eq('id', input.parentCommentId)
      .eq('brand_id', input.brandId)
      .maybeSingle();
    if (parentError) {
      console.error('[library/comments] parent lookup failed', parentError);
      return NextResponse.json({ error: 'Query failed' }, { status: 500 });
    }
    const parentRow = parent as {
      id: string;
      asset_id: string;
      parent_comment_id: string | null;
      version_id: string | null;
      deleted_at: string | null;
    } | null;
    if (!parentRow || parentRow.deleted_at || parentRow.asset_id !== input.assetId) {
      return NextResponse.json({ error: 'Parent comment not found' }, { status: 404 });
    }
    parentCommentId = parentRow.parent_comment_id ?? parentRow.id;
    parentVersionId = parentRow.version_id;
  }

  const resolved = await resolveCommentVersion({
    supabase: caller.supabase,
    head,
    brandId: input.brandId,
    requestedVersionId: input.versionId,
    parentVersionId,
  });
  if (resolved instanceof NextResponse) return resolved;

  const { data, error } = await mediaSchema(caller.supabase)
    .from('comments')
    .insert({
      brand_id: input.brandId,
      asset_id: input.assetId,
      version_id: resolved.versionId,
      parent_comment_id: parentCommentId,
      body: input.body,
      annotation: input.annotation ?? null,
      created_by: caller.userId,
    })
    .select(COMMENT_SELECT)
    .single();
  if (error || !data) {
    console.error('[library/comments] insert failed', error);
    return NextResponse.json({ error: 'Insert failed' }, { status: 500 });
  }

  const authors = await fetchBrandAuthors(caller.supabase, input.brandId);
  return NextResponse.json(
    toComment(data as unknown as MediaCommentRow, authors, caller.userEmail),
    { status: 201 },
  );
}

export async function PATCH(request: Request) {
  const caller = await requireCaller();
  if (caller instanceof NextResponse) return caller;

  const body = await readJson(request);
  if (body instanceof NextResponse) return body;
  const parsed = updateCommentRequestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.message }, { status: 422 });
  }
  const input = parsed.data;

  if (!(await callerHasBrandAccess(caller.supabase, input.brandId))) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { data: existing, error: readError } = await mediaSchema(caller.supabase)
    .from('comments')
    .select('id, created_by, deleted_at')
    .eq('id', input.commentId)
    .eq('brand_id', input.brandId)
    .maybeSingle();
  if (readError) {
    console.error('[library/comments] update lookup failed', readError);
    return NextResponse.json({ error: 'Query failed' }, { status: 500 });
  }
  const existingRow = existing as {
    id: string;
    created_by: string | null;
    deleted_at: string | null;
  } | null;
  if (!existingRow || existingRow.deleted_at) {
    return NextResponse.json({ error: 'Comment not found' }, { status: 404 });
  }
  // Body edits are author-only; resolve/reopen is open to any brand member.
  if (input.body !== undefined && existingRow.created_by !== caller.userId) {
    return NextResponse.json({ error: 'Only the author can edit a comment' }, { status: 403 });
  }

  const patch: Record<string, unknown> = {};
  if (input.body !== undefined) patch.body = input.body;
  if (input.resolved !== undefined) {
    patch.resolved_at = input.resolved ? new Date().toISOString() : null;
    patch.resolved_by = input.resolved ? caller.userId : null;
  }

  const { data, error } = await mediaSchema(caller.supabase)
    .from('comments')
    .update(patch)
    .eq('id', input.commentId)
    .eq('brand_id', input.brandId)
    .select(COMMENT_SELECT)
    .single();
  if (error || !data) {
    console.error('[library/comments] update failed', error);
    return NextResponse.json({ error: 'Update failed' }, { status: 500 });
  }

  const authors = await fetchBrandAuthors(caller.supabase, input.brandId);
  return NextResponse.json(toComment(data as unknown as MediaCommentRow, authors));
}

export async function DELETE(request: Request) {
  const caller = await requireCaller();
  if (caller instanceof NextResponse) return caller;

  const body = await readJson(request);
  if (body instanceof NextResponse) return body;
  const parsed = deleteCommentRequestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.message }, { status: 422 });
  }
  const input = parsed.data;

  if (!(await callerHasBrandAccess(caller.supabase, input.brandId))) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  // Soft delete, own comments only. The created_by filter makes "someone
  // else's comment" and "already deleted" both read as not-found.
  const { data, error } = await mediaSchema(caller.supabase)
    .from('comments')
    .update({ deleted_at: new Date().toISOString() })
    .eq('id', input.commentId)
    .eq('brand_id', input.brandId)
    .eq('created_by', caller.userId)
    .is('deleted_at', null)
    .select('id');
  if (error) {
    console.error('[library/comments] delete failed', error);
    return NextResponse.json({ error: 'Delete failed' }, { status: 500 });
  }
  if (!data || (data as unknown[]).length === 0) {
    return NextResponse.json({ error: 'Comment not found' }, { status: 404 });
  }

  return NextResponse.json({ ok: true });
}
