"use client"

import * as React from "react"
import Image from "next/image"
import { PlayIcon } from "@radix-ui/react-icons"

import { cn } from "@/lib/utils"
import type { OrganicCalendarDraft } from "./types"
import { useCalendarStore } from "@/lib/organic/store"
import { Input } from "@/components/ui/input"
import { ScrollArea } from "@/components/ui/scroll-area"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import { isOrganicPlatformKey } from "@/lib/organic/platforms"
import {
  resolvePreviewAspectRatio,
  resolvePreviewMaxWidth,
} from "./social-preview-utils"

interface OrganicDraftPreviewProps {
  draft: OrganicCalendarDraft
}

type SocialPreviewProps = {
  draft: OrganicCalendarDraft
  mediaAspectRatio: number
  onCaptionChange: (value: string) => void
  thumbnailDirection: string
}

function hasText(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0
}

function toDataUrl(base64: string, mimeType?: string | null): string {
  const normalized = base64.trim()
  if (normalized.startsWith("data:")) return normalized
  const mime = hasText(mimeType) ? mimeType.trim() : "image/png"
  return `data:${mime};base64,${normalized}`
}

function resolveDraftMediaAssetUrl(draft: OrganicCalendarDraft): string | null {
  const persistedImageAsset = draft.publishingAssets?.find((asset) => asset.kind === "image")
  if (persistedImageAsset?.storageUrl) {
    return persistedImageAsset.storageUrl
  }

  const mediaSuggestion = draft.mediaSuggestion
  if (!mediaSuggestion) return null

  const assetUrl = hasText(mediaSuggestion.assetUrl) ? mediaSuggestion.assetUrl.trim() : ""
  if (assetUrl.length > 0) return assetUrl

  if (hasText(mediaSuggestion.assetBase64)) {
    return toDataUrl(mediaSuggestion.assetBase64, "image/png")
  }

  const primaryAsset = (mediaSuggestion.assets ?? [])
    .filter((asset): asset is NonNullable<NonNullable<typeof mediaSuggestion.assets>[number]> => {
      return Boolean(asset && hasText(asset.assetBase64))
    })
    .sort((left, right) => (left.order ?? Number.MAX_SAFE_INTEGER) - (right.order ?? Number.MAX_SAFE_INTEGER))[0]

  if (!primaryAsset || !hasText(primaryAsset.assetBase64)) return null
  return toDataUrl(primaryAsset.assetBase64, primaryAsset.mimeType)
}

function resolveDraftMediaAltText(draft: OrganicCalendarDraft): string {
  const candidate =
    typeof draft.mediaSuggestion?.alt === "string"
      ? draft.mediaSuggestion.alt.trim()
      : ""
  if (candidate.length > 0) return candidate
  return draft.title || "Generated draft image"
}

function resolveCreativeDirection(draft: OrganicCalendarDraft): string {
  return (
    draft.creativeDirectionPrompt?.trim() ||
    draft.creativeIdea?.trim() ||
    draft.summary?.trim() ||
    draft.title
  )
}

function resolveThumbnailDirection(draft: OrganicCalendarDraft): string {
  return (
    draft.thumbnailPrompt?.trim() ||
    draft.mediaSuggestion?.prompt?.trim() ||
    draft.assetHints?.[0]?.suggestion?.trim() ||
    ""
  )
}

function InlinePreviewTextarea({
  className,
  ...props
}: React.ComponentProps<typeof Textarea>) {
  return (
    <Textarea
      {...props}
      className={cn(
        "resize-none border-border/60 bg-muted/25 text-foreground placeholder:text-muted-foreground shadow-none focus-visible:ring-1 focus-visible:ring-ring/40",
        className
      )}
    />
  )
}

