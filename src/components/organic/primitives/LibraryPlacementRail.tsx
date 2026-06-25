"use client"

// Docked horizontal scroll-snap source for placing library creatives.
// Reuses useStudioLibraryBrowser + LibraryFilterBar(variant="compact") + AssetTile visual language.
// Click a tile → place into active slot. Each tile is also dnd-kit draggable.
// Collapsed state persisted to localStorage. "Browse all" expands OrganicCreativesPicker grid.

import * as React from "react"
import { useDraggable } from "@dnd-kit/core"
import { CSS } from "@dnd-kit/utilities"
import { ChevronDownIcon, ChevronUpIcon, Play } from "lucide-react"
import { ImageOff } from "lucide-react"
import { cn } from "@/lib/utils"
import { LibraryFilterBar } from "@/components/library/LibraryFilterBar"
import { useStudioLibraryBrowser } from "@/lib/creative-assets/useStudioLibraryBrowser"
import { sanitizeCreativeAssetUrl } from "@/lib/creative-assets/assetUrl"
import { OrganicCreativesPicker } from "./OrganicCreativesPicker"
import type { MediaAsset } from "@continuum/contracts"
import type { OrganicCalendarDraft } from "./types"

const LS_COLLAPSED_KEY = "continuum:organic-planner:placement-rail-collapsed"

type PublishingAsset = NonNullable<OrganicCalendarDraft["publishingAssets"]>[number]

type LibraryPlacementRailProps = {
  brandProfileId: string
  draftId: string
  // Called when the user clicks or drags a tile onto the active slot.
  onPlace: (asset: MediaAsset) => void
  // Called when the user confirms multi-select from the "Browse all" grid.
  onAttach: (assets: PublishingAsset[]) => void
  className?: string
}

function DraggableAssetTile({
  asset,
  onPlace,
}: {
  asset: MediaAsset
  onPlace: (asset: MediaAsset) => void
}) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: `asset-tile-${asset.id}`,
    data: { assetId: asset.id, asset },
  })

  const url = sanitizeCreativeAssetUrl(asset.signedUrl)
  const isVideo = asset.kind === "video"

  const style: React.CSSProperties = {
    transform: CSS.Translate.toString(transform),
    opacity: isDragging ? 0.5 : 1,
    cursor: isDragging ? "grabbing" : "grab",
    // Native drag transfers assetId so the PreviewMediaDropZone's onDrop handler can read it.
    touchAction: "none",
  }

  const handleDragStart = React.useCallback(
    (e: React.DragEvent) => {
      e.dataTransfer.setData("application/x-asset-id", asset.id)
    },
    [asset.id],
  )

  return (
    <button
      ref={setNodeRef}
      type="button"
      aria-label={`Place ${asset.title ?? asset.fileName}`}
      onClick={() => onPlace(asset)}
      onDragStart={handleDragStart}
      draggable
      style={style}
      {...attributes}
      {...listeners}
      className={cn(
        "group relative h-14 w-14 shrink-0 overflow-hidden rounded-md border border-border/50",
        "transition-all duration-150 hover:border-primary focus-visible:outline-none",
        "focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1",
        "min-h-[44px] min-w-[44px]",
      )}
    >
      {url && !isVideo ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={url}
          alt={asset.title ?? asset.fileName}
          loading="lazy"
          className="h-full w-full object-cover"
        />
      ) : url && isVideo ? (
        <video
          src={`${url}#t=0.01`}
          preload="metadata"
          muted
          playsInline
          className="h-full w-full object-cover"
        />
      ) : (
        <div className="flex h-full w-full items-center justify-center text-muted-foreground/50">
          <ImageOff className="size-4" />
        </div>
      )}

      {isVideo && (
        <div className="pointer-events-none absolute left-1 top-1 rounded-full bg-black/60 p-0.5">
          <Play className="size-2.5 text-white" />
        </div>
      )}

      {/* Hover highlight */}
      <div className="pointer-events-none absolute inset-0 bg-primary/0 transition-colors duration-150 group-hover:bg-primary/20 group-focus-visible:bg-primary/20" />
    </button>
  )
}

