"use client"

import * as React from "react"
import Image from "next/image"
import { ChevronLeftIcon, ChevronRightIcon, Cross2Icon } from "@radix-ui/react-icons"

import { CheckCircle2, Circle, Loader2, Send, Wand2, ImagePlus } from "lucide-react"

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
import {
  DndContext,
  useSensor,
  useSensors,
  PointerSensor,
  KeyboardSensor,
  type DragEndEvent,
} from "@dnd-kit/core"
import { sortableKeyboardCoordinates } from "@dnd-kit/sortable"
import { Textarea } from "@/components/ui/textarea"
import { isOrganicPlatformKey } from "@/lib/organic/platforms"
import {
  resolvePreviewAspectRatio,
  resolvePreviewMaxWidth,
} from "./social-preview-utils"
import { OrganicCreativesPicker } from "./OrganicCreativesPicker"
import { HyperFramePlayer } from "./HyperFramePlayer"
import { usePublishDraft } from "@/components/organic/hooks/usePublishDraft"
import { signMediaAsset, signOrganicMediaAsset } from "@/lib/organic/hyperframeSign"
import { PreviewMediaDropZone, UseOwnCreativeCta } from "./PreviewMediaDropZone"
import { CarouselSlideStrip } from "./CarouselSlideStrip"
import { LibraryPlacementRail } from "./LibraryPlacementRail"
import { useDraftMediaPlacement } from "@/components/organic/hooks/useDraftMediaPlacement"
import type { MediaAsset } from "@continuum/contracts"
import { useGenerateDraftMedia } from "@/components/organic/hooks/useGenerateDraftMedia"
import { evaluateDraftReadiness } from "@/lib/organic/draftReadiness"

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
  // When truthy, render the media area as an interactive drop zone.
  onMediaActivate?: () => void
  mediaDropState?: "idle" | "drag-over-valid" | "drag-over-invalid" | "placing" | "success" | "fallback"
  activeSlideIndex?: number
  onSelectSlide?: (index: number) => void
  placement?: ReturnType<typeof useDraftMediaPlacement>
  onAddSlideRequest?: () => void
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

function resolveThumbnailDirection(draft: OrganicCalendarDraft): string {
  return (
    draft.thumbnailPrompt?.trim() ||
    draft.mediaSuggestion?.prompt?.trim() ||
    draft.assetHints?.[0]?.suggestion?.trim() ||
    ""
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

// Derive the display state of the media status badge.
function resolveMediaStatusLabel(draft: OrganicCalendarDraft): string {
  const ms = draft.mediaSuggestion?.mediaStatus
  if (ms === "user_supplied") return "Your creative"
  if (ms === "generating") return "Generating…"
  if (ms === "ready") return "Ready"
  // pending but blueprint done = "Preparing media…"
  if (ms === "pending" && draft.mediaSuggestion?.blueprintReady) return "Preparing media…"
  if (ms === "pending") return "Pending"
  if (ms === "skipped") return "Skipped"
  // No mediaSuggestion at all.
  if (draft.mediaSuggestion?.textReady) return "Preparing media…"
  return "Pending"
}

// Derive the visual style of the badge.
function resolveMediaStatusVariant(
  draft: OrganicCalendarDraft,
): "default" | "generating" | "ready" | "user_supplied" | "pending" {
  const ms = draft.mediaSuggestion?.mediaStatus
  if (ms === "user_supplied") return "user_supplied"
  if (ms === "generating") return "generating"
  if (ms === "ready") return "ready"
  return "pending"
}

function MediaStatusBadge({ draft }: { draft: OrganicCalendarDraft }) {
  const label = resolveMediaStatusLabel(draft)
  const variant = resolveMediaStatusVariant(draft)

  return (
    <span
      className={cn(
        "rounded-full px-2 py-0.5 text-[9px] font-semibold uppercase tracking-wider",
        variant === "user_supplied"
          ? "border border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400"
          : variant === "generating"
            ? "border border-primary/30 bg-primary/10 text-primary"
            : variant === "ready"
              ? "border border-emerald-500/30 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
              : "border border-border/50 bg-muted/40 text-muted-foreground/60",
      )}
    >
      {label}
    </span>
  )
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
  activeSlideIndex,
  onSelectSlide,
  placement,
  onAddSlideRequest,
}: {
  draft: OrganicCalendarDraft
  alt: string
  aspectRatio: number
  borderClass?: string
  slotId: string
  onActivate: () => void
  onNativeDrop?: (assetId: string) => void
  activeSlideIndex: number
  onSelectSlide: (i: number) => void
  placement?: ReturnType<typeof useDraftMediaPlacement>
  onAddSlideRequest?: () => void
}) {
  const slides = resolveCarouselSlides(draft)
  const total = slides.length
  const isCarousel = draft.format.toLowerCase() === "carousel"
  const showCta = shouldShowUseOwnCta(draft)
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

  const dropState = successFlash
    ? "success"
    : showCta
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
              <div className="absolute right-2 top-2 rounded-full bg-black/50 px-2 py-0.5 text-[10px] font-semibold text-white tabular-nums">
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

        {showCta && (
          <UseOwnCreativeCta onActivate={onActivate} format={draft.format} />
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
          className="border-b border-border/60 px-2"
        />
      )}
    </div>
  )
}

