"use client"

import Image from "next/image"
import { PlayIcon } from "@radix-ui/react-icons"
import { resolveOrganicImageUrl } from "@continuum/contracts"
import { cn } from "@/lib/utils"
import type { OrganicCalendarDraft } from "./types"

const PLATFORM_GRADIENTS: Record<string, [string, string]> = {
  instagram: ["#E1306C", "#833AB4"],
  linkedin: ["#0A66C2", "#004182"],
  facebook: ["#1877F2", "#0550AE"],
  tiktok: ["#69C9D0", "#010101"],
  youtube: ["#FF0000", "#CC0000"],
  twitter: ["#1DA1F2", "#0C7ABF"],
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

/**
 * Single FE draft → image resolver. Persisted publishing assets win (durable
 * storage URL); otherwise defer to the shared contracts resolver so chat, list
 * and calendar all surface the same media (incl. base64-only 512px mockups).
 */
export function resolveDraftMediaAssetUrl(draft: OrganicCalendarDraft): string | null {
  const persistedImageAsset = draft.publishingAssets?.find((a) => a.kind === "image")
  if (persistedImageAsset?.storageUrl) return persistedImageAsset.storageUrl
  return resolveOrganicImageUrl(draft.mediaSuggestion)
}

export function hasDraftMedia(draft: OrganicCalendarDraft): boolean {
  return resolveDraftMediaAssetUrl(draft) !== null
}

export function resolveFormatAspectClass(format: string): string {
  const f = (format ?? "").toLowerCase()
  if (f === "hyperframe") return "aspect-video"
  if (f === "reel" || f === "video") return "aspect-[4/5]"
  if (f === "story") return "aspect-[9/16]"
  return "aspect-square"
}

export type DraftHyperframeCover = {
  coverImageUrl?: string | null
  coverBase64?: string | null
  coverPath?: string | null
  bucket?: string | null
}

export function isHyperframeDraft(draft: OrganicCalendarDraft): boolean {
  return (draft.format ?? "").toLowerCase() === "hyperframe"
}

export function resolveDraftHyperframeCover(
  draft: OrganicCalendarDraft
): DraftHyperframeCover | null {
  const hf = draft.mediaSuggestion?.hyperframe
  if (!hf) return null
  const hasCover =
    hasText(hf.coverImageUrl) || hasText(hf.coverBase64) || hasText(hf.coverPath)
  if (!hasCover) return null
  return {
    coverImageUrl: hf.coverImageUrl ?? null,
    coverBase64: hf.coverBase64 ?? null,
    coverPath: hf.coverPath ?? null,
    bucket: hf.bucket ?? null,
  }
}

function resolveHyperframeCoverUrl(cover: DraftHyperframeCover): string | null {
  if (hasText(cover.coverImageUrl)) return cover.coverImageUrl.trim()
  if (hasText(cover.coverBase64)) return toDataUrl(cover.coverBase64, "image/png")
  return null
}

export function DraftCardMedia({
  draft,
  aspectClass = "aspect-square",
  className,
  sizes = "280px",
}: {
  draft: OrganicCalendarDraft
  aspectClass?: string
  className?: string
  sizes?: string
}) {
  const platform = draft.platforms[0] ?? "instagram"
  const [gradientStart, gradientEnd] = PLATFORM_GRADIENTS[platform] ?? ["#5A48F9", "#7C6FFF"]
  const altText =
    typeof draft.mediaSuggestion?.alt === "string" && draft.mediaSuggestion.alt.trim()
      ? draft.mediaSuggestion.alt.trim()
      : draft.title

  const hyperframeCover = isHyperframeDraft(draft) ? resolveDraftHyperframeCover(draft) : null
  const hyperframeCoverUrl = hyperframeCover ? resolveHyperframeCoverUrl(hyperframeCover) : null

  if (hyperframeCoverUrl) {
    return (
      <div className={cn("relative overflow-hidden", aspectClass, className)}>
        <Image
          src={hyperframeCoverUrl}
          alt={altText}
          fill
          unoptimized
          className="object-cover"
          sizes={sizes}
        />
        <div className="absolute inset-0 flex items-center justify-center">
          <span className="flex h-9 w-9 items-center justify-center rounded-full bg-black/45 text-white backdrop-blur-sm">
            <PlayIcon className="h-4 w-4 translate-x-[1px]" />
          </span>
        </div>
      </div>
    )
  }

  const reel = draft.mediaSuggestion?.reel
  const reelUrl = reel?.generated && hasText(reel.signedUrl) ? reel.signedUrl.trim() : null
  if (reelUrl) {
    return (
      <div className={cn("relative overflow-hidden", aspectClass, className)}>
        {/* Muted, paused preview — the first frame is the implicit poster. */}
        {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
        <video
          src={reelUrl}
          muted
          playsInline
          preload="metadata"
          aria-label={altText}
          className="absolute inset-0 h-full w-full object-cover"
        />
        <div className="absolute inset-0 flex items-center justify-center">
          <span className="flex h-9 w-9 items-center justify-center rounded-full bg-black/45 text-white backdrop-blur-sm">
            <PlayIcon className="h-4 w-4 translate-x-[1px]" />
          </span>
        </div>
      </div>
    )
  }

  const mediaUrl = resolveDraftMediaAssetUrl(draft)

  return (
    <div className={cn("relative overflow-hidden", aspectClass, className)}>
      {mediaUrl ? (
        <Image
          src={mediaUrl}
          alt={altText}
          fill
          unoptimized
          className="object-cover"
          sizes={sizes}
        />
      ) : (
        <div
          className="absolute inset-0 flex items-end p-3"
          style={{ background: `linear-gradient(135deg, ${gradientStart}, ${gradientEnd})` }}
        >
          <p className="line-clamp-3 text-[11px] font-bold leading-tight text-white/90 drop-shadow-sm">
            {draft.creativeIdea || draft.title}
          </p>
        </div>
      )}
    </div>
  )
}
