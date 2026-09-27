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
//
// Review metadata lives here too: a lock marks a comment internal (never shown
// on a share link), a globe marks one shared with share recipients, and either
// can be flipped in place; attachments preview inline; and the timed comments of
// the version on stage export as editing-app markers.

import type { CommentVisibility, MediaComment } from '@continuum/contracts';
import { splitCommentBodyForRender } from '@continuum/contracts';
import {
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Download,
  Globe,
  History,
  Link2,
  Lock,
  PanelRight,
  RotateCcw,
  Trash2,
} from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { toast } from '@/components/ui/toast-imperative';
import { COMMENT_EXPORT_FORMATS, type CommentExportFormat } from '@/lib/library/commentExport';
import type { CommentThread, CommentThreadGroups } from '@/lib/library/comments';
import {
  type CommentAttachmentPreview,
  commentExportHref,
  displayNameFromEmail,
  downloadFromRoute,
  editorViewHref,
  initialsFor,
  listCommentAttachmentPreviews,
  patchCommentMetadata,
} from '@/lib/library/comments';
import { formatRelativeTime } from '@/lib/time/relativeTime';
import { cn } from '@/lib/utils';
import { AttachmentPreviewList } from '../review/AttachmentPreviewList';
import { formatStageRange, useTimecodeDisplay } from '../review/timecodeDisplay';
import { useAssetTiming } from '../review/useAssetTiming';
import { CommentComposer, type ComposerExtras } from './CommentComposer';

type Props = {
  /** Brand context enables @mention autocomplete in reply composers. */
  brandId?: string;
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
  onReply: (parentId: string, body: string, extras?: ComposerExtras) => void;
  onResolve: (commentId: string, resolved: boolean) => void;
  onDelete: (commentId: string) => void;
  commentHref?: (comment: MediaComment) => string;
};

function authorLabel(comment: MediaComment): string {
  return comment.authorName ?? displayNameFromEmail(comment.authorEmail) ?? 'Member';
}

// Mention tokens render as chips; everything else stays verbatim text.
function CommentBodyText({ body }: { body: string }) {
  const segments = splitCommentBodyForRender(body);
  return (
    <>
      {segments.map((segment, index) =>
        segment.kind === 'text' ? (
          // biome-ignore lint/suspicious/noArrayIndexKey: segments are a pure derived split of an immutable string
          <span key={index}>{segment.text}</span>
        ) : (
          // biome-ignore lint/suspicious/noArrayIndexKey: same derived-split rationale
          <span key={index} className="rounded bg-primary/10 px-0.5 font-medium text-primary">
            @{segment.label}
          </span>
        ),
      )}
    </>
  );
}

function VisibilityMark({ visibility }: { visibility: CommentVisibility }) {
  if (visibility === 'internal') {
    return (
      <Lock
        data-testid="comment-internal-lock"
        aria-label="Internal — hidden from share links"
        className="size-3 shrink-0 text-muted-foreground"
      />
    );
  }
  return (
    <Globe
      data-testid="comment-shared-mark"
      aria-label={visibility === 'external' ? 'From a share-link reviewer' : 'Shown on share links'}
      className="size-3 shrink-0 text-primary"
    />
  );
}

const EXPORT_LABELS: Record<CommentExportFormat, string> = {
  csv: 'CSV (spreadsheet)',
  edl: 'EDL (DaVinci Resolve markers)',
  fcpxml: 'FCPXML (Final Cut Pro)',
  premiere: 'XML (Premiere Pro markers)',
};

// Attachments are Library assets; previews are signed on demand and cached per
// comment for the life of the card.
function CommentAttachments({ brandId, comment }: { brandId?: string; comment: MediaComment }) {
  const [previews, setPreviews] = useState<CommentAttachmentPreview[] | null>(null);
  const ids = comment.attachments.map((attachment) => attachment.assetId).join(',');

  useEffect(() => {
    if (!brandId || !ids) return;
    let cancelled = false;
    listCommentAttachmentPreviews(brandId, ids.split(','))
      .then((result) => {
        if (!cancelled) setPreviews(result);
      })
      .catch((error: unknown) => {
        console.error('[CommentThreads] attachment previews failed', error);
        if (!cancelled) setPreviews([]);
      });
    return () => {
      cancelled = true;
    };
  }, [brandId, ids]);

  if (!ids) return null;
  if (previews === null) {
    return <div className="mt-1.5 h-16 w-28 animate-pulse rounded-md bg-muted/70" />;
  }
  return <AttachmentPreviewList previews={previews} />;
}

