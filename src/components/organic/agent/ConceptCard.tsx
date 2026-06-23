'use client';

import { CalendarDays, List, Loader2, RefreshCw, Sparkles, X } from 'lucide-react';
import { useState } from 'react';
import { Progress } from '@/components/ui/progress';
import { cn } from '@/lib/utils';
import { AgentArtifactCard, MetaRow, PlatformTag, StatusLabel } from './agentCardKit';
import { resolveConceptPreviewUrl } from './conceptPreview';
import type { PipelineCardState, PlanItem, PlanItemStatus } from './types';

const STATUS_TONE: Record<PlanItemStatus, 'neutral' | 'running' | 'done' | 'failed'> = {
  pending: 'neutral',
  executing: 'running',
  completed: 'done',
  failed: 'failed',
  cancelled: 'neutral',
};

const STATUS_LABEL: Record<PlanItemStatus, string> = {
  pending: 'Concept',
  executing: 'Copy in progress',
  completed: 'Copy ready',
  failed: 'Failed',
  cancelled: 'Cancelled',
};

const IMAGE_OUTLINE = 'outline outline-1 -outline-offset-1 outline-black/10 dark:outline-white/10';

function formatScheduledAt(iso: string): string {
  try {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return iso;
    return d.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
  } catch {
    return iso;
  }
}

type Props = {
  concept: PlanItem;
  status: PlanItemStatus;
  pipeline?: PipelineCardState;
  locked?: boolean;
  onGenerate: () => void;
  onDismiss?: () => void;
  onViewDraft?: (draftId: string, target: 'calendar' | 'list') => void;
};

