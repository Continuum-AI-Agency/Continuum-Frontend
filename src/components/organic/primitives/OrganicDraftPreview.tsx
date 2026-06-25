"use client"

import * as React from "react"
import Image from "next/image"
import { ChevronLeftIcon, ChevronRightIcon, Cross2Icon } from "@radix-ui/react-icons"

import { CheckCircle2, Circle, Hash, Loader2, Send, Sparkles } from "lucide-react"

import { cn } from "@/lib/utils"
import type { OrganicCalendarDraft } from "./types"
import { useCalendarStore } from "@/lib/organic/store"
import { ScrollArea } from "@/components/ui/scroll-area"
import {
  DndContext,
  useSensor,
  useSensors,
  PointerSensor,
  KeyboardSensor,
  type DragEndEvent,
} from "@dnd-kit/core"
import { sortableKeyboardCoordinates } from "@dnd-kit/sortable"
import { isOrganicPlatformKey } from "@/lib/organic/platforms"
import type { OrganicPlatformKey } from "@/lib/organic/platforms"
import {
  resolvePreviewAspectRatio,
  resolvePreviewMaxWidth,
} from "./social-preview-utils"
import { HyperFramePlayer } from "./HyperFramePlayer"
import { usePublishDraft } from "@/components/organic/hooks/usePublishDraft"
import { useOpenDraftInAiStudio } from "./AiStudioHandoffContext"
import { signMediaAsset, signOrganicMediaAsset } from "@/lib/organic/hyperframeSign"
import { PreviewMediaDropZone } from "./PreviewMediaDropZone"
import { CarouselSlideStrip } from "./CarouselSlideStrip"
import {
  useDraftMediaPlacement,
  type SlotTarget,
} from "@/components/organic/hooks/useDraftMediaPlacement"
import type { MediaAsset } from "@continuum/contracts"
import { uploadDraftCreatives } from "@/lib/creative-assets/uploadDraftCreative"
import { useGenerateDraftMedia } from "@/components/organic/hooks/useGenerateDraftMedia"
import { evaluateDraftReadiness } from "@/lib/organic/draftReadiness"
import { EditableCaption, InlinePreviewTextarea } from "./EditableCaption"
import { flattenHashtags } from "@/lib/organic/hashtags"
import { PostMetaChips } from "./PostMetaChips"
import { PostCommandMenu } from "./PostCommandMenu"
import { MediaStagePill, resolveDraftMediaStage } from "./DraftLifecycle"
import { MediaSelectPopover } from "./MediaSelectPopover"

interface OrganicDraftPreviewProps {
  draft: OrganicCalendarDraft
  brandName?: string
  brandProfileId?: string
  onApprove?: (draftId: string) => void
}

