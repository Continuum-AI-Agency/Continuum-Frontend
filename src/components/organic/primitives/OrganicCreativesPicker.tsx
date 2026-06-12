/* eslint-disable @next/next/no-img-element */
"use client"

import * as React from "react"
import { Play, Search, ImageOff } from "lucide-react"
import type { MediaAsset } from "@continuum/contracts"
import { creativeRefFromAsset, shapeUserSuppliedMedia } from "@continuum/contracts"

import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import { LibraryFilterBar } from "@/components/library/LibraryFilterBar"
import { useStudioLibraryBrowser } from "@/lib/creative-assets/useStudioLibraryBrowser"
import { sanitizeCreativeAssetUrl } from "@/lib/creative-assets/assetUrl"
import type { OrganicCalendarDraft } from "./types"

type PublishingAsset = NonNullable<OrganicCalendarDraft["publishingAssets"]>[number]

type OrganicCreativesPickerProps = {
  brandProfileId: string
  draftId: string
  attached: PublishingAsset[]
  onAttach: (assets: PublishingAsset[]) => void
}

function SkeletonGrid() {
  return (
    <div className="grid grid-cols-4 gap-1.5">
      {Array.from({ length: 8 }).map((_, i) => (
        <div key={i} className="aspect-square animate-pulse rounded-lg bg-muted/40" />
      ))}
    </div>
  )
}

function AssetTile({
  asset,
  order,
  onToggle,
}: {
  asset: MediaAsset
  // 1-based selection position, or 0 when not selected. Drives the carousel
  // slide order shown on the badge.
  order: number
  onToggle: () => void
}) {
  const url = sanitizeCreativeAssetUrl(asset.signedUrl)
  const isVideo = asset.kind === "video"
  const isSelected = order > 0

  return (
    <button
      type="button"
      aria-label={asset.title ?? asset.fileName}
      aria-pressed={isSelected}
      onClick={onToggle}
      className={cn(
        "group relative aspect-square cursor-pointer overflow-hidden rounded-lg border transition-all duration-150",
        isSelected
          ? "border-primary ring-2 ring-primary ring-offset-1"
          : "border-border/50 hover:border-border",
      )}
    >
      {url && !isVideo ? (
        <img src={url} alt={asset.title ?? asset.fileName} loading="lazy" className="h-full w-full object-cover" />
      ) : url && isVideo ? (
        <video src={`${url}#t=0.01`} preload="metadata" muted playsInline className="h-full w-full object-cover" />
      ) : (
        <div className="flex h-full w-full items-center justify-center text-muted-foreground/50">
          <ImageOff className="size-5" />
        </div>
      )}

      {isVideo && (
        <div className="pointer-events-none absolute left-1.5 top-1.5 rounded-full bg-black/60 p-1">
          <Play className="size-3 text-white" />
        </div>
      )}

      <div
        className={cn(
          "absolute inset-0 flex items-center justify-center transition-opacity duration-150",
          isSelected
            ? "bg-primary/30 opacity-100"
            : "bg-black/0 opacity-0 group-hover:bg-black/20 group-hover:opacity-100",
        )}
      >
        {isSelected && (
          <div className="flex h-5 min-w-5 items-center justify-center rounded-full bg-primary px-1 text-[11px] font-semibold text-primary-foreground">
            {order}
          </div>
        )}
      </div>
    </button>
  )
}

// Browse the unified media library (uploads + AI + Canvas, image and video,
// folders/search) and attach the selection to the draft. Selection order maps
// to carousel slide order.
// handleAttach routes through shapeUserSuppliedMedia so the emitted assets
// are always publishable (mediaSuggestion + publishingAssets in the correct
// shape, mediaStatus='user_supplied').
export function OrganicCreativesPicker({
  brandProfileId,
  onAttach,
  attached,
}: OrganicCreativesPickerProps) {
  const { assets, loading, hasMore, loadMore, query, setQuery, filters, setFilters } =
    useStudioLibraryBrowser(brandProfileId)

  const [selectedIds, setSelectedIds] = React.useState<string[]>(() =>
    (attached ?? []).map((a) => a.assetId).filter((id): id is string => !!id),
  )

  const sentinelRef = React.useRef<HTMLDivElement | null>(null)
  React.useEffect(() => {
    const node = sentinelRef.current
    if (!node || !hasMore) return
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) loadMore()
      },
      { rootMargin: "200px" },
    )
    observer.observe(node)
    return () => observer.disconnect()
  }, [hasMore, loadMore, assets.length])

  const toggleAsset = (id: string) => {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    )
  }

  const handleAttach = () => {
    const byId = new Map(assets.map((a) => [a.id, a]))
    const selected = selectedIds
      .map((id) => byId.get(id))
      .filter((a): a is MediaAsset => !!a)

    if (selected.length === 0) return

    // Route through shapeUserSuppliedMedia so the result is always
    // publishable: both publishingAssets and mediaSuggestion are populated.
    const refs = selected.map(creativeRefFromAsset)
    const { publishingAssets } = shapeUserSuppliedMedia(refs)
    onAttach(publishingAssets as PublishingAsset[])
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="relative">
        <Search className="absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search the library…"
          className="w-full rounded-md border border-border/60 bg-background py-1.5 pl-9 pr-3 text-sm outline-none focus:border-border"
        />
      </div>

      <LibraryFilterBar
        source={filters.source}
        kind={filters.kind}
        onSourceChange={(value) => setFilters({ source: value })}
        onKindChange={(value) => setFilters({ kind: value })}
      />

      <div className="max-h-72 overflow-y-auto pr-0.5">
        {assets.length === 0 && loading ? (
          <SkeletonGrid />
        ) : assets.length === 0 ? (
          <div className="flex min-h-[6rem] items-center justify-center rounded-xl border border-dashed border-border/70 bg-muted/30 px-3 py-4">
            <p className="text-center text-[11px] text-muted-foreground/60">
              {query.trim() ? (
                "No matching creatives."
              ) : (
                <>
                  No creatives in your library yet.{" "}
                  <span className="text-muted-foreground">Generate in AI Studio or upload, then attach here.</span>
                </>
              )}
            </p>
          </div>
        ) : (
          <>
            <div className="grid grid-cols-4 gap-1.5">
              {assets.map((asset) => (
                <AssetTile
                  key={asset.id}
                  asset={asset}
                  order={selectedIds.indexOf(asset.id) + 1}
                  onToggle={() => toggleAsset(asset.id)}
                />
              ))}
            </div>
            <div ref={sentinelRef} className="h-px w-full" />
          </>
        )}
      </div>

      {selectedIds.length > 0 && (
        <div className="flex justify-end">
          <Button type="button" size="sm" onClick={handleAttach}>
            Attach selected ({selectedIds.length})
          </Button>
        </div>
      )}
    </div>
  )
}