export function ConceptCard({
  concept,
  status,
  pipeline,
  locked,
  onGenerate,
  onDismiss,
  onViewDraft,
}: Props) {
  const [dispatched, setDispatched] = useState(false);

  const image = resolveConceptPreviewUrl(pipeline?.preview);
  const caption = pipeline?.preview?.caption ?? null;
  const isGenerating = status === 'executing' || pipeline?.status === 'running';
  const isDone = status === 'completed' || pipeline?.status === 'completed';
  const isFailed = status === 'failed' || pipeline?.status === 'failed';
  const pct = Math.max(5, Math.min(100, pipeline?.pct ?? 10));
  const draftId = pipeline?.draftId ?? concept.draftId ?? null;
  const hasTextDraft = Boolean(draftId && (pipeline?.checkpoint?.textReady || isDone));
  const mediaStatus = pipeline?.checkpoint?.mediaStatus;
  const hasPreviewReady = Boolean(pipeline?.checkpoint?.blueprintReady);
  const statusLabel =
    mediaStatus === 'ready' || mediaStatus === 'user_supplied'
      ? 'Fully fleshed out'
      : mediaStatus === 'generating'
        ? 'Fleshing out'
        : hasPreviewReady
          ? 'Preview ready'
          : hasTextDraft
            ? 'Copy ready'
            : STATUS_LABEL[status];
  const statusTone = hasTextDraft ? 'done' : STATUS_TONE[status];

  return (
    <AgentArtifactCard className="mt-0 flex flex-col p-0">
      {/* ── Image / placeholder ──────────────────────────────── */}
      <div className="relative aspect-square w-full">
        {image ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={image}
            alt="Preview"
            className={cn('h-full w-full object-cover', IMAGE_OUTLINE)}
          />
        ) : (
          <div className="flex h-full flex-col justify-between bg-gradient-to-br from-muted/80 via-muted/50 to-muted/20 p-3">
            <PlatformTag platform={concept.platform} />
            {concept.angle && (
              <p className="line-clamp-5 text-[12px] font-semibold leading-snug text-foreground/90 text-pretty">
                {concept.angle}
              </p>
            )}
          </div>
        )}

        {image && (
          <div className="absolute inset-x-0 top-0 p-2.5">
            <PlatformTag
              platform={concept.platform}
              className="bg-black/40 text-white backdrop-blur-[2px]"
            />
          </div>
        )}

        {isGenerating && (
          <Progress
            value={pct}
            className="absolute inset-x-0 bottom-0 h-0.5 rounded-none bg-muted/40 [&_[data-slot=progress-indicator]]:bg-brand-primary [&_[data-slot=progress-indicator]]:transition-transform [&_[data-slot=progress-indicator]]:duration-500"
          />
        )}
      </div>

      {/* ── Scrollable metadata ──────────────────────────────── */}
      <div className="flex max-h-[84px] flex-1 flex-col gap-1 overflow-y-auto p-3 [&::-webkit-scrollbar]:hidden">
        <div className="flex items-center justify-between gap-1">
          <MetaRow
            items={[concept.format ?? undefined, formatScheduledAt(concept.scheduledAt)]}
            className="text-[10.5px]"
          />
          <StatusLabel tone={statusTone}>{statusLabel}</StatusLabel>
        </div>
        {concept.trendTitle && (
          <p className="text-[10px] text-muted-foreground/60">↑ {concept.trendTitle}</p>
        )}
        {(caption ?? concept.rationale) && (
          <p className="text-[11px] leading-relaxed text-muted-foreground text-pretty">
            {caption ?? concept.rationale}
          </p>
        )}
        {isFailed && pipeline?.error?.message && (
          <p className="text-[10.5px] text-destructive/80">{pipeline.error.message}</p>
        )}
      </div>

      {/* ── Action row ──────────────────────────────────────── */}
      <div className="flex items-stretch border-t border-border/40">
        {hasTextDraft && draftId && onViewDraft ? (
          <>
            <button
              type="button"
              onClick={() => onViewDraft(draftId, 'calendar')}
              className="flex flex-1 items-center justify-center gap-1 py-2.5 text-[10.5px] text-muted-foreground transition-colors hover:text-foreground"
            >
              <CalendarDays className="h-3 w-3" />
              Calendar
            </button>
            <div className="w-px self-stretch bg-border/40" />
            <button
              type="button"
              onClick={() => onViewDraft(draftId, 'list')}
              className="flex flex-1 items-center justify-center gap-1 py-2.5 text-[10.5px] text-muted-foreground transition-colors hover:text-foreground"
            >
              <List className="h-3 w-3" />
              List
            </button>
          </>
        ) : isGenerating || (dispatched && !isFailed) ? (
          <div className="flex flex-1 items-center justify-center gap-1.5 py-2.5 text-[10.5px] text-muted-foreground/50">
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
            {isGenerating ? 'Writing copy…' : 'Queued for copy…'}
          </div>
        ) : (
          <>
            <button
              type="button"
              disabled={locked || !onDismiss}
              onClick={onDismiss}
              className={cn(
                'flex flex-1 items-center justify-center py-2.5',
                'text-muted-foreground/30 transition-[color,transform] duration-150',
                'hover:text-destructive active:scale-[0.96]',
                'disabled:pointer-events-none disabled:opacity-20',
              )}
            >
              <X className="h-4 w-4" />
            </button>
            <div className="w-px self-stretch bg-border/40" />
            <button
              type="button"
              aria-label={isFailed ? 'Retry copy draft' : 'Create copy draft'}
              title={isFailed ? 'Retry copy draft' : 'Create copy draft'}
              disabled={locked || isGenerating}
              onClick={() => {
                setDispatched(true);
                onGenerate();
              }}
              className={cn(
                'flex flex-1 items-center justify-center py-2.5',
                'text-muted-foreground/30 transition-[color,transform] duration-150',
                'hover:text-emerald-500 active:scale-[0.96]',
                'disabled:pointer-events-none disabled:opacity-20',
              )}
            >
              {isFailed ? <RefreshCw className="h-4 w-4" /> : <Sparkles className="h-4 w-4" />}
            </button>
          </>
        )}
      </div>
    </AgentArtifactCard>
  );
}
