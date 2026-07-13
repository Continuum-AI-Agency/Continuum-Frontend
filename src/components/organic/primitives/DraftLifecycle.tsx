import { deriveOrganicMediaStage, type OrganicMediaStage } from '@continuum/contracts';
import {
  AlertCircle,
  ArrowRight,
  CheckCircle2,
  Circle,
  Info,
  Library,
  RotateCcw,
  Wand2,
} from 'lucide-react';
import Image from 'next/image';
import * as React from 'react';
import type {
  DraftLadder,
  LadderStep,
  LadderStepState,
} from '@/components/organic/hooks/useDraftEnrichmentLadder';
import { Button } from '@/components/ui/button';
import { HoverCard, HoverCardContent, HoverCardTrigger } from '@/components/ui/hover-card';
import { type ReusableMediaItem, summarizeDraftMedia } from '@/lib/organic/draftMediaSummary';
import type { ReadinessCheck } from '@/lib/organic/draftReadiness';
import { cn } from '@/lib/utils';
import type { OrganicCalendarDraft } from './types';

// Single source of truth for the enrichment-axis (media_stage) presentation,
// shared by the grid card and the editor so the two never drift. The publish
// axis (Draft/Scheduled/Posted) is rendered separately by the editor's
// LifecyclePill; this pill is strictly the enrichment ladder.

type StageMeta = { label: string; tone: string };

const STAGE_META: Record<OrganicMediaStage, StageMeta> = {
  text_only: {
    label: 'Text only',
    tone: 'border-border/60 bg-muted/40 text-muted-foreground/70',
  },
  storyboard_ready: {
    label: 'Blueprint ready',
    tone: 'border-primary/30 bg-primary/10 text-primary',
  },
  realizing: {
    label: 'Realizing',
    tone: 'border-primary/40 bg-primary/10 text-primary',
  },
  realized: {
    label: 'Realized',
    tone: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400',
  },
  failed: {
    label: 'Media failed',
    tone: 'border-destructive/40 bg-destructive/10 text-destructive',
  },
};

export function deriveMediaStageLabel(mediaStage: OrganicMediaStage): string {
  return STAGE_META[mediaStage].label;
}

// Prefer the authoritative backend column (draft.mediaStage); fall back to the
// shared contract derivation for ephemeral stream drafts not yet persisted.
export function resolveDraftMediaStage(draft: OrganicCalendarDraft): OrganicMediaStage {
  if (draft.mediaStage) return draft.mediaStage;
  return deriveOrganicMediaStage({
    publishingAssets: draft.publishingAssets,
    creative: {
      mediaSuggestion: {
        mediaStatus: draft.mediaSuggestion?.mediaStatus ?? null,
        storyboard: draft.mediaSuggestion?.storyboard ?? null,
      },
    },
  });
}

export function MediaStagePill({
  mediaStage,
  className,
}: {
  mediaStage: OrganicMediaStage;
  className?: string;
}) {
  const meta = STAGE_META[mediaStage];
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-full border px-1.5 py-0.5 text-3xs font-semibold uppercase tracking-wider',
        meta.tone,
        className,
      )}
    >
      {mediaStage === 'realizing' && (
        <span className="h-1 w-1 animate-pulse rounded-full bg-current" aria-hidden />
      )}
      {meta.label}
    </span>
  );
}

const STEP_NODE_TONE: Record<LadderStepState, string> = {
  done: 'border-emerald-500/40 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400',
  running: 'border-primary/40 bg-primary/10 text-primary',
  current: 'border-primary/40 bg-primary/5 text-primary',
  locked: 'border-border/60 bg-muted/30 text-muted-foreground/50',
  failed: 'border-destructive/40 bg-destructive/10 text-destructive',
};

function LadderStepNode({ step }: { step: LadderStep }) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-full border px-1.5 py-0.5 text-3xs font-semibold uppercase tracking-wider',
        STEP_NODE_TONE[step.state],
      )}
    >
      {step.state === 'done' ? (
        <CheckCircle2 className="size-2.5" aria-hidden />
      ) : step.state === 'running' ? (
        <span className="h-1 w-1 animate-pulse rounded-full bg-current" aria-hidden />
      ) : step.state === 'failed' ? (
        <AlertCircle className="size-2.5" aria-hidden />
      ) : (
        <Circle className="size-2.5" aria-hidden />
      )}
      {step.label}
    </span>
  );
}

/**
 * The enrichment ladder: Copy → Blueprint → Media, with exactly one Build action on the
 * step the draft can advance to. `compact` renders progress only (the calendar card);
 * the editor renders the actionable form.
 */
export function EnrichmentLadder({
  ladder,
  compact = false,
  className,
}: {
  ladder: DraftLadder;
  compact?: boolean;
  className?: string;
}) {
  return (
    <div className={cn('flex flex-wrap items-center gap-1.5', className)}>
      {ladder.steps.map((step, index) => (
        <React.Fragment key={step.id}>
          {index > 0 && <span className="h-px w-2 bg-border" aria-hidden />}
          <LadderStepNode step={step} />
        </React.Fragment>
      ))}

      {!compact && ladder.actionLabel && (
        <Button
          type="button"
          size="sm"
          variant="secondary"
          className="ml-1 h-6 px-2 text-2xs"
          disabled={ladder.isBusy || ladder.disabledReason !== null}
          onClick={ladder.run}
        >
          {ladder.disabledReason ?? ladder.actionLabel}
          {!ladder.disabledReason && <ArrowRight className="size-3" aria-hidden />}
        </Button>
      )}

      {!compact && ladder.canRewriteCopy && (
        <Button
          type="button"
          size="sm"
          variant="ghost"
          className="h-6 px-2 text-2xs text-muted-foreground"
          disabled={ladder.isBusy}
          onClick={ladder.rewriteCopy}
          title="Replace the current copy with a fresh generation"
        >
          <RotateCcw className="size-3" aria-hidden />
          Rewrite
        </Button>
      )}
    </div>
  );
}

