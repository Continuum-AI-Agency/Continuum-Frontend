import { deriveOrganicMediaStage, type OrganicMediaStage } from "@continuum/contracts"
import { cn } from "@/lib/utils"
import type { OrganicCalendarDraft } from "./types"

// Single source of truth for the enrichment-axis (media_stage) presentation,
// shared by the grid card and the editor so the two never drift. The publish
// axis (Draft/Scheduled/Posted) is rendered separately by the editor's
// LifecyclePill; this pill is strictly the enrichment ladder.

type StageMeta = { label: string; tone: string }

const STAGE_META: Record<OrganicMediaStage, StageMeta> = {
  text_only: {
    label: "Text only",
    tone: "border-border/60 bg-muted/40 text-muted-foreground/70",
  },
  storyboard_ready: {
    label: "Blueprint ready",
    tone: "border-primary/30 bg-primary/10 text-primary",
  },
  realizing: {
    label: "Realizing",
    tone: "border-primary/40 bg-primary/10 text-primary",
  },
  realized: {
    label: "Realized",
    tone: "border-emerald-500/30 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
  },
  failed: {
    label: "Media failed",
    tone: "border-destructive/40 bg-destructive/10 text-destructive",
  },
}

export function deriveMediaStageLabel(mediaStage: OrganicMediaStage): string {
  return STAGE_META[mediaStage].label
}

// Prefer the authoritative backend column (draft.mediaStage); fall back to the
// shared contract derivation for ephemeral stream drafts not yet persisted.
export function resolveDraftMediaStage(draft: OrganicCalendarDraft): OrganicMediaStage {
  if (draft.mediaStage) return draft.mediaStage
  return deriveOrganicMediaStage({
    publishingAssets: draft.publishingAssets,
    creative: {
      mediaSuggestion: {
        mediaStatus: draft.mediaSuggestion?.mediaStatus ?? null,
        storyboard: draft.mediaSuggestion?.storyboard ?? null,
      },
    },
  })
}

export function MediaStagePill({
  mediaStage,
  className,
}: {
  mediaStage: OrganicMediaStage
  className?: string
}) {
  const meta = STAGE_META[mediaStage]
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full border px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wider",
        meta.tone,
        className,
      )}
    >
      {mediaStage === "realizing" && (
        <span className="h-1 w-1 animate-pulse rounded-full bg-current" aria-hidden />
      )}
      {meta.label}
    </span>
  )
}
