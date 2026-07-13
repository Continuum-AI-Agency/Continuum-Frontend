'use client';

// Threaded comments sidebar: open threads on the version being viewed (top-level
// + one level of replies), a collapsed "Resolved (n)" section, a collapsed
// section for threads written on OTHER versions, reply/resolve/delete actions,
// and two-way selection linkage with the stage annotations (clicking a thread
// highlights its pin; clicking a pin scrolls its thread into view).
//
// Threads from another version are deliberately pin-less: their box addresses a
// crop that is no longer on screen and their timecode addresses a cut that no
// longer exists, so they carry a version chip and a way to go look at the
// version they were written on instead of a pin that would point at nothing.

import type { MediaComment } from '@continuum/contracts';
import { CheckCircle2, ChevronDown, ChevronRight, History, RotateCcw, Trash2 } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import type { CommentThread, CommentThreadGroups } from '@/lib/library/comments';
import { displayNameFromEmail, initialsFor } from '@/lib/library/comments';
import { formatRelativeTime } from '@/lib/time/relativeTime';
import { cn } from '@/lib/utils';
import { CommentComposer } from './CommentComposer';

type Props = {
  /** Threads written on the version currently on the stage. Only these carry pins. */
  threads: CommentThreadGroups;
  pinLabels: Map<string, string>;
  /** Threads written on any other version, oldest first. */
  otherVersionThreads: CommentThread[];
  otherVersionCommentCount: number;
  /** versionId → display label ("v1"), for the chip on an other-version thread. */
  versionLabels: ReadonlyMap<string, string>;
  /** Whether the stage is on the head, which decides if "other" means "earlier". */
  viewingHead: boolean;
  onViewVersion: (versionId: string) => void;
  selectedId: string | null;
  onSelectThread: (root: MediaComment) => void;
  currentUserId: string | null;
  pendingIds: ReadonlySet<string>;
  posting: boolean;
  loading: boolean;
  onReply: (parentId: string, body: string) => void;
  onResolve: (commentId: string, resolved: boolean) => void;
  onDelete: (commentId: string) => void;
};

function authorLabel(comment: MediaComment): string {
  return comment.authorName ?? displayNameFromEmail(comment.authorEmail) ?? 'Member';
}

function CommentBody({
  comment,
  pinLabel,
  pending,
}: {
  comment: MediaComment;
  pinLabel?: string;
  pending: boolean;
}) {
  const name = authorLabel(comment);
  return (
    <div className={cn('flex gap-2.5', pending && 'opacity-60')}>
      <Avatar className="size-6 shrink-0">
        <AvatarFallback className="text-2xs font-medium">{initialsFor(name)}</AvatarFallback>
      </Avatar>
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline gap-2">
          <span className="truncate text-xs font-medium">{name}</span>
          <span className="shrink-0 text-2xs text-muted-foreground/70">
            {formatRelativeTime(comment.createdAt)}
          </span>
          {pinLabel && (
            <span className="ml-auto shrink-0 rounded bg-primary/10 px-1.5 py-0.5 text-2xs font-semibold tabular-nums text-primary">
              {pinLabel}
            </span>
          )}
        </div>
        <p className="mt-0.5 whitespace-pre-wrap break-words text-sm leading-relaxed text-foreground/90">
          {comment.body}
        </p>
      </div>
    </div>
  );
}

