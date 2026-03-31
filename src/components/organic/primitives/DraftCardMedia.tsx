"use client"

import Image from "next/image"
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

export function resolveDraftMediaAssetUrl(draft: OrganicCalendarDraft): string | null {
  const persistedImageAsset = draft.publishingAssets?.find((a) => a.kind === "image")
  if (persistedImageAsset?.storageUrl) return persistedImageAsset.storageUrl

  const m = draft.mediaSuggestion
  if (!m) return null

  const assetUrl = hasText(m.assetUrl) ? m.assetUrl.trim() : ""
  if (assetUrl.length > 0) return assetUrl

  if (hasText(m.assetBase64)) return toDataUrl(m.assetBase64, "image/png")

  const primaryAsset = (m.assets ?? [])
    .filter(
      (a): a is NonNullable<NonNullable<typeof m.assets>[number]> & { assetBase64: string } =>
        Boolean(a && hasText(a.assetBase64))
    )
    .sort(
      (l, r) => (l.order ?? Number.MAX_SAFE_INTEGER) - (r.order ?? Number.MAX_SAFE_INTEGER)
    )[0]

  if (!primaryAsset) return null
  return toDataUrl(primaryAsset.assetBase64, primaryAsset.mimeType)
}

export function hasDraftMedia(draft: OrganicCalendarDraft): boolean {
  return resolveDraftMediaAssetUrl(draft) !== null
}

export function resolveFormatAspectClass(format: string): string {
  const f = (format ?? "").toLowerCase()
  if (f === "reel" || f === "video") return "aspect-[4/5]"
  if (f === "story") return "aspect-[9/16]"
  return "aspect-square"
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
  const mediaUrl = resolveDraftMediaAssetUrl(draft)
  const platform = draft.platforms[0] ?? "instagram"
  const [gradientStart, gradientEnd] = PLATFORM_GRADIENTS[platform] ?? ["#5A48F9", "#7C6FFF"]
  const altText =
    typeof draft.mediaSuggestion?.alt === "string" && draft.mediaSuggestion.alt.trim()
      ? draft.mediaSuggestion.alt.trim()
      : draft.title

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
