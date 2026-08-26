'use client';

// Comments for the SET of assets a surface is showing at once — the Video
// Editor's timeline, where several source assets are cut together and each one
// brings its own feedback with it.
//
// Deliberately not a loop over useAssetComments: hook counts must be fixed, and
// one realtime channel with an `in.(...)` filter beats N channels for the same
// rows. Same fetch/merge/optimistic-post contract as the single-asset hook,
// with `assetId` moved from a hook argument into the post input.

import {
  type CommentAnnotation,
  type MediaComment,
  parseCommentMentions,
} from '@continuum/contracts';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  type AssetCommentsSnapshot,
  type CommentAuthor,
  commentRowToMediaComment,
  createComment,
  deleteComment,
  displayNameFromEmail,
  listCommentsWithVersion,
  type MediaCommentRow,
  updateComment,
  upsertComment,
} from '@/lib/library/comments';
import { createSupabaseBrowserClient } from '@/lib/supabase/client';
import { subscribeToPostgresChanges } from '@/lib/supabase/realtime';

export type PostMultiCommentInput = {
  assetId: string;
  body: string;
  annotation?: CommentAnnotation;
  parentCommentId?: string;
};

export type UseMultiAssetCommentsResult = {
  comments: MediaComment[];
  loading: boolean;
  error: string | null;
  currentUserId: string | null;
  pendingIds: ReadonlySet<string>;
  postComment: (input: PostMultiCommentInput) => Promise<MediaComment | null>;
  setResolved: (commentId: string, resolved: boolean) => Promise<void>;
  removeComment: (commentId: string) => Promise<void>;
};

export function headVersionsFrom(
  assetIds: readonly string[],
  snapshots: readonly AssetCommentsSnapshot[],
): Map<string, string | null> {
  return new Map(
    assetIds.map((assetId, index) => [assetId, snapshots[index]?.headVersionId ?? null]),
  );
}

/**
 * Only the feedback that is about the file actually on the timeline.
 *
 * The editor always cuts an asset's CURRENT version, so a comment pinned to a
 * superseded one is dropped rather than drawn: its timeMs was measured against a
 * different cut and would mark the wrong frame, and its box was drawn on a
 * different crop. That older feedback is not lost — the asset detail modal is
 * where it is read, against the version it was written on.
 *
 * A head that could not be resolved (an asset whose v1 row was never
 * materialized) means nothing has superseded anything, so the comment is kept.
 */
export function currentVersionComments(
  snapshots: readonly AssetCommentsSnapshot[],
  heads: ReadonlyMap<string, string | null>,
): MediaComment[] {
  return snapshots
    .flatMap((snapshot) => snapshot.comments)
    .filter((comment) => {
      const head = heads.get(comment.assetId);
      return !head || !comment.versionId || comment.versionId === head;
    });
}

