'use client';

// The Library's review feedback, shown INSIDE the Video Editor.
//
// Comments live on the source asset, not on the cut, so this layer is a lens:
// commentMapping projects each source-anchored comment onto whichever clips
// kept that moment, and posts new comments back to SOURCE time so they follow
// the asset into every other timeline and back to the asset detail modal. The
// editor's timeline is a pixel scale (pxPerSec), so markers position in px —
// a sibling renderer of the Library scrubber's fraction-based strip, sharing
// its visual language rather than its component.

import type { MediaComment } from '@continuum/contracts';
import { MessageSquarePlus, SquareDashedBottom, X } from 'lucide-react';
import { useCallback, useMemo, useState } from 'react';
import { formatTimecode } from '@/components/library/detail/annotationGeometry';
import { CommentComposer } from '@/components/library/detail/CommentComposer';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import {
  buildCommentThreads,
  type CommentThread,
  displayNameFromEmail,
  initialsFor,
} from '@/lib/library/comments';
import { useMultiAssetComments } from '@/lib/library/useMultiAssetComments';
import { formatRelativeTime } from '@/lib/time/relativeTime';
import { cn } from '@/lib/utils';
import {
  type ClipPlacement,
  type EditorCommentMarker,
  editorRangeToSource,
  editorTimeToSource,
  projectCommentsToTimeline,
} from './commentMapping';

type Props = {
  brandId: string;
  placements: ClipPlacement[];
  pxPerSec: number;
  playheadSec: number;
  onSeek: (sec: number) => void;
};

function authorLabel(comment: MediaComment): string {
  return comment.authorName ?? displayNameFromEmail(comment.authorEmail) ?? 'Member';
}

function ThreadPopover({
  thread,
  posting,
  onReply,
}: {
  thread: CommentThread;
  posting: boolean;
  onReply: (body: string) => void;
}) {
  const entries = [thread.root, ...thread.replies];
  return (
    <div className="flex flex-col gap-2">
      {entries.map((comment) => (
        <div key={comment.id} className="flex gap-2">
          <Avatar className="size-6 shrink-0">
            <AvatarFallback className="text-2xs font-medium">
              {initialsFor(authorLabel(comment))}
            </AvatarFallback>
          </Avatar>
          <div className="min-w-0 flex-1">
            <div className="flex items-baseline gap-2">
              <span className="truncate text-xs font-medium">{authorLabel(comment)}</span>
              <span className="shrink-0 text-2xs text-muted-foreground/70">
                {formatRelativeTime(comment.createdAt)}
              </span>
            </div>
            <p className="mt-0.5 whitespace-pre-wrap break-words text-sm leading-relaxed text-foreground/90">
              {comment.body}
            </p>
          </div>
        </div>
      ))}
      <CommentComposer
        placeholder="Reply..."
        submitLabel="Reply"
        busy={posting}
        onSubmit={onReply}
      />
    </div>
  );
}