function ReusableThumb({ item }: { item: ReusableMediaItem }) {
  return (
    <div className="relative aspect-square overflow-hidden rounded-md border border-border/50 bg-muted/40">
      {item.kind === 'video' ? (
        <video
          src={`${item.url}#t=0.01`}
          preload="metadata"
          muted
          playsInline
          className="h-full w-full object-cover"
        />
      ) : (
        <Image src={item.url} alt="" fill unoptimized sizes="64px" className="object-cover" />
      )}
      {item.source === 'blueprint' && (
        <span className="absolute inset-x-0 bottom-0 bg-black/55 px-1 py-0.5 text-center text-[8px] font-semibold uppercase tracking-wide text-white">
          Blueprint
        </span>
      )}
    </div>
  );
}

// The enrichment axis surfaced on the post-preview stepper: the media-stage pill,
// a glanceable inventory label ("3 images"), and a hover popover that previews the
// existing/reusable media plus reuse actions (browse the brand library/search, or
// realize from an existing blueprint). Reuse handlers are owned by the editor.
export function MediaEnrichmentSummary({
  draft,
  onReuseLibrary,
  onRealize,
  canRealize = false,
}: {
  draft: OrganicCalendarDraft;
  onReuseLibrary: () => void;
  onRealize?: () => void;
  canRealize?: boolean;
}) {
  const mediaStage = resolveDraftMediaStage(draft);
  const summary = React.useMemo(() => summarizeDraftMedia(draft), [draft]);
  // "Realize from blueprint" is a prior-stage reuse action — only meaningful when
  // a persisted blueprint exists to realize from.
  const showRealize =
    canRealize && mediaStage === 'storyboard_ready' && typeof onRealize === 'function';

  return (
    <div className="flex items-center gap-1.5">
      <span className="text-3xs font-medium uppercase tracking-wider text-muted-foreground/50">
        Media
      </span>
      <MediaStagePill mediaStage={mediaStage} />
      <HoverCard openDelay={120} closeDelay={120}>
        <HoverCardTrigger asChild>
          <button
            type="button"
            aria-label="Media enrichment details"
            className="inline-flex items-center gap-1 rounded-full border border-border/60 bg-muted/30 px-1.5 py-0.5 text-3xs font-medium text-muted-foreground transition-colors hover:bg-muted/60 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
          >
            <span>{summary.label}</span>
            <Info className="h-3 w-3 shrink-0 opacity-70" aria-hidden />
          </button>
        </HoverCardTrigger>
        <HoverCardContent align="start" className="w-72 space-y-2.5">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Media enrichment
          </p>

          {summary.reusable.length > 0 ? (
            <div className="grid grid-cols-4 gap-1.5">
              {summary.reusable.slice(0, 8).map((item) => (
                <ReusableThumb key={item.id} item={item} />
              ))}
            </div>
          ) : (
            <p className="rounded-md border border-dashed border-border/60 bg-muted/30 px-2 py-3 text-center text-2xs text-muted-foreground/70">
              No media attached yet.
            </p>
          )}

          <div className="flex flex-col gap-1.5">
            {showRealize && (
              <button
                type="button"
                onClick={onRealize}
                className="flex w-full items-center justify-center gap-1.5 rounded-md border border-primary/40 bg-primary/10 px-2 py-1.5 text-xs font-medium text-primary transition-colors hover:bg-primary/20"
              >
                <Wand2 className="h-3.5 w-3.5" />
                Realize from blueprint
              </button>
            )}
            <button
              type="button"
              onClick={onReuseLibrary}
              className="flex w-full items-center justify-center gap-1.5 rounded-md border border-border/60 bg-background px-2 py-1.5 text-xs font-medium text-foreground transition-colors hover:bg-muted/60"
            >
              <Library className="h-3.5 w-3.5" />
              Reuse from library / search
            </button>
          </div>
        </HoverCardContent>
      </HoverCard>
    </div>
  );
}

// Replaces the always-on footer checklist: a compact amber alert chip whose hover
// popover lists the bare-minimum schedule requirements (caption + media). Shown
// only while a draft is not yet ready, so the panel footer stays uncluttered.
export function SchedulingRequirementsHint({ checks }: { checks: ReadinessCheck[] }) {
  return (
    <HoverCard openDelay={120} closeDelay={120}>
      <HoverCardTrigger asChild>
        <button
          type="button"
          aria-label="Why this draft can't be scheduled yet"
          className="inline-flex shrink-0 items-center gap-1 rounded-full border border-amber-500/30 bg-amber-500/10 px-1.5 py-0.5 text-3xs font-semibold uppercase tracking-wider text-amber-700 transition-colors hover:bg-amber-500/20 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring dark:text-amber-300"
        >
          <AlertCircle className="h-3 w-3 shrink-0" aria-hidden />
          Needs setup
        </button>
      </HoverCardTrigger>
      <HoverCardContent align="end" className="w-60 space-y-2">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Needed to schedule
        </p>
        <ul className="flex flex-col gap-1">
          {checks.map((check) => (
            <li key={check.id} className="flex items-center gap-2 text-sm">
              {check.met ? (
                <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-emerald-600 dark:text-emerald-400" />
              ) : (
                <Circle className="h-3.5 w-3.5 shrink-0 text-muted-foreground/50" />
              )}
              <span
                className={check.met ? 'text-muted-foreground line-through' : 'text-foreground'}
              >
                {check.label}
              </span>
            </li>
          ))}
        </ul>
      </HoverCardContent>
    </HoverCard>
  );
}
