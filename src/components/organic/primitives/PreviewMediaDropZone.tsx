'use client';

// Drop zone that turns the post media slot into a place-target.
// States: idle | drag-over-valid | drag-over-invalid | placing | success | fallback.
// Primary input: CLICK-TO-PLACE (tiles are real <button>s, keyboard+SR accessible).
// Enhancement: drag-from-rail (dnd-kit useDroppable + native onDrop).
// Token-locked: primary accent ring only; amber reserved for existing failure semantic;
// no glow/bounce; transform/opacity-only motion; prefers-reduced-motion collapses.

import { useDroppable } from '@dnd-kit/core';
import { ImageIcon, Loader2, Upload } from 'lucide-react';
import { useReducedMotion } from 'motion/react';
import * as React from 'react';
import type { PlacementError } from '@/components/organic/hooks/useDraftMediaPlacement';
import { cn } from '@/lib/utils';

export type DropZoneState =
  | 'idle'
  | 'drag-over-valid'
  | 'drag-over-invalid'
  | 'placing'
  | 'success'
  | 'fallback';

// AI stage actions (Generate media / Enrich) surfaced as a primary row above the
// library/upload split so a media-less draft offers the agent path, not only manual.
export type DropZoneFallbackAction = {
  key: string;
  label: string;
  busyLabel?: string;
  title?: string;
  icon: React.ReactNode;
  busy?: boolean;
  onSelect: () => void;
};

type PreviewMediaDropZoneProps = {
  // Whether this zone is the active/focused slot for keyboard placement.
  isActive: boolean;
  state: DropZoneState;
  // Slot id used by dnd-kit as the droppable identifier.
  slotId: string;
  // Called when native file drop occurs (drag-from-rail passes the assetId).
  onNativeDrop?: (assetId: string) => void;
  // Called when the user activates the zone (Enter/Space) to trigger click-to-place.
  onActivate?: () => void;
  // Blank-state split: top half opens the library; bottom half uploads from disk.
  // OS-file drop anywhere on the zone also routes to onFilesChosen.
  onSelectLibrary?: () => void;
  onFilesChosen?: (files: File[]) => void;
  fallbackActions?: DropZoneFallbackAction[];
  // Forwarded error from the placement hook for aria-live announcements.
  error?: PlacementError | null;
  aspectRatio?: number;
  children?: React.ReactNode;
  className?: string;
};

// Duration values collapse to 0 when prefers-reduced-motion is set.
function useMotionDuration(ms: number): number {
  const reduced = useReducedMotion();
  return reduced ? 0 : ms;
}

