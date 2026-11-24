'use client';

// The frame every Home tile draws inside: the Optimizer board's ModuleFrame (same sizes, same
// states, same bench contract: data-module-state), with the Home's own header actions — the pin,
// and "Open", which shows the tile's expanded module in a side sheet. The expanded module is the
// tile's own lazy chunk, so it downloads, and reads, only when someone opens it.
//
// `reason` is the board's sentence for the tile (generated, in the account's language) or, when
// the board had no figure to cite, the tile's own figure line from its read.

import type { HomeBoardTile, HomeTileId } from '@continuum/contracts';
import { ArrowUpRightIcon, PinIcon } from 'lucide-react';
import { useTranslations } from 'next-intl';
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
import { HOME_DRAFT_READ_ONLY, useHomeDraft } from './HomePresentationContext';
import styles from './homeDots.module.css';

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

/** Each tile's title in the UI language (the contracts' HOME_TILE_LABELS, said per locale). */
const HOME_TILE_TITLE_KEYS = {
  goals: 'goal_cdbf697',
  setup: 'setup_7013af4',
  health: 'account_health_3a060d2',
  checklist: 'client_checklist_965ff10',
  brief: 'jaina_brief_0e9d3a0',
  opps: 'opportunities_1e6e878',
  pacing: 'pacing_afb633d',
  autopilot: 'overnight_a6b86e2',
  creative: 'creative_2c7e633',
  organic: 'organic_week_46f9ebc',
  market: 'market_5238d9b',
} as const satisfies Record<HomeTileId, string>;

export function useHomeTileTitle(id: HomeTileId): string {
  const uiText = useTranslations('dashboard');
  return uiText(HOME_TILE_TITLE_KEYS[id]);
}

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
  const uiText = useTranslations('dashboard');
  const draft = useHomeDraft();
  const { isPinned, togglePin } = useHomeBoardChrome();
  const [ownOpen, setOwnOpen] = useState(false);
  const open = controlledOpen ?? ownOpen;
  const setOpen = (next: boolean) => {
    setOwnOpen(next);
    onOpenChange?.(next);
  };
  const title = useHomeTileTitle(tile.id);
  const pinned = isPinned(tile.id);
  const reason = tile.why ?? badge ?? undefined;

  return (
    <>
      <ModuleFrame
        action={
          // Ghost buttons: pull out by their padding so the arrow ends on the tile's trailing line,
          // and up so the 28px buttons centre on the 18px title line.
          <div className="-mt-1 -mr-2 flex items-center gap-0.5">
            {action}
            <Button
              aria-label={
                pinned
                  ? uiText('unpin_title_666d816', { title })
                  : uiText('pin_title_5b47053', { title })
              }
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
                {uiText('open_ed077f3')} <ArrowUpRightIcon className="size-3" />
              </Button>
            ) : null}
          </div>
        }
        className={cn(draft && styles.frame, pinned && 'ring-1 ring-primary/30', className)}
        reason={draft ? undefined : reason}
        size={tile.size}
        state={state}
        testId={homeTileTestId(tile)}
        title={title}
      >
        {draft && reason ? (
          <p className="sr-only" data-testid={`${homeTileTestId(tile)}-reason`}>
            {reason}
          </p>
        ) : null}
        {children}
      </ModuleFrame>
      {expanded ? (
        <Sheet onOpenChange={setOpen} open={open}>
          <SheetContent
            className="overflow-y-auto data-[side=right]:w-full data-[side=right]:sm:max-w-xl"
            data-testid={`${homeTileTestId(tile)}-sheet`}
            side="right"
          >
            <SheetHeader>
              <SheetTitle>{title}</SheetTitle>
              {expandedDescription ? (
                <SheetDescription>{expandedDescription}</SheetDescription>
              ) : null}
            </SheetHeader>
            <div className="min-w-0 px-4 pb-6" data-testid="home-tile-sheet-body">
              {draft ? (
                <p className="mb-3 text-muted-foreground text-xs" role="note">
                  {uiText(HOME_DRAFT_READ_ONLY)}
                </p>
              ) : null}
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