type SocialPreviewProps = {
  draft: OrganicCalendarDraft
  onCaptionChange: (value: string) => void
  brandName?: string
  platform: string
  // The media zone, pre-wired with its MediaSelectPopover by the parent.
  mediaNode: React.ReactNode
  // Hover-revealed edit affordances — open the existing inline editors.
  onEditCreativeDirection?: () => void
  onEditHashtags?: () => void
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

// Storage-first: the preview always resolves to a storage signed URL (durable +
// re-signable), never an in-memory base64 data: URL.
function resolveDraftMediaAssetUrl(draft: OrganicCalendarDraft): string | null {
  const persistedImageAsset = draft.publishingAssets?.find((asset) => asset.kind === "image")
  if (hasText(persistedImageAsset?.storageUrl)) {
    return persistedImageAsset.storageUrl
  }

  const assetUrl = draft.mediaSuggestion?.assetUrl
  return hasText(assetUrl) ? assetUrl.trim() : null
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


function resolveCarouselSlides(draft: OrganicCalendarDraft): Array<{
  slideIndex: number
  storageUrl: string
  assetId?: string | null
  storagePath: string
}> {
  // Storage-first: carousel slides are durable published assets (storageUrl,
  // refreshed by useDraftWithFreshMedia), ordered by slideIndex.
  const published = (draft.publishingAssets ?? [])
    .filter((a) => a.kind === "image" && hasText(a.storageUrl))
    .sort((a, b) => (a.slideIndex ?? 999) - (b.slideIndex ?? 999))
  if (published.length > 0) {
    return published.map((a) => ({
      slideIndex: a.slideIndex ?? 0,
      storageUrl: a.storageUrl,
      assetId: a.assetId,
      storagePath: a.storagePath,
    }))
  }

  const primary = resolveDraftMediaAssetUrl(draft)
  if (primary) {
    return [{ slideIndex: 0, storageUrl: primary, storagePath: primary }]
  }
  return []
}

type StoryboardFrame = {
  role?: string | null
  storageUrl: string
  format?: string | null
}

// Persisted 512px storyboard preview frames (Stage-2 blueprint). The backend
// re-signs storageUrl on every calendar load, so render it directly. Only frames
// with a usable signed URL are surfaced; base64 is never used.
function resolveStoryboardFrames(draft: OrganicCalendarDraft): StoryboardFrame[] {
  return (draft.mediaSuggestion?.storyboard ?? [])
    .filter((frame): frame is { storageUrl: string } & typeof frame =>
      hasText(frame?.storageUrl),
    )
    .map((frame) => ({
      role: frame.role,
      storageUrl: frame.storageUrl as string,
      format: frame.format,
    }))
}

// The blueprint preview shown in an empty (pending) media slot: surfaces the
// persisted storyboard so a text-only draft reads honestly as "no final media
// yet — here's the planned look" instead of an empty box.
function StoryboardPreview({ frames, alt }: { frames: StoryboardFrame[]; alt: string }) {
  return (
    <div className="flex w-full flex-col items-center gap-2 px-4 py-5 text-center">
      <span className="inline-flex items-center gap-1 rounded-full border border-primary/30 bg-primary/10 px-2 py-0.5 text-3xs font-semibold uppercase tracking-wider text-primary">
        Blueprint ready
      </span>
      <div className="flex flex-wrap items-center justify-center gap-1.5">
        {frames.slice(0, 4).map((frame, index) => (
          <div
            key={`${frame.storageUrl}-${index}`}
            className="relative h-16 w-16 overflow-hidden rounded-md border border-border/60 bg-muted/40"
          >
            <Image
              src={frame.storageUrl}
              alt={`${alt} — storyboard frame ${index + 1}`}
              fill
              unoptimized
              sizes="64px"
              className="object-cover"
            />
          </div>
        ))}
      </div>
      <p className="text-xs font-medium text-muted-foreground">
        Generate final media or use your own creative
      </p>
    </div>
  )
}

// Derive the visual style of the media status (drives Generate-button gating).
function resolveMediaStatusVariant(
  draft: OrganicCalendarDraft,
): "default" | "generating" | "ready" | "user_supplied" | "pending" {
  const ms = draft.mediaSuggestion?.mediaStatus
  if (ms === "user_supplied") return "user_supplied"
  if (ms === "generating") return "generating"
  if (ms === "ready") return "ready"
  return "pending"
}

// Determines whether we should show the "Use your own creative" CTA in the media slot.
function shouldShowUseOwnCta(draft: OrganicCalendarDraft): boolean {
  const status = draft.status
  if (status === "failed") return true
  const ms = draft.mediaSuggestion?.mediaStatus
  const hasMedia = resolveDraftMediaAssetUrl(draft) !== null
  if (!hasMedia && ms !== "generating") return true
  return false
}

// The interactive media area — wraps the existing CarouselMediaArea visuals
// inside a PreviewMediaDropZone. When no media is present, renders the CTA.
function InteractiveCarouselMediaArea({
  draft,
  alt,
  aspectRatio,
  borderClass = "border-b border-border/70",
  slotId,
  onActivate,
  onNativeDrop,
  onSelectLibrary,
  onFilesChosen,
  isUploading,
  activeSlideIndex,
  onSelectSlide,
  placement,
  onAddSlideRequest,
  onReplaceSlideRequest,
}: {
  draft: OrganicCalendarDraft
  alt: string
  aspectRatio: number
  borderClass?: string
  slotId: string
  onActivate: () => void
  onNativeDrop?: (assetId: string) => void
  onSelectLibrary?: () => void
  onFilesChosen?: (files: File[]) => void
  isUploading?: boolean
  activeSlideIndex: number
  onSelectSlide: (i: number) => void
  placement?: ReturnType<typeof useDraftMediaPlacement>
  onAddSlideRequest?: () => void
  onReplaceSlideRequest?: (position: number) => void
}) {
  const slides = resolveCarouselSlides(draft)
  const total = slides.length
  const isCarousel = draft.format.toLowerCase() === "carousel"
  const showCta = shouldShowUseOwnCta(draft)
  // A pending (text-only) draft with a persisted blueprint shows its storyboard
  // in the otherwise-empty slot, making the no-final-media state explicit.
  const storyboardFrames = resolveStoryboardFrames(draft)
  const showStoryboard =
    showCta &&
    total === 0 &&
    draft.mediaSuggestion?.mediaStatus === "pending" &&
    storyboardFrames.length > 0
  const [successFlash, setSuccessFlash] = React.useState(false)

  // Flash success ring briefly after a new media placement.
  const prevAssetsLength = React.useRef(total)
  React.useEffect(() => {
    if (total > prevAssetsLength.current) {
      setSuccessFlash(true)
      const t = setTimeout(() => setSuccessFlash(false), 1500)
      prevAssetsLength.current = total
      return () => clearTimeout(t)
    }
    prevAssetsLength.current = total
  }, [total])

  // The blank-state split (library / upload) is the dropzone's "fallback" overlay.
  // When a storyboard preview is present we show that instead (rendered as
  // children below), so suppress the split there to avoid stacking both.
  const dropState = isUploading
    ? "placing"
    : successFlash
      ? "success"
      : showCta && !showStoryboard
        ? "fallback"
        : "idle"

  const activeSlide = slides[activeSlideIndex] ?? slides[0]

  return (
    <div>
      <PreviewMediaDropZone
        isActive={false}
        state={dropState}
        slotId={slotId}
        onNativeDrop={onNativeDrop}
        onActivate={onActivate}
        onSelectLibrary={onSelectLibrary}
        onFilesChosen={onFilesChosen}
        aspectRatio={aspectRatio}
        className={cn("w-full", borderClass)}
        error={placement?.error}
      >
        {total > 0 && activeSlide && (
          <>
            <Image
              src={activeSlide.storageUrl}
              alt={`${alt} — slide ${(activeSlide.slideIndex ?? 0) + 1}`}
              fill
              unoptimized
              sizes="(max-width: 768px) 100vw, 560px"
              className="absolute inset-0 h-full w-full object-cover"
            />

            {total > 1 && (
              <div className="absolute right-2 top-2 rounded-full bg-black/50 px-2 py-0.5 text-2xs font-semibold text-white tabular-nums">
                {(activeSlide.slideIndex ?? 0) + 1}/{total}
              </div>
            )}

            {activeSlideIndex > 0 && (
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); onSelectSlide(activeSlideIndex - 1) }}
                className="absolute left-2 top-1/2 flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-full bg-black/40 text-white transition-colors hover:bg-black/60"
                aria-label="Previous slide"
              >
                <ChevronLeftIcon className="h-4 w-4" />
              </button>
            )}

            {activeSlideIndex < total - 1 && (
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); onSelectSlide(activeSlideIndex + 1) }}
                className="absolute right-2 top-1/2 flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-full bg-black/40 text-white transition-colors hover:bg-black/60"
                aria-label="Next slide"
              >
                <ChevronRightIcon className="h-4 w-4" />
              </button>
            )}

            {total > 1 && (
              <div className="absolute bottom-2 left-1/2 flex -translate-x-1/2 items-center gap-1">
                {slides.map((_, i) => (
                  <button
                    key={i}
                    type="button"
                    onClick={(e) => { e.stopPropagation(); onSelectSlide(i) }}
                    className={cn(
                      "h-1.5 rounded-full transition-all",
                      i === activeSlideIndex ? "w-4 bg-white" : "w-1.5 bg-white/50",
                    )}
                    aria-label={`Slide ${i + 1}`}
                  />
                ))}
              </div>
            )}
          </>
        )}

        {showStoryboard && (
          <button
            type="button"
            onClick={onActivate}
            aria-label="Blueprint ready — open the library to use your own creative"
            className="flex w-full flex-col items-center transition-colors hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <StoryboardPreview frames={storyboardFrames} alt={alt} />
          </button>
        )}
      </PreviewMediaDropZone>

      {/* Carousel slide strip — editing surface (not the preview dots) */}
      {isCarousel && slides.length > 0 && placement && (
        <CarouselSlideStrip
          slides={slides}
          activeIndex={activeSlideIndex}
          onSelectSlide={onSelectSlide}
          placement={placement}
          onAddRequest={onAddSlideRequest ?? onActivate}
          onReplaceRequest={onReplaceSlideRequest}
          className="border-b border-border/60 px-2"
        />
      )}
    </div>
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
                "rounded-full px-2 py-0.5 text-3xs font-semibold uppercase tracking-wider",
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