export function useMultiAssetComments(
  brandId: string,
  assetIds: string[],
): UseMultiAssetCommentsResult {
  const [comments, setComments] = useState<MediaComment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [pendingIds, setPendingIds] = useState<ReadonlySet<string>>(new Set());
  const authorsRef = useRef<Map<string, CommentAuthor>>(new Map());
  // Head version per source asset: a comment posted from the editor is pinned to
  // the version whose file is actually on the timeline.
  const headVersionsRef = useRef<Map<string, string | null>>(new Map());
  const currentUserRef = useRef<{ id: string; email: string | null } | null>(null);

  // Callers rebuild the id array on every render (it is derived from the
  // timeline's placements), so the effects key off a stable canonical string
  // rather than the array identity.
  const assetKey = useMemo(
    () => Array.from(new Set(assetIds)).sort().join(','),
    // biome-ignore lint/correctness/useExhaustiveDependencies: the array's identity churns; its contents are the real dependency
    [assetIds.join(',')],
  );

  useEffect(() => {
    const ids = assetKey ? assetKey.split(',') : [];
    let cancelled = false;
    setComments([]);
    setError(null);
    authorsRef.current = new Map();

    if (ids.length === 0) {
      setLoading(false);
      return;
    }
    setLoading(true);

    const supabase = createSupabaseBrowserClient();

    void supabase.auth.getUser().then(({ data }) => {
      if (cancelled || !data.user) return;
      currentUserRef.current = { id: data.user.id, email: data.user.email ?? null };
      authorsRef.current.set(data.user.id, { name: null, email: data.user.email ?? null });
      setCurrentUserId(data.user.id);
    });

    Promise.all(ids.map((assetId) => listCommentsWithVersion(brandId, assetId)))
      .then((perAsset) => {
        if (cancelled) return;
        const heads = headVersionsFrom(ids, perAsset);
        headVersionsRef.current = heads;
        const fetched = currentVersionComments(perAsset, heads);
        for (const comment of fetched) {
          if (comment.createdBy && (comment.authorEmail || comment.authorName)) {
            authorsRef.current.set(comment.createdBy, {
              name: comment.authorName ?? null,
              email: comment.authorEmail ?? null,
            });
          }
        }
        setComments(fetched);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        console.error('[useMultiAssetComments] list failed', err);
        setError('Could not load comments.');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [brandId, assetKey]);

  /** INSERT and UPDATE land the same way; a soft-deleted row leaves the list. */
  const applyComment = useCallback((row: MediaCommentRow) => {
    if (row.deleted_at) {
      setComments((prev) => prev.filter((c) => c.id !== row.id));
      return;
    }
    const mapped = commentRowToMediaComment(row, authorsRef.current);
    setComments((prev) => {
      // Realtime rows carry no author fields; keep whatever the fetch or
      // the optimistic post already resolved locally.
      const known = prev.find((c) => c.id === mapped.id);
      const merged = known
        ? { ...mapped, authorName: known.authorName, authorEmail: known.authorEmail }
        : mapped;
      return upsertComment(prev, merged);
    });
  }, []);

  useEffect(() => {
    if (!assetKey) return;

    const scoped = {
      schema: 'media',
      table: 'comments',
      filter: `asset_id=in.(${assetKey})`,
    } as const;

    return subscribeToPostgresChanges({
      label: `media-comments-multi-${assetKey}`,
      bindings: [
        {
          ...scoped,
          event: 'DELETE',
          onRow: (row) => {
            const removedId = (row as { id?: string }).id;
            if (removedId) setComments((prev) => prev.filter((c) => c.id !== removedId));
          },
        },
        {
          ...scoped,
          event: 'INSERT',
          onRow: (row) => applyComment(row as MediaCommentRow),
        },
        {
          ...scoped,
          event: 'UPDATE',
          onRow: (row) => applyComment(row as MediaCommentRow),
        },
      ],
    });
  }, [assetKey, applyComment]);

  const markPending = useCallback((id: string, pending: boolean) => {
    setPendingIds((prev) => {
      const next = new Set(prev);
      if (pending) next.add(id);
      else next.delete(id);
      return next;
    });
  }, []);

  const postComment = useCallback(
    async (input: PostMultiCommentInput): Promise<MediaComment | null> => {
      const user = currentUserRef.current;
      const tempId = `optimistic-${crypto.randomUUID()}`;
      const now = new Date().toISOString();
      const optimistic: MediaComment = {
        id: tempId,
        brandId,
        assetId: input.assetId,
        versionId: null,
        parentCommentId: input.parentCommentId ?? null,
        body: input.body,
        mentions: parseCommentMentions(input.body),
        annotation: input.annotation ?? null,
        resolvedAt: null,
        resolvedBy: null,
        createdBy: user?.id ?? null,
        authorName: displayNameFromEmail(user?.email),
        authorEmail: user?.email ?? null,
        createdAt: now,
        updatedAt: now,
      };
      setComments((prev) => [...prev, optimistic]);
      markPending(tempId, true);
      setError(null);

      try {
        const created = await createComment({
          brandId,
          assetId: input.assetId,
          body: input.body,
          annotation: input.annotation,
          parentCommentId: input.parentCommentId,
          // The editor is always cutting the head file, so a note taken here
          // belongs to the head version. Left unset the route resolves the same
          // head anyway; sending it keeps the intent explicit.
          ...(headVersionsRef.current.get(input.assetId)
            ? { versionId: headVersionsRef.current.get(input.assetId) as string }
            : {}),
        });
        setComments((prev) =>
          upsertComment(
            prev.filter((c) => c.id !== tempId),
            created,
          ),
        );
        return created;
      } catch (err: unknown) {
        console.error('[useMultiAssetComments] post failed', err);
        setComments((prev) => prev.filter((c) => c.id !== tempId));
        setError('Could not post comment.');
        return null;
      } finally {
        markPending(tempId, false);
      }
    },
    [brandId, markPending],
  );

  const setResolved = useCallback(
    async (commentId: string, resolved: boolean) => {
      setError(null);
      try {
        const updated = await updateComment({ brandId, commentId, resolved });
        setComments((prev) => upsertComment(prev, updated));
      } catch (err: unknown) {
        console.error('[useMultiAssetComments] resolve failed', err);
        setError(resolved ? 'Could not resolve thread.' : 'Could not reopen thread.');
      }
    },
    [brandId],
  );

  const removeComment = useCallback(
    async (commentId: string) => {
      setError(null);
      try {
        await deleteComment({ brandId, commentId });
        setComments((prev) => prev.filter((c) => c.id !== commentId));
      } catch (err: unknown) {
        console.error('[useMultiAssetComments] delete failed', err);
        setError('Could not delete comment.');
      }
    },
    [brandId],
  );

  return useMemo(
    () => ({
      comments,
      loading,
      error,
      currentUserId,
      pendingIds,
      postComment,
      setResolved,
      removeComment,
    }),
    [comments, loading, error, currentUserId, pendingIds, postComment, setResolved, removeComment],
  );
}