function RailSkeleton() {
  return (
    <div className="flex items-center gap-2 px-3 py-2">
      {Array.from({ length: 6 }).map((_, i) => (
        <div key={i} className="h-14 w-14 shrink-0 animate-pulse rounded-md bg-muted/40" />
      ))}
    </div>
  )
}

export function LibraryPlacementRail({
  brandProfileId,
  draftId,
  onPlace,
  onAttach,
  className,
}: LibraryPlacementRailProps) {
  const [collapsed, setCollapsed] = React.useState<boolean>(() => {
    if (typeof window === "undefined") return false
    try {
      return localStorage.getItem(LS_COLLAPSED_KEY) === "true"
    } catch {
      return false
    }
  })
  const [browseAllOpen, setBrowseAllOpen] = React.useState(false)

  const { assets, loading, hasMore, loadMore, query, setQuery, filters, setFilters } =
    useStudioLibraryBrowser(brandProfileId)

  const sentinelRef = React.useRef<HTMLDivElement | null>(null)
  React.useEffect(() => {
    const node = sentinelRef.current
    if (!node || !hasMore) return
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) loadMore()
      },
      { root: node.closest("[data-rail-scroll]"), rootMargin: "80px" },
    )
    observer.observe(node)
    return () => observer.disconnect()
  }, [hasMore, loadMore, assets.length])

  const toggleCollapsed = React.useCallback(() => {
    setCollapsed((prev) => {
      const next = !prev
      try {
        localStorage.setItem(LS_COLLAPSED_KEY, String(next))
      } catch {
        // ignore quota errors
      }
      return next
    })
  }, [])

  return (
    <div
      className={cn(
        "rounded-xl border border-border/70 bg-background/95",
        className,
      )}
    >
      {/* Rail header */}
      <button
        type="button"
        aria-expanded={!collapsed}
        aria-controls="placement-rail-content"
        onClick={toggleCollapsed}
        className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset rounded-xl"
      >
        <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Your library
        </span>
        {collapsed ? (
          <ChevronDownIcon className="h-3.5 w-3.5 text-muted-foreground" />
        ) : (
          <ChevronUpIcon className="h-3.5 w-3.5 text-muted-foreground" />
        )}
      </button>

      {/* Rail content */}
      {!collapsed && (
        <div id="placement-rail-content">
          {/* Filters */}
          <div className="px-3 pb-2">
            <LibraryFilterBar
              source={filters.source}
              kind={filters.kind}
              onSourceChange={(value) => setFilters({ source: value })}
              onKindChange={(value) => setFilters({ kind: value })}
              variant="compact"
            />
          </div>

          {/* Horizontal scroll asset strip */}
          {!browseAllOpen && (
            <div
              data-rail-scroll=""
              className={cn(
                "flex items-center gap-2 overflow-x-auto scroll-smooth px-3 pb-2",
                "[&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]",
                "snap-x snap-mandatory",
              )}
            >
              {assets.length === 0 && loading ? (
                <RailSkeleton />
              ) : assets.length === 0 ? (
                <p className="py-3 text-xs text-muted-foreground/60">
                  {query.trim() ? "No matches." : "Library is empty."}
                </p>
              ) : (
                <>
                  {assets.map((asset) => (
                    <div key={asset.id} className="snap-start">
                      <DraggableAssetTile asset={asset} onPlace={onPlace} />
                    </div>
                  ))}
                  <div ref={sentinelRef} className="h-px w-px shrink-0" />
                </>
              )}
            </div>
          )}

          {/* Browse all expanded grid */}
          {browseAllOpen && (
            <div className="border-t border-border/60 px-3 pt-2 pb-3">
              <OrganicCreativesPicker
                brandProfileId={brandProfileId}
                draftId={draftId}
                attached={[]}
                onAttach={(assets) => {
                  onAttach(assets)
                  setBrowseAllOpen(false)
                }}
              />
            </div>
          )}

          {/* Browse all / collapse toggle */}
          <div className="flex items-center justify-end gap-2 border-t border-border/50 px-3 py-1.5">
            <button
              type="button"
              onClick={() => setBrowseAllOpen((v) => !v)}
              className="text-xs font-medium text-primary underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring rounded"
            >
              {browseAllOpen ? "Collapse" : "Browse all"}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