function ThreadCard({
  thread,
  pinLabel,
  versionLabel,
  onViewVersion,
  selected,
  resolved,
  currentUserId,
  pendingIds,
  posting,
  onSelect,
  onReply,
  onResolve,
  onDelete,
}: {
  thread: CommentThread;
  pinLabel?: string;
  /** Set only for a thread written on a version other than the one on stage. */
  versionLabel?: string;
  onViewVersion?: () => void;
  selected: boolean;
  resolved: boolean;
  currentUserId: string | null;
  pendingIds: ReadonlySet<string>;
  posting: boolean;
  onSelect: () => void;
  onReply: (body: string) => void;
  onResolve: (resolved: boolean) => void;
  onDelete: (commentId: string) => void;
}) {
  const [replying, setReplying] = useState(false);
  const cardRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (selected) cardRef.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }, [selected]);

  return (
    <div
      ref={cardRef}
      className={cn(
        'group rounded-lg border p-2.5 transition-colors',
        selected ? 'border-primary/50 bg-primary/5' : 'border-border/60 bg-card',
        resolved && 'opacity-75',
      )}
    >
      {versionLabel ? (
        <div className="mb-1.5 flex items-center gap-1.5">
          <span className="rounded bg-muted px-1.5 py-0.5 text-2xs font-medium tabular-nums text-muted-foreground">
            {versionLabel}
          </span>
          {onViewVersion ? (
            <button
              type="button"
              onClick={onViewVersion}
              className="text-2xs text-muted-foreground underline-offset-2 transition-colors hover:text-foreground hover:underline"
            >
              View {versionLabel}
            </button>
          ) : null}
        </div>
      ) : null}

      <button type="button" className="w-full text-left" onClick={onSelect}>
        <CommentBody
          comment={thread.root}
          pinLabel={pinLabel}
          pending={pendingIds.has(thread.root.id)}
        />
      </button>

      {thread.replies.length > 0 && (
        <div className="mt-2 flex flex-col gap-2 border-l border-border/60 pl-3">
          {thread.replies.map((reply) => (
            <div key={reply.id} className="flex items-start gap-1">
              <div className="min-w-0 flex-1">
                <CommentBody comment={reply} pending={pendingIds.has(reply.id)} />
              </div>
              {currentUserId && reply.createdBy === currentUserId && (
                <button
                  type="button"
                  aria-label="Delete reply"
                  title="Delete reply"
                  onClick={() => onDelete(reply.id)}
                  className="shrink-0 p-1 text-muted-foreground/40 opacity-0 transition-opacity hover:text-destructive group-hover:opacity-100"
                >
                  <Trash2 className="size-3" />
                </button>
              )}
            </div>
          ))}
        </div>
      )}

      <div className="mt-1.5 flex items-center gap-0.5">
        {!resolved && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-6 px-1.5 text-2xs text-muted-foreground"
            onClick={() => setReplying((v) => !v)}
          >
            Reply
          </Button>
        )}
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-6 px-1.5 text-2xs text-muted-foreground"
          onClick={() => onResolve(!resolved)}
        >
          {resolved ? <RotateCcw className="size-3" /> : <CheckCircle2 className="size-3" />}
          {resolved ? 'Reopen' : 'Resolve'}
        </Button>
        {currentUserId && thread.root.createdBy === currentUserId && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="ml-auto h-6 px-1.5 text-2xs text-muted-foreground hover:text-destructive"
            onClick={() => onDelete(thread.root.id)}
          >
            <Trash2 className="size-3" />
            Delete
          </Button>
        )}
      </div>

      {replying && !resolved && (
        <div className="mt-1.5">
          <CommentComposer
            placeholder="Reply..."
            submitLabel="Reply"
            busy={posting}
            autoFocus
            onSubmit={(body) => {
              onReply(body);
              setReplying(false);
            }}
            onCancel={() => setReplying(false)}
          />
        </div>
      )}
    </div>
  );
}

function SectionToggle({
  open,
  onToggle,
  children,
}: {
  open: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-expanded={open}
      className="flex items-center gap-1 px-1 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
    >
      {open ? <ChevronDown className="size-3.5" /> : <ChevronRight className="size-3.5" />}
      {children}
    </button>
  );
}

