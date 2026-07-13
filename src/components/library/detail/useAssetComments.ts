'use client';

// Comments for one asset while its detail modal is open: initial fetch,
// realtime merge (media.comments postgres_changes, same channel pattern as
// useMediaLibrary), and optimistic posting. Realtime rows carry no author
// fields, so an authors map built from the fetch (plus the caller) fills
// display names for rows arriving live.

import type { CommentAnnotation, MediaComment } from '@continuum/contracts';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  type CommentAuthor,
  commentRowToMediaComment,
  createComment,
  deleteComment,
  displayNameFromEmail,
  listComments,
  type MediaCommentRow,
  updateComment,
  upsertComment,
} from '@/lib/library/comments';
import { createSupabaseBrowserClient } from '@/lib/supabase/client';

export type PostCommentInput = {
  body: string;
  annotation?: CommentAnnotation;
  parentCommentId?: string;
  /** The version the author is looking at. Omitted only when the asset has no
   *  version rows yet, in which case the API pins to the head it materializes. */
  versionId?: string;
};

export type UseAssetCommentsResult = {
  comments: MediaComment[];
  loading: boolean;
  error: string | null;
  currentUserId: string | null;
  pendingIds: ReadonlySet<string>;
  postComment: (input: PostCommentInput) => Promise<MediaComment | null>;
  setResolved: (commentId: string, resolved: boolean) => Promise<void>;
  removeComment: (commentId: string) => Promise<void>;
};

export function useAssetComments(brandId: string, assetId: string): UseAssetCommentsResult {
  const [comments, setComments] = useState<MediaComment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [pendingIds, setPendingIds] = useState<ReadonlySet<string>>(new Set());
  const authorsRef = useRef<Map<string, CommentAuthor>>(new Map());
  const currentUserRef = useRef<{ id: string; email: string | null } | null>(null);

  useEffect(() => {
    let cancelled = false;
    setComments([]);
    setLoading(true);
    setError(null);
    authorsRef.current = new Map();

    const supabase = createSupabaseBrowserClient();

    void supabase.auth.getUser().then(({ data }) => {
      if (cancelled || !data.user) return;
      currentUserRef.current = { id: data.user.id, email: data.user.email ?? null };
      authorsRef.current.set(data.user.id, { name: null, email: data.user.email ?? null });
      setCurrentUserId(data.user.id);
    });

    listComments(brandId, assetId)
      .then((fetched) => {
        if (cancelled) return;
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
        console.error('[useAssetComments] list failed', err);
        setError('Could not load comments.');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [brandId, assetId]);

  useEffect(() => {
    const supabase = createSupabaseBrowserClient();
    const channel = supabase
      .channel(`media-comments-${assetId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'media', table: 'comments', filter: `asset_id=eq.${assetId}` },
        (payload) => {
          if (payload.eventType === 'DELETE') {
            const removedId = (payload.old as { id?: string }).id;
            if (removedId) setComments((prev) => prev.filter((c) => c.id !== removedId));
            return;
          }
          const row = payload.new as MediaCommentRow;
          if (row.deleted_at) {
            setComments((prev) => prev.filter((c) => c.id !== row.id));
            return;
          }
          const mapped = commentRowToMediaComment(row, authorsRef.current);
          setComments((prev) => {
            // Keep author display already resolved locally (optimistic post /
            // initial fetch) — realtime rows would blank it out.
            const known = prev.find((c) => c.id === mapped.id);
            const merged = known
              ? { ...mapped, authorName: known.authorName, authorEmail: known.authorEmail }
              : mapped;
            return upsertComment(prev, merged);
          });
        },
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [assetId]);

  const markPending = useCallback((id: string, pending: boolean) => {
    setPendingIds((prev) => {
      const next = new Set(prev);
      if (pending) next.add(id);
      else next.delete(id);
      return next;
    });
  }, []);

  const postComment = useCallback(
    async (input: PostCommentInput): Promise<MediaComment | null> => {
      const user = currentUserRef.current;
      const tempId = `optimistic-${crypto.randomUUID()}`;
      const now = new Date().toISOString();
      const optimistic: MediaComment = {
        id: tempId,
        brandId,
        assetId,
        // Pinned before the server answers, or the comment would flash into the
        // "other versions" bucket (anchored to the head) and jump out again.
        versionId: input.versionId ?? null,
        parentCommentId: input.parentCommentId ?? null,
        body: input.body,
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
          assetId,
          body: input.body,
          annotation: input.annotation,
          parentCommentId: input.parentCommentId,
          versionId: input.versionId,
        });
        setComments((prev) =>
          upsertComment(
            prev.filter((c) => c.id !== tempId),
            created,
          ),
        );
        return created;
      } catch (err: unknown) {
        console.error('[useAssetComments] post failed', err);
        setComments((prev) => prev.filter((c) => c.id !== tempId));
        setError('Could not post comment.');
        return null;
      } finally {
        markPending(tempId, false);
      }
    },
    [brandId, assetId, markPending],
  );

  const setResolved = useCallback(
    async (commentId: string, resolved: boolean) => {
      setError(null);
      try {
        const updated = await updateComment({ brandId, commentId, resolved });
        setComments((prev) => upsertComment(prev, updated));
      } catch (err: unknown) {
        console.error('[useAssetComments] resolve failed', err);
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
        console.error('[useAssetComments] delete failed', err);
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
