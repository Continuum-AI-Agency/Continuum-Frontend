'use client';

// Enlarge-and-act surface for post-preview creatives. Clicking a blueprint frame
// or a realized slide opens this dialog with the creative shown large plus
// contextual actions (Generate / Use your own for blueprints; Replace / Remove
// for realized slides). The actions are supplied by the parent, which owns the
// generate/placement handlers — this component only presents and navigates.

import { ChevronLeft, ChevronRight } from 'lucide-react';
import Image from 'next/image';
import type * as React from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { cn } from '@/lib/utils';

export type LightboxItem = {
  url: string;
  caption: string;
  isVideo?: boolean;
};

export function MediaLightbox({
  open,
  onOpenChange,
  title,
  items,
  index,
  onIndexChange,
  actions,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  items: LightboxItem[];
  index: number;
  onIndexChange: (index: number) => void;
  actions?: React.ReactNode;
}) {
  const current = items[index];
  const hasMultiple = items.length > 1;
  const canPrev = index > 0;
  const canNext = index < items.length - 1;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl gap-3">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{current?.caption ?? ''}</DialogDescription>
        </DialogHeader>

        <div className="relative flex items-center justify-center overflow-hidden rounded-lg border border-border/60 bg-muted/30">
          {current?.isVideo ? (
            // biome-ignore lint/a11y/useMediaCaption: user-generated creative preview
            <video
              src={current.url}
              controls
              playsInline
              className="max-h-[65vh] w-auto max-w-full object-contain"
            />
          ) : current ? (
            <div className="relative flex h-[65vh] w-full items-center justify-center">
              <Image
                src={current.url}
                alt={current.caption}
                fill
                unoptimized
                sizes="(max-width: 768px) 100vw, 640px"
                className="object-contain"
              />
            </div>
          ) : null}

          {hasMultiple && (
            <>
              <button
                type="button"
                onClick={() => onIndexChange(index - 1)}
                disabled={!canPrev}
                aria-label="Previous creative"
                className={cn(
                  'absolute left-2 top-1/2 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full bg-black/50 text-white transition-opacity hover:bg-black/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                  !canPrev && 'pointer-events-none opacity-30',
                )}
              >
                <ChevronLeft className="h-5 w-5" />
              </button>
              <button
                type="button"
                onClick={() => onIndexChange(index + 1)}
                disabled={!canNext}
                aria-label="Next creative"
                className={cn(
                  'absolute right-2 top-1/2 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full bg-black/50 text-white transition-opacity hover:bg-black/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                  !canNext && 'pointer-events-none opacity-30',
                )}
              >
                <ChevronRight className="h-5 w-5" />
              </button>
            </>
          )}
        </div>

        {actions && <div className="flex flex-wrap items-center justify-end gap-2">{actions}</div>}
      </DialogContent>
    </Dialog>
  );
}