export function PreviewMediaDropZone({
  isActive,
  state,
  slotId,
  onNativeDrop,
  onActivate,
  onSelectLibrary,
  onFilesChosen,
  fallbackActions,
  error,
  aspectRatio,
  children,
  className,
}: PreviewMediaDropZoneProps) {
  const { setNodeRef, isOver } = useDroppable({ id: slotId });
  const motionDuration = useMotionDuration(200);
  const liveRegionRef = React.useRef<HTMLDivElement>(null);

  // Reflect error announcements into the shared aria-live region.
  React.useEffect(() => {
    if (error && liveRegionRef.current) {
      liveRegionRef.current.textContent = error.message;
    }
  }, [error]);

  const handleNativeDragOver = React.useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  }, []);

  const handleNativeDrop = React.useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      // OS-file drop (from the desktop) takes precedence over an asset-id drag
      // (from the library rail) — they are mutually exclusive on a single drop.
      const files = e.dataTransfer.files;
      if (files && files.length > 0 && onFilesChosen) {
        onFilesChosen(Array.from(files));
        return;
      }
      const assetId = e.dataTransfer.getData('application/x-asset-id');
      if (assetId && onNativeDrop) {
        onNativeDrop(assetId);
      }
    },
    [onNativeDrop, onFilesChosen],
  );

  const handleKeyDown = React.useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        onActivate?.();
      }
    },
    [onActivate],
  );

  const isDragOver = isOver;
  const isInvalidDrag = isDragOver && state === 'drag-over-invalid';
  const isValidDrag = isDragOver && state !== 'drag-over-invalid';
  const isPlacing = state === 'placing';
  const isSuccess = state === 'success';
  const isFallback = state === 'fallback';

  const ringClass = isActive
    ? 'ring-2 ring-primary ring-offset-1'
    : isValidDrag
      ? 'ring-2 ring-primary/60 ring-offset-1'
      : isInvalidDrag
        ? 'ring-2 ring-amber-500 ring-offset-1'
        : '';

  const overlayOpacity = isDragOver || isPlacing ? 1 : 0;

  return (
    // biome-ignore lint/a11y/useSemanticElements: the slot wraps nested interactive controls (stage actions, library/upload split, slide nav), so it cannot be a native <button>; Enter/Space activation is wired via onKeyDown.
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
        'relative cursor-pointer overflow-hidden rounded-sm bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
        ringClass,
        className,
      )}
    >
      {/* Existing media or skeleton */}
      {children}

      {/* Placing skeleton shimmer */}
      {isPlacing && <div className="absolute inset-0 z-10 animate-pulse bg-muted/70" aria-hidden />}

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
          'pointer-events-none absolute inset-0 z-20 flex items-center justify-center rounded-sm',
          isInvalidDrag
            ? 'bg-amber-500/20 border-2 border-amber-500 border-dashed'
            : 'bg-primary/15 border-2 border-primary border-dashed',
        )}
        style={{
          opacity: overlayOpacity,
          transition: `opacity ${motionDuration}ms ease`,
        }}
      >
        <div
          className={cn(
            'flex flex-col items-center gap-1 text-xs font-medium',
            isInvalidDrag ? 'text-amber-700 dark:text-amber-400' : 'text-primary',
          )}
        >
          <Upload className="h-5 w-5" />
          {isInvalidDrag ? 'Wrong type' : 'Drop here'}
        </div>
      </div>

      {/* Blank-state split: top half browses the library, bottom half uploads
          from the computer. Each half highlights on hover. OS-file drop anywhere
          on the zone also uploads (handleNativeDrop). */}
      {isFallback && !isDragOver && !isPlacing && (
        <div className="absolute inset-0 z-10 flex flex-col">
          {fallbackActions && fallbackActions.length > 0 && (
            <div className="flex flex-1 items-stretch border-b border-border/50">
              {fallbackActions.map((action, index) => (
                <button
                  key={action.key}
                  type="button"
                  disabled={action.busy}
                  title={action.title}
                  onClick={(e) => {
                    e.stopPropagation();
                    action.onSelect();
                  }}
                  className={cn(
                    'group/gen flex flex-1 flex-col items-center justify-center gap-1.5 bg-primary/5 px-4 text-center transition-colors duration-150 hover:bg-primary/10 disabled:cursor-default disabled:opacity-70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset',
                    index > 0 && 'border-l border-border/50',
                  )}
                >
                  <div className="flex h-9 w-9 items-center justify-center rounded-full border border-primary/40 bg-background text-primary transition-colors group-hover/gen:border-primary/70">
                    {action.busy ? <Loader2 className="h-4 w-4 animate-spin" /> : action.icon}
                  </div>
                  <p className="text-xs font-medium text-primary">
                    {action.busy ? (action.busyLabel ?? action.label) : action.label}
                  </p>
                </button>
              ))}
            </div>
          )}
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onSelectLibrary?.();
            }}
            className="group/lib flex flex-1 flex-col items-center justify-center gap-1.5 border-b border-border/50 bg-muted/60 px-4 text-center transition-colors duration-150 hover:bg-primary/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset"
          >
            <div className="flex h-9 w-9 items-center justify-center rounded-full border border-border/70 bg-background transition-colors group-hover/lib:border-primary/40">
              <ImageIcon className="h-4 w-4 text-muted-foreground transition-colors group-hover/lib:text-primary" />
            </div>
            <p className="text-xs font-medium text-muted-foreground transition-colors group-hover/lib:text-foreground">
              Select from library
            </p>
          </button>
          {/* biome-ignore lint/a11y/useKeyWithClickEvents: the handler merely stops propagation so upload-half clicks don't also open the library picker; the nested file input carries the keyboard interaction. */}
          <label
            onClick={(e) => e.stopPropagation()}
            className="group/up flex flex-1 cursor-pointer flex-col items-center justify-center gap-1.5 bg-muted/60 px-4 text-center transition-colors duration-150 hover:bg-primary/5 focus-within:ring-2 focus-within:ring-ring focus-within:ring-inset"
          >
            <div className="flex h-9 w-9 items-center justify-center rounded-full border border-border/70 bg-background transition-colors group-hover/up:border-primary/40">
              <Upload className="h-4 w-4 text-muted-foreground transition-colors group-hover/up:text-primary" />
            </div>
            <p className="text-xs font-medium text-muted-foreground transition-colors group-hover/up:text-foreground">
              Upload from your computer
            </p>
            <input
              type="file"
              accept="image/*,video/*"
              multiple
              className="sr-only"
              onChange={(e) => {
                const files = e.target.files ? Array.from(e.target.files) : [];
                e.currentTarget.value = '';
                if (files.length > 0) onFilesChosen?.(files);
              }}
            />
          </label>
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
  );
}
