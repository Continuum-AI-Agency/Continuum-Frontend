"use client"

import * as React from "react"
import Image from "next/image"
import { PlayIcon } from "@radix-ui/react-icons"

import { Loader2, Send } from "lucide-react"

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
import { OrganicCreativesPicker } from "./OrganicCreativesPicker"
import { usePublishDraft } from "@/components/organic/hooks/usePublishDraft"
import { inferPostType } from "@/lib/organic/publish-utils"

interface OrganicDraftPreviewProps {
  draft: OrganicCalendarDraft
  brandName?: string
  brandProfileId?: string
  onApprove?: (draftId: string) => void
}

type SocialPreviewProps = {
  draft: OrganicCalendarDraft
  mediaAspectRatio: number
  onCaptionChange: (value: string) => void
  thumbnailDirection: string
  brandName?: string
}

function hasText(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0
}

function brandInitials(name: string | undefined): string {
  if (!name) return "BR"
  return name
    .split(" ")
    .map((w) => w[0])
    .join("")
    .slice(0, 2)
    .toUpperCase()
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

const LIFECYCLE_STEPS = [
  { key: "draft", label: "Draft" },
  { key: "scheduled", label: "Scheduled" },
  { key: "posted", label: "Posted" },
] as const

function LifecyclePill({ status }: { status: OrganicCalendarDraft["status"] }) {
  const activeIndex =
    status === "published" ? 2 : status === "scheduled" ? 1 : 0

  return (
    <div className="flex items-center gap-1 w-full">
      {LIFECYCLE_STEPS.map((step, i) => {
        const isActive = i === activeIndex
        const isCompleted = i < activeIndex
        const isFuture = i > activeIndex
        return (
          <React.Fragment key={step.key}>
            {i > 0 && <div className="h-px flex-1 bg-border/50" />}
            <span
              className={cn(
                "rounded-full px-2 py-0.5 text-[9px] font-semibold uppercase tracking-wider",
                isActive && status === "failed"
                  ? "border border-destructive/40 bg-destructive/10 text-destructive"
                  : isActive
                    ? "border border-primary/30 bg-primary/10 text-primary"
                    : isCompleted
                      ? "border border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400"
                      : isFuture && step.key === "posted"
                        ? "border border-border/50 bg-muted/30 text-muted-foreground/40"
                        : "border border-border/50 bg-muted/40 text-muted-foreground/60"
              )}
            >
              {step.label}
            </span>
          </React.Fragment>
        )
      })}
    </div>
  )
}

export function OrganicDraftPreview({ draft, brandName, brandProfileId, onApprove }: OrganicDraftPreviewProps) {
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

  const isApproveDisabled =
    draft.status === "scheduled" || draft.status === "streaming"

  const { publish, isPublishing, stage, pollingAttempt, tokenExpired } = usePublishDraft()
  const isInstagram = draft.platforms.includes("instagram")
  const isPublished = draft.status === "published"
  const canPublish = isInstagram && !isPublished && draft.status !== "streaming"
  const showFooter = onApprove != null || canPublish || isPublished

  return (
    <div className="flex h-full flex-col overflow-hidden rounded-xl border border-border/80 bg-card shadow-sm">
      {/* Header */}
      <div className="flex shrink-0 flex-col gap-2 border-b border-border/70 bg-muted/55 p-3">
        <div className="flex flex-wrap items-center gap-2">
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

        <LifecyclePill status={draft.status} />
      </div>

      {/* Scroll content: Creative direction first, then social preview */}
      <ScrollArea className="flex-1 bg-muted/10 p-3">
        <div className="mx-auto flex w-full max-w-[48rem] flex-col gap-3">
          {/* Creative direction — primary edit field */}
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

          {/* Creatives — attach AI Studio assets */}
          {brandProfileId && (
            <div
              className="mx-auto w-full rounded-xl border border-border/70 bg-background/90 p-3"
              style={{ maxWidth: `${previewMaxWidth}px` }}
            >
              <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                Creatives
              </p>
              <OrganicCreativesPicker
                brandProfileId={brandProfileId}
                draftId={draft.id}
                attached={draft.publishingAssets ?? []}
                onAttach={(assets) =>
                  updateDraft(draft.id, (current) => ({
                    ...current,
                    publishingAssets: assets,
                  }))
                }
              />
            </div>
          )}

          {/* Social preview mock */}
          <div className="mx-auto w-full" style={{ maxWidth: `${previewMaxWidth}px` }}>
            {selectedPlatform === "instagram" ? (
              <InstagramMobilePreview
                draft={draft}
                mediaAspectRatio={mediaAspectRatio}
                onCaptionChange={(value) => patchDraft({ captionPreview: value })}
                thumbnailDirection={thumbnailDirection}
                brandName={brandName}
              />
            ) : null}

            {selectedPlatform === "facebook" ? (
              <FacebookFeedPreview
                draft={draft}
                mediaAspectRatio={mediaAspectRatio}
                onCaptionChange={(value) => patchDraft({ captionPreview: value })}
                thumbnailDirection={thumbnailDirection}
                brandName={brandName}
              />
            ) : null}

            {selectedPlatform === "linkedin" ? (
              <LinkedInDesktopPreview
                draft={draft}
                mediaAspectRatio={mediaAspectRatio}
                onCaptionChange={(value) => patchDraft({ captionPreview: value })}
                thumbnailDirection={thumbnailDirection}
                brandName={brandName}
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
        </div>
      </ScrollArea>

      {/* Footer CTA */}
      {showFooter ? (
        <div className="shrink-0 border-t border-border/70 bg-background/90 p-3 flex flex-col gap-2">
          {tokenExpired && (
            <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-[12px] text-amber-700 dark:text-amber-300">
              Instagram access token expired.{" "}
              <a
                href="/settings/integrations"
                className="underline underline-offset-2"
              >
                Reconnect your account
              </a>
            </div>
          )}

          {onApprove && (
            <button
              type="button"
              disabled={isApproveDisabled}
              onClick={() => onApprove(draft.id)}
              className={cn(
                "flex w-full items-center justify-center gap-2 rounded-lg px-4 py-2.5 text-sm font-semibold transition-colors",
                isApproveDisabled
                  ? "cursor-not-allowed bg-muted text-muted-foreground"
                  : "bg-primary text-primary-foreground hover:bg-primary/90"
              )}
            >
              {draft.status === "scheduled"
                ? "Approved for Scheduling"
                : "Approve for Scheduling"}
            </button>
          )}

          {canPublish && (
            <button
              type="button"
              disabled={isPublishing}
              onClick={() => publish(draft.id, inferPostType(draft))}
              className={cn(
                "flex w-full items-center justify-center gap-2 rounded-lg px-4 py-2.5 text-sm font-semibold transition-colors",
                isPublishing
                  ? "cursor-not-allowed bg-muted text-muted-foreground"
                  : "bg-primary text-primary-foreground hover:bg-primary/90"
              )}
            >
              {isPublishing ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  {stage === "container_created"
                    ? "Uploading media…"
                    : stage === "polling"
                      ? `Processing video${pollingAttempt > 0 ? ` (${pollingAttempt})` : ""}…`
                      : "Publishing…"}
                </>
              ) : (
                <>
                  <Send className="h-4 w-4" />
                  Publish to Instagram
                </>
              )}
            </button>
          )}

          {isPublished && (
            <div className="flex items-center justify-center gap-2 px-4 py-1.5">
              <span className="text-[12px] text-muted-foreground">Published</span>
              {draft.instagram_post_id && (
                <a
                  href={`https://www.instagram.com/p/${draft.instagram_post_id}/`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-[12px] text-primary underline underline-offset-2"
                >
                  View on Instagram
                </a>
              )}
            </div>
          )}
        </div>
      ) : null}
    </div>
  )
}

const CAPTION_LIMITS: Record<string, number> = {
  instagram: 2200,
  facebook: 63206,
  linkedin: 3000,
}

function CaptionCharCount({ caption, platform }: { caption: string; platform: string }) {
  const limit = CAPTION_LIMITS[platform] ?? 2200
  const len = caption.length
  return (
    <div className="mt-1 flex justify-end">
      <span
        className={cn(
          "text-[10px] tabular-nums",
          len > limit
            ? "text-destructive"
            : len > limit * 0.9
              ? "text-amber-600"
              : "text-muted-foreground/50"
        )}
      >
        {len.toLocaleString()} / {limit.toLocaleString()}
      </span>
    </div>
  )
}

function InstagramMobilePreview({
  draft,
  mediaAspectRatio,
  onCaptionChange,
  thumbnailDirection,
  brandName,
}: SocialPreviewProps) {
  const mediaAssetUrl = resolveDraftMediaAssetUrl(draft)
  const mediaAltText = resolveDraftMediaAltText(draft)
  const displayName = brandName ?? "Your Brand"
  const initials = brandInitials(brandName)

  return (
    <div className="w-full overflow-hidden rounded-xl border border-border/70 bg-card shadow-lg text-foreground">
      <div className="flex items-center p-3 border-b border-border/70">
        <div className="flex items-center space-x-3">
          <div className="w-8 h-8 rounded-full bg-gradient-to-tr from-primary/70 via-accent/70 to-secondary/70 p-[2px] flex items-center justify-center text-[10px] font-bold text-foreground">
            <div className="flex h-full w-full items-center justify-center rounded-full bg-background">
              <div className="flex h-7 w-7 items-center justify-center rounded-full bg-muted text-[8px] text-muted-foreground">
                {initials}
              </div>
            </div>
          </div>
          <div className="flex flex-col">
            <span className="text-sm font-semibold leading-none tracking-tight">
              {displayName}
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

      {/* Engagement bar */}
      <div className="flex items-center justify-between border-b border-border/40 px-3 py-2">
        <div className="flex items-center gap-4 text-muted-foreground/40">
          <svg viewBox="0 0 24 24" className="h-5 w-5 cursor-default" fill="none" stroke="currentColor" strokeWidth={2}><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" /></svg>
          <svg viewBox="0 0 24 24" className="h-5 w-5 cursor-default" fill="none" stroke="currentColor" strokeWidth={2}><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" /></svg>
          <svg viewBox="0 0 24 24" className="h-5 w-5 cursor-default" fill="none" stroke="currentColor" strokeWidth={2}><line x1="22" y1="2" x2="11" y2="13" /><polygon points="22 2 15 22 11 13 2 9 22 2" /></svg>
        </div>
        <svg viewBox="0 0 24 24" className="h-5 w-5 cursor-default text-muted-foreground/40" fill="none" stroke="currentColor" strokeWidth={2}><path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z" /></svg>
      </div>

      <div className="px-3 pb-3 pt-2">
        <p className="mb-1 text-xs font-bold">{displayName}</p>
        <InlinePreviewTextarea
          value={draft.captionPreview}
          onChange={(event) => onCaptionChange(event.target.value)}
          aria-label="Instagram caption"
          className="min-h-[7rem] border-0 bg-transparent p-0 text-xs leading-relaxed focus-visible:ring-0"
          placeholder="Write your caption..."
        />
        <CaptionCharCount caption={draft.captionPreview} platform="instagram" />
      </div>
    </div>
  )
}

function FacebookFeedPreview({
  draft,
  mediaAspectRatio,
  onCaptionChange,
  thumbnailDirection,
  brandName,
}: SocialPreviewProps) {
  const mediaAssetUrl = resolveDraftMediaAssetUrl(draft)
  const mediaAltText = resolveDraftMediaAltText(draft)
  const displayName = brandName ?? "Your Brand"

  return (
    <div className="w-full overflow-hidden rounded-xl border border-border/70 bg-card shadow-lg text-foreground">
      <div className="p-3 flex items-center border-b border-border/70">
        <div className="flex items-center gap-2">
          <div className="flex h-9 w-9 items-center justify-center rounded-full border border-primary/30 bg-primary/15 font-bold text-primary">
            {brandInitials(brandName)}
          </div>
          <div>
            <p className="text-sm font-bold tracking-tight">{displayName}</p>
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
        <CaptionCharCount caption={draft.captionPreview} platform="facebook" />
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

      {/* Engagement bar */}
      <div className="flex items-center gap-4 border-t border-border/40 px-4 py-2 text-[12px] font-medium text-muted-foreground/40 cursor-default">
        <span className="flex items-center gap-1">
          <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2}><path d="M14 9V5a3 3 0 0 0-3-3l-4 9v11h11.28a2 2 0 0 0 2-1.7l1.38-9a2 2 0 0 0-2-2.3H14z" /></svg>
          Like
        </span>
        <span className="flex items-center gap-1">
          <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2}><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" /></svg>
          Comment
        </span>
        <span className="flex items-center gap-1">
          <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2}><circle cx="18" cy="5" r="3" /><circle cx="6" cy="12" r="3" /><circle cx="18" cy="19" r="3" /><line x1="8.59" y1="13.51" x2="15.42" y2="17.49" /><line x1="15.41" y1="6.51" x2="8.59" y2="10.49" /></svg>
          Share
        </span>
      </div>
    </div>
  )
}