export function OrganicDraftPreview({ draft }: OrganicDraftPreviewProps) {
  const updateDraft = useCalendarStore((state) => state.updateDraft)
  const selectedPlatform = draft.platforms[0] || "instagram"
  const previewMaxWidth = resolvePreviewMaxWidth(selectedPlatform)
  const mediaAspectRatio = resolvePreviewAspectRatio(selectedPlatform)
  const creativeDirection = resolveCreativeDirection(draft)
  const thumbnailDirection = resolveThumbnailDirection(draft)

  const patchDraft = React.useCallback(
    (patch: Partial<OrganicCalendarDraft>) => {
      updateDraft(draft.id, (current) => ({
        ...current,
        ...patch,
      }))
    },
    [draft.id, updateDraft]
  )

  return (
    <div className="flex h-full flex-col overflow-hidden rounded-xl border border-border/80 bg-card shadow-sm">
      <div className="flex flex-wrap items-center gap-2 border-b border-border/70 bg-muted/55 p-3">
        <Select
          value={selectedPlatform}
          onValueChange={(value) => {
            if (!isOrganicPlatformKey(value)) return
            patchDraft({ platforms: [value] })
          }}
        >
          <SelectTrigger className="h-8 w-[9.5rem] border-border/60 bg-background text-xs font-semibold">
            <SelectValue placeholder="Platform" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="instagram">Instagram</SelectItem>
            <SelectItem value="facebook">Facebook</SelectItem>
            <SelectItem value="linkedin">LinkedIn</SelectItem>
          </SelectContent>
        </Select>

        <Input
          value={draft.timeLabel}
          onChange={(event) => patchDraft({ timeLabel: event.target.value })}
          placeholder="9:00 AM"
          className="h-8 w-[8rem] border-border/60 bg-background text-xs font-medium"
        />

        <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
          {draft.format}
        </p>
      </div>

      <ScrollArea className="flex-1 bg-muted/10 p-3">
        <div className="mx-auto flex w-full max-w-[48rem] flex-col gap-3">
          <div className="mx-auto w-full" style={{ maxWidth: `${previewMaxWidth}px` }}>
            {selectedPlatform === "instagram" ? (
              <InstagramMobilePreview
                draft={draft}
                mediaAspectRatio={mediaAspectRatio}
                onCaptionChange={(value) => patchDraft({ captionPreview: value })}
                thumbnailDirection={thumbnailDirection}
              />
            ) : null}

            {selectedPlatform === "facebook" ? (
              <FacebookFeedPreview
                draft={draft}
                mediaAspectRatio={mediaAspectRatio}
                onCaptionChange={(value) => patchDraft({ captionPreview: value })}
                thumbnailDirection={thumbnailDirection}
              />
            ) : null}

            {selectedPlatform === "linkedin" ? (
              <LinkedInDesktopPreview
                draft={draft}
                mediaAspectRatio={mediaAspectRatio}
                onCaptionChange={(value) => patchDraft({ captionPreview: value })}
                thumbnailDirection={thumbnailDirection}
              />
            ) : null}

            {selectedPlatform !== "instagram" &&
            selectedPlatform !== "facebook" &&
            selectedPlatform !== "linkedin" ? (
              <div className="flex min-h-[24rem] items-center justify-center rounded-xl border border-dashed border-border/70 bg-muted/30 px-4 py-10">
                <p className="text-sm text-muted-foreground">
                  Preview for {selectedPlatform} is coming soon.
                </p>
              </div>
            ) : null}
          </div>

          <div
            className="mx-auto w-full rounded-xl border border-border/70 bg-background/90 p-3"
            style={{ maxWidth: `${previewMaxWidth}px` }}
          >
            <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
              Creative direction prompt
            </p>
            <InlinePreviewTextarea
              value={creativeDirection}
              onChange={(event) =>
                patchDraft({
                  creativeDirectionPrompt: event.target.value,
                  creativeIdea: event.target.value,
                })
              }
              placeholder="Describe the hook, visual intent, and mood."
              className="min-h-[5.25rem] text-sm leading-relaxed"
            />
          </div>
        </div>
      </ScrollArea>
    </div>
  )
}

