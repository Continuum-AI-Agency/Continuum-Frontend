// Read-only comment feed for the anonymous /share/[token] page.
//
// Two rules make this safe to hand to someone outside the brand:
//   1. Only OPEN threads travel. A thread whose ROOT carries resolved_at is
//      settled internal churn — an external reviewer must not see it.
//   2. Every comment is re-projected onto PublicShareComment (a strict schema
//      with no created_by, no resolved_by and no email) before it leaves this
//      module, so a future field added to the internal mapper cannot silently
//      ride out to the public page.
//
// The admin client is injected rather than constructed here: the share page
// already holds the service-role client (share tokens have no session), and
// taking it as an argument keeps this module pure and directly testable.

import { type PublicShareComment, publicShareCommentSchema } from '@continuum/contracts';
import type { SupabaseClient } from '@supabase/supabase-js';
import { fetchBrandAuthors } from '@/lib/library/commentAuthors';
import {
  buildCommentThreads,
  type CommentAuthor,
  commentRowToMediaComment,
  type MediaCommentRow,
} from '@/lib/library/comments';
import { mediaSchema } from '@/lib/media/supabase-media';

const COMMENT_SELECT =
  'id, brand_id, asset_id, version_id, parent_comment_id, body, annotation, resolved_at, resolved_by, created_by, external_reviewer_session_id, visibility, created_at, updated_at, deleted_at';

// A reviewer skims; they do not page. Beyond this many open threads on one
// asset the page is noise, so the newest threads win and the rest are dropped.
export const MAX_THREADS_PER_ASSET = 50;

// Hard ceiling on rows pulled for the whole share (a collection can carry 100
// assets). Chronological, so an absurdly commented asset can only cost the
// share its most recent chatter, never the page's responsiveness.
const MAX_COMMENT_ROWS = 2000;

export type LoadShareCommentsInput = {
  brandId: string;
  assetIds: string[];
  versionIdsByAsset?: Readonly<Record<string, string>>;
};

// Whitelist projection. Listing the fields explicitly (rather than spreading and
// deleting) is the leak guard: the strict schema below then rejects anything
// that is not on this list.
function toPublicComment(comment: {
  id: string;
  assetId: string;
  versionId?: string | null;
  parentCommentId?: string | null;
  body: string;
  annotation?: PublicShareComment['annotation'];
  authorName?: string | null;
  createdAt: string;
}): PublicShareComment | null {
  const parsed = publicShareCommentSchema.safeParse({
    id: comment.id,
    assetId: comment.assetId,
    versionId: comment.versionId ?? null,
    parentCommentId: comment.parentCommentId ?? null,
    body: comment.body,
    annotation: comment.annotation ?? null,
    authorName: comment.authorName ?? null,
    createdAt: comment.createdAt,
  });
  if (!parsed.success) {
    console.error('[share] dropped a comment that failed the public projection', {
      commentId: comment.id,
    });
    return null;
  }
  return parsed.data;
}

function publicCommentsForAsset(
  rows: MediaCommentRow[],
  authors: Map<string, CommentAuthor>,
  externalAuthors: ReadonlyMap<string, string>,
): PublicShareComment[] {
  const comments = rows.map((row) => {
    const comment = commentRowToMediaComment(row, authors);
    const externalName = row.external_reviewer_session_id
      ? externalAuthors.get(row.external_reviewer_session_id)
      : null;
    return externalName ? { ...comment, authorName: externalName } : comment;
  });
  // buildCommentThreads already splits open from resolved by the ROOT's
  // resolved_at and nests one level of replies, which is exactly the public rule.
  const open = buildCommentThreads(comments).open.slice(-MAX_THREADS_PER_ASSET);

  return open.flatMap((thread) =>
    [thread.root, ...thread.replies].flatMap((comment) => {
      const projected = toPublicComment(comment);
      return projected ? [projected] : [];
    }),
  );
}

// Returns a flat, chronological list of the open threads (root followed by its
// replies) across every shared asset, in the order the assets were given.
export async function loadShareComments(
  admin: SupabaseClient,
  { brandId, assetIds, versionIdsByAsset = {} }: LoadShareCommentsInput,
): Promise<PublicShareComment[]> {
  if (assetIds.length === 0) return [];

  const { data, error } = await mediaSchema(admin)
    .from('comments')
    .select(COMMENT_SELECT)
    .eq('brand_id', brandId)
    .in('asset_id', assetIds)
    .in('visibility', ['shared', 'external'])
    .is('deleted_at', null)
    .order('created_at', { ascending: true })
    .limit(MAX_COMMENT_ROWS);

  if (error) {
    // Comments are an enhancement to the share page, never its reason to exist:
    // a failed read degrades to a comment-less view rather than a broken link.
    console.error('[share] comment read failed', error);
    return [];
  }

  const rows = ((data ?? []) as unknown as MediaCommentRow[]).filter((row) => {
    const versionId = versionIdsByAsset[row.asset_id];
    return !versionId || row.version_id === versionId;
  });
  if (rows.length === 0) return [];

  const externalSessionIds = [
    ...new Set(rows.flatMap((row) => row.external_reviewer_session_id ?? [])),
  ];
  const [authors, externalSessions] = await Promise.all([
    fetchBrandAuthors(admin, brandId),
    externalSessionIds.length > 0
      ? mediaSchema(admin)
          .from('external_reviewer_sessions')
          .select('id, display_name')
          .in('id', externalSessionIds)
      : Promise.resolve({ data: [], error: null }),
  ]);
  const externalAuthors = new Map(
    ((externalSessions.data ?? []) as Array<{ id: string; display_name: string | null }>).flatMap(
      (session) => (session.display_name ? [[session.id, session.display_name] as const] : []),
    ),
  );

  const rowsByAsset = new Map<string, MediaCommentRow[]>();
  for (const row of rows) {
    const existing = rowsByAsset.get(row.asset_id);
    if (existing) existing.push(row);
    else rowsByAsset.set(row.asset_id, [row]);
  }

  return assetIds.flatMap((assetId) =>
    publicCommentsForAsset(rowsByAsset.get(assetId) ?? [], authors, externalAuthors),
  );
}
