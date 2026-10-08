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
// The reads happen in the library-share edge function (the service-role key is not
// on Vercel); this module only threads and projects what it returns, so it stays
// pure and directly testable.

import {
  type PublicShareAttachmentPreview,
  type PublicShareComment,
  publicShareCommentSchema,
} from '@continuum/contracts';
import {
  buildCommentThreads,
  type CommentAuthor,
  commentRowToMediaComment,
  type MediaCommentRow,
} from '@/lib/library/comments';

export const MAX_THREADS_PER_ASSET = 50;

// What the library-share edge function reads for the page's threads: shared and
// external comments on the shown versions, the brand's authors, external reviewer
// names, and signed previews of attached assets. Null when comments are off or
// the read failed: comments enhance a share page, they are never its reason to exist.
export type ShareCommentSource = {
  rows: MediaCommentRow[];
  authors: Array<{ user_id: string; email: string | null }>;
  externalAuthors: Array<{ id: string; display_name: string | null }>;
  attachmentPreviews: PublicShareAttachmentPreview[];
} | null;

function toPublicComment(comment: {
  id: string;
  assetId: string;
  versionId?: string | null;
  parentCommentId?: string | null;
  body: string;
  annotation?: PublicShareComment['annotation'];
  attachments?: PublicShareComment['attachments'];
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
    ...(comment.attachments?.length ? { attachments: comment.attachments } : {}),
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

// Open threads per asset, in the order the assets were shared, projected for an
// anonymous viewer (a display name at most, never an email or a user id).
export function projectShareComments(
  assetIds: string[],
  source: ShareCommentSource,
): PublicShareComment[] {
  if (!source || assetIds.length === 0) return [];
  const authors = new Map<string, CommentAuthor>(
    source.authors.map((row) => [row.user_id, { name: null, email: row.email }]),
  );
  const externalAuthors = new Map(
    source.externalAuthors.flatMap((session) =>
      session.display_name ? [[session.id, session.display_name] as const] : [],
    ),
  );
  const rowsByAsset = new Map<string, MediaCommentRow[]>();
  for (const row of source.rows) {
    const existing = rowsByAsset.get(row.asset_id);
    if (existing) existing.push(row);
    else rowsByAsset.set(row.asset_id, [row]);
  }
  const previews = new Map(source.attachmentPreviews.map((preview) => [preview.assetId, preview]));
  return assetIds
    .flatMap((assetId) =>
      publicCommentsForAsset(rowsByAsset.get(assetId) ?? [], authors, externalAuthors),
    )
    .map((comment) => {
      const attached = (comment.attachments ?? []).flatMap((a) => previews.get(a.assetId) ?? []);
      return attached.length > 0 ? { ...comment, attachmentPreviews: attached } : comment;
    });
}
