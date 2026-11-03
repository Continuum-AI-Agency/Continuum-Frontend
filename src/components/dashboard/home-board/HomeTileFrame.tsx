'use client';

// The frame every Home tile draws inside: the Optimizer board's ModuleFrame (same sizes, same
// states, same bench contract: data-module-state), with the Home's own header actions — the pin,
// and "Open", which shows the tile's expanded module in a side sheet. The expanded module is the
// tile's own lazy chunk, so it downloads, and reads, only when someone opens it.
//
// `reason` is the board's sentence for the tile (generated, in the account's language) or, when
// the board had no figure to cite, the tile's own figure line from its read.

import { HOME_TILE_LABELS, type HomeBoardTile } from '@continuum/contracts';
import { ArrowUpRightIcon, PinIcon } from 'lucide-react';
import { type ReactNode, Suspense, useState } from 'react';
import {
  ModuleFrame,
  type ModuleFrameState,
} from '@/components/paid-media/optimizer/sections/board/ModuleFrame';
import { Button } from '@/components/ui/button';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import { useHomeBoardChrome } from './HomeBoardChrome';

export type HomeTileFrameProps = {
  tile: HomeBoardTile;
  state: ModuleFrameState;
  /** The tile's own figure line, shown when the board wrote no sentence for it. */
  badge?: string | null;
  /** The expanded module, drawn in a side sheet when the tile is opened. */
  expanded?: ReactNode;
  /** A one-line description under the sheet's title. */
  expandedDescription?: string;
  /** An extra header action (rare; most tiles act inside their expanded module). */
  action?: ReactNode;
  /** Controls the expanded sheet when the tile opens it from its own button too; the frame
   *  keeps its own state when these are omitted. */
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  className?: string;
  children: ReactNode;
};

export function homeTileTestId(tile: HomeBoardTile): string {
  return `home-tile-${tile.id}`;
}

export function HomeTileFrame({
  tile,
  state,
  badge,
  expanded,
  expandedDescription,
  action,
  className,
  open: controlledOpen,
  onOpenChange,
  children,
}: HomeTileFrameProps) {
  const { isPinned, togglePin } = useHomeBoardChrome();
  const [ownOpen, setOwnOpen] = useState(false);
  const open = controlledOpen ?? ownOpen;
  const setOpen = (next: boolean) => {
    setOwnOpen(next);
    onOpenChange?.(next);
  };
  const title = HOME_TILE_LABELS[tile.id];
  const pinned = isPinned(tile.id);
  const reason = tile.why ?? badge ?? undefined;

  return (
    <>
      <ModuleFrame
        action={
          <div className="flex items-center gap-0.5">
            {action}
            <Button
              aria-label={pinned ? `Unpin ${title}` : `Pin ${title}`}
              aria-pressed={pinned}
              className={cn('size-7', pinned ? 'text-foreground' : 'text-muted-foreground')}
              data-testid={`${homeTileTestId(tile)}-pin`}
              onClick={() => togglePin(tile.id)}
              size="icon-sm"
              type="button"
              variant="ghost"
            >
              <PinIcon className={cn('size-3.5', pinned && 'fill-current')} />
            </Button>
            {expanded ? (
              <Button
                className="h-7 gap-0.5 px-2 text-xs"
                data-testid={`${homeTileTestId(tile)}-open`}
                onClick={() => setOpen(true)}
                size="sm"
                type="button"
                variant="ghost"
              >
                Open <ArrowUpRightIcon className="size-3" />
              </Button>
            ) : null}
          </div>
        }
        className={cn(pinned && 'ring-1 ring-primary/30', className)}
        reason={reason}
        size={tile.size}
        state={state}
        testId={homeTileTestId(tile)}
        title={title}
      >
        {children}
      </ModuleFrame>
      {expanded ? (
        <Sheet onOpenChange={setOpen} open={open}>
          <SheetContent
            className="w-full overflow-y-auto sm:max-w-xl"
            data-testid={`${homeTileTestId(tile)}-sheet`}
            side="right"
          >
            <SheetHeader>
              <SheetTitle>{title}</SheetTitle>
              {expandedDescription ? (
                <SheetDescription>{expandedDescription}</SheetDescription>
              ) : null}
            </SheetHeader>
            <div className="min-w-0 px-4 pb-6">
              {open ? (
                <Suspense fallback={<Skeleton className="h-48 w-full" />}>{expanded}</Suspense>
              ) : null}
            </div>
          </SheetContent>
        </Sheet>
      ) : null}
    </>
  );
}

/** The body of a tile whose source does not exist for this brand yet: one sentence naming what is
 *  missing (and, when there is one, the place to fix it). Never a figure. */
export function TileMissing({ children }: { children: ReactNode }) {
  return (
    <p className="text-muted-foreground text-xs leading-snug" data-testid="home-tile-missing">
      {children}
    </p>
  );
}
