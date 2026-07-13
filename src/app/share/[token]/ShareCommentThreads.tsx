// Read-only comment threads under a shared asset. Server-rendered and inert:
// no composer, no reply/resolve/delete affordance, no client JS. An external
// reviewer reads the brand's open feedback and nothing else.
//
// No realtime subscription belongs here. The share route is force-dynamic and
// server-rendered, so every visit already resolves the token and re-reads the
// comments — a fresh page load IS the refresh, which is the right freshness for
// a review link and keeps the page free of an authenticated socket.

import type { PublicShareComment } from '@continuum/contracts';
import { formatTimecode } from '@/components/library/detail/annotationGeometry';
import { initialsFor } from '@/lib/library/comments';
import { formatRelativeTime } from '@/lib/time/relativeTime';

export type PublicShareThread = { root: PublicShareComment; replies: PublicShareComment[] };

const VIEWER_FALLBACK_NAME = 'Member';

// loadShareComments emits each open thread as a root followed by its replies, so
// threading here is a regroup, not a rebuild: buildCommentThreads (which also
// splits resolved from open, a dimension the public shape deliberately drops)
// has already run server-side.
export function buildPublicShareThreads(comments: PublicShareComment[]): PublicShareThread[] {
  const threads = new Map<string, PublicShareThread>();
  for (const comment of comments) {
    if (!comment.parentCommentId) threads.set(comment.id, { root: comment, replies: [] });
  }
  for (const comment of comments) {
    const parentId = comment.parentCommentId;
    if (parentId) threads.get(parentId)?.replies.push(comment);
  }
  return Array.from(threads.values());
}

// A moment reads "0:04"; a span reads "0:04 – 0:09". Box annotations carry no
// chip: this page shows no pin overlay, so a coordinate would mean nothing.
export function timeChipLabel(annotation: PublicShareComment['annotation']): string | null {
  if (!annotation || annotation.kind !== 'time') return null;
  return annotation.endMs === undefined
    ? formatTimecode(annotation.timeMs)
    : `${formatTimecode(annotation.timeMs)} – ${formatTimecode(annotation.endMs)}`;
}

export function authorLabel(comment: PublicShareComment): string {
  return comment.authorName ?? VIEWER_FALLBACK_NAME;
}

function CommentBody({ comment }: { comment: PublicShareComment }) {
  const name = authorLabel(comment);
  const chip = timeChipLabel(comment.annotation);
  return (
    <div className="flex gap-2.5">
      <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-muted text-2xs font-medium text-muted-foreground">
        {initialsFor(name)}
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline gap-2">
          <span className="truncate text-xs font-medium text-foreground">{name}</span>
          <time
            dateTime={comment.createdAt}
            title={new Date(comment.createdAt).toUTCString()}
            className="shrink-0 text-2xs text-muted-foreground/70"
          >
            {formatRelativeTime(comment.createdAt)}
          </time>
          {chip ? (
            <span className="ml-auto shrink-0 rounded bg-primary/10 px-1.5 py-0.5 text-2xs font-semibold tabular-nums text-primary">
              {chip}
            </span>
          ) : null}
        </div>
        <p className="mt-0.5 whitespace-pre-wrap break-words text-sm leading-relaxed text-foreground/90">
          {comment.body}
        </p>
      </div>
    </div>
  );
}

export function ShareCommentThreads({ threads }: { threads: PublicShareThread[] }) {
  if (threads.length === 0) return null;

  return (
    <section className="flex flex-col gap-2 rounded-lg border border-border bg-card/40 p-3">
      <h2 className="text-2xs font-semibold uppercase tracking-wide text-muted-foreground">
        Comments ({threads.length})
      </h2>
      {threads.map((thread) => (
        <div key={thread.root.id} className="rounded-lg border border-border/60 bg-card p-2.5">
          <CommentBody comment={thread.root} />
          {thread.replies.length > 0 ? (
            <div className="mt-2 flex flex-col gap-2 border-l border-border/60 pl-3">
              {thread.replies.map((reply) => (
                <CommentBody key={reply.id} comment={reply} />
              ))}
            </div>
          ) : null}
        </div>
      ))}
    </section>
  );
}
