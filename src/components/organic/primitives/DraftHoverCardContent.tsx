"use client"

import { LightningBoltIcon, Pencil1Icon } from "@radix-ui/react-icons"
import { Loader2, Send } from "lucide-react"
import { cn } from "@/lib/utils"
import { Progress } from "@/components/ui/progress"
import type { OrganicCalendarDraft } from "./types"
import { DraftCardMedia, resolveFormatAspectClass } from "./DraftCardMedia"
import { usePublishDraft } from "@/components/organic/hooks/usePublishDraft"
import { inferPostType } from "@/lib/organic/publish-utils"

function resolveHashtags(draft: OrganicCalendarDraft): string[] {
  const ht = draft.hashtags
  if (ht) {
    const combined = [
      ...(ht.high ?? []).slice(0, 3),
      ...(ht.medium ?? []).slice(0, 2),
      ...(ht.low ?? []).slice(0, 1),
    ]
    if (combined.length > 0) return combined
  }
  return draft.tags?.slice(0, 6) ?? []
}

export function DraftHoverCardContent({
  draft,
  onEdit,
  onRegenerate,
}: {
  draft: OrganicCalendarDraft
  onEdit?: (id: string) => void
  onRegenerate?: (id: string) => void
}) {
  const { publish, isPublishing } = usePublishDraft()
  const canPublish =
    draft.platforms.includes("instagram") &&
    draft.status !== "published" &&
    draft.status !== "streaming"

  const hashtags = resolveHashtags(draft)
  const visibleHashtags = hashtags.slice(0, 6)
  const extraCount = hashtags.length - visibleHashtags.length

  const aspectClass = resolveFormatAspectClass(draft.format)
  const isStory = (draft.format ?? "").toLowerCase() === "story"

  return (
    <div className="w-[272px] overflow-hidden rounded-xl border border-border/80 bg-card shadow-2xl shadow-black/20">
      {/* Media thumbnail */}
      <div className={cn("overflow-hidden", isStory && "max-h-[220px]")}>
        <DraftCardMedia
          draft={draft}
          aspectClass={aspectClass}
          className="w-full rounded-none"
          sizes="272px"
        />
      </div>

      {/* Caption */}
      <div className="px-3 pt-2.5 pb-1.5">
        <p className="line-clamp-5 text-xs leading-relaxed text-foreground">
          {draft.captionPreview}
        </p>
      </div>

      {/* Hashtags */}
      {visibleHashtags.length > 0 && (
        <div className="flex flex-wrap gap-1 px-3 pb-2">
          {visibleHashtags.map((tag) => (
            <span
              key={tag}
              className="rounded-full bg-muted/60 px-2 py-0.5 text-[10px] text-muted-foreground"
            >
              {tag.startsWith("#") ? tag : `#${tag}`}
            </span>
          ))}
          {extraCount > 0 && (
            <span className="rounded-full bg-muted/40 px-2 py-0.5 text-[10px] text-muted-foreground/60">
              +{extraCount} more
            </span>
          )}
        </div>
      )}

      {/* Generation progress */}
      {typeof draft.progress === "number" && (
        <div className="space-y-1 px-3 pb-2">
          <div className="flex justify-between text-[9px] font-bold text-muted-foreground">
            <span className="animate-pulse text-amber-500">GENERATING</span>
            <span>{draft.progress}%</span>
          </div>
          <Progress value={draft.progress} className="h-0.5" />
        </div>
      )}

      {/* Quick actions */}
      <div className="flex items-center gap-1 border-t border-border/50 px-2.5 py-2">
        {onEdit && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation()
              onEdit(draft.id)
            }}
            className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-[11px] font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          >
            <Pencil1Icon className="h-3 w-3" />
            Edit
          </button>
        )}
        {onRegenerate && draft.status !== "streaming" && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation()
              onRegenerate(draft.id)
            }}
            className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-[11px] font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          >
            <LightningBoltIcon className="h-3 w-3" />
            Regen
          </button>
        )}
        {canPublish && (
          <button
            type="button"
            disabled={isPublishing}
            onClick={(e) => {
              e.stopPropagation()
              publish(draft.id, inferPostType(draft))
            }}
            className={cn(
              "ml-auto inline-flex items-center gap-1 rounded-md px-2 py-1 text-[11px] font-medium transition-colors",
              "bg-brand-primary/10 text-brand-primary hover:bg-brand-primary/20 disabled:opacity-50"
            )}
          >
            {isPublishing ? (
              <Loader2 className="h-3 w-3 animate-spin" />
            ) : (
              <Send className="h-3 w-3" />
            )}
            {isPublishing ? "Publishing…" : "Publish"}
          </button>
        )}
      </div>
    </div>
  )
}