// All user-supplied text is HTML-escaped before being inserted into the HTML
// string, so dangerouslySetInnerHTML on the mirror div is XSS-safe.
function buildCaptionMirrorHtml(text: string): string {
  const escaped = text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
  return escaped
    .replace(/@[^\s\n@&]+/g, '<mark class="mention-token">$&</mark>')
    .replace(/\n/g, "<br>");
}

function InlinePreviewTextarea({
  className,
  value,
  onScroll,
  ...props
}: React.ComponentProps<typeof Textarea>) {
  const mirrorRef = React.useRef<HTMLDivElement>(null);

  const mirrorHtml = React.useMemo(
    () => buildCaptionMirrorHtml(String(value ?? "")),
    [value]
  );

  const handleScroll = React.useCallback(
    (e: React.UIEvent<HTMLTextAreaElement>) => {
      if (mirrorRef.current) mirrorRef.current.scrollTop = e.currentTarget.scrollTop;
      onScroll?.(e);
    },
    [onScroll]
  );

  const layoutClass = cn("px-3 py-2", className);

  return (
    <div className="relative">
      <div
        ref={mirrorRef}
        aria-hidden
        className={cn(
          layoutClass,
          "pointer-events-none absolute inset-0 overflow-hidden whitespace-pre-wrap break-words text-transparent"
        )}
        dangerouslySetInnerHTML={{ __html: mirrorHtml }}
      />
      <Textarea
        value={value}
        onScroll={handleScroll}
        {...props}
        className={cn(
          "relative resize-none border-border/60 bg-transparent text-foreground placeholder:text-muted-foreground shadow-none focus-visible:ring-1 focus-visible:ring-ring/40",
          className
        )}
      />
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

function toPublishFormat(format: string): "Post" | "Carousel" | "Reel" | "HyperFrame" {
  const f = format.toLowerCase()
  if (f === "hyperframe") return "HyperFrame"
  if (f === "reel" || f === "video") return "Reel"
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
        className="h-6 flex-1 rounded border border-border/50 bg-transparent px-2 text-[10px] text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-1 focus:ring-ring"
      />
      <button
        type="button"
        onClick={handleSubmit}
        disabled={!value.trim()}
        className="rounded bg-muted/60 px-2 py-0.5 text-[10px] font-medium text-muted-foreground hover:bg-muted disabled:opacity-40"
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

  return React.useMemo(() => {
    const freshPublishing = Object.keys(freshByPath).length > 0 && draft.publishingAssets
    if (!freshPublishing && !freshReelUrl) return draft
    const next: OrganicCalendarDraft = { ...draft }
    if (freshPublishing && draft.publishingAssets) {
      next.publishingAssets = draft.publishingAssets.map((asset) =>
        freshByPath[asset.storagePath] ? { ...asset, storageUrl: freshByPath[asset.storagePath] } : asset,
      )
    }
    if (freshReelUrl && draft.mediaSuggestion?.reel) {
      next.mediaSuggestion = {
        ...draft.mediaSuggestion,
        reel: { ...draft.mediaSuggestion.reel, signedUrl: freshReelUrl },
      }
    }
    return next
  }, [draft, freshByPath, freshReelUrl])
}

export function OrganicDraftPreview({ draft, brandName, brandProfileId, onApprove }: OrganicDraftPreviewProps) {
  const updateDraft = useCalendarStore((state) => state.updateDraft)
  const draftForPreview = useDraftWithFreshMedia(draft, brandProfileId)
  const isHyperframeFormat = draft.format.toLowerCase() === "hyperframe"
  const isCarouselFormat = draft.format.toLowerCase() === "carousel"
  const selectedPlatform = draft.platforms[0] || "instagram"
  const previewMaxWidth = resolvePreviewMaxWidth(selectedPlatform)
  const mediaAspectRatio = resolvePreviewAspectRatio(selectedPlatform, draft.format)
  const creativeDirection = resolveCreativeDirection(draft)
  const thumbnailDirection = resolveThumbnailDirection(draft)

  // Media placement hook — write path for user-supplied creatives.
  const placement = useDraftMediaPlacement(draft.id)

  // Active carousel slide index (shared between preview and strip).
  const [activeSlideIndex, setActiveSlideIndex] = React.useState(0)

  // Manually-authored drafts lead with upload + Library; agent drafts default to
  // the creatives surface. Tracks provenance so the editor can tailor media steps.
  const isManual = draft.origin === "manual"

  // Whether the library rail is focused for placement. Defaults open for manual
  // drafts and resets to the per-draft default whenever a different draft loads
  // (the preview panel instance is reused across selections).
  const [railFocused, setRailFocused] = React.useState(isManual)
  React.useEffect(() => {
    setRailFocused(draft.origin === "manual")
  }, [draft.id, draft.origin])

  const { generateDraftMedia, isGenerating } = useGenerateDraftMedia()

  const dndSensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  )

  const handleDragEnd = React.useCallback((_event: DragEndEvent) => {
    // Top-level DnD context — individual sub-contexts (CarouselSlideStrip)
    // handle their own onDragEnd. Nothing to do at this level.
  }, [])

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

  // Handle a single asset placed from the library rail (click or drop). On a
  // carousel a single asset appends a slide (place() would collapse the carousel
  // to one image); otherwise it fills the single image or video slot.
  const handleRailPlace = React.useCallback(
    (asset: MediaAsset) => {
      if (isCarouselFormat) {
        placement.addSlide(asset)
        return
      }
      placement.place([asset], asset.kind === "video" ? { kind: "video" } : { kind: "single" })
    },
    [placement, isCarouselFormat],
  )

  // Handle the picker attaching multi-selected assets (shapeUserSuppliedMedia already
  // called inside OrganicCreativesPicker.handleAttach).
  const handlePickerAttach = React.useCallback(
    (assets: NonNullable<OrganicCalendarDraft["publishingAssets"]>) => {
      updateDraft(draft.id, (current) => ({
        ...current,
        publishingAssets: assets,
        mediaSuggestion: {
          ...current.mediaSuggestion,
          mediaStatus: "user_supplied",
        },
      }))
    },
    [draft.id, updateDraft],
  )

  const handleGenerateMedia = React.useCallback(() => {
    // Requires a persisted backend draft; the realize stream keys every update
    // off feId, so we must hand the hook the MediaGenerationDraftTarget shape.
    if (!brandProfileId || !draft.backendDraftId) return
    void generateDraftMedia(brandProfileId, [
      { feId: draft.id, backendDraftId: draft.backendDraftId, format: draft.format },
    ])
  }, [brandProfileId, draft.id, draft.backendDraftId, draft.format, generateDraftMedia])

  const mediaStatusVariant = resolveMediaStatusVariant(draft)
  const mediaIsPending = mediaStatusVariant === "pending"
  const mediaIsUserSupplied = draft.mediaSuggestion?.mediaStatus === "user_supplied"

  return (
    <DndContext sensors={dndSensors} onDragEnd={handleDragEnd}>
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

            <Select
              value={toPublishFormat(draft.format)}
              onValueChange={(value) => patchDraft({ format: value })}
            >
              <SelectTrigger className="h-8 w-[7rem] border-border/60 bg-background text-xs font-semibold">
                <SelectValue placeholder="Format" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="Post">Post</SelectItem>
                <SelectItem value="Carousel">Carousel</SelectItem>
                <SelectItem value="Reel">Reel</SelectItem>
                <SelectItem value="HyperFrame">HyperFrame</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <LifecyclePill status={draft.status} />

          {/* Media status badge + creative-source control */}
          {!isHyperframeFormat && (
            <div className="flex flex-wrap items-center gap-2">
              <MediaStatusBadge draft={draft} />

              {/* Undo inline — no confirm modal */}
              {placement.canUndo && (
                <button
                  type="button"
                  onClick={placement.undo}
                  className="rounded px-2 py-0.5 text-[10px] font-medium text-muted-foreground underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                >
                  Undo
                </button>
              )}

              <div className="ml-auto flex items-center gap-1.5">
                {/* Attach control — focuses the library rail */}
                <button
                  type="button"
                  aria-label="Attach your own creative"
                  onClick={() => setRailFocused((v) => !v)}
                  className={cn(
                    "flex items-center gap-1 rounded-md border px-2.5 py-1 text-[11px] font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                    railFocused
                      ? "border-primary/40 bg-primary/10 text-primary"
                      : "border-border/60 bg-background text-muted-foreground hover:border-border hover:text-foreground",
                  )}
                >
                  <ImagePlus className="h-3.5 w-3.5" />
                  Attach
                </button>

                {/* Generate — explicit opt-in, token-heavy headless gen. Hidden for
                    manual drafts: from-scratch posts use upload + Library, not AI. */}
                {mediaIsPending && !mediaIsUserSupplied && !isManual && (
                  <button
                    type="button"
                    aria-label="Generate media for this post"
                    disabled={isGenerating || !draft.backendDraftId}
                    onClick={handleGenerateMedia}
                    className={cn(
                      "flex items-center gap-1 rounded-md border px-2.5 py-1 text-[11px] font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                      isGenerating || !draft.backendDraftId
                        ? "cursor-not-allowed border-border/40 bg-muted/40 text-muted-foreground/50"
                        : "border-primary/40 bg-primary/10 text-primary hover:bg-primary/20",
                    )}
                  >
                    {isGenerating ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <Wand2 className="h-3.5 w-3.5" />
                    )}
                    Generate
                  </button>
                )}
              </div>
            </div>
          )}

          {/* Placement error — aria-live region for keyboard/SR users */}
          {placement.error && (
            <div
              role="alert"
              aria-live="assertive"
              className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-1.5 text-[11px] text-amber-700 dark:text-amber-300"
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

        {/* Scroll content */}
        <ScrollArea className="flex-1 bg-muted/10 p-3">
          <div className="mx-auto flex w-full max-w-[48rem] flex-col gap-3">
            {/* Creative direction */}
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

            {/* Library placement rail — docked below creative direction */}
            {brandProfileId && railFocused && (
              <div
                className="mx-auto w-full"
                style={{ maxWidth: `${previewMaxWidth}px` }}
              >
                <LibraryPlacementRail
                  brandProfileId={brandProfileId}
                  draftId={draft.id}
                  onPlace={handleRailPlace}
                  onAttach={handlePickerAttach}
                />
              </div>
            )}

            {/* Legacy creatives section — still available when rail is not focused */}
            {brandProfileId && !railFocused && (
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
                  onAttach={handlePickerAttach}
                />
              </div>
            )}

            {/* Hashtag Tiers */}
            {draft.hashtags && (draft.hashtags.high?.length || draft.hashtags.medium?.length || draft.hashtags.low?.length) ? (
              <div
                className="mx-auto w-full rounded-xl border border-border/70 bg-background/90 p-3"
                style={{ maxWidth: `${previewMaxWidth}px` }}
              >
                <div className="space-y-2">
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                    Hashtags
                  </p>
                  {(["high", "medium", "low"] as const).map((tier) => {
                    const tags = draft.hashtags?.[tier]
                    if (!tags?.length) return null
                    return (
                      <div key={tier} className="space-y-1">
                        <p className="text-[10px] font-medium text-muted-foreground/70">
                          {tier === "high" ? "High Competition" : tier === "medium" ? "Medium Competition" : "Low Competition"}
                        </p>
                        <div className="flex flex-wrap gap-1">
                          {tags.map((tag) => (
                            <span
                              key={tag}
                              className="inline-flex items-center gap-1 rounded-full bg-muted/60 px-2 py-0.5 text-[10px] text-muted-foreground"
                            >
                              #{tag.replace(/^#/, "")}
                              <button
                                type="button"
                                className="ml-0.5 rounded-full p-0.5 text-muted-foreground/50 hover:bg-destructive/10 hover:text-destructive"
                                onClick={(e) => {
                                  e.stopPropagation()
                                  patchDraft({
                                    hashtags: {
                                      ...draft.hashtags,
                                      [tier]: tags.filter((t) => t !== tag),
                                    },
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
                      patchDraft({
                        hashtags: {
                          ...current,
                          medium: [...medium, tag],
                        },
                      })
                    }}
                  />
                </div>
              </div>
            ) : null}

            {/* Social preview mock */}
            <div className="mx-auto w-full" style={{ maxWidth: `${previewMaxWidth}px` }}>
              {isHyperframeFormat ? (
                <div className="flex flex-col gap-3">
                  <HyperFramePlayer draft={draft} brandId={brandProfileId ?? ""} />
                  <div className="rounded-xl border border-border/70 bg-background/90 p-3">
                    <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                      Caption
                    </p>
                    <InlinePreviewTextarea
                      value={draft.captionPreview}
                      onChange={(event) => handleCaptionChange(event.target.value)}
                      placeholder="Write a caption..."
                      className="min-h-[5rem] text-sm leading-relaxed"
                    />
                  </div>
                </div>
              ) : null}

              {!isHyperframeFormat && selectedPlatform === "instagram" ? (
                <div className="overflow-hidden rounded-[2.5rem] border-[5px] border-foreground/10 shadow-2xl">
                  <div className="relative flex items-center justify-center bg-background px-4 pt-3 pb-2">
                    <span className="absolute left-5 text-[9px] font-bold tabular-nums text-foreground/70">9:41</span>
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
                  <div
                    className="overflow-y-auto"
                    style={{ maxHeight: 560 }}
                  >
                    <InstagramMobilePreview
                      draft={draftForPreview}
                      mediaAspectRatio={mediaAspectRatio}
                      onCaptionChange={handleCaptionChange}
                      thumbnailDirection={thumbnailDirection}
                      brandName={brandName}
                      onMediaActivate={() => setRailFocused(true)}
                      activeSlideIndex={activeSlideIndex}
                      onSelectSlide={setActiveSlideIndex}
                      placement={placement}
                      onAddSlideRequest={() => setRailFocused(true)}
                    />
                  </div>
                  <div className="flex justify-center bg-background py-2">
                    <div className="h-1 w-24 rounded-full bg-foreground/20" />
                  </div>
                </div>
              ) : null}

              {!isHyperframeFormat && selectedPlatform === "facebook" ? (
                <FacebookFeedPreview
                  draft={draftForPreview}
                  mediaAspectRatio={mediaAspectRatio}
                  onCaptionChange={handleCaptionChange}
                  thumbnailDirection={thumbnailDirection}
                  brandName={brandName}
                  onMediaActivate={() => setRailFocused(true)}
                  activeSlideIndex={activeSlideIndex}
                  onSelectSlide={setActiveSlideIndex}
                  placement={placement}
                  onAddSlideRequest={() => setRailFocused(true)}
                />
              ) : null}

              {!isHyperframeFormat && selectedPlatform === "linkedin" ? (
                <LinkedInDesktopPreview
                  draft={draftForPreview}
                  mediaAspectRatio={mediaAspectRatio}
                  onCaptionChange={handleCaptionChange}
                  thumbnailDirection={thumbnailDirection}
                  brandName={brandName}
                  onMediaActivate={() => setRailFocused(true)}
                  activeSlideIndex={activeSlideIndex}
                  onSelectSlide={setActiveSlideIndex}
                  placement={placement}
                  onAddSlideRequest={() => setRailFocused(true)}
                />
              ) : null}

              {!isHyperframeFormat &&
              selectedPlatform !== "instagram" &&
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
                  href="/settings?section=integrations"
                  className="underline underline-offset-2"
                >
                  Reconnect your account
                </a>
              </div>
            )}

            {!isPublished && !readiness.ready && (
              <div className="rounded-lg border border-border/70 bg-muted/40 px-3 py-2">
                <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                  Needed to schedule
                </p>
                <ul className="flex flex-col gap-1">
                  {readiness.checks.map((check) => (
                    <li key={check.id} className="flex items-center gap-2 text-[12px]">
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
    </DndContext>
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
  onMediaActivate,
  activeSlideIndex = 0,
  onSelectSlide,
  placement,
  onAddSlideRequest,
}: SocialPreviewProps) {
  const mediaAltText = React.useMemo(() => resolveDraftMediaAltText(draft), [
    draft.mediaSuggestion,
    draft.title,
  ])
  const displayName = brandName ?? "Your Brand"
  const initials = brandInitials(brandName)

  return (
    <div className="w-full overflow-hidden bg-card text-foreground">
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

      <InteractiveCarouselMediaArea
        draft={draft}
        alt={mediaAltText}
        aspectRatio={mediaAspectRatio}
        slotId={`preview-media-${draft.id}`}
        onActivate={onMediaActivate ?? (() => {})}
        activeSlideIndex={activeSlideIndex}
        onSelectSlide={onSelectSlide ?? (() => {})}
        placement={placement}
        onAddSlideRequest={onAddSlideRequest}
      />

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
  onMediaActivate,
  activeSlideIndex = 0,
  onSelectSlide,
  placement,
  onAddSlideRequest,
}: SocialPreviewProps) {
  const mediaAltText = React.useMemo(() => resolveDraftMediaAltText(draft), [
    draft.mediaSuggestion,
    draft.title,
  ])
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

      <InteractiveCarouselMediaArea
        draft={draft}
        alt={mediaAltText}
        aspectRatio={mediaAspectRatio}
        borderClass="border-y border-border/70"
        slotId={`preview-media-fb-${draft.id}`}
        onActivate={onMediaActivate ?? (() => {})}
        activeSlideIndex={activeSlideIndex}
        onSelectSlide={onSelectSlide ?? (() => {})}
        placement={placement}
        onAddSlideRequest={onAddSlideRequest}
      />

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
  onMediaActivate,
  activeSlideIndex = 0,
  onSelectSlide,
  placement,
  onAddSlideRequest,
}: SocialPreviewProps) {
  const mediaAltText = React.useMemo(() => resolveDraftMediaAltText(draft), [
    draft.mediaSuggestion,
    draft.title,
  ])
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

      <InteractiveCarouselMediaArea
        draft={draft}
        alt={mediaAltText}
        aspectRatio={mediaAspectRatio}
        borderClass="border-y border-border/70"
        slotId={`preview-media-li-${draft.id}`}
        onActivate={onMediaActivate ?? (() => {})}
        activeSlideIndex={activeSlideIndex}
        onSelectSlide={onSelectSlide ?? (() => {})}
        placement={placement}
        onAddSlideRequest={onAddSlideRequest}
      />

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