function toPublishFormat(format: string): "Post" | "Carousel" | "Reel" {
  const f = format.toLowerCase()
  // Legacy 'hyperframe' drafts display as Reel — HyperFrames is a production
  // method whose rendered MP4 publishes as a reel, not a selectable post type.
  if (f === "hyperframe" || f === "reel" || f === "video") return "Reel"
  if (f === "carousel") return "Carousel"
  return "Post"
}

function HashtagInput({ onAdd }: { onAdd: (tag: string) => void }) {
  const [value, setValue] = React.useState("")

  const handleSubmit = () => {
    const cleaned = value.trim().replace(/^#/, "")
    if (!cleaned) return
    onAdd(cleaned)
    setValue("")
  }

  return (
    <div className="flex items-center gap-1.5">
      <input
        type="text"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") { e.preventDefault(); handleSubmit() }
        }}
        placeholder="Add hashtag..."
        className="h-6 flex-1 rounded border border-border/50 bg-transparent px-2 text-2xs text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-1 focus:ring-ring"
      />
      <button
        type="button"
        onClick={handleSubmit}
        disabled={!value.trim()}
        className="rounded bg-muted/60 px-2 py-0.5 text-2xs font-medium text-muted-foreground hover:bg-muted disabled:opacity-40"
      >
        Add
      </button>
    </div>
  )
}

/**
 * Re-signs the draft's durable publishing assets on read. Persisted drafts store
 * only bucket+storagePath (the upload-time signed URL expires in ~1h), so this
 * mints fresh storageUrls when the preview opens.
 */