export function TimelineCommentLayer({
  brandId,
  placements,
  pxPerSec,
  playheadSec,
  onSeek,
}: Props) {
  const assetIds = useMemo(
    () => Array.from(new Set(placements.map((placement) => placement.assetId))),
    [placements],
  );
  const { comments, posting, postComment } = usePostingComments(brandId, assetIds);

  const threads = useMemo(() => buildCommentThreads(comments), [comments]);
  const threadById = useMemo(
    () => new Map(threads.open.map((thread) => [thread.root.id, thread])),
    [threads],
  );

  // Resolved threads retire their marker, exactly as they retire their pin in
  // the asset detail modal.
  const markers = useMemo(
    () =>
      projectCommentsToTimeline(
        threads.open.map((thread) => thread.root),
        placements,
      ),
    [threads, placements],
  );

  const [draftInSec, setDraftInSec] = useState<number | null>(null);
  const [draftOutSec, setDraftOutSec] = useState<number | null>(null);

  const clearDraft = useCallback(() => {
    setDraftInSec(null);
    setDraftOutSec(null);
  }, []);

  // What a draft would anchor to in source time — null when the playhead sits
  // over a gap/still, or when an in/out pair straddles a cut and so cannot be
  // one comment on one asset.
  const draftAnchor = useMemo(() => {
    if (draftInSec === null) return null;
    if (draftOutSec === null) {
      const point = editorTimeToSource(draftInSec, placements);
      return point && { assetId: point.assetId, timeMs: point.sourceTimeMs, endMs: null };
    }
    const range = editorRangeToSource(draftInSec, draftOutSec, placements);
    return range && { assetId: range.assetId, timeMs: range.timeMs, endMs: range.endMs };
  }, [draftInSec, draftOutSec, placements]);

  const playheadResolves = editorTimeToSource(playheadSec, placements) !== null;

  const postDraft = useCallback(
    (body: string) => {
      if (!draftAnchor) return;
      void postComment({
        assetId: draftAnchor.assetId,
        body,
        annotation: {
          kind: 'time',
          timeMs: draftAnchor.timeMs,
          ...(draftAnchor.endMs === null ? {} : { endMs: draftAnchor.endMs }),
        },
      });
      clearDraft();
    },
    [draftAnchor, postComment, clearDraft],
  );

  return (
    <div className="flex flex-col gap-1">
      <div className="relative h-5">
        {markers.map((marker) => (
          <TimelineCommentMarker
            key={marker.key}
            marker={marker}
            pxPerSec={pxPerSec}
            thread={threadById.get(marker.commentId)}
            posting={posting}
            onSeek={onSeek}
            onReply={(body, thread) =>
              void postComment({
                assetId: thread.root.assetId,
                body,
                parentCommentId: thread.root.id,
              })
            }
          />
        ))}
      </div>

      <div className="flex items-center gap-2">
        {draftInSec === null ? (
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={!playheadResolves}
            title={
              playheadResolves
                ? 'Comment on the source frame under the playhead'
                : 'The playhead is not over a video clip'
            }
            onClick={() => setDraftInSec(playheadSec)}
          >
            <MessageSquarePlus className="size-3.5" />
            Comment at {formatTimecode(playheadSec * 1000)}
          </Button>
        ) : (
          <>
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={playheadSec <= draftInSec}
              title="Extend this comment into a range ending at the playhead"
              onClick={() => setDraftOutSec(playheadSec)}
            >
              <SquareDashedBottom className="size-3.5" />
              End at {formatTimecode(playheadSec * 1000)}
            </Button>
            {draftOutSec !== null && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                aria-label="Clear the end point and comment on a single moment"
                onClick={() => setDraftOutSec(null)}
              >
                <X className="size-3.5" />
              </Button>
            )}
          </>
        )}
      </div>

      {draftInSec !== null && (
        <div className="rounded-lg border border-border bg-muted/30 p-2.5">
          {draftAnchor ? (
            <CommentComposer
              placeholder="Comment on this moment of the source clip..."
              busy={posting}
              autoFocus
              annotationChip={
                <span className="rounded bg-primary/10 px-1.5 py-0.5 text-xs font-medium tabular-nums text-primary">
                  {draftAnchor.endMs === null
                    ? formatTimecode(draftAnchor.timeMs)
                    : `${formatTimecode(draftAnchor.timeMs)}–${formatTimecode(draftAnchor.endMs)}`}{' '}
                  on the source
                </span>
              }
              onSubmit={postDraft}
              onCancel={clearDraft}
            />
          ) : (
            // Rather than a composer whose Post silently no-ops: the sweep spans
            // two clips, so there is no single source range to anchor it to.
            <div className="flex flex-wrap items-center gap-2">
              <p className="text-xs text-destructive">
                That range crosses a cut — set in and out points inside one clip.
              </p>
              <div className="ml-auto flex items-center gap-1.5">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setDraftOutSec(null)}
                >
                  Back to a moment
                </Button>
                <Button type="button" variant="ghost" size="sm" onClick={clearDraft}>
                  Cancel
                </Button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function TimelineCommentMarker({
  marker,
  pxPerSec,
  thread,
  posting,
  onSeek,
  onReply,
}: {
  marker: EditorCommentMarker;
  pxPerSec: number;
  thread: CommentThread | undefined;
  posting: boolean;
  onSeek: (sec: number) => void;
  onReply: (body: string, thread: CommentThread) => void;
}) {
  if (!thread) return null;

  const leftPx = marker.outputStartSec * pxPerSec;
  const widthPx =
    marker.outputEndSec === null ? null : (marker.outputEndSec - marker.outputStartSec) * pxPerSec;
  const initials = initialsFor(authorLabel(thread.root));
  const label =
    widthPx === null
      ? `Comment at ${formatTimecode(marker.outputStartSec * 1000)}`
      : `Comment from ${formatTimecode(marker.outputStartSec * 1000)} to ${formatTimecode((marker.outputEndSec ?? 0) * 1000)}`;

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label={`${label}: ${thread.root.body.slice(0, 80)}`}
          title={thread.root.body}
          onClick={() => onSeek(marker.outputStartSec)}
          className="group absolute top-0 h-5"
          style={{ left: `${leftPx}px`, width: widthPx === null ? undefined : `${widthPx}px` }}
        >
          {widthPx !== null && (
            <span
              className={cn(
                'absolute inset-x-0 bottom-0 h-1 rounded-full bg-primary/25 transition-colors group-hover:bg-primary/60',
                // A clipped span was cut by the trim, not authored that way.
                marker.clipped && 'opacity-70',
              )}
            />
          )}
          <span className="absolute left-0 top-0 flex size-5 -translate-x-1/2 items-center justify-center rounded-full bg-background text-3xs font-semibold uppercase text-foreground shadow-sm ring-1 ring-border transition-transform group-hover:scale-110">
            {initials}
          </span>
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-72 p-2.5">
        <ThreadPopover
          thread={thread}
          posting={posting}
          onReply={(body) => onReply(body, thread)}
        />
      </PopoverContent>
    </Popover>
  );
}

// The multi-asset hook has no posting flag of its own (the modal owns one), so
// the layer tracks in-flight posts to busy its composers.
function usePostingComments(brandId: string, assetIds: string[]) {
  const { comments, postComment } = useMultiAssetComments(brandId, assetIds);
  const [posting, setPosting] = useState(false);

  const post = useCallback(
    async (input: Parameters<typeof postComment>[0]) => {
      setPosting(true);
      try {
        return await postComment(input);
      } finally {
        setPosting(false);
      }
    },
    [postComment],
  );

  return { comments, posting, postComment: post };
}
