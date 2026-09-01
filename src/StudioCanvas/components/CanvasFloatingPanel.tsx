'use client';

import { X } from 'lucide-react';
import type { ReactNode } from 'react';
import { Panel } from '@/components/ai-elements/panel';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

// The frame is bounded and the overflow lives in ONE inner pane — docs/styleguide.md §4.
//
// `max-h-[calc(100%-8.5rem)]` resolves against the canvas wrapper (`relative h-full`
// in StudioCanvas.tsx), which is the containing block of every `.react-flow__panel`.
// It replaces the `calc(100vh-12rem)` each caller used to carry: the canvas is not the
// viewport (it sits below the app header, beside the sidebar), so a vh-based bound let
// the panel run down into the bottom-right chat launcher — which then covered the list
// AND swallowed the wheel, so a scrolled panel could not be scrolled back up
// (Airtable #281). 8.5rem is this component's own `mt-14` top inset (3.5rem) plus the
// 5rem the collapsed launcher occupies (`size-11` + its `mb-4`).
export function CanvasFloatingPanel({
  title,
  icon,
  onClose,
  children,
  className,
  bodyClassName,
  position = 'top-left',
}: {
  title: string;
  icon?: ReactNode;
  onClose: () => void;
  children: ReactNode;
  className?: string;
  bodyClassName?: string;
  position?:
    | 'top-left'
    | 'top-center'
    | 'top-right'
    | 'bottom-left'
    | 'bottom-center'
    | 'bottom-right';
}) {
  return (
    <Panel
      position={position}
      className={cn(
        'nodrag nowheel ml-1 mt-14 flex max-h-[calc(100%-8.5rem)] w-[380px] flex-col overflow-hidden border-border/70 bg-background/95 p-0 shadow-md backdrop-blur',
        className,
      )}
    >
      <div className="flex min-h-10 shrink-0 items-center justify-between border-b border-border/70 px-3 py-2">
        <div className="flex items-center gap-2 text-sm font-medium">
          {icon}
          <span>{title}</span>
        </div>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="size-7 text-muted-foreground"
          onClick={onClose}
          aria-label={`Close ${title.toLowerCase()}`}
        >
          <X className="size-4" aria-hidden />
        </Button>
      </div>
      <div className={cn('min-h-0 flex-1 overflow-y-auto overscroll-contain', bodyClassName)}>
        {children}
      </div>
    </Panel>
  );
}
