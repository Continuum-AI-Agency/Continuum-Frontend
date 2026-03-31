"use client"

import * as React from "react"
import { CheckIcon } from "@radix-ui/react-icons"

import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import {
  listCreativeAssets,
  createSignedAssetUrl,
} from "@/lib/creative-assets/storageClient"
import type { OrganicCalendarDraft } from "./types"

type PublishingAsset = NonNullable<OrganicCalendarDraft["publishingAssets"]>[number]

type OrganicCreativesPickerProps = {
  brandProfileId: string
  draftId: string
  attached: PublishingAsset[]
  onAttach: (assets: PublishingAsset[]) => void
}

type ResolvedAsset = {
  fullPath: string
  name: string
  signedUrl: string
  contentType: string | null
}

function SkeletonGrid() {
  return (
    <div className="grid grid-cols-4 gap-1.5">
      {Array.from({ length: 8 }).map((_, i) => (
        <div
          key={i}
          className="aspect-square animate-pulse rounded-lg bg-muted/40"
        />
      ))}
    </div>
  )
}

function AssetTile({
  asset,
  isSelected,
  onToggle,
}: {
  asset: ResolvedAsset
  isSelected: boolean
  onToggle: () => void
}) {
  return (
    <button
      type="button"
      aria-label={asset.name}
      aria-pressed={isSelected}
      onClick={onToggle}
      className={cn(
        "group relative aspect-square cursor-pointer overflow-hidden rounded-lg border transition-all duration-150",
        isSelected
          ? "border-primary ring-2 ring-primary ring-offset-1"
          : "border-border/50 hover:border-border"
      )}
    >
      <img
        src={asset.signedUrl}
        alt={asset.name}
        loading="lazy"
        className="h-full w-full object-cover"
      />
      <div
        className={cn(
          "absolute inset-0 flex items-center justify-center transition-opacity duration-150",
          isSelected
            ? "bg-primary/30 opacity-100"
            : "bg-black/0 opacity-0 group-hover:bg-black/20 group-hover:opacity-100"
        )}
      >
        {isSelected && (
          <div className="flex h-5 w-5 items-center justify-center rounded-full bg-primary text-primary-foreground">
            <CheckIcon className="size-3" />
          </div>
        )}
      </div>
    </button>
  )
}

export function OrganicCreativesPicker({
  brandProfileId,
  onAttach,
  attached,
}: OrganicCreativesPickerProps) {
  const [assets, setAssets] = React.useState<ResolvedAsset[]>([])
  const [loading, setLoading] = React.useState(true)
  const [error, setError] = React.useState<string | null>(null)
  const [selectedPaths, setSelectedPaths] = React.useState<Set<string>>(
    () => new Set((attached ?? []).map((a) => a.storagePath))
  )

  React.useEffect(() => {
    let cancelled = false

    async function load() {
      setLoading(true)
      setError(null)
      try {
        const { assets: fileAssets } = await listCreativeAssets(brandProfileId, "ai-studio")
        const imageAssets = fileAssets.filter(
          (a) => a.kind === "file" && a.contentType?.startsWith("image/")
        )
        const signed = await Promise.all(
          imageAssets.map(async (a) => {
            try {
              const signedUrl = await createSignedAssetUrl(a.fullPath, 3600)
              return { fullPath: a.fullPath, name: a.name, signedUrl, contentType: a.contentType }
            } catch {
              return null
            }
          })
        )
        if (!cancelled) {
          setAssets(signed.filter((a): a is ResolvedAsset => a !== null))
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Failed to load creatives")
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    void load()
    return () => { cancelled = true }
  }, [brandProfileId])

  const toggleAsset = (fullPath: string) => {
    setSelectedPaths((prev) => {
      const next = new Set(prev)
      if (next.has(fullPath)) {
        next.delete(fullPath)
      } else {
        next.add(fullPath)
      }
      return next
    })
  }

  const handleAttach = () => {
    const selected = assets.filter((a) => selectedPaths.has(a.fullPath))
    const publishingAssets: PublishingAsset[] = selected.map((a) => ({
      role: "primary",
      kind: "image" as const,
      storagePath: a.fullPath,
      storageUrl: a.signedUrl,
      mimeType: a.contentType ?? "image/jpeg",
    }))
    onAttach(publishingAssets)
    setSelectedPaths(new Set())
  }

  if (loading) return <SkeletonGrid />

  if (error) {
    return (
      <div className="flex min-h-[6rem] items-center justify-center rounded-xl border border-dashed border-border/70 bg-muted/30 px-3 py-4">
        <p className="text-center text-[11px] text-muted-foreground/70">{error}</p>
      </div>
    )
  }

  if (assets.length === 0) {
    return (
      <div className="flex min-h-[6rem] items-center justify-center rounded-xl border border-dashed border-border/70 bg-muted/30 px-3 py-4">
        <p className="text-center text-[11px] text-muted-foreground/60">
          No AI Studio creatives found.{" "}
          <span className="text-muted-foreground">Generate assets in AI Studio, then return here to attach them.</span>
        </p>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="grid grid-cols-4 gap-1.5">
        {assets.map((asset) => (
          <AssetTile
            key={asset.fullPath}
            asset={asset}
            isSelected={selectedPaths.has(asset.fullPath)}
            onToggle={() => toggleAsset(asset.fullPath)}
          />
        ))}
      </div>
      {selectedPaths.size > 0 && (
        <div className="flex justify-end">
          <Button type="button" size="sm" onClick={handleAttach}>
            Attach selected ({selectedPaths.size})
          </Button>
        </div>
      )}
    </div>
  )
}
