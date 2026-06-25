/* eslint-disable @next/next/no-img-element */
"use client"

import * as React from "react"
import { ImageOff, Images, Loader2, Play, Sparkles } from "lucide-react"

import {
  creativeRefFromAsset,
  type MediaAsset,
  type QuickCreatePostResponse,
} from "@continuum/contracts"

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/utils"
import { useStudioLibraryBrowser } from "@/lib/creative-assets/useStudioLibraryBrowser"
import { sanitizeCreativeAssetUrl } from "@/lib/creative-assets/assetUrl"
import { quickCreatePost } from "@/lib/organic/quickCreatePost"
import type { OrganicPlatformKey } from "@/lib/organic/platforms"
import type { Trend } from "@/lib/organic/trends"

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

function ComposerAssetTile({
  asset,
  order,
  onToggle,
}: {
  asset: MediaAsset
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
        isSelected ? "border-primary ring-2 ring-primary ring-offset-1" : "border-border/50 hover:border-border",
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
      {isSelected && (
        <div className="absolute inset-0 flex items-center justify-center bg-primary/30">
          <div className="flex h-5 min-w-5 items-center justify-center rounded-full bg-primary px-1 text-xs font-semibold text-primary-foreground">
            {order}
          </div>
        </div>
      )}
    </button>
  )
}

/**
 * Calendar "Create with AI" composer. Collects a direction, optionally tags one
 * or more library creatives (>=2 ⇒ carousel), and optionally tags trends, then
 * fires ONE durable post-generation job. The generated draft surfaces in the
 * calendar via the existing realtime refetch when the worker persists it.
 */
export function AiPostComposer({
  open,
  onOpenChange,
  brandProfileId,
  platform,
  scheduledAt,
  trends,
  onQueued,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  brandProfileId: string
  platform: OrganicPlatformKey
  scheduledAt: string
  trends: Trend[]
  onQueued?: (response: QuickCreatePostResponse) => void
}) {
  const [angle, setAngle] = React.useState("")
  const [guidance, setGuidance] = React.useState("")
  const [selectedIds, setSelectedIds] = React.useState<string[]>([])
  const [selectedTrendIds, setSelectedTrendIds] = React.useState<string[]>([])
  const [submitting, setSubmitting] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)

  const { assets, loading, hasMore, loadMore } = useStudioLibraryBrowser(brandProfileId)

  // Reset to a clean slate whenever the dialog closes.
  React.useEffect(() => {
    if (!open) {
      setAngle("")
      setGuidance("")
      setSelectedIds([])
      setSelectedTrendIds([])
      setError(null)
      setSubmitting(false)
    }
  }, [open])

  // Only real (uuid) trends can anchor a durable job; seeded slug trends are skipped.
  const taggableTrends = React.useMemo(() => trends.filter((t) => UUID_RE.test(t.id)), [trends])

  const toggleAsset = (id: string) =>
    setSelectedIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]))
  const toggleTrend = (id: string) =>
    setSelectedTrendIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]))

  const isCarousel = selectedIds.length > 1

  const handleSubmit = async () => {
    const trimmed = angle.trim()
    if (!trimmed || submitting) return
    setSubmitting(true)
    setError(null)
    try {
      const byId = new Map(assets.map((a) => [a.id, a]))
      const userSuppliedMedia = selectedIds
        .map((id) => byId.get(id))
        .filter((a): a is MediaAsset => !!a)
        .map(creativeRefFromAsset)

      const response = await quickCreatePost({
        brandId: brandProfileId,
        angle: trimmed,
        guidancePrompt: guidance.trim() ? guidance.trim() : null,
        trendIds: selectedTrendIds,
        userSuppliedMedia,
        platform,
        scheduledAt,
        format: isCarousel ? "carousel" : null,
      })
      onQueued?.(response)
      onOpenChange(false)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not queue the post. Try again.")
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="size-4 text-primary" />
            Create with AI
          </DialogTitle>
          <DialogDescription>
            Give the agent a direction. Tag creatives to use them (two or more makes a carousel) and
            trends to ground the post.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-1.5">
            <label htmlFor="ai-post-direction" className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Direction
            </label>
            <Textarea
              id="ai-post-direction"
              value={angle}
              onChange={(e) => setAngle(e.target.value)}
              placeholder="e.g. Punchy back-to-school savings hook with our top 3 deals"
              className="min-h-[4.5rem] text-sm"
              autoFocus
            />
          </div>

          <details className="group/guidance">
            <summary className="cursor-pointer text-xs font-medium text-muted-foreground hover:text-foreground">
              Add more guidance (optional)
            </summary>
            <Textarea
              value={guidance}
              onChange={(e) => setGuidance(e.target.value)}
              placeholder="Tone, CTA, or anything else to steer the post."
              className="mt-1.5 min-h-[3rem] text-sm"
            />
          </details>

          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                <Images className="size-3.5" /> Creatives
              </p>
              {isCarousel && <Badge variant="secondary" className="text-2xs">Carousel · {selectedIds.length}</Badge>}
            </div>
            <div className="max-h-40 overflow-y-auto rounded-lg border border-border/50 p-1.5">
              {assets.length === 0 && loading ? (
                <div className="grid grid-cols-5 gap-1.5">
                  {Array.from({ length: 5 }).map((_, i) => (
                    <div key={i} className="aspect-square animate-pulse rounded-lg bg-muted/40" />
                  ))}
                </div>
              ) : assets.length === 0 ? (
                <p className="px-2 py-4 text-center text-xs text-muted-foreground/60">
                  Nothing in your library yet — the agent will generate the creative.
                </p>
              ) : (
                <>
                  <div className="grid grid-cols-5 gap-1.5">
                    {assets.map((asset) => (
                      <ComposerAssetTile
                        key={asset.id}
                        asset={asset}
                        order={selectedIds.indexOf(asset.id) + 1}
                        onToggle={() => toggleAsset(asset.id)}
                      />
                    ))}
                  </div>
                  {hasMore && (
                    <button
                      type="button"
                      onClick={() => loadMore()}
                      className="mt-1.5 w-full rounded-md py-1 text-xs text-muted-foreground hover:bg-muted/50"
                    >
                      Load more
                    </button>
                  )}
                </>
              )}
            </div>
          </div>

          {taggableTrends.length > 0 && (
            <div className="space-y-1.5">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Trends</p>
              <div className="flex flex-wrap gap-1.5">
                {taggableTrends.map((trend) => {
                  const active = selectedTrendIds.includes(trend.id)
                  return (
                    <button
                      key={trend.id}
                      type="button"
                      aria-pressed={active}
                      onClick={() => toggleTrend(trend.id)}
                      className={cn(
                        "rounded-full border px-2.5 py-1 text-xs transition-colors",
                        active
                          ? "border-primary/40 bg-primary/10 text-primary"
                          : "border-border/60 text-muted-foreground hover:border-border hover:text-foreground",
                      )}
                    >
                      {trend.title}
                    </button>
                  )
                })}
              </div>
            </div>
          )}

          {error && <p className="text-sm text-destructive">{error}</p>}
        </div>

        <DialogFooter>
          <Button type="button" variant="ghost" onClick={() => onOpenChange(false)} disabled={submitting}>
            Cancel
          </Button>
          <Button type="button" onClick={handleSubmit} disabled={!angle.trim() || submitting} className="gap-1.5">
            {submitting ? <Loader2 className="size-4 animate-spin" /> : <Sparkles className="size-4" />}
            {submitting ? "Queuing…" : "Create post"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