function InstagramMobilePreview({
  draft,
  mediaAspectRatio,
  onCaptionChange,
  thumbnailDirection,
}: SocialPreviewProps) {
  const mediaAssetUrl = resolveDraftMediaAssetUrl(draft)
  const mediaAltText = resolveDraftMediaAltText(draft)

  return (
    <div className="w-full overflow-hidden rounded-xl border border-border/70 bg-card shadow-lg text-foreground">
      <div className="flex items-center p-3 border-b border-border/70">
        <div className="flex items-center space-x-3">
          <div className="w-8 h-8 rounded-full bg-gradient-to-tr from-primary/70 via-accent/70 to-secondary/70 p-[2px] flex items-center justify-center text-[10px] font-bold text-foreground">
            <div className="flex h-full w-full items-center justify-center rounded-full bg-background">
              <div className="flex h-7 w-7 items-center justify-center rounded-full bg-muted text-[8px] text-muted-foreground">
                PT
              </div>
            </div>
          </div>
          <div className="flex flex-col">
            <span className="text-sm font-semibold leading-none tracking-tight">
              thepizzatest
            </span>
            <span className="mt-1 text-[10px] text-muted-foreground">Sponsored</span>
          </div>
        </div>
      </div>

      <div className="relative border-b border-border/70 bg-muted" style={{ aspectRatio: mediaAspectRatio }}>
        {mediaAssetUrl ? (
          <Image
            src={mediaAssetUrl}
            alt={mediaAltText}
            fill
            unoptimized
            sizes="(max-width: 768px) 100vw, 560px"
            className="absolute inset-0 h-full w-full object-cover"
          />
        ) : (
          <div className="absolute inset-0 flex items-center justify-center bg-muted text-muted-foreground">
            <div className="flex flex-col items-center gap-2 text-center">
              <div className="flex h-12 w-12 items-center justify-center rounded-full border border-border/70 bg-background">
                <PlayIcon className="h-6 w-6" />
              </div>
              <p className="text-xs">No thumbnail yet</p>
            </div>
          </div>
        )}
      </div>

      {thumbnailDirection ? (
        <div className="border-b border-border/70 px-3 py-2">
          <p className="line-clamp-2 text-[11px] text-muted-foreground">
            Thumbnail: {thumbnailDirection}
          </p>
        </div>
      ) : null}

      <div className="px-3 pb-2 pt-3">
        <p className="text-xs font-bold">1,234 likes</p>
      </div>

      <div className="px-3 pb-3">
        <p className="mb-1 text-xs font-bold">thepizzatest</p>
        <InlinePreviewTextarea
          value={draft.captionPreview}
          onChange={(event) => onCaptionChange(event.target.value)}
          aria-label="Instagram caption"
          className="min-h-[7rem] border-0 bg-transparent p-0 text-xs leading-relaxed focus-visible:ring-0"
          placeholder="Write your caption..."
        />
      </div>
    </div>
  )
}