function LinkedInDesktopPreview({
  draft,
  mediaAspectRatio,
  onCaptionChange,
  thumbnailDirection,
  brandName,
}: SocialPreviewProps) {
  const mediaAssetUrl = resolveDraftMediaAssetUrl(draft)
  const mediaAltText = resolveDraftMediaAltText(draft)
  const displayName = brandName ?? "Your Brand"

  return (
    <div className="w-full overflow-hidden rounded-xl border border-border/70 bg-card shadow-lg text-foreground">
      <div className="p-3 flex items-center justify-between border-b border-border/70">
        <div className="flex items-center gap-2">
          <div className="flex h-11 w-11 items-center justify-center rounded border border-primary/30 bg-primary/15 text-lg font-bold text-primary">
            {brandInitials(brandName)}
          </div>
          <div>
            <p className="text-sm font-bold tracking-tight">{displayName}</p>
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
        <CaptionCharCount caption={draft.captionPreview} platform="linkedin" />
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

      {/* Engagement bar */}
      <div className="flex items-center gap-4 border-t border-border/40 px-4 py-2 text-[12px] font-medium text-muted-foreground/40 cursor-default">
        <span className="flex items-center gap-1">
          <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2}><path d="M14 9V5a3 3 0 0 0-3-3l-4 9v11h11.28a2 2 0 0 0 2-1.7l1.38-9a2 2 0 0 0-2-2.3H14z" /></svg>
          Like
        </span>
        <span className="flex items-center gap-1">
          <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2}><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" /></svg>
          Comment
        </span>
        <span className="flex items-center gap-1">
          <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2}><polyline points="17 1 21 5 17 9" /><path d="M3 11V9a4 4 0 0 1 4-4h14" /><polyline points="7 23 3 19 7 15" /><path d="M21 13v2a4 4 0 0 1-4 4H3" /></svg>
          Repost
        </span>
        <span className="flex items-center gap-1">
          <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2}><line x1="22" y1="2" x2="11" y2="13" /><polygon points="22 2 15 22 11 13 2 9 22 2" /></svg>
          Send
        </span>
      </div>
    </div>
  )
}
