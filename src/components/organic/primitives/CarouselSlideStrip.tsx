'use client';

// Per-slide editing strip for carousel format.
// Supports: @dnd-kit/sortable reorder with motion layout thumbnails,
// add (dashed + button), remove (hover ×, min 1 enforced).
// The in-frame social dots (from the preview mock) remain there for
// position context; this strip is the editing surface.

import type { MediaAsset } from '@continuum/contracts';
import {
  closestCenter,
  DndContext,
  type DragEndEvent,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import {
  horizontalListSortingStrategy,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { Maximize2, Plus, Replace, X } from 'lucide-react';
import Image from 'next/image';
import * as React from 'react';
import type { UseDraftMediaPlacementResult } from '@/components/organic/hooks/useDraftMediaPlacement';
import { cn } from '@/lib/utils';

type Slide = {
  slideIndex: number;
  storageUrl: string;
  assetId?: string | null;
  storagePath: string;
};

type CarouselSlideStripProps = {
  slides: Slide[];
  // 0-based index of the currently previewed slide.
  activeIndex: number;
  onSelectSlide: (index: number) => void;
  placement: UseDraftMediaPlacementResult;
  // Called when user clicks the + add slot — typically opens the library rail.
  onAddRequest: () => void;
  // Called when the user asks to replace a slide; receives the slide's 0-based
  // array position. Opens the picker in "replace" mode. Optional — when absent,
  // the per-slide replace control is hidden.
  onReplaceRequest?: (position: number) => void;
  // Called when the user asks to enlarge a slide; receives the slide's 0-based
  // array position. Opens the media lightbox. Optional — hidden when absent.
  onEnlarge?: (position: number) => void;
  className?: string;
};

function SortableThumb({
  slide,
  activeIndex,
  totalCount,
  onSelect,
  onRemove,
  onReplace,
  onEnlarge,
}: {
  slide: Slide;
  activeIndex: number;
  totalCount: number;
  onSelect: () => void;
  onRemove: () => void;
  onReplace?: () => void;
  onEnlarge?: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: `slide-${slide.slideIndex}`,
  });

  const isActive = slide.slideIndex === activeIndex;
  const canRemove = totalCount > 1;

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <div ref={setNodeRef} style={style} className="group relative shrink-0" {...attributes}>
      {/* Drag handle + thumbnail — the whole tile is the drag surface */}
      <button
        type="button"
        aria-label={`Slide ${slide.slideIndex + 1}${isActive ? ' (active)' : ''}`}
        aria-pressed={isActive}
        onClick={onSelect}
        className={cn(
          'relative h-14 w-14 overflow-hidden rounded-md border transition-all duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
          isActive
            ? 'border-primary ring-2 ring-primary ring-offset-1'
            : 'border-border/50 hover:border-border',
        )}
        {...listeners}
      >
        <Image
          src={slide.storageUrl}
          alt={`Slide ${slide.slideIndex + 1}`}
          fill
          unoptimized
          sizes="56px"
          className="object-cover"
        />
        <div className="absolute bottom-0.5 right-0.5 rounded-full bg-black/60 px-1 py-px text-3xs font-semibold text-white tabular-nums">
          {slide.slideIndex + 1}
        </div>
      </button>

      {/* Replace, shown on hover at top-left */}
      {onReplace && (
        <button
          type="button"
          aria-label={`Replace slide ${slide.slideIndex + 1}`}
          onClick={(e) => {
            e.stopPropagation();
            onReplace();
          }}
          className="absolute -left-1.5 -top-1.5 hidden h-4 w-4 items-center justify-center rounded-full bg-background border border-border/70 shadow-sm text-muted-foreground transition-colors hover:bg-primary hover:text-primary-foreground focus-visible:flex focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring group-hover:flex"
        >
          <Replace className="h-2.5 w-2.5" />
        </button>
      )}

      {/* Remove ×, shown on hover, hidden when only one slide */}
      {canRemove && (
        <button
          type="button"
          aria-label={`Remove slide ${slide.slideIndex + 1}`}
          onClick={(e) => {
            e.stopPropagation();
            onRemove();
          }}
          className="absolute -right-1.5 -top-1.5 hidden h-4 w-4 items-center justify-center rounded-full bg-background border border-border/70 shadow-sm text-muted-foreground transition-colors hover:bg-destructive hover:text-destructive-foreground focus-visible:flex focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring group-hover:flex"
        >
          <X className="h-2.5 w-2.5" />
        </button>
      )}

      {/* Enlarge, shown on hover at bottom-left */}
      {onEnlarge && (
        <button
          type="button"
          aria-label={`Enlarge slide ${slide.slideIndex + 1}`}
          onClick={(e) => {
            e.stopPropagation();
            onEnlarge();
          }}
          className="absolute -bottom-1.5 -left-1.5 hidden h-4 w-4 items-center justify-center rounded-full bg-background border border-border/70 shadow-sm text-muted-foreground transition-colors hover:bg-primary hover:text-primary-foreground focus-visible:flex focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring group-hover:flex"
        >
          <Maximize2 className="h-2.5 w-2.5" />
        </button>
      )}
    </div>
  );
}

export function CarouselSlideStrip({
  slides,
  activeIndex,
  onSelectSlide,
  placement,
  onAddRequest,
  onReplaceRequest,
  onEnlarge,
  className,
}: CarouselSlideStripProps) {
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );

  const sortedSlides = [...slides].sort((a, b) => a.slideIndex - b.slideIndex);
  const slideIds = sortedSlides.map((s) => `slide-${s.slideIndex}`);

  const handleDragEnd = React.useCallback(
    (event: DragEndEvent) => {
      const { active, over } = event;
      if (!over || active.id === over.id) return;

      const fromIndex = sortedSlides.findIndex((s) => `slide-${s.slideIndex}` === active.id);
      const toIndex = sortedSlides.findIndex((s) => `slide-${s.slideIndex}` === over.id);

      if (fromIndex !== -1 && toIndex !== -1) {
        placement.reorderSlides(fromIndex, toIndex);
        // Keep the active preview in sync after reorder.
        if (activeIndex === fromIndex) {
          onSelectSlide(toIndex);
        }
      }
    },
    [sortedSlides, placement, activeIndex, onSelectSlide],
  );

  if (slides.length === 0) return null;

  return (
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
      <SortableContext items={slideIds} strategy={horizontalListSortingStrategy}>
        {/* biome-ignore lint/a11y/useSemanticElements: drag-reorder group, not a form fieldset */}
        <div
          role="group"
          aria-label="Carousel slides"
          className={cn(
            'flex items-center gap-2 overflow-x-auto py-2 px-1 scroll-smooth',
            '[&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]',
            className,
          )}
        >
          {sortedSlides.map((slide, position) => (
            <SortableThumb
              key={slide.slideIndex}
              slide={slide}
              activeIndex={activeIndex}
              totalCount={sortedSlides.length}
              onSelect={() => onSelectSlide(slide.slideIndex)}
              onRemove={() => placement.removeSlide(position)}
              onReplace={onReplaceRequest ? () => onReplaceRequest(position) : undefined}
              onEnlarge={onEnlarge ? () => onEnlarge(position) : undefined}
            />
          ))}

          {/* Add slot — dashed border + + icon */}
          <button
            type="button"
            aria-label="Add a slide"
            onClick={onAddRequest}
            className="flex h-14 w-14 shrink-0 items-center justify-center rounded-md border border-dashed border-border/60 bg-muted/30 text-muted-foreground transition-colors hover:border-border hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <Plus className="h-5 w-5" />
          </button>
        </div>
      </SortableContext>
    </DndContext>
  );
}
