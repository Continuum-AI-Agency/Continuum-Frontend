import { type CommentVisibility, patchCommentMetadataRequestSchema } from '@continuum/contracts';
import { NextResponse } from 'next/server';
import { fetchBrandAuthors } from '@/lib/library/commentAuthors';
import { commentRowToMediaComment, type MediaCommentRow } from '@/lib/library/comments';
import { requireBrandCaller } from '@/lib/library/libraryOperation.server';
import { mediaSchema } from '@/lib/media/supabase-media';

// PATCH /api/library/comments/metadata — the review metadata of a posted comment:
// the lock toggle (internal ↔ shared with share-link recipients) and its
// attachments. Runs on the caller's RLS-scoped client; the database enforces the
// rest (media.assert_comment_attachments, media.guard_comment_visibility).
//
// Who may change what: the author changes both on their own comment; any member
// above viewer may also lock or unlock a teammate's comment, since deciding what a
// client sees is a producer's call. Attachments stay the author's.

const COMMENT_SELECT =
  'id, brand_id, asset_id, version_id, parent_comment_id, body, mentions, annotation, attachments, visibility, resolved_at, resolved_by, created_by, created_at, updated_at, deleted_at';

export async function PATCH(request: Request) {
  const parsed = patchCommentMetadataRequestSchema.safeParse(
    await request.json().catch(() => null),
  );
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.message }, { status: 422 });
  }
  const input = parsed.data;
  const caller = await requireBrandCaller(input.brandId);
  if (caller instanceof NextResponse) return caller;

  const { data: existing, error: readError } = await mediaSchema(caller.supabase)
    .from('comments')
    .select('id, created_by, visibility, deleted_at')
    .eq('id', input.commentId)
    .eq('brand_id', input.brandId)
    .maybeSingle();
  if (readError) {
    console.error('[library/comments/metadata] lookup failed', readError);
    return NextResponse.json({ error: 'Query failed' }, { status: 500 });
  }
  const row = existing as {
    created_by: string | null;
    visibility: CommentVisibility;
    deleted_at: string | null;
  } | null;
  if (!row || row.deleted_at) {
    return NextResponse.json({ error: 'Comment not found' }, { status: 404 });
  }

  const isAuthor = row.created_by === caller.user.id;
  if (input.attachments !== undefined && !isAuthor) {
    return NextResponse.json({ error: 'Only the author can attach files' }, { status: 403 });
  }
  if (input.visibility !== undefined && !isAuthor) {
    const { data: role } = await caller.supabase
      .schema('brand_profiles')
      .rpc('brand_role', { p_brand_id: input.brandId });
    if (role === 'viewer' || !role) {
      return NextResponse.json(
        { error: 'Viewers can only lock their own comments' },
        { status: 403 },
      );
    }
  }
  if (input.visibility !== undefined && row.visibility === 'external') {
    return NextResponse.json({ error: 'A client comment is always shared' }, { status: 409 });
  }

  const { data, error } = await mediaSchema(caller.supabase)
    .from('comments')
    .update({
      ...(input.visibility !== undefined ? { visibility: input.visibility } : {}),
      ...(input.attachments !== undefined ? { attachments: input.attachments } : {}),
    })
    .eq('id', input.commentId)
    .eq('brand_id', input.brandId)
    .select(COMMENT_SELECT)
    .single();
  if (error || !data) {
    if (error?.message === 'invalid_comment_attachment') {
      return NextResponse.json(
        { error: 'An attachment is not a live asset of this brand' },
        { status: 422 },
      );
    }
    console.error('[library/comments/metadata] update failed', error);
    return NextResponse.json({ error: 'Update failed' }, { status: 500 });
  }

  const authors = await fetchBrandAuthors(caller.supabase, input.brandId);
  return NextResponse.json(commentRowToMediaComment(data as unknown as MediaCommentRow, authors));
}