export function CommentThreads({
  threads,
  pinLabels,
  otherVersionThreads,
  otherVersionCommentCount,
  versionLabels,
  viewingHead,
  onViewVersion,
  selectedId,
  onSelectThread,
  currentUserId,
  pendingIds,
  posting,
  loading,
  onReply,
  onResolve,
  onDelete,
}: Props) {
  const [showResolved, setShowResolved] = useState(false);
  const [showOtherVersions, setShowOtherVersions] = useState(false);

  if (loading) {
    return (
      <div className="flex flex-col gap-2 p-3">
        {[0, 1, 2].map((i) => (
          <div key={i} className="h-16 animate-pulse rounded-lg bg-muted/70" />
        ))}
      </div>
    );
  }

  const currentCount = threads.open.length + threads.resolved.length;

  if (currentCount === 0 && otherVersionThreads.length === 0) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-1 p-6 text-center">
        <p className="text-sm text-muted-foreground">No comments yet.</p>
        <p className="text-xs text-muted-foreground/60">
          Drag on the image or pin a moment in the video to leave feedback in context.
        </p>
      </div>
    );
  }

  const otherVersionsLabel = `${otherVersionCommentCount} ${
    otherVersionCommentCount === 1 ? 'comment' : 'comments'
  } on ${viewingHead ? 'earlier versions' : 'other versions'}`;

  return (
    <div className="flex flex-col gap-2 p-3">
      {currentCount === 0 && (
        <p className="px-1 py-2 text-xs text-muted-foreground">No comments on this version yet.</p>
      )}

      {threads.open.map((thread) => (
        <ThreadCard
          key={thread.root.id}
          thread={thread}
          pinLabel={pinLabels.get(thread.root.id)}
          selected={selectedId === thread.root.id}
          resolved={false}
          currentUserId={currentUserId}
          pendingIds={pendingIds}
          posting={posting}
          onSelect={() => onSelectThread(thread.root)}
          onReply={(body) => onReply(thread.root.id, body)}
          onResolve={(resolved) => onResolve(thread.root.id, resolved)}
          onDelete={onDelete}
        />
      ))}

      {threads.resolved.length > 0 && (
        <>
          <SectionToggle open={showResolved} onToggle={() => setShowResolved((v) => !v)}>
            Resolved ({threads.resolved.length})
          </SectionToggle>
          {showResolved &&
            threads.resolved.map((thread) => (
              <ThreadCard
                key={thread.root.id}
                thread={thread}
                pinLabel={pinLabels.get(thread.root.id)}
                selected={selectedId === thread.root.id}
                resolved
                currentUserId={currentUserId}
                pendingIds={pendingIds}
                posting={posting}
                onSelect={() => onSelectThread(thread.root)}
                onReply={(body) => onReply(thread.root.id, body)}
                onResolve={(resolved) => onResolve(thread.root.id, resolved)}
                onDelete={onDelete}
              />
            ))}
        </>
      )}

      {otherVersionThreads.length > 0 && (
        <>
          <SectionToggle open={showOtherVersions} onToggle={() => setShowOtherVersions((v) => !v)}>
            <History className="size-3.5" />
            {otherVersionsLabel}
          </SectionToggle>
          {showOtherVersions &&
            otherVersionThreads.map((thread) => {
              const versionId = thread.root.versionId ?? null;
              const versionLabel = versionId ? versionLabels.get(versionId) : undefined;
              return (
                <ThreadCard
                  key={thread.root.id}
                  thread={thread}
                  // No pinLabel and no pin: this thread's geometry addresses
                  // bytes that are not on the stage.
                  versionLabel={versionLabel ?? 'Other version'}
                  onViewVersion={
                    versionId && versionLabel ? () => onViewVersion(versionId) : undefined
                  }
                  selected={selectedId === thread.root.id}
                  resolved={Boolean(thread.root.resolvedAt)}
                  currentUserId={currentUserId}
                  pendingIds={pendingIds}
                  posting={posting}
                  onSelect={() => onSelectThread(thread.root)}
                  onReply={(body) => onReply(thread.root.id, body)}
                  onResolve={(resolved) => onResolve(thread.root.id, resolved)}
                  onDelete={onDelete}
                />
              );
            })}
        </>
      )}
    </div>
  );
}
