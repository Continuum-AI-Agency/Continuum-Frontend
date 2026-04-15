import type { OrganicCalendarDraft } from "@/components/organic/primitives/types"

export function inferPostType(draft: OrganicCalendarDraft): "POST" | "REEL" | "CAROUSEL" {
  if (draft.format === "Reel" || draft.format === "Video") return "REEL"
  if (draft.format === "Carousel") return "CAROUSEL"
  return "POST"
}

// ── Request body shapes ───────────────────────────────────────────────────────

type PostPublishBody = {
  postType: "POST"
  placementId: string
  imageUrl?: string
  caption?: string
  igAccountId?: string
  brandId?: string
}

type ReelPublishBody = {
  postType: "REEL"
  placementId: string
  videoUrl?: string
  caption?: string
  coverUrl?: string
  shareToFeed: true
  igAccountId?: string
  brandId?: string
}

type CarouselPublishBody = {
  postType: "CAROUSEL"
  placementId: string
  items?: Array<{ imageUrl: string }>
  caption?: string
  igAccountId?: string
  brandId?: string
}

export type PublishRequestBody = PostPublishBody | ReelPublishBody | CarouselPublishBody

// ── Caption builder ───────────────────────────────────────────────────────────

export function flattenHashtags(
  hashtags: OrganicCalendarDraft["hashtags"]
): string[] {
  if (!hashtags) return []
  return [
    ...(hashtags.high ?? []),
    ...(hashtags.medium ?? []),
    ...(hashtags.low ?? []),
  ]
    .filter(Boolean)
    .map((tag) => (tag.startsWith("#") ? tag : `#${tag}`))
}

export function buildFullCaption(draft: OrganicCalendarDraft): string {
  const body = (draft.captionPreview ?? "").trim()
  const tags = flattenHashtags(draft.hashtags)
  if (!tags.length) return body
  return body ? `${body}\n\n${tags.join(" ")}` : tags.join(" ")
}

function buildCaption(draft: OrganicCalendarDraft): string {
  return buildFullCaption(draft)
}

// ── Main builder ──────────────────────────────────────────────────────────────

export function buildPublishBody(
  draft: OrganicCalendarDraft,
  igAccountId: string | null,
  brandId: string | null
): PublishRequestBody {
  const postType = inferPostType(draft)
  const caption = buildCaption(draft) || undefined
  const assets = draft.publishingAssets ?? []

  const accountFields = {
    ...(igAccountId ? { igAccountId } : {}),
    ...(brandId ? { brandId } : {}),
  }

  if (postType === "REEL") {
    const videoAsset = assets.find((a) => a.kind === "video")
    const coverAsset = assets.find((a) => a.role === "cover" && a.kind === "image")
    return {
      postType: "REEL",
      placementId: draft.id,
      ...(videoAsset ? { videoUrl: videoAsset.storageUrl } : {}),
      ...(coverAsset ? { coverUrl: coverAsset.storageUrl } : {}),
      caption,
      shareToFeed: true,
      ...accountFields,
    }
  }

  if (postType === "CAROUSEL") {
    const storedSlides = assets
      .filter((a) => a.kind === "image")
      .sort((a, b) => (a.slideIndex ?? 0) - (b.slideIndex ?? 0))
      .map((a) => ({ imageUrl: a.storageUrl }))

    const generatedSlides = (draft.mediaSuggestion?.assets ?? [])
      .filter((a) => a.assetBase64)
      .sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
      .map((a) => ({ imageUrl: `data:${a.mimeType ?? "image/png"};base64,${a.assetBase64}` }))

    const slides = storedSlides.length >= generatedSlides.length ? storedSlides : generatedSlides

    return {
      postType: "CAROUSEL",
      placementId: draft.id,
      ...(slides.length > 0 ? { items: slides } : {}),
      caption,
      ...accountFields,
    }
  }

  const imageAsset = assets.find((a) => a.kind === "image" && a.role === "primary")
    ?? assets.find((a) => a.kind === "image")
  return {
    postType: "POST",
    placementId: draft.id,
    ...(imageAsset ? { imageUrl: imageAsset.storageUrl } : {}),
    caption,
    ...accountFields,
  }
}