function useDraftWithFreshMedia(
  draft: OrganicCalendarDraft,
  brandProfileId?: string,
): OrganicCalendarDraft {
  const [freshByPath, setFreshByPath] = React.useState<Record<string, string>>({})

  const signables = React.useMemo(
    () =>
      (draft.publishingAssets ?? []).filter(
        (a) => hasText(a.storagePath) && (hasText(a.assetId) || hasText(a.bucket)),
      ),
    [draft.publishingAssets],
  )

  React.useEffect(() => {
    if (!brandProfileId || signables.length === 0) return
    let cancelled = false
    void Promise.all(
      signables.map(async (asset) => {
        const url = hasText(asset.assetId)
          ? await signMediaAsset({ brandId: brandProfileId, assetId: asset.assetId })
          : await signOrganicMediaAsset({
              brandId: brandProfileId,
              bucket: asset.bucket as string,
              path: asset.storagePath,
            })
        return url ? ([asset.storagePath, url] as const) : null
      }),
    ).then((pairs) => {
      if (cancelled) return
      const next: Record<string, string> = {}
      for (const pair of pairs) if (pair) next[pair[0]] = pair[1]
      if (Object.keys(next).length > 0) setFreshByPath(next)
    })
    return () => {
      cancelled = true
    }
  }, [brandProfileId, signables])

  const reel = draft.mediaSuggestion?.reel
  const reelBucket = reel?.generated === true && hasText(reel.url) ? (reel.bucket ?? null) : null
  const reelPath = reel?.generated === true ? (reel.url ?? null) : null
  const [freshReelUrl, setFreshReelUrl] = React.useState<string | null>(null)

  React.useEffect(() => {
    if (!brandProfileId || !reelBucket || !reelPath) return
    let cancelled = false
    void signOrganicMediaAsset({ brandId: brandProfileId, bucket: reelBucket, path: reelPath }).then((url) => {
      if (!cancelled && url) setFreshReelUrl(url)
    })
    return () => {
      cancelled = true
    }
  }, [brandProfileId, reelBucket, reelPath])

  // Hyperframe MP4 + cover are durable bucket+path references too; re-sign both so
  // the player/card render fresh URLs instead of an expired URL or a base64 cover.
  const hyperframe = draft.mediaSuggestion?.hyperframe
  const hfMp4Bucket = hasText(hyperframe?.mp4Path) ? (hyperframe?.mp4Bucket ?? null) : null
  const hfMp4Path = hasText(hyperframe?.mp4Path) ? (hyperframe?.mp4Path ?? null) : null
  const hfCoverBucket = hasText(hyperframe?.coverPath) ? (hyperframe?.bucket ?? null) : null
  const hfCoverPath = hasText(hyperframe?.coverPath) ? (hyperframe?.coverPath ?? null) : null
  const [freshHfMp4Url, setFreshHfMp4Url] = React.useState<string | null>(null)
  const [freshHfCoverUrl, setFreshHfCoverUrl] = React.useState<string | null>(null)

  React.useEffect(() => {
    if (!brandProfileId) return
    let cancelled = false
    void (async () => {
      if (hfMp4Bucket && hfMp4Path) {
        const url = await signOrganicMediaAsset({ brandId: brandProfileId, bucket: hfMp4Bucket, path: hfMp4Path })
        if (!cancelled && url) setFreshHfMp4Url(url)
      }
      if (hfCoverBucket && hfCoverPath) {
        const url = await signOrganicMediaAsset({ brandId: brandProfileId, bucket: hfCoverBucket, path: hfCoverPath })
        if (!cancelled && url) setFreshHfCoverUrl(url)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [brandProfileId, hfMp4Bucket, hfMp4Path, hfCoverBucket, hfCoverPath])

  return React.useMemo(() => {
    const freshPublishing = Object.keys(freshByPath).length > 0 && draft.publishingAssets
    const freshHyperframe = (freshHfMp4Url || freshHfCoverUrl) && draft.mediaSuggestion?.hyperframe
    if (!freshPublishing && !freshReelUrl && !freshHyperframe) return draft
    const next: OrganicCalendarDraft = { ...draft }
    if (freshPublishing && draft.publishingAssets) {
      next.publishingAssets = draft.publishingAssets.map((asset) =>
        freshByPath[asset.storagePath] ? { ...asset, storageUrl: freshByPath[asset.storagePath] } : asset,
      )
    }
    if ((freshReelUrl || freshHyperframe) && draft.mediaSuggestion) {
      next.mediaSuggestion = {
        ...draft.mediaSuggestion,
        ...(freshReelUrl && draft.mediaSuggestion.reel
          ? { reel: { ...draft.mediaSuggestion.reel, signedUrl: freshReelUrl } }
          : {}),
        ...(freshHyperframe
          ? {
              hyperframe: {
                ...draft.mediaSuggestion.hyperframe,
                ...(freshHfMp4Url ? { mp4Url: freshHfMp4Url } : {}),
                ...(freshHfCoverUrl ? { coverImageUrl: freshHfCoverUrl } : {}),
              },
            }
          : {}),
      }
    }
    return next
  }, [draft, freshByPath, freshReelUrl, freshHfMp4Url, freshHfCoverUrl])
}

// A titled inline panel that appears on demand (from the ⋯ menu) and collapses
// when dismissed — the progressive-disclosure home for secondary editors.
function ContextualPanel({
  title,
  onClose,
  children,
}: {
  title: string
  onClose: () => void
  children: React.ReactNode
}) {
  return (
    <div className="rounded-xl border border-border/70 bg-background/90 p-3">
      <div className="mb-2 flex items-center justify-between">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          {title}
        </p>
        <button
          type="button"
          onClick={onClose}
          aria-label={`Close ${title}`}
          className="rounded p-0.5 text-muted-foreground/60 transition-colors duration-150 hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
        >
          <Cross2Icon className="h-3.5 w-3.5" />
        </button>
      </div>
      {children}
    </div>
  )
}

function HashtagTiers({
  draft,
  patchDraft,
}: {
  draft: OrganicCalendarDraft
  patchDraft: (patch: Partial<OrganicCalendarDraft>) => void
}) {
  return (
    <div className="space-y-2">
      {(["high", "medium", "low"] as const).map((tier) => {
        const tags = draft.hashtags?.[tier]
        if (!tags?.length) return null
        return (
          <div key={tier} className="space-y-1">
            <p className="text-2xs font-medium text-muted-foreground/70">
              {tier === "high" ? "High Competition" : tier === "medium" ? "Medium Competition" : "Low Competition"}
            </p>
            <div className="flex flex-wrap gap-1">
              {tags.map((tag) => (
                <span
                  key={tag}
                  className="inline-flex items-center gap-1 rounded-full bg-muted/60 px-2 py-0.5 text-2xs text-muted-foreground"
                >
                  #{tag.replace(/^#/, "")}
                  <button
                    type="button"
                    className="ml-0.5 rounded-full p-0.5 text-muted-foreground/50 hover:bg-destructive/10 hover:text-destructive"
                    onClick={(e) => {
                      e.stopPropagation()
                      patchDraft({
                        hashtags: { ...draft.hashtags, [tier]: tags.filter((t) => t !== tag) },
                      })
                    }}
                    aria-label={`Remove #${tag.replace(/^#/, "")}`}
                  >
                    <Cross2Icon className="h-2.5 w-2.5" />
                  </button>
                </span>
              ))}
            </div>
          </div>
        )
      })}
      <HashtagInput
        onAdd={(tag) => {
          const current = draft.hashtags ?? {}
          const medium = current.medium ?? []
          patchDraft({ hashtags: { ...current, medium: [...medium, tag] } })
        }}
      />
    </div>
  )
}

/**
 * Hover-revealed toolbar on the post preview. Each button opens the existing
 * inline editor panel (creative direction / hashtags) — so the editors are
 * reachable on mouseover instead of only through the ⋯ command menu.
 */
function PreviewHoverActions({
  onEditCreativeDirection,
  onEditHashtags,
}: {
  onEditCreativeDirection?: () => void
  onEditHashtags?: () => void
}) {
  if (!onEditCreativeDirection && !onEditHashtags) return null
  const buttonClass =
    "flex items-center gap-1 rounded-md border border-border/60 bg-background/90 px-2 py-1 text-2xs font-medium text-muted-foreground shadow-sm backdrop-blur transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
  return (
    <div className="pointer-events-none absolute right-2 top-2 z-30 flex items-center gap-1 opacity-0 transition-opacity duration-150 group-hover/preview:pointer-events-auto group-hover/preview:opacity-100 focus-within:pointer-events-auto focus-within:opacity-100">
      {onEditCreativeDirection && (
        <button type="button" onClick={onEditCreativeDirection} aria-label="Edit creative direction" className={buttonClass}>
          <Sparkles className="h-3 w-3" />
          Direction
        </button>
      )}
      {onEditHashtags && (
        <button type="button" onClick={onEditHashtags} aria-label="Edit hashtags" className={buttonClass}>
          <Hash className="h-3 w-3" />
          Hashtags
        </button>
      )}
    </div>
  )
}

/** Flattened, #-prefixed hashtag list shown under the caption — as on a real post. */
function HashtagDisplayBlock({ hashtags }: { hashtags: OrganicCalendarDraft["hashtags"] }) {
  const tags = flattenHashtags(hashtags)
  if (tags.length === 0) return null
  return (
    <p className="mt-1.5 flex flex-wrap gap-x-1.5 gap-y-0.5 text-xs leading-relaxed text-primary/80">
      {tags.map((tag) => (
        <span key={tag}>{tag}</span>
      ))}
    </p>
  )
}

export function OrganicDraftPreview({ draft, brandName, brandProfileId, onApprove }: OrganicDraftPreviewProps) {
  const updateDraft = useCalendarStore((state) => state.updateDraft)
  const bulkDeleteDrafts = useCalendarStore((state) => state.bulkDeleteDrafts)
  const openInStudio = useOpenDraftInAiStudio()
  const draftForPreview = useDraftWithFreshMedia(draft, brandProfileId)
  const isHyperframeFormat = draft.format.toLowerCase() === "hyperframe"
  const isCarouselFormat = draft.format.toLowerCase() === "carousel"
  const selectedPlatform = draft.platforms[0] || "instagram"
  const previewMaxWidth = resolvePreviewMaxWidth(selectedPlatform)
  const mediaAspectRatio = resolvePreviewAspectRatio(selectedPlatform, draft.format)
  const creativeDirection = resolveCreativeDirection(draft)

  // Media placement hook — the single write path for user-supplied creatives.
  const placement = useDraftMediaPlacement(draft.id)

  // Active carousel slide index (shared between preview and strip).
  const [activeSlideIndex, setActiveSlideIndex] = React.useState(0)

  // Drives the dropzone "placing" shimmer while disk uploads run.
  const [isUploading, setIsUploading] = React.useState(false)

  // Contextual surfaces — nothing is always-on; each reveals on demand.
  const [mediaSelectOpen, setMediaSelectOpen] = React.useState(false)
  // When the user clicks a slide's "replace" control we stash its position here,
  // open the shared media picker, and route the next selection through
  // replaceSlide instead of addSlide. A ref (not state) so the captured position
  // survives the picker round-trip without re-rendering the strip mid-flow.
  const replaceTargetRef = React.useRef<number | null>(null)
  const [creativeOpen, setCreativeOpen] = React.useState(false)
  const [hashtagsOpen, setHashtagsOpen] = React.useState(false)

  // Manual drafts construct from scratch (upload + Library, no headless gen).
  const isManual = draft.origin === "manual"

  const { generateDraftMedia, isGenerating } = useGenerateDraftMedia()

  const dndSensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  )

  const handleDragEnd = React.useCallback((_event: DragEndEvent) => {
    // Top-level DnD context — sub-contexts (CarouselSlideStrip) own their drag end.
  }, [])

  const patchDraft = React.useCallback(
    (patch: Partial<OrganicCalendarDraft>) => {
      updateDraft(draft.id, (current) => ({ ...current, ...patch }))
    },
    [draft.id, updateDraft]
  )

  const isApproveDisabled =
    draft.status === "scheduled" || draft.status === "streaming"

  // Bare-minimum gate for scheduling/publishing: caption + at least one media asset.
  const readiness = React.useMemo(() => evaluateDraftReadiness(draft), [draft])

  const handleCaptionChange = React.useCallback(
    (value: string) => patchDraft({ captionPreview: value }),
    [patchDraft]
  )

  const { publish, isPublishing, stage, pollingAttempt, tokenExpired } = usePublishDraft()
  const isInstagram = draft.platforms.includes("instagram")
  const isPublished = draft.status === "published"
  const canPublish = isInstagram && !isPublished && draft.status !== "streaming"
  const showFooter = onApprove != null || canPublish || isPublished

  // Single unified attach path: every selection from the media Popover goes
  // through useDraftMediaPlacement (gains undo + always emits publishable shapes).
  // Carousels append slides; otherwise place() infers single/carousel/video.
  const handleAttachAssets = React.useCallback(
    (assets: MediaAsset[]) => {
      if (assets.length === 0) return
      if (isCarouselFormat) {
        // Replace mode: a slide's replace control set a target position — swap that
        // one slide and consume the target (extra picks are ignored for replace).
        const replaceTarget = replaceTargetRef.current
        if (replaceTarget != null) {
          replaceTargetRef.current = null
          placement.replaceSlide(replaceTarget, assets[0])
          return
        }
        assets.forEach((asset) => placement.addSlide(asset))
        return
      }
      const target: SlotTarget =
        assets.length === 1 && assets[0].kind === "video" ? { kind: "video" } : { kind: "single" }
      placement.place(assets, target)
    },
    [isCarouselFormat, placement],
  )

  // Upload-from-computer: register each dropped/selected file into the library,
  // mint a signed URL, then route through the same attach path the library
  // picker uses (multi-file ⇒ carousel slides).
  const handleUploadFiles = React.useCallback(
    async (files: File[]) => {
      if (!brandProfileId || files.length === 0) return
      setIsUploading(true)
      try {
        const assets = await uploadDraftCreatives({ files, brandId: brandProfileId })
        if (assets.length > 0) handleAttachAssets(assets)
      } finally {
        setIsUploading(false)
      }
    },
    [brandProfileId, handleAttachAssets],
  )

  const handleGenerateMedia = React.useCallback(() => {
    // Requires a persisted backend draft; the realize stream keys updates off feId.
    if (!brandProfileId || !draft.backendDraftId) return
    void generateDraftMedia(brandProfileId, [
      { feId: draft.id, backendDraftId: draft.backendDraftId, format: draft.format },
    ])
  }, [brandProfileId, draft.id, draft.backendDraftId, draft.format, generateDraftMedia])

  const handleDelete = React.useCallback(() => {
    bulkDeleteDrafts([draft.id])
  }, [bulkDeleteDrafts, draft.id])

  const mediaStatusVariant = resolveMediaStatusVariant(draft)
  const mediaIsPending = mediaStatusVariant === "pending"
  const mediaIsUserSupplied = draft.mediaSuggestion?.mediaStatus === "user_supplied"
  // Generation requires a persisted backend draft id (autosave assigns one within
  // ~500ms); manual drafts never headless-generate.
  const canGenerate = mediaIsPending && !mediaIsUserSupplied && !isManual && !!draft.backendDraftId
  const canMarkScheduled = readiness.ready && !isApproveDisabled

  // The media zone, pre-wired with its contextual MediaSelectPopover. Clicking
  // the empty/CTA area (or a carousel "+") opens the library Popover anchored here.
  const mediaNode =
    !isHyperframeFormat && brandProfileId ? (
      <MediaSelectPopover
        brandProfileId={brandProfileId}
        open={mediaSelectOpen}
        onOpenChange={(open) => {
          // Drop a pending replace target if the picker closes without a pick, so a
          // cancelled replace can't hijack the next add.
          if (!open) replaceTargetRef.current = null
          setMediaSelectOpen(open)
        }}
        onAttachAssets={handleAttachAssets}
        onGenerate={handleGenerateMedia}
        canGenerate={canGenerate}
        isGenerating={isGenerating}
        anchor={
          <InteractiveCarouselMediaArea
            draft={draftForPreview}
            alt={resolveDraftMediaAltText(draftForPreview)}
            aspectRatio={mediaAspectRatio}
            slotId={`preview-media-${draft.id}`}
            onActivate={() => setMediaSelectOpen(true)}
            onSelectLibrary={() => setMediaSelectOpen(true)}
            onFilesChosen={handleUploadFiles}
            isUploading={isUploading}
            activeSlideIndex={activeSlideIndex}
            onSelectSlide={setActiveSlideIndex}
            placement={placement}
            onAddSlideRequest={() => {
              replaceTargetRef.current = null
              setMediaSelectOpen(true)
            }}
            onReplaceSlideRequest={(position) => {
              replaceTargetRef.current = position
              setMediaSelectOpen(true)
            }}
          />
        }
      />
    ) : null

  const commandMenu = (
    <PostCommandMenu
      onEditCreativeDirection={() => setCreativeOpen(true)}
      onEditHashtags={() => setHashtagsOpen(true)}
      onApproveSchedule={onApprove ? () => onApprove(draft.id) : undefined}
      canSchedule={canMarkScheduled}
      isScheduled={draft.status === "scheduled"}
      onMoveBackToDraft={() => patchDraft({ status: "draft" })}
      onPublish={canPublish ? () => publish(draft) : undefined}
      canPublish={canPublish}
      isPublishing={isPublishing}
      onOpenInStudio={openInStudio ? () => openInStudio(draft.id) : undefined}
      onDelete={handleDelete}
    />
  )

  return (
    <DndContext sensors={dndSensors} onDragEnd={handleDragEnd}>
      <div className="flex h-full flex-col overflow-hidden rounded-xl border border-border/80 bg-card shadow-sm">
        {/* Glanceable metadata strip + ⋯ command menu. Nothing else lives here
            permanently — every editing tool opens on demand. */}
        <PostMetaChips
          platform={selectedPlatform as OrganicPlatformKey}
          format={toPublishFormat(draft.format)}
          timeLabel={draft.timeLabel}
          onPlatformChange={(value) => {
            if (!isOrganicPlatformKey(value)) return
            patchDraft({ platforms: [value] })
          }}
          onFormatChange={(value) => patchDraft({ format: value })}
          onTimeChange={(value) => patchDraft({ timeLabel: value })}
          actions={commandMenu}
        />

        {/* Two lifecycle axes: publish status (stepper) + media enrichment stage. */}
        <div className="flex shrink-0 flex-col gap-1.5 border-b border-border/60 bg-muted/30 px-3 py-2">
          <LifecyclePill status={draft.status} />
          <div className="flex items-center gap-1.5">
            <span className="text-3xs font-medium uppercase tracking-wider text-muted-foreground/50">
              Media
            </span>
            <MediaStagePill mediaStage={resolveDraftMediaStage(draft)} />
          </div>
          {placement.canUndo && (
            <button
              type="button"
              onClick={placement.undo}
              className="self-start rounded px-1.5 py-0.5 text-2xs font-medium text-muted-foreground underline-offset-2 transition-colors hover:underline focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
            >
              Undo last media change
            </button>
          )}
          {placement.error && (
            <div
              role="alert"
              aria-live="assertive"
              className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-1.5 text-xs text-amber-700 dark:text-amber-300"
            >
              {placement.error.message}
              <button
                type="button"
                onClick={placement.clearError}
                className="ml-2 underline underline-offset-2"
              >
                Dismiss
              </button>
            </div>
          )}
        </div>

        {/* Single scroll — media-first frame. Contextual editors (creative
            direction, hashtags) reveal inline on demand from the ⋯ menu. */}
        <ScrollArea className="flex-1 bg-muted/10 p-3">
          <div
            className="mx-auto flex w-full flex-col gap-3"
            style={{ maxWidth: `${previewMaxWidth}px` }}
          >
            {creativeOpen && (
              <ContextualPanel title="Creative direction" onClose={() => setCreativeOpen(false)}>
                <InlinePreviewTextarea
                  value={creativeDirection}
                  onChange={(event) =>
                    patchDraft({
                      creativeDirectionPrompt: event.target.value,
                      creativeIdea: event.target.value,
                    })
                  }
                  placeholder="Describe the hook, visual intent, and mood."
                  className="min-h-[5rem] text-sm leading-relaxed"
                />
              </ContextualPanel>
            )}

            {hashtagsOpen && (
              <ContextualPanel title="Hashtags" onClose={() => setHashtagsOpen(false)}>
                <HashtagTiers draft={draft} patchDraft={patchDraft} />
              </ContextualPanel>
            )}

            {isHyperframeFormat ? (
              <div className="flex flex-col gap-3">
                <HyperFramePlayer draft={draft} brandId={brandProfileId ?? ""} />
                <div className="rounded-xl border border-border/70 bg-background/90 p-3">
                  <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    Caption
                  </p>
                  <EditableCaption
                    value={draft.captionPreview}
                    onChange={handleCaptionChange}
                    platform={selectedPlatform}
                  />
                </div>
              </div>
            ) : selectedPlatform === "instagram" ? (
              <div className="overflow-hidden rounded-[2.5rem] border-[5px] border-foreground/10 shadow-2xl">
                <div className="relative flex items-center justify-center bg-background px-4 pt-3 pb-2">
                  <span className="absolute left-5 text-3xs font-bold tabular-nums text-foreground/70">9:41</span>
                  <div className="h-5 w-[88px] rounded-full bg-foreground/90" />
                  <div className="absolute right-5 flex items-center gap-1 text-foreground/70">
                    <svg viewBox="0 0 24 24" className="h-3 w-3" fill="currentColor">
                      <path d="M1.5 8.5C5.082 4.918 9.795 3 12 3s6.918 1.918 10.5 5.5L21 11c-2.9-3.15-5.68-4.5-9-4.5S5.9 7.85 3 11L1.5 8.5z" />
                      <path d="M4.5 11.5C7.2 8.8 9.7 7.5 12 7.5s4.8 1.3 7.5 4L18 13c-1.9-2.15-3.7-3-6-3s-4.1.85-6 3L4.5 11.5z" />
                      <circle cx="12" cy="17" r="2" />
                    </svg>
                    <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="currentColor">
                      <rect x="1" y="6" width="18" height="12" rx="2" fillOpacity="0.3" />
                      <rect x="1" y="6" width="13" height="12" rx="2" />
                      <path d="M21 10v4a2 2 0 0 0 0-4z" />
                    </svg>
                  </div>
                </div>
                <InstagramMobilePreview
                  draft={draftForPreview}
                  onCaptionChange={handleCaptionChange}
                  brandName={brandName}
                  platform="instagram"
                  mediaNode={mediaNode}
                  onEditCreativeDirection={() => setCreativeOpen(true)}
                  onEditHashtags={() => setHashtagsOpen(true)}
                />
                <div className="flex justify-center bg-background py-2">
                  <div className="h-1 w-24 rounded-full bg-foreground/20" />
                </div>
              </div>
            ) : selectedPlatform === "facebook" ? (
              <FacebookFeedPreview
                draft={draftForPreview}
                onCaptionChange={handleCaptionChange}
                brandName={brandName}
                platform="facebook"
                mediaNode={mediaNode}
                onEditCreativeDirection={() => setCreativeOpen(true)}
                onEditHashtags={() => setHashtagsOpen(true)}
              />
            ) : selectedPlatform === "linkedin" ? (
              <LinkedInDesktopPreview
                draft={draftForPreview}
                onCaptionChange={handleCaptionChange}
                brandName={brandName}
                platform="linkedin"
                mediaNode={mediaNode}
                onEditCreativeDirection={() => setCreativeOpen(true)}
                onEditHashtags={() => setHashtagsOpen(true)}
              />
            ) : (
              <div className="flex min-h-[24rem] items-center justify-center rounded-xl border border-dashed border-border/70 bg-muted/30 px-4 py-10">
                <p className="text-sm text-muted-foreground">
                  Preview for {selectedPlatform} is coming soon.
                </p>
              </div>
            )}
          </div>
        </ScrollArea>

        {/* Footer CTA */}
        {showFooter ? (
          <div className="shrink-0 border-t border-border/70 bg-background/90 p-3 flex flex-col gap-2">
            {tokenExpired && (
              <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-sm text-amber-700 dark:text-amber-300">
                Instagram access token expired.{" "}
                <a
                  href="/settings?section=integrations"
                  className="underline underline-offset-2"
                >
                  Reconnect your account
                </a>
              </div>
            )}

            {!isPublished && !readiness.ready && (
              <div className="rounded-lg border border-border/70 bg-muted/40 px-3 py-2">
                <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Needed to schedule
                </p>
                <ul className="flex flex-col gap-1">
                  {readiness.checks.map((check) => (
                    <li key={check.id} className="flex items-center gap-2 text-sm">
                      {check.met ? (
                        <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-emerald-600 dark:text-emerald-400" />
                      ) : (
                        <Circle className="h-3.5 w-3.5 shrink-0 text-muted-foreground/50" />
                      )}
                      <span className={check.met ? "text-muted-foreground line-through" : "text-foreground"}>
                        {check.label}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {onApprove && (
              <button
                type="button"
                disabled={isApproveDisabled || !readiness.ready}
                onClick={() => onApprove(draft.id)}
                className={cn(
                  "flex w-full items-center justify-center gap-2 rounded-lg px-4 py-2.5 text-sm font-semibold transition-colors",
                  isApproveDisabled || !readiness.ready
                    ? "cursor-not-allowed bg-muted text-muted-foreground"
                    : "bg-primary text-primary-foreground hover:bg-primary/90"
                )}
              >
                {draft.status === "scheduled"
                  ? "Approved for posting"
                  : "Approve & Schedule"}
              </button>
            )}

            {canPublish && (
              <button
                type="button"
                disabled={isPublishing || !readiness.ready}
                onClick={() => publish(draft)}
                className={cn(
                  "flex w-full items-center justify-center gap-2 rounded-lg px-4 py-2.5 text-sm font-semibold transition-colors",
                  isPublishing || !readiness.ready
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
                <span className="text-sm text-muted-foreground">Published</span>
                {draft.instagram_post_id && (
                  <a
                    href={`https://www.instagram.com/p/${draft.instagram_post_id}/`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-sm text-primary underline underline-offset-2"
                  >
                    View on Instagram
                  </a>
                )}
              </div>
            )}
          </div>
        ) : null}
      </div>
    </DndContext>
  )
}

function InstagramMobilePreview({ draft, onCaptionChange, brandName, platform, mediaNode, onEditCreativeDirection, onEditHashtags }: SocialPreviewProps) {
  const displayName = brandName ?? "Your Brand"
  const initials = brandInitials(brandName)

  return (
    <div className="group/preview relative w-full overflow-hidden bg-card text-foreground">
      <PreviewHoverActions onEditCreativeDirection={onEditCreativeDirection} onEditHashtags={onEditHashtags} />
      <div className="flex items-center p-3 border-b border-border/70">
        <div className="flex items-center space-x-3">
          <div className="w-8 h-8 rounded-full bg-gradient-to-tr from-primary/70 via-accent/70 to-secondary/70 p-[2px] flex items-center justify-center text-2xs font-bold text-foreground">
            <div className="flex h-full w-full items-center justify-center rounded-full bg-background">
              <div className="flex h-7 w-7 items-center justify-center rounded-full bg-muted text-3xs text-muted-foreground">
                {initials}
              </div>
            </div>
          </div>
          <div className="flex flex-col">
            <span className="text-sm font-semibold leading-none tracking-tight">
              {displayName}
            </span>
            <span className="mt-1 text-2xs text-muted-foreground">Sponsored</span>
          </div>
        </div>
      </div>

      {mediaNode}

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
        <EditableCaption
          value={draft.captionPreview}
          onChange={onCaptionChange}
          platform={platform}
          ariaLabel="Instagram caption"
          placeholder="Write your caption…"
          className="text-xs leading-relaxed"
          editClassName="text-xs"
        />
        <HashtagDisplayBlock hashtags={draft.hashtags} />
      </div>
    </div>
  )
}

function FacebookFeedPreview({ draft, onCaptionChange, brandName, platform, mediaNode, onEditCreativeDirection, onEditHashtags }: SocialPreviewProps) {
  const displayName = brandName ?? "Your Brand"

  return (
    <div className="group/preview relative w-full overflow-hidden rounded-xl border border-border/70 bg-card shadow-lg text-foreground">
      <PreviewHoverActions onEditCreativeDirection={onEditCreativeDirection} onEditHashtags={onEditHashtags} />
      <div className="p-3 flex items-center border-b border-border/70">
        <div className="flex items-center gap-2">
          <div className="flex h-9 w-9 items-center justify-center rounded-full border border-primary/30 bg-primary/15 font-bold text-primary">
            {brandInitials(brandName)}
          </div>
          <div>
            <p className="text-sm font-bold tracking-tight">{displayName}</p>
            <p className="text-xs text-muted-foreground">Sponsored · 1h</p>
          </div>
        </div>
      </div>

      <div className="px-4 py-3">
        <EditableCaption
          value={draft.captionPreview}
          onChange={onCaptionChange}
          platform={platform}
          ariaLabel="Facebook post copy"
          placeholder="Write your post copy…"
        />
        <HashtagDisplayBlock hashtags={draft.hashtags} />
      </div>

      {mediaNode}

      {/* Engagement bar */}
      <div className="flex items-center gap-4 border-t border-border/40 px-4 py-2 text-sm font-medium text-muted-foreground/40 cursor-default">
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

function LinkedInDesktopPreview({ draft, onCaptionChange, brandName, platform, mediaNode, onEditCreativeDirection, onEditHashtags }: SocialPreviewProps) {
  const displayName = brandName ?? "Your Brand"

  return (
    <div className="group/preview relative w-full overflow-hidden rounded-xl border border-border/70 bg-card shadow-lg text-foreground">
      <PreviewHoverActions onEditCreativeDirection={onEditCreativeDirection} onEditHashtags={onEditHashtags} />
      <div className="p-3 flex items-center justify-between border-b border-border/70">
        <div className="flex items-center gap-2">
          <div className="flex h-11 w-11 items-center justify-center rounded border border-primary/30 bg-primary/15 text-lg font-bold text-primary">
            {brandInitials(brandName)}
          </div>
          <div>
            <p className="text-sm font-bold tracking-tight">{displayName}</p>
            <p className="text-xs text-muted-foreground">12,450 followers</p>
          </div>
        </div>
      </div>

      <div className="px-4 py-3">
        <EditableCaption
          value={draft.captionPreview}
          onChange={onCaptionChange}
          platform={platform}
          ariaLabel="LinkedIn post copy"
          placeholder="Write your post copy…"
        />
        <HashtagDisplayBlock hashtags={draft.hashtags} />
      </div>

      {mediaNode}

      {/* Engagement bar */}
      <div className="flex items-center gap-4 border-t border-border/40 px-4 py-2 text-sm font-medium text-muted-foreground/40 cursor-default">
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
