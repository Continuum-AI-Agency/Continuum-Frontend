'use client';

// The one action set for the Organic chat's generation cards (the plan row and the inline
// pipeline card). Both used to compute Enrich / Generate media on their own, word them
// their own way, and neither knew a finished job could have lost its draft.

import { hasApprovablePreview } from '@continuum/contracts';
import type { LucideIcon } from 'lucide-react';
import { CalendarDays, PencilRuler, RefreshCw, Wand2 } from 'lucide-react';
import { type ButtonHTMLAttributes, type ReactNode, useEffect, useState } from 'react';
import {
  describeOrganicFailure,
  ORGANIC_ACTION_LABELS,
  shortDraftId,
} from '@/lib/organic/organicActionCopy';
import { cn } from '@/lib/utils';
import { type ConceptStatus, isFailureKind } from './conceptStatus';
import type { CheckpointState } from './types';

type Variant = 'row' | 'footer';

/** A text-weight row action. The plan footer owns the one filled primary. */
export function RowAction({
  icon: Icon,
  children,
  emphasis,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  icon: LucideIcon;
  emphasis?: 'primary' | 'danger';
}) {
  return (
    <button
      type="button"
      {...props}
      className={cn(
        'inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-2xs transition-colors',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
        'disabled:pointer-events-none disabled:opacity-40',
        emphasis === 'primary'
          ? 'font-medium text-foreground/80 hover:bg-muted/60 hover:text-primary'
          : emphasis === 'danger'
            ? 'text-muted-foreground hover:bg-destructive/10 hover:text-destructive'
            : 'text-muted-foreground hover:bg-muted/60 hover:text-foreground',
        props.className,
      )}
    >
      <Icon className="h-3 w-3" />
      {children}
    </button>
  );
}

/** The pipeline card's full-width foot. Emphasis is the bar's position, not a colour. */
function FooterAction({
  icon: Icon,
  children,
  emphasis: _emphasis,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  icon: LucideIcon;
  emphasis?: 'primary' | 'danger';
}) {
  return (
    <button
      type="button"
      {...props}
      className="flex flex-1 items-center justify-center gap-1 py-2.5 text-2xs text-muted-foreground transition-colors hover:text-primary disabled:pointer-events-none disabled:opacity-40"
    >
      <Icon className="h-3 w-3" />
      {children}
    </button>
  );
}

/**
 * The plain-language sentence for a failed card. The raw code and message stay one hover
 * away for whoever is debugging, never in the sentence a marketer reads.
 */
export function FailureNotice({
  status,
  error,
  className,
}: {
  status: ConceptStatus;
  error?: { code?: string; message: string } | null;
  className?: string;
}) {
  if (!isFailureKind(status.kind)) return null;
  const raw = [error?.code, error?.message].filter(Boolean).join(': ');
  return (
    <p
      data-slot="failure-notice"
      title={raw || undefined}
      className={cn('max-w-[68ch] text-destructive/85 text-pretty', className)}
    >
      {describeOrganicFailure({ phase: status.kind, code: error?.code, message: error?.message })}
    </p>
  );
}

/** "Draft 7f95…" — the link from a card to its row in the logs. Click copies the full id. */
export function DraftIdTag({ draftId }: { draftId: string | null | undefined }) {
  if (!draftId) return null;
  return (
    <button
      type="button"
      data-slot="draft-id"
      title={draftId}
      aria-label={`Copy draft id ${draftId}`}
      onClick={() => void navigator.clipboard?.writeText(draftId)}
      className="shrink-0 rounded px-1 font-mono text-3xs text-muted-foreground/70 transition-colors hover:bg-muted/60 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      {shortDraftId(draftId)}
    </button>
  );
}

const DRAFT_KINDS = new Set<ConceptStatus['kind']>([
  'copy_ready',
  'preview_ready',
  'realizing',
  'realized',
  'media_failed',
]);

/** The card holds a draft someone can open: its copy landed and the row still exists. */
export function hasOpenableDraft(
  status: ConceptStatus,
  draftId: string | null,
  checkpoint: CheckpointState | null | undefined,
): boolean {
  if (status.kind === 'draft_missing' || !draftId) return false;
  return Boolean(checkpoint?.textReady || DRAFT_KINDS.has(status.kind));
}

export type DraftCardActionsProps = {
  variant: Variant;
  status: ConceptStatus;
  draftId: string | null;
  checkpoint: CheckpointState | null | undefined;
  format: string | null;
  /** Re-queue this job: "Retry" for a failed job, "Recreate draft" for a missing one. */
  onRetry?: () => void;
  /** Open the planner on this draft; `null` opens the planner itself. */
  onOpenDraft?: (draftId: string | null) => void;
  onEnrichDraft?: (draftId: string) => void;
  onGenerateMedia?: (draftId: string, format: string, previewRevision: string) => void;
  /** Card-specific actions placed before the shared ones (the plan row's Dismiss). */
  leading?: ReactNode;
};

