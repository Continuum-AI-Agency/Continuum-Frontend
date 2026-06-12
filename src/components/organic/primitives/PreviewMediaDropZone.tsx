"use client"

// Drop zone that turns the post media slot into a place-target.
// States: idle | drag-over-valid | drag-over-invalid | placing | success | fallback.
// Primary input: CLICK-TO-PLACE (tiles are real <button>s, keyboard+SR accessible).
// Enhancement: drag-from-rail (dnd-kit useDroppable + native onDrop).
// Token-locked: primary accent ring only; amber reserved for existing failure semantic;
// no glow/bounce; transform/opacity-only motion; prefers-reduced-motion collapses.

import * as React from "react"
import { useDroppable } from "@dnd-kit/core"
import { useReducedMotion } from "motion/react"
import { ImageIcon, VideoIcon, Upload } from "lucide-react"
import { cn } from "@/lib/utils"
import type { PlacementError } from "@/components/organic/hooks/useDraftMediaPlacement"

export type DropZoneState =
  | "idle"
  | "drag-over-valid"
  | "drag-over-invalid"
  | "placing"
  | "success"
  | "fallback"

type PreviewMediaDropZoneProps = {
  // Whether this zone is the active/focused slot for keyboard placement.
  isActive: boolean
  state: DropZoneState
  // Slot id used by dnd-kit as the droppable identifier.
  slotId: string
  // Called when native file drop occurs (drag-from-rail passes the assetId).
  onNativeDrop?: (assetId: string) => void
  // Called when the user activates the zone (Enter/Space) to trigger click-to-place.
  onActivate?: () => void
  // Forwarded error from the placement hook for aria-live announcements.
  error?: PlacementError | null
  aspectRatio?: number
  children?: React.ReactNode
  className?: string
}

// Duration values collapse to 0 when prefers-reduced-motion is set.
function useMotionDuration(ms: number): number {
  const reduced = useReducedMotion()
  return reduced ? 0 : ms
}

export function PreviewMediaDropZone({
  isActive,
  state,
  slotId,
  onNativeDrop,
  onActivate,
  error,
  aspectRatio,
  children,
  className,
}: PreviewMediaDropZoneProps) {
  const { setNodeRef, isOver } = useDroppable({ id: slotId })
  const motionDuration = useMotionDuration(200)
  const liveRegionRef = React.useRef<HTMLDivElement>(null)

  // Reflect error announcements into the shared aria-live region.
  React.useEffect(() => {
    if (error && liveRegionRef.current) {
      liveRegionRef.current.textContent = error.message
    }
  }, [error])

  const handleNativeDragOver = React.useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
  }, [])

  const handleNativeDrop = React.useCallback(
    (e: React.DragEvent) => {
      e.preventDefault()
      e.stopPropagation()
      const assetId = e.dataTransfer.getData("application/x-asset-id")
      if (assetId && onNativeDrop) {
        onNativeDrop(assetId)
      }
    },
    [onNativeDrop],
  )

  const handleKeyDown = React.useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault()
        onActivate?.()
      }
    },
    [onActivate],
  )

  const isDragOver = isOver
  const isInvalidDrag = isDragOver && state === "drag-over-invalid"
  const isValidDrag = isDragOver && state !== "drag-over-invalid"
  const isPlacing = state === "placing"
  const isSuccess = state === "success"
  const isFallback = state === "fallback"

  const ringClass = isActive
    ? "ring-2 ring-primary ring-offset-1"
    : isValidDrag
      ? "ring-2 ring-primary/60 ring-offset-1"
      : isInvalidDrag
        ? "ring-2 ring-amber-500 ring-offset-1"
        : ""

  const overlayOpacity = isDragOver || isPlacing ? 1 : 0

  return (
    <div
      ref={setNodeRef}
      role="button"
      tabIndex={0}
      aria-label={`Media slot — press Enter or Space to place a creative`}
      aria-busy={isPlacing}
      aria-invalid={!!error}
      onKeyDown={handleKeyDown}
      onClick={onActivate}
      onDragOver={handleNativeDragOver}
      onDrop={handleNativeDrop}
      style={{
        aspectRatio: aspectRatio ?? undefined,
        transition: `box-shadow ${motionDuration}ms ease`,
      }}
      className={cn(
        "relative cursor-pointer overflow-hidden rounded-sm bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        ringClass,
        className,
      )}
    >
      {/* Existing media or skeleton */}
      {children}

      {/* Placing skeleton shimmer */}
      {isPlacing && (
        <div
          className="absolute inset-0 z-10 animate-pulse bg-muted/70"
          aria-hidden
        />
      )}

      {/* Success accent ring settle — opacity-only, no bounce */}
      {isSuccess && (
        <div
          className="absolute inset-0 z-10 rounded-sm ring-2 ring-primary"
          style={{
            opacity: 1,
            transition: `opacity ${motionDuration}ms ease`,
          }}
          aria-hidden
        />
      )}

      {/* Drag-over overlay */}
      <div
        aria-hidden
        className={cn(
          "pointer-events-none absolute inset-0 z-20 flex items-center justify-center rounded-sm",
          isInvalidDrag
            ? "bg-amber-500/20 border-2 border-amber-500 border-dashed"
            : "bg-primary/15 border-2 border-primary border-dashed",
        )}
        style={{
          opacity: overlayOpacity,
          transition: `opacity ${motionDuration}ms ease`,
        }}
      >
        <div
          className={cn(
            "flex flex-col items-center gap-1 text-xs font-medium",
            isInvalidDrag ? "text-amber-700 dark:text-amber-400" : "text-primary",
          )}
        >
          <Upload className="h-5 w-5" />
          {isInvalidDrag ? "Wrong type" : "Drop here"}
        </div>
      </div>

      {/* Fallback / blank CTA — "Use your own creative" */}
      {isFallback && !isDragOver && !isPlacing && (
        <div className="absolute inset-0 z-10 flex items-center justify-center bg-muted/60">
          <div className="flex flex-col items-center gap-2 px-4 text-center">
            <div className="flex h-10 w-10 items-center justify-center rounded-full border border-border/70 bg-background">
              <ImageIcon className="h-5 w-5 text-muted-foreground" />
            </div>
            <p className="text-xs font-medium text-muted-foreground">
              Use your own creative
            </p>
            <p className="text-[10px] text-muted-foreground/60">
              Click to browse library
            </p>
          </div>
        </div>
      )}

      {/* aria-live region — shared placement error announcements */}
      <div
        ref={liveRegionRef}
        role="status"
        aria-live="polite"
        aria-atomic="true"
        className="sr-only"
      />
    </div>
  )
}

// A CTA rendered inside a failed or blank media slot.
export function UseOwnCreativeCta({
  onActivate,
  format,
}: {
  onActivate: () => void
  format?: string
}) {
  const isVideo = format?.toLowerCase() === "reel" || format?.toLowerCase() === "video"

  return (
    <button
      type="button"
      onClick={onActivate}
      className="flex w-full flex-col items-center gap-2 px-4 py-6 text-center transition-colors hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      <div className="flex h-10 w-10 items-center justify-center rounded-full border border-border/70 bg-background">
        {isVideo ? (
          <VideoIcon className="h-5 w-5 text-muted-foreground" />
        ) : (
          <ImageIcon className="h-5 w-5 text-muted-foreground" />
        )}
      </div>
      <p className="text-xs font-medium text-muted-foreground">Use your own creative</p>
      <p className="text-[10px] text-muted-foreground/60">Click to browse library</p>
    </button>
  )
}
