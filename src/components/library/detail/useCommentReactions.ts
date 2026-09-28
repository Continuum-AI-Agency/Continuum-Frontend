'use client';

// Emoji reactions on one asset's comments while its detail view is open: the
// initial list, live inserts/deletes from anyone (media.comment_reactions is in
// the realtime publication), and an optimistic toggle for the viewer's own.

import type { CommentReaction } from '@continuum/contracts';
import { useCallback, useEffect, useRef, useState } from 'react';
import { toast } from '@/components/ui/toast-imperative';
import { listCommentReactions, setCommentReaction } from '@/lib/library/comments';
import { subscribeToPostgresChanges } from '@/lib/supabase/realtime';

type ReactionRow = {
  comment_id: string;
  brand_id: string;
  asset_id: string;
  user_id: string;
  emoji: string;
  created_at: string;
};

const sameReaction =
  (a: Pick<CommentReaction, 'commentId' | 'userId' | 'emoji'>) => (b: CommentReaction) =>
    a.commentId === b.commentId && a.userId === b.userId && a.emoji === b.emoji;

function fromRow(row: ReactionRow): CommentReaction {
  return {
    commentId: row.comment_id,
    brandId: row.brand_id,
    assetId: row.asset_id,
    userId: row.user_id,
    emoji: row.emoji,
    createdAt: row.created_at,
  };
}

export function useCommentReactions(
  brandId: string,
  assetId: string,
  currentUserId: string | null,
) {
  const [reactions, setReactions] = useState<CommentReaction[]>([]);
  const reactionsRef = useRef(reactions);
  reactionsRef.current = reactions;

  useEffect(() => {
    let cancelled = false;
    listCommentReactions(brandId, assetId)
      .then((list) => {
        if (!cancelled) setReactions(list);
      })
      .catch((error: unknown) => console.error('[useCommentReactions] list failed', error));
    return () => {
      cancelled = true;
    };
  }, [brandId, assetId]);

  useEffect(() => {
    const scoped = {
      schema: 'media',
      table: 'comment_reactions',
      filter: `asset_id=eq.${assetId}`,
    } as const;
    return subscribeToPostgresChanges({
      label: `media-comment-reactions-${assetId}`,
      bindings: [
        {
          ...scoped,
          event: 'INSERT',
          onRow: (row) => {
            const reaction = fromRow(row as ReactionRow);
            setReactions((prev) =>
              prev.some(sameReaction(reaction)) ? prev : [...prev, reaction],
            );
          },
        },
        {
          ...scoped,
          event: 'DELETE',
          onRow: (row) => {
            const gone = row as Partial<ReactionRow>;
            if (!gone.comment_id || !gone.user_id || !gone.emoji) return;
            const key = { commentId: gone.comment_id, userId: gone.user_id, emoji: gone.emoji };
            setReactions((prev) => prev.filter((reaction) => !sameReaction(key)(reaction)));
          },
        },
      ],
    });
  }, [assetId]);

  const toggle = useCallback(
    (commentId: string, emoji: string) => {
      if (!currentUserId) return;
      const key = { commentId, userId: currentUserId, emoji };
      const on = !reactionsRef.current.some(sameReaction(key));
      const add = (prev: CommentReaction[]) => [
        ...prev,
        { ...key, brandId, assetId, createdAt: new Date().toISOString() },
      ];
      const remove = (prev: CommentReaction[]) =>
        prev.filter((reaction) => !sameReaction(key)(reaction));
      setReactions(on ? add : remove);
      setCommentReaction({ brandId, commentId, emoji, on }).catch((error: unknown) => {
        // Put the list back the way the server has it.
        setReactions(on ? remove : add);
        toast.error(`Could not update the reaction · ${(error as Error).message}`);
      });
    },
    [brandId, assetId, currentUserId],
  );

  return { reactions, toggle };
}