export function DraftCardActions({
  variant,
  status,
  draftId,
  checkpoint,
  format,
  onRetry,
  onOpenDraft,
  onEnrichDraft,
  onGenerateMedia,
  leading,
}: DraftCardActionsProps) {
  const [mediaActionSent, setMediaActionSent] = useState(false);
  const [retrySent, setRetrySent] = useState(false);
  // A retry that landed moves the card to a new kind; let the next failure retry again.
  useEffect(() => {
    setRetrySent(false);
  }, [status.kind]);

  const Action = variant === 'row' ? RowAction : FooterAction;
  const missing = status.kind === 'draft_missing';
  const liveDraftId = missing ? null : draftId;
  const mediaStatus = checkpoint?.mediaStatus;
  const mediaSettled =
    mediaStatus === 'ready' || mediaStatus === 'user_supplied' || mediaStatus === 'generating';
  const hasDraft = hasOpenableDraft(status, draftId, checkpoint);
  // Generate media needs the approval token: the realize path rejects an absent or stale one.
  const showGenerateMedia = Boolean(
    onGenerateMedia &&
      liveDraftId &&
      hasApprovablePreview(checkpoint) &&
      checkpoint?.blueprintReady &&
      !mediaSettled,
  );
  // THE INVARIANT: an unsettled draft always offers something to click. Enrich re-runs the
  // blueprint, which stamps a fresh previewRevision — the pre-blueprint action, the recovery
  // for a blueprint without a usable token, and the media-failure retry.
  const showEnrich = Boolean(
    onEnrichDraft && liveDraftId && checkpoint?.textReady && !mediaSettled && !showGenerateMedia,
  );
  // A media failure WITH its draft recovers through Enrich; without one it is a dead job.
  const showRetry = Boolean(
    onRetry &&
      (missing || status.kind === 'failed' || (status.kind === 'media_failed' && !hasDraft)),
  );
  const showOpen = Boolean(onOpenDraft && (missing || hasDraft));

  if (!leading && !showRetry && !showOpen && !showEnrich && !showGenerateMedia) return null;

  const retry = () => {
    if (retrySent) return;
    setRetrySent(true);
    onRetry?.();
  };

  const buttons = (
    <>
      {leading}
      {showRetry && (
        <Action
          icon={RefreshCw}
          emphasis="primary"
          disabled={retrySent}
          title={
            missing
              ? 'Write this post again into a new draft'
              : 'Run this generation again from where it stopped'
          }
          onClick={retry}
        >
          {missing ? ORGANIC_ACTION_LABELS.recreateDraft : ORGANIC_ACTION_LABELS.retry}
        </Action>
      )}
      {showOpen && (
        <Action
          icon={CalendarDays}
          onClick={() => onOpenDraft?.(liveDraftId)}
          title={missing ? 'Open the planner' : 'Open this draft in the planner'}
        >
          {missing ? ORGANIC_ACTION_LABELS.openCalendar : ORGANIC_ACTION_LABELS.openInCalendar}
        </Action>
      )}
      {showEnrich && liveDraftId && (
        <Action
          icon={PencilRuler}
          emphasis="primary"
          disabled={mediaActionSent}
          title={
            status.kind === 'media_failed'
              ? 'Re-sketch the blueprint and try the media again'
              : checkpoint?.blueprintReady
                ? 'Rebuild the blueprint to refresh its preview approval'
                : 'Sketch a low-cost blueprint before final media'
          }
          onClick={() => {
            setMediaActionSent(true);
            onEnrichDraft?.(liveDraftId);
          }}
        >
          {mediaActionSent ? 'Enriching…' : ORGANIC_ACTION_LABELS.enrich}
        </Action>
      )}
      {showGenerateMedia && liveDraftId && (
        <Action
          icon={Wand2}
          emphasis="primary"
          disabled={mediaActionSent}
          title="Render the final media from the approved blueprint"
          onClick={() => {
            setMediaActionSent(true);
            if (checkpoint?.previewRevision) {
              onGenerateMedia?.(liveDraftId, format ?? '', checkpoint.previewRevision);
            }
          }}
        >
          {mediaActionSent ? 'Generating…' : ORGANIC_ACTION_LABELS.generateMedia}
        </Action>
      )}
    </>
  );

  return variant === 'row' ? (
    <div className="ml-auto flex flex-wrap items-center gap-0.5">{buttons}</div>
  ) : (
    <div className="-mx-[var(--card-pad)] -mb-[var(--card-pad)] flex items-stretch border-t border-border/40">
      {buttons}
    </div>
  );
}