function FacebookFeedPreview({
  draft,
  mediaAspectRatio,
  onCaptionChange,
  thumbnailDirection,
}: SocialPreviewProps) {
  const mediaAssetUrl = resolveDraftMediaAssetUrl(draft)
  const mediaAltText = resolveDraftMediaAltText(draft)

  return (
    <div className="w-full overflow-hidden rounded-xl border border-border/70 bg-card shadow-lg text-foreground">
      <div className="p-3 flex items-center border-b border-border/70">
        <div className="flex items-center gap-2">
          <div className="flex h-9 w-9 items-center justify-center rounded-full border border-primary/30 bg-primary/15 font-bold text-primary">
            f
          </div>
          <div>
            <p className="text-sm font-bold tracking-tight">The Pizza Test</p>
            <p className="text-[11px] text-muted-foreground">Sponsored · 1h</p>
          </div>
        </div>
      </div>

      <div className="px-4 py-3 space-y-2">
        <InlinePreviewTextarea
          value={draft.captionPreview}
          onChange={(event) => onCaptionChange(event.target.value)}
          aria-label="Facebook post copy"
          className="min-h-[7rem] border-0 bg-transparent p-0 text-sm leading-relaxed focus-visible:ring-0"
          placeholder="Write your post copy..."
        />
      </div>

      <div className="relative border-y border-border/70 bg-muted" style={{ aspectRatio: mediaAspectRatio }}>
        {mediaAssetUrl ? (
          <Image
            src={mediaAssetUrl}
            alt={mediaAltText}
            fill
            unoptimized
            sizes="(max-width: 768px) 100vw, 560px"
            className="absolute inset-0 h-full w-full object-cover"
          />
        ) : (
          <div className="absolute inset-0 flex items-center justify-center text-muted-foreground">
            <div className="flex flex-col items-center gap-2">
              <div className="flex h-12 w-12 items-center justify-center rounded-full border border-border/70 bg-background">
                <PlayIcon className="h-6 w-6" />
              </div>
              <p className="text-xs">No thumbnail yet</p>
            </div>
          </div>
        )}
      </div>

      {thumbnailDirection ? (
        <div className="border-t border-border/70 px-4 py-2">
          <p className="line-clamp-2 text-[11px] text-muted-foreground">
            Thumbnail: {thumbnailDirection}
          </p>
        </div>
      ) : null}
    </div>
  )
}

function LinkedInDesktopPreview({
  draft,
  mediaAspectRatio,
  onCaptionChange,
  thumbnailDirection,
}: SocialPreviewProps) {
  const mediaAssetUrl = resolveDraftMediaAssetUrl(draft)
  const mediaAltText = resolveDraftMediaAltText(draft)

  return (
    <div className="w-full overflow-hidden rounded-xl border border-border/70 bg-card shadow-lg text-foreground">
      <div className="p-3 flex items-center justify-between border-b border-border/70">
        <div className="flex items-center gap-2">
          <div className="flex h-11 w-11 items-center justify-center rounded border border-primary/30 bg-primary/15 text-xl font-bold text-primary">
            in
          </div>
          <div>
            <p className="text-sm font-bold tracking-tight">The Pizza Test</p>
            <p className="text-[11px] text-muted-foreground">12,450 followers</p>
          </div>
        </div>
      </div>

      <div className="px-4 py-3">
        <InlinePreviewTextarea
          value={draft.captionPreview}
          onChange={(event) => onCaptionChange(event.target.value)}
          aria-label="LinkedIn post copy"
          className="min-h-[7rem] border-0 bg-transparent p-0 text-sm leading-relaxed focus-visible:ring-0"
          placeholder="Write your post copy..."
        />
      </div>

      <div className="relative border-y border-border/70 bg-muted" style={{ aspectRatio: mediaAspectRatio }}>
        {mediaAssetUrl ? (
          <Image
            src={mediaAssetUrl}
            alt={mediaAltText}
            fill
            unoptimized
            sizes="(max-width: 768px) 100vw, 620px"
            className="absolute inset-0 h-full w-full object-cover"
          />
        ) : (
          <div className="absolute inset-0 flex items-center justify-center text-muted-foreground">
            <div className="flex flex-col items-center gap-2">
              <div className="flex h-14 w-14 items-center justify-center rounded-2xl border border-border/70 bg-background">
                <PlayIcon className="h-7 w-7 text-primary" />
              </div>
              <p className="text-xs">No thumbnail yet</p>
            </div>
          </div>
        )}
      </div>

      {thumbnailDirection ? (
        <div className="border-t border-border/70 px-4 py-2">
          <p className="line-clamp-2 text-[11px] text-muted-foreground">
            Thumbnail: {thumbnailDirection}
          </p>
        </div>
      ) : null}
    </div>
  )
}