function CommentBody({
  brandId,
  comment,
  pinLabel,
  pending,
}: {
  brandId?: string;
  comment: MediaComment;
  pinLabel?: string;
  pending: boolean;
}) {
  const name = authorLabel(comment);
  return (
    <div
      className={cn('flex gap-2.5', pending && 'opacity-60')}
      data-comment-id={comment.id}
      data-visibility={comment.visibility ?? 'internal'}
    >
      <Avatar className="size-6 shrink-0">
        <AvatarFallback className="text-2xs font-medium">{initialsFor(name)}</AvatarFallback>
      </Avatar>
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline gap-2">
          <span className="truncate text-xs font-medium">{name}</span>
          <VisibilityMark visibility={comment.visibility ?? 'internal'} />
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
          <CommentBodyText body={comment.body} />
        </p>
        <CommentAttachments brandId={brandId} comment={comment} />
      </div>
    </div>
  );
}

function ThreadCard({
  brandId,
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
  href,
}: {
  brandId?: string;
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
  onReply: (body: string, extras?: ComposerExtras) => void;
  onResolve: (resolved: boolean) => void;
  onDelete: (commentId: string) => void;
  href?: string;
}) {
  const [replying, setReplying] = useState(false);
  const [copied, setCopied] = useState(false);
  // Held until realtime echoes the row back, so the lock flips on click.
  const [visibilityOverride, setVisibilityOverride] = useState<CommentVisibility | null>(null);
  const cardRef = useRef<HTMLDivElement>(null);
  const rootVisibility = visibilityOverride ?? thread.root.visibility ?? 'internal';
  const root = { ...thread.root, visibility: rootVisibility };

  useEffect(() => {
    setVisibilityOverride(null);
  }, [thread.root.visibility]);

  const toggleVisibility = () => {
    if (!brandId || rootVisibility === 'external') return;
    const next = rootVisibility === 'internal' ? 'shared' : 'internal';
    setVisibilityOverride(next);
    patchCommentMetadata({ brandId, commentId: thread.root.id, visibility: next }).catch(
      (error: unknown) => {
        setVisibilityOverride(null);
        toast.error(`Could not change who sees this comment · ${(error as Error).message}`);
      },
    );
  };

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
          brandId={brandId}
          comment={root}
          pinLabel={pinLabel}
          pending={pendingIds.has(thread.root.id)}
        />
      </button>

      {thread.replies.length > 0 && (
        <div className="mt-2 flex flex-col gap-2 border-l border-border/60 pl-3">
          {thread.replies.map((reply) => (
            <div key={reply.id} className="flex items-start gap-1">
              <div className="min-w-0 flex-1">
                <CommentBody brandId={brandId} comment={reply} pending={pendingIds.has(reply.id)} />
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
        {href ? (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-6 px-1.5 text-2xs text-muted-foreground"
            onClick={() => {
              void navigator.clipboard.writeText(href).then(() => {
                setCopied(true);
                window.setTimeout(() => setCopied(false), 1500);
              });
            }}
          >
            {copied ? <Check className="size-3" /> : <Link2 className="size-3" />}
            {copied ? 'Copied' : 'Copy link'}
          </Button>
        ) : null}
        {brandId && rootVisibility !== 'external' ? (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            data-testid="comment-visibility-switch"
            className="h-6 px-1.5 text-2xs text-muted-foreground"
            onClick={toggleVisibility}
            title={
              rootVisibility === 'internal'
                ? 'Show this comment to share-link reviewers'
                : 'Hide this comment from share links'
            }
          >
            {rootVisibility === 'internal' ? (
              <Globe className="size-3" />
            ) : (
              <Lock className="size-3" />
            )}
            {rootVisibility === 'internal' ? 'Share' : 'Make internal'}
          </Button>
        ) : null}
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
            brandId={brandId}
            reviewOptions={Boolean(brandId)}
            onSubmit={(body, extras) => {
              onReply(body, extras);
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
  brandId,
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
  commentHref,
}: Props) {
  const [showResolved, setShowResolved] = useState(false);
  const [showOtherVersions, setShowOtherVersions] = useState(false);

  // The version on stage, read off its own threads (a legacy row with no pin
  // is the head's, which the export and timing routes resolve when none is named).
  const currentRoots = [...threads.open, ...threads.resolved].map((thread) => thread.root);
  const timedRoot = currentRoots.find((root) => root.annotation?.kind === 'time');

  // In timecode or frame mode the labels come from the file's own timing; until it
  // arrives (or for a still) the stage's m:ss labels stand.
  const timecodeMode = useTimecodeDisplay();
  const timing = useAssetTiming(
    timecodeMode !== 'clock' && brandId && timedRoot
      ? { brandId, assetId: timedRoot.assetId, versionId: timedRoot.versionId ?? null }
      : null,
  );
  const labelFor = (root: MediaComment): string | undefined => {
    const annotation = root.annotation;
    if (timecodeMode === 'clock' || !timing || annotation?.kind !== 'time') {
      return pinLabels.get(root.id);
    }
    return formatStageRange(
      annotation.timeMs,
      annotation.endMs ?? null,
      timecodeMode,
      timing.frameRate,
      { startFrame: timing.startFrame, dropFrame: timing.dropFrame },
    );
  };

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

      {brandId && timedRoot ? (
        <div className="flex justify-end gap-1">
          <a
            href={editorViewHref({
              brandId,
              assetId: timedRoot.assetId,
              versionId: timedRoot.versionId ?? null,
            })}
            target="continuum-editor-view"
            rel="noreferrer"
            data-testid="editor-view-link"
            title="Open a compact comment list to keep beside your editor"
            className="inline-flex h-6 items-center gap-1 rounded-md px-1.5 text-2xs text-muted-foreground hover:bg-accent hover:text-foreground"
          >
            <PanelRight className="size-3" />
            Editor view
          </a>
          <DropdownMenu>
            <DropdownMenuTrigger
              render={
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-6 px-1.5 text-2xs text-muted-foreground"
                  aria-label="Export comments as markers"
                >
                  <Download className="size-3" />
                  Export markers
                </Button>
              }
            />
            <DropdownMenuContent align="end">
              {COMMENT_EXPORT_FORMATS.map((format) => (
                <DropdownMenuItem
                  key={format}
                  className="text-xs"
                  data-export-format={format}
                  onSelect={() => {
                    downloadFromRoute(
                      commentExportHref({
                        brandId,
                        assetId: timedRoot.assetId,
                        versionId: timedRoot.versionId ?? null,
                        format,
                      }),
                    ).catch((error: unknown) =>
                      toast.error(`Export failed · ${(error as Error).message}`),
                    );
                  }}
                >
                  {EXPORT_LABELS[format]}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      ) : null}

      {threads.open.map((thread) => (
        <ThreadCard
          key={thread.root.id}
          brandId={brandId}
          thread={thread}
          pinLabel={labelFor(thread.root)}
          selected={selectedId === thread.root.id}
          resolved={false}
          currentUserId={currentUserId}
          pendingIds={pendingIds}
          posting={posting}
          onSelect={() => onSelectThread(thread.root)}
          onReply={(body, extras) => onReply(thread.root.id, body, extras)}
          onResolve={(resolved) => onResolve(thread.root.id, resolved)}
          onDelete={onDelete}
          href={commentHref?.(thread.root)}
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
                brandId={brandId}
                thread={thread}
                pinLabel={labelFor(thread.root)}
                selected={selectedId === thread.root.id}
                resolved
                currentUserId={currentUserId}
                pendingIds={pendingIds}
                posting={posting}
                onSelect={() => onSelectThread(thread.root)}
                onReply={(body, extras) => onReply(thread.root.id, body, extras)}
                onResolve={(resolved) => onResolve(thread.root.id, resolved)}
                onDelete={onDelete}
                href={commentHref?.(thread.root)}
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
                  brandId={brandId}
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
                  onReply={(body, extras) => onReply(thread.root.id, body, extras)}
                  onResolve={(resolved) => onResolve(thread.root.id, resolved)}
                  onDelete={onDelete}
                  href={commentHref?.(thread.root)}
                />
              );
            })}
        </>
      )}
    </div>
  );
}
